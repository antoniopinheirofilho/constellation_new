# Databricks notebook source
# MAGIC %md
# MAGIC ### Get Parameters Values

# COMMAND ----------

# Get the catalog and schema from the task values
catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")

# Obtain the number of days to offset for purging old data
purge_offset_days = dbutils.widgets.get("purge_offset_days")

# COMMAND ----------

# MAGIC %md
# MAGIC ### Delete from Nodes table

# COMMAND ----------

spark.sql(f"""
    DELETE FROM {catalog}.{schema}.lineage_nodes
    WHERE last_event_date < DATE_SUB(CURRENT_DATE(), {purge_offset_days})
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ### Delete from Links table

# COMMAND ----------

spark.sql(f"""
    DELETE FROM {catalog}.{schema}.lineage_links
    WHERE last_event_date < DATE_SUB(CURRENT_DATE(), {purge_offset_days})
""")