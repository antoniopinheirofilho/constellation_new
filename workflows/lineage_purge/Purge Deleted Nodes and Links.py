# Databricks notebook source
# MAGIC %md
# MAGIC ### Get Parameters Values

# COMMAND ----------

# Retrieve workspace URL and ID from task values for dynamic query construction
workspace_url = dbutils.jobs.taskValues.get(
  taskKey='functions_and_configuration_parameters', 
  key="workspace_url"
)
workspace_id = dbutils.jobs.taskValues.get(
  taskKey='functions_and_configuration_parameters', 
  key="workspace_id"
)

# Get the catalog and schema from the task values
catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")

# Obtain the number of days to offset for filtering events in the query
offset_days = dbutils.widgets.get("offset_days")



# # Retrieve workspace URL and ID from task values for dynamic query construction
# # workspace_url = dbutils.jobs.taskValues.get(taskKey='functions_and_configuration_parameters', key="workspace_url")
# from dbruntime.databricks_repl_context import get_context

# # workspace_id = dbutils.jobs.taskValues.get(taskKey='functions_and_configuration_parameters', key="workspace_id")
# workspace_url = spark.conf.get("spark.databricks.workspaceUrl")
# workspace_id = get_context().workspaceId
# # Fetch catalog and schema names from notebook widgets for view creation
# # catalog = dbutils.widgets.get("catalog")
# # schema = dbutils.widgets.get("schema")
# catalog = "stage"
# schema = "ad_lineage_grafos"
# # Obtain the number of days to offset for filtering events in the query
# # offset_days = dbutils.widgets.get("offset_days")
# offset_days = 365

# COMMAND ----------

# MAGIC %md
# MAGIC ### Mapped TABLES/VIEWS

# COMMAND ----------


spark.sql(f"""
--When it goes to production this should change to use system.information_schema.tables
CREATE OR REPLACE TABLE {catalog}.{schema}.table_view
select TRIM(table_catalog ||"."|| table_schema ||"."||table_name) table_id
from stage.ad_lineage_grafos.tables_information_schema
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ### Create deletes base

# COMMAND ----------

deleted_entities_df = spark.sql(f"""
    WITH deletions AS (
        SELECT 
            DATE(event_time) AS event_date,
            action_name,
            CASE
                WHEN action_name = 'deleteTable' THEN request_params.full_name_arg
                WHEN action_name = 'deleteSchema' THEN CONCAT(request_params.full_name_arg, '%') -- Add % for LIKE operation later, since Nodes have only tables
                ELSE NULL
            END AS schema_table_name,
            CASE 
                WHEN action_name = 'deleteTable' THEN CONCAT('https://{workspace_url}/explore/data/', REPLACE(request_params.full_name_arg, '.', '/'))
                WHEN action_name = 'deleteSchema' THEN CONCAT('https://{workspace_url}/explore/data/', REPLACE(request_params.full_name_arg, '.', '/'), '/%')
                WHEN action_name = 'delete' and service_name = 'jobs' THEN CONCAT('https://{workspace_url}/jobs/', request_params.job_id)
                WHEN action_name = 'deletePipeline' THEN CONCAT('https://{workspace_url}/pipelines/', request_params.pipelineId)
                WHEN action_name = 'deleteNotebook' THEN CONCAT('https://{workspace_url}/#notebook/', request_params.notebookId)
                WHEN action_name = 'deleteDashboard' THEN CONCAT('https://{workspace_url}/sql/dashboards%/', request_params.dashboardId) -- Add % for LIKE operation later, since there may be legacy dashboards without the v3 suffix
                WHEN action_name in ('deleteQuery', 'deleteQueryDraft') THEN CONCAT('https://{workspace_url}/editor/queries/uuid/', request_params.queryId)
            END AS deleted_entity_path
        FROM system.access.audit
        WHERE
            -- Filtering only for relevant delete events
            action_name IN (
                'deleteTable', 
                'deleteJob', 
                'deletePipeline', 
                'deleteNotebook', 
                'deleteDashboard', 
                'deleteQuery',
                'deleteQueryDraft',
                'deleteSchema',
                'delete'
            )
            AND DATE(event_time) >= CURRENT_DATE() - INTERVAL '{offset_days}' DAYS
    )
    SELECT
        ln.node,
        ln.node_type,
        ln.entity_path,
        d.action_name,
        d.schema_table_name
    FROM {catalog}.{schema}.lineage_nodes ln
    JOIN deletions d
        ON (d.action_name IN ('deleteSchema', 'deleteDashboard') AND ln.entity_path LIKE d.deleted_entity_path)
            OR (d.action_name NOT IN ('deleteSchema', 'deleteDashboard') AND ln.entity_path = d.deleted_entity_path)
    WHERE d.event_date > ln.last_event_date -- Filtering only nodes that were updated before the deletion
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ### Delete data from Links table
# MAGIC (This should be done before Nodes deletion)

# COMMAND ----------

from delta.tables import DeltaTable

lineage_links = DeltaTable.forName(spark, f"{catalog}.{schema}.lineage_links")
merge_result_events = lineage_links.alias("ll") \
                            .merge(deleted_entities_df.alias("d"),
                                """(ll.target_node = d.node AND ll.target_node_type = d.node_type)
                                OR (ll.source_node = d.node AND ll.source_node_type = d.node_type)
                                    OR ((d.action_name = 'deleteTable' AND ll.source_node = d.schema_table_name) 
                                            OR (d.action_name = 'deleteSchema' AND ll.source_node LIKE d.schema_table_name))
                                """
                            ) \
                            .whenMatchedDelete() \
                            .execute()
# Get the operation metrics
operation_metrics_m = lineage_links.history(1).select("operationMetrics").collect()[0][0]
iperation_metrics_m = int(operation_metrics_m.get("numTargetRowsDeleted", "0"))

delete_result_table_views = lineage_links.delete(
    f"""(source_node_type = 'TABLE/VIEW' AND source_node NOT IN ( SELECT table_id 
                            FROM {catalog}.{schema}.table_view))
         OR (target_node_type = 'TABLE/VIEW' AND target_node NOT IN ( SELECT table_id 
                            FROM {catalog}.{schema}.table_view))
    """
)
operation_metrics_d = lineage_links.history(1).select("operationMetrics").collect()[0][0]

# Extract the number of deleted rows
num_deleted_rows = int(operation_metrics_m.get("numTargetRowsDeleted", "0")) + int(operation_metrics_d.get("numDeletedRows", "0"))

print(f"Number of rows deleted: {num_deleted_rows}")

# COMMAND ----------

print(num_deleted_rows)

# COMMAND ----------

# MAGIC %md
# MAGIC ### Delete data from Nodes table

# COMMAND ----------

from delta.tables import DeltaTable

lineage_nodes = DeltaTable.forName(spark, f"{catalog}.{schema}.lineage_nodes")
merge_result = lineage_nodes.alias("ln") \
                            .merge(deleted_entities_df.alias("d"),
                                "ln.node = d.node AND ln.node_type = d.node_type AND ln.entity_path = d.entity_path"
                            ) \
                            .whenMatchedDelete() \
                            .execute()

# Get the operation metrics
operation_metrics_m = lineage_nodes.history(1).select("operationMetrics").collect()[0][0]
iperation_metrics_m = int(operation_metrics_m.get("numTargetRowsDeleted", "0"))

delete_result_table_views = lineage_nodes.delete(
    f"""(node_type = 'TABLE/VIEW' AND node NOT IN (SELECT table_id 
                            FROM {catalog}.{schema}.table_view))
     """)
operation_metrics_d = lineage_nodes.history(1).select("operationMetrics").collect()[0][0]

# Extract the number of deleted rows
num_deleted_rows = int(operation_metrics_m.get("numTargetRowsDeleted", "0")) + int(operation_metrics_d.get("numDeletedRows", "0"))
print(f"Number of rows deleted: {num_deleted_rows}")

