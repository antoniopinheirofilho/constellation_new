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

# COMMAND ----------

# MAGIC %md
# MAGIC ### Create Temp View "vw_objects_union"

# COMMAND ----------

spark.sql(f"""
    CREATE OR REPLACE VIEW {catalog}.{schema}.vw_objects_union AS

    SELECT node, node_type, entity_path, MAX(last_event_time) AS last_event_time
    FROM (
        -- Unite all the sources and targets, each one in a separate row
        -- Tables

        SELECT 
            source_object AS node, 
            source_type AS node_type, 
            -- Build table link for catalog access
            CONCAT('https://{workspace_url}/explore/data/', REPLACE(source_object, '.', '/')) AS entity_path, 
            last_event_time
        FROM {catalog}.{schema}.vw_sources_targets_fill
        WHERE source_type = 'TABLE/VIEW/PATH'
        AND source_object IS NOT NULL

        UNION ALL
       
        SELECT 
            target_object AS node, 
            target_type AS node_type, 
            -- Build table link for catalog access
            CONCAT('https://{workspace_url}/explore/data/', REPLACE(target_object, '.', '/')) AS entity_path, 
            last_event_time
        FROM {catalog}.{schema}.vw_sources_targets_fill
        WHERE target_type = 'TABLE/VIEW/PATH'
        AND target_object IS NOT NULL

        UNION ALL
        
        SELECT 
            source_object AS node, 
            source_type AS node_type, 
            entity_path, 
            last_event_time
        FROM {catalog}.{schema}.vw_sources_targets_fill
        WHERE source_type != 'TABLE/VIEW/PATH'
        AND source_object IS NOT NULL

        UNION ALL

        SELECT 
            target_object AS node, 
            target_type AS node_type, 
            entity_path, 
            last_event_time
        FROM {catalog}.{schema}.vw_sources_targets_fill
        WHERE target_type != 'TABLE/VIEW/PATH'
        AND target_object IS NOT NULL
    )
    GROUP BY node, node_type, entity_path
""")