# Databricks notebook source
# MAGIC %md
# MAGIC ### Get Parameter Values

# COMMAND ----------

# Retrieve workspace URL and ID from task values for dynamic query construction
workspace_url = dbutils.jobs.taskValues.get(taskKey='functions_and_configuration_parameters', key="workspace_url")
workspace_id = dbutils.jobs.taskValues.get(taskKey='functions_and_configuration_parameters', key="workspace_id")

# Fetch catalog and schema names from notebook widgets for view creation
catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")

# Obtain the number of days to offset for filtering events in the query
offset_days = dbutils.widgets.get("offset_days")

# COMMAND ----------

# MAGIC %md
# MAGIC ### Create Temp View "vw_sources_targets_fill"

# COMMAND ----------

# Verify whether the HMS lineage system table is present
hms_lineage_table = "system.hms_to_uc_migration.table_access"
hms_lineage_table_exists = spark.catalog.tableExists(hms_lineage_table)

print(f"HMS lineage table exists: {hms_lineage_table_exists}")

# COMMAND ----------

# If the HMS lineage system table is present, then union its data with the UC lineage system table.
# Otherwise, only the UC lineage system table will be considered. 

lineage_query = ""

if hms_lineage_table_exists:
  lineage_query = """
  
  select
  entity_type,
  entity_id,
  source_table_catalog,
  source_table_schema,
  source_table_full_name,
  source_path,
  source_type,
  target_table_catalog,
  target_table_schema,
  target_table_full_name,
  target_path,
  target_type,
  event_time,
  workspace_id,
  event_date,
  'table_lineage' as lineage_source_table

  from system.access.table_lineage

  union all
  select
  entity_type,
  entity_id,
  source_table_catalog,
  source_table_schema,
  source_table_full_name,
  source_path,
  source_type,
  target_table_catalog,
  target_table_schema,
  target_table_full_name,
  target_path,
  target_type,
  event_time,
  workspace_id,
  event_date,
  CAST('hms_table_lineage' as STRING) as lineage_source_table
  from system.hms_to_uc_migration.table_access
  
  """
else:

  lineage_query = """
  
  select
  entity_type,
  entity_id,
  source_table_catalog,
  source_table_schema,
  source_table_full_name,
  source_path,
  source_type,
  target_table_catalog,
  target_table_schema,
  target_table_full_name,
  target_path,
  target_type,
  event_time,
  workspace_id,
  event_date,
  CAST('table_lineage' as STRING) as lineage_source_table
  from system.access.table_lineage
  
  """

print(lineage_query)

# COMMAND ----------

spark.sql(f"CREATE OR REPLACE VIEW {catalog}.{schema}.vw_lineage_data_raw AS {lineage_query}")

# COMMAND ----------

spark.sql(f"""
    CREATE OR REPLACE VIEW {catalog}.{schema}.vw_sources_targets_fill AS
        WITH tables_lineages AS (
            WITH internal_tables_lineages AS (
                SELECT
                     CASE
                        WHEN entity_type IN ('TABLE', 'VIEW', 'PATH', 'STREAMING_TABLE', 'EXTERNAL', 'MANAGED') THEN 'TABLE/VIEW/PATH'
                        WHEN entity_type = 'DBSQL_DASHBOARD' THEN 'DASHBOARD'
                        WHEN entity_type = 'DASHBOARD_V3' THEN 'DASHBOARD'
                        WHEN entity_type = 'DBSQL_QUERY' THEN 'QUERY'
                        WHEN entity_type IN ('JOB', 'PIPELINE') THEN 'JOB/PIPELINE'
                        ELSE entity_type
                    END AS source_entity_type,
                    entity_id AS source_entity_id,
                    COALESCE(source_table_full_name, source_path) as source_table_full_name,
                    CASE
                        WHEN source_type IN ('TABLE', 'VIEW', 'PATH', 'STREAMING_TABLE', 'EXTERNAL', 'MANAGED') THEN 'TABLE/VIEW/PATH'
                        WHEN source_type = 'DBSQL_DASHBOARD' THEN 'DASHBOARD'
                        WHEN source_type = 'DASHBOARD_V3' THEN 'DASHBOARD'
                        WHEN source_type = 'DBSQL_QUERY' THEN 'QUERY'
                        WHEN source_type IN ('JOB', 'PIPELINE') THEN 'JOB/PIPELINE'
                        ELSE source_type
                    END AS source_type,
                    COALESCE(target_table_full_name, target_path) as target_table_full_name,
                    CASE
                        WHEN target_type IN ('TABLE', 'VIEW', 'PATH', 'STREAMING_TABLE', 'EXTERNAL', 'MANAGED') THEN 'TABLE/VIEW/PATH'
                        WHEN target_type = 'DBSQL_DASHBOARD' THEN 'DASHBOARD'
                        WHEN target_type = 'DASHBOARD_V3' THEN 'DASHBOARD'
                        WHEN target_type = 'DBSQL_QUERY' THEN 'QUERY'
                        WHEN target_type IN ('JOB', 'PIPELINE') THEN 'JOB/PIPELINE'
                        ELSE target_type
                    END AS target_type,
                    -- Build entity URLs for later access
                    CASE
                        WHEN entity_type = 'NOTEBOOK' THEN 'https://{workspace_url}/#notebook/' || entity_id
                        WHEN entity_type = 'PIPELINE' THEN 'https://{workspace_url}/pipelines/' || entity_id
                        WHEN entity_type = 'JOB' THEN 'https://{workspace_url}/jobs/' || entity_id
                        WHEN entity_type = 'DBSQL_QUERY' THEN 'https://{workspace_url}/editor/queries/uuid/' || entity_id
                        WHEN entity_type = 'DASHBOARD_V3' THEN 'https://{workspace_url}/sql/dashboardsv3/' || entity_id
                        WHEN entity_type = 'DBSQL_DASHBOARD' THEN 'https://{workspace_url}/sql/dashboards/' || entity_id
                    END AS entity_path,
                    MAX(event_time) as last_event_time,
                    workspace_id,
                    lineage_source_table
                FROM {catalog}.{schema}.vw_lineage_data_raw
                WHERE entity_type IS NOT NULL
                    AND workspace_id = {workspace_id}
                    -- Eliminate operational data
                    AND COALESCE(source_table_catalog, target_table_catalog, 'unknown') != 'system'
                    AND COALESCE(source_table_schema, target_table_schema, 'unknown') != 'information_schema'
                    AND event_date >= CURRENT_DATE() - INTERVAL '{offset_days}' DAYS
                GROUP BY ALL
            )


            SELECT source_entity_type as source_type,
                   source_entity_type || '-' || source_entity_id AS source_object,  -- Adding the entity type with its ID to avoid collision
                   target_type, 
                   target_table_full_name as target_object,
                   entity_path,
                   last_event_time,
                   workspace_id,
                   lineage_source_table
            FROM internal_tables_lineages

            UNION


            SELECT source_type,
                   source_table_full_name as source_object,
                   source_entity_type as target_type,
                   source_entity_type || '-' || source_entity_id AS target_object,  -- Adding the entity type with its ID to avoid collision
                   entity_path,
                   last_event_time,
                   workspace_id,
                   lineage_source_table
            FROM internal_tables_lineages

        )
        SELECT DISTINCT
            source_object,
            source_type,
            target_object,
            target_type,
            entity_path,
            last_event_time,
            workspace_id,
            lineage_source_table
          FROM tables_lineages
            WHERE source_object IS NOT NULL AND target_object IS NOT NULL AND source_type IS NOT NULL AND target_type IS NOT NULL
""")