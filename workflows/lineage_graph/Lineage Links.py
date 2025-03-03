# Databricks notebook source
# MAGIC %md
# MAGIC ### Get Parameters Values

# COMMAND ----------

# Get the catalog and schema from the task values
catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")

# COMMAND ----------

# MAGIC %md
# MAGIC ### Create Link Dataframe

# COMMAND ----------

links_df = spark.sql(f"""
    SELECT
        ou_s.node AS source_node,
        ou_s.node_type AS source_node_type, 
        ou_t.node AS target_node,
        ou_t.node_type AS target_node_type, 
        ou_t.entity_path,
        DATE(MAX(stf.last_event_time)) AS last_event_date,
        stf.lineage_source_table
    FROM {catalog}.{schema}.vw_sources_targets_fill stf
    JOIN {catalog}.{schema}.vw_objects_union ou_s -- Populate with source nodes
        ON stf.source_object = ou_s.node 
            AND stf.source_type = ou_s.node_type
    JOIN {catalog}.{schema}.vw_objects_union ou_t  -- Populate with target nodes
        ON stf.target_object = ou_t.node 
            AND stf.target_type = ou_t.node_type
    GROUP BY ALL
""")



# COMMAND ----------

# MAGIC %md
# MAGIC ### For Cycles created in the graph keeping the first event

# COMMAND ----------

from pyspark.sql.functions import array, split, array_sort, col, concat_ws
from pyspark.sql.window import Window
from pyspark.sql.functions import row_number

w = Window.partitionBy("link_deduplicator").orderBy(col("last_event_date").asc())

links_df = links_df.withColumn(
    "link_deduplicator", 
    concat_ws("", array_sort(array([col("source_node"), col("target_node")])))
).withColumn("row_number", row_number().over(w)).where(col("row_number") == 1).drop("row_number", "link_deduplicator")

links_df = links_df.dropDuplicates()

# COMMAND ----------

# MAGIC %md
# MAGIC ### Upsert new Link data

# COMMAND ----------

from delta.tables import DeltaTable

if not spark.catalog.tableExists(f"{catalog}.{schema}.lineage_links"):
    links_df.write.saveAsTable(f"{catalog}.{schema}.lineage_links")
else:
    lineage_links_table = DeltaTable.forName(spark, f"{catalog}.{schema}.lineage_links")
    merge_result = lineage_links_table.alias('lineage_links') \
        .merge(
            links_df.alias('new_links'),
            'lineage_links.source_node = new_links.source_node AND lineage_links.source_node_type = new_links.source_node_type AND lineage_links.target_node = new_links.target_node AND lineage_links.target_node_type = new_links.target_node_type AND lineage_links.entity_path = new_links.entity_path AND lineage_links.lineage_source_table = new_links.lineage_source_table'
        ) \
        .whenMatchedUpdateAll( # If the new link is more recent, update the existing one
            condition='lineage_links.last_event_date <= new_links.last_event_date'
        ) \
        .whenNotMatchedInsert(values={ # Insert new links
            "source_node": "new_links.source_node",
            "source_node_type": "new_links.source_node_type",
            "target_node": "new_links.target_node",
            "target_node_type": "new_links.target_node_type",
            "entity_path": "new_links.entity_path",
            "last_event_date": "new_links.last_event_date",
            "lineage_source_table": "new_links.lineage_source_table"
        }) \
        .execute()

    # Get the operation metrics
    operation_metrics = lineage_links_table.history(1).select("operationMetrics").collect()[0][0]

    # Extract and print relevant metrics
    num_inserted_rows = int(operation_metrics.get("numTargetRowsInserted", "0"))
    num_updated_rows = int(operation_metrics.get("numTargetRowsUpdated", "0"))

    print(f"Number of rows inserted: {num_inserted_rows}")
    print(f"Number of rows updated: {num_updated_rows}")