# Databricks notebook source
# MAGIC %pip install databricks-sdk --upgrade

# COMMAND ----------

# MAGIC %restart_python

# COMMAND ----------

from databricks.sdk import WorkspaceClient
from dbruntime.databricks_repl_context import get_context

# Retrieve the API URL and token from the Databricks runtime context
host = get_context().apiUrl
token = get_context().apiToken

w = WorkspaceClient(token=token, host=host)

workspace_url = spark.conf.get("spark.databricks.workspaceUrl")
workspace_id = get_context().workspaceId

# COMMAND ----------

# Set the workspace URL and ID as task values for downstream use
dbutils.jobs.taskValues.set(key="workspace_url", value=workspace_url)
dbutils.jobs.taskValues.set(key="workspace_id", value=workspace_id)