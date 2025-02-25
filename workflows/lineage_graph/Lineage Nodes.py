# Databricks notebook source
# MAGIC %md
# MAGIC ### Get Parameters Values

# COMMAND ----------

# Get the workspace URL from the task values
workspace_url = dbutils.jobs.taskValues.get(
    taskKey='functions_and_configuration_parameters', 
    key="workspace_url"
)

# Get the catalog and schema from the task values
catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")

# Obtain the number of days to offset for filtering events in the query
offset_days = dbutils.widgets.get("offset_days")

# COMMAND ----------

# MAGIC %md
# MAGIC ### Create Nodes Dataframe

# COMMAND ----------

# DBTITLE 1,Crawl HMS
# Since system.information_schema.tables does not contain HMS records, we need to manually crawl HMS to build the list of nodes

from pyspark.sql import SparkSession
from concurrent.futures import ThreadPoolExecutor
from pyspark.sql.functions import lit
from datetime import datetime

# Function to list tables in a given schema
def list_tables(schema_name):
    tables = spark.sql(f"SHOW TABLES IN hive_metastore.{schema_name}").collect()
    return [{"table_catalog": "hive_metastore", "table_schema": schema_name, "table_name": t.tableName} for t in tables]

# Fetch all schemas in Hive Metastore
schemas = [s.databaseName for s in spark.sql("SHOW SCHEMAS IN hive_metastore").collect()]

# Use ThreadPoolExecutor for parallel execution
hms_inventory = []
with ThreadPoolExecutor() as executor:
    results = executor.map(list_tables, schemas)

# Flatten the results into a single list
for res in results:
    hms_inventory.extend(res)

# Convert list to Spark DataFrame
df_hms = spark.createDataFrame(hms_inventory)
df_hms = df_hms.withColumn("last_altered", lit(datetime.max)) # Workaround since HMS doesn't display the last altered data. This will ensure that we always include all existing HMS tables
df_hms.write.mode("overwrite").saveAsTable(f"{catalog}.{schema}.hms_table_inventory")

# COMMAND ----------

nodes_df = spark.sql(f"""
    WITH base_nodes AS (
        WITH nodes_with_event AS (
            SELECT
                node,
                node_type,
                entity_path,
                DATE(last_event_time) AS last_event_date
            FROM {catalog}.{schema}.vw_objects_union
            GROUP BY ALL
        )
        SELECT
            node,
            node_type,
            entity_path,
            last_event_date
        FROM nodes_with_event

        UNION

        -- Unite nodes that had an event and also tables (UC) with no events at all (lonely nodes)
        SELECT
            CONCAT(t.table_catalog, '.', t.table_schema, '.', t.table_name) AS node,
            'TABLE/VIEW/PATH' AS node_type,
            CONCAT('https://{workspace_url}/explore/data/', t.table_catalog, '/', t.table_schema, '/', t.table_name) AS entity_path, 
            DATE(t.last_altered) AS last_event_date
        FROM system.information_schema.tables t
        LEFT JOIN nodes_with_event nwe
            ON CONCAT(t.table_catalog, '.', t.table_schema, '.', t.table_name) = nwe.node
        WHERE nwe.node IS NULL
            -- Eliminate operational data
            AND t.table_catalog != 'system'
            AND t.table_schema != 'information_schema'
            AND DATE(t.last_altered) >= CURRENT_DATE() - INTERVAL '{offset_days}' DAYS

        UNION

        -- Unite nodes that had an event and also tables (HMS) with no events at all (lonely nodes)
        SELECT
            CONCAT(t.table_catalog, '.', t.table_schema, '.', t.table_name) AS node,
            'TABLE/VIEW/PATH' AS node_type,
            CONCAT('https://{workspace_url}/explore/data/', t.table_catalog, '/', t.table_schema, '/', t.table_name) AS entity_path, 
            DATE(t.last_altered) AS last_event_date
        FROM {catalog}.{schema}.hms_table_inventory t
        LEFT JOIN nodes_with_event nwe
            ON CONCAT(t.table_catalog, '.', t.table_schema, '.', t.table_name) = nwe.node
        WHERE nwe.node IS NULL
    )
    SELECT
        bn.node,
        bn.node_type,
        bn.entity_path,
        bn.last_event_date
    FROM base_nodes bn
    LEFT JOIN {catalog}.{schema}.lineage_links ls
        ON bn.node = ls.source_node
            AND bn.node_type = ls.source_node_type
    LEFT JOIN {catalog}.{schema}.lineage_links lt
        ON bn.node = lt.target_node
            AND bn.node_type = lt.target_node_type
    GROUP BY ALL
""")

nodes_df = nodes_df.dropDuplicates()

# COMMAND ----------

display(nodes_df)

# COMMAND ----------

# MAGIC %md
# MAGIC ### Upsert new Node data

# COMMAND ----------

from delta.tables import DeltaTable

if not spark.catalog.tableExists(f"{catalog}.{schema}.lineage_nodes"):
    nodes_df.write.saveAsTable(f"{catalog}.{schema}.lineage_nodes")
else:
    lineage_nodes_table = DeltaTable.forName(spark, f"{catalog}.{schema}.lineage_nodes")
    merge_result = lineage_nodes_table.alias('lineage_nodes') \
        .merge(
            nodes_df.alias('new_nodes'),
            'lineage_nodes.node = new_nodes.node AND lineage_nodes.node_type = new_nodes.node_type AND lineage_nodes.entity_path = new_nodes.entity_path'
        ) \
        .whenMatchedUpdateAll( # In case the new node is more recent, update the existing one
            condition='lineage_nodes.last_event_date <= new_nodes.last_event_date'
        ) \
        .whenNotMatchedInsert(values={ # Insert new nodes
            "node": "new_nodes.node",
            "node_type": "new_nodes.node_type",
            "entity_path": "new_nodes.entity_path",
            "last_event_date": "new_nodes.last_event_date"
        }) \
        .execute()

    # Get the operation metrics
    operation_metrics = lineage_nodes_table.history(1).select("operationMetrics").collect()[0][0]

    # Extract and print relevant metrics
    num_inserted_rows = int(operation_metrics.get("numTargetRowsInserted", "0"))
    num_updated_rows = int(operation_metrics.get("numTargetRowsUpdated", "0"))

    print(f"Number of rows inserted: {num_inserted_rows}")
    print(f"Number of rows updated: {num_updated_rows}")
