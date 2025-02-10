# Databricks notebook source
# MAGIC %md
# MAGIC ### Get Parameters Values

# COMMAND ----------

workspace_url = "dbc-9570c746-ec11.cloud.databricks.com"
workspace_id = 3606981051492833
catalog = "stage"
schema = "ad_lineage_grafos"

# COMMAND ----------

spark.sql(f"""
CREATE OR REPLACE TABLE {catalog}.{schema}.table_view AS
select TRIM(table_catalog ||"."|| table_schema ||"."||table_name) table_id
from stage.ad_lineage_grafos.tables_information_schema 
""")

# COMMAND ----------

#Tables on lineage nodes, but not in 
non_compliant = spark.sql(f"""
            SELECT * from stage.ad_lineage_grafos.lineage_nodes ln
            LEFT ANTI JOIN {catalog}.{schema}.table_view tv
            ON ln.node = tv.table_id
            WHERE node_type = "TABLE/VIEW"
            """)

non_compliant.count()