from flask import Flask, render_template, jsonify, request
import random
import string
from databricks import sql
from databricks.sdk.core import Config
import os
import pandas as pd
import logging
from typing import Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

def sqlQuery(query: str) -> pd.DataFrame:
    """
    Execute a SQL query on a Databricks SQL warehouse and return the result as a pandas DataFrame.

    Args:
        query (str): The SQL query to execute.

    Returns:
        pd.DataFrame: The query result as a pandas DataFrame.

    Raises:
        Exception: If there's an error during the database query.
    """
    try:
        logger.info(f"""Running the folowing query:\n
                        {query}
                    """)

        cfg = Config()  # Pull environment variables for auth
        with sql.connect(
            server_hostname=cfg.host,
            http_path=f"/sql/1.0/warehouses/148ccb90800933a1",
            credentials_provider=lambda: cfg.authenticate
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute(query)
                result = cursor.fetchall_arrow()
                if result is None:
                    return []
                return result.to_pandas().to_dict(orient="records")
    except Exception as e:
        print(f"Database query error: {str(e)}")
        raise e
        
def generate_random_name():
    """Create a random name to be consumed during the creation of fake data"""
    return ''.join(random.choices(string.ascii_letters, k=5))

def generate_fake_dag():
    """
    Generate a fake Directed Acyclic Graph (DAG), to help with UI local tests without
    integrations with the SQL Warehouse.

    Returns:
        dict: A dictionary containing 'nodes' and 'links' for the generated DAG.
    """
    num_nodes = 1000
    nodes = [{"id": f"develop.cassol.tabela_2_8653031800044{i}",
              "name": generate_random_name(),
              "type": random.choice(["Job", "Notebook", 
                                     "Table", "Dashboard",
                                     "Dataset"]),
             "days_last_interaction":252,
             "entity_path":"https://google.com",
             "last_event_date":"Mon, 18 Mar 2024 00:00:00 GMT",
             "total_connections":25}
              for i in range(num_nodes)]
    links = [{"source": nodes[i]["id"], 
              "target": nodes[random.randint(i+1, num_nodes-1)]["id"]}
              for i in range(num_nodes-1)]
    return {"nodes": nodes, "links": links}

@app.route('/')
def index():
    """
    Render the main page of the application.

    Returns:
        str: Rendered HTML template for the main page.
    """

    return render_template('d3_dag_viz.html')

@app.route('/subgraph/<node_id>')
def subgraph(node_id):
    """
    Render the subgraph page for a specific node.
    Useful  when the amount of nodes from the total graph is massive.

    Args:
        node_id (str): The ID of the node to display the subgraph for.

    Returns:
        str: Rendered HTML template for the subgraph page.
    """
    return render_template('dexco_d3_dag_viz_subgraph.html')

@app.route('/search/<node_id>')
def search(node_id: str):
    """
    Search for nodes and links connected to a specific node using Breadth-First Search (BFS).

    Args:
        node_id (str): The ID of the node to search from.

    Returns:
        flask.Response: JSON response containing connected nodes and links.
    """
    logger.info("Fetching dag data...")
    nodes = get_nodes()
    logger.info(f"Retrieved {len(nodes)} nodes")
    links = get_links()
    logger.info(f"Retrieved {len(links)} links")
    connected_nodes = set()
    connected_links = dict()
    logger.info(f"Searching nodes connected to {node_id}")


    def bfs(start_node, is_upstream):
        """Apply Breadth-First Search to find connected nodes and links."""
        queue = [start_node]
        visited = {start_node}
        connected_nodes.add(start_node)

        while queue:
            current_node = queue.pop(0)
            for link in links:
                neighbor = False
                if is_upstream and link["target"] == current_node:
                    connected_links[link["source"]+link["target"]] = link
                    neighbor = link["source"]
                elif not is_upstream and link["source"]== current_node:
                    connected_links[link["source"]+link["target"]] = link
                    neighbor = link["target"]

                if neighbor is not False and neighbor not in visited:
                    connected_nodes.add(neighbor)
                    visited.add(neighbor)
                    queue.append(neighbor)

    bfs(node_id, True)
    bfs(node_id, False)
    connected_nodes = [node for node in nodes if node["id"] in connected_nodes]
    connected_links = [link for _, link in connected_links.items()]
    return  jsonify({"nodes": connected_nodes, "links": connected_links})

@app.route('/nodes')
def get_nodes(filter_str: Optional[str]):
    """
    Retrieve nodes from the database.

    Returns:
        list: A list of dictionaries containing node information.
    """
    lineage_source_table = request.args.get('lineage_source_table') 
    if lineage_source_table == "all" or lineage_source_table is None:
        filter_str = ""
    elif lineage_source_table in ["hms_table_lineage", "table_lineage"]:    
        filter_str = f"""WHERE lineage_source_table = '{lineage_source_table}'"""
    elif filter_str is not None:
        filter_str = f"""WHERE lineage_source_table = '{lineage_source_table}'"""


    logger.info(f"Using the folowing filter to nodes: {filter_str}")

    return sqlQuery(f"""
                    WITH CONNECTION_BY_NODE AS(
                    SELECT node as id, SUM(total_connections) total_connections FROM (
                        SELECT source_node node,count(target_node) total_connections
                        FROM main.ad_lineage_grafos.lineage_links
                        GROUP BY source_node
                        UNION 
                        SELECT target_node node,count(source_node) total_connections
                        FROM main.ad_lineage_grafos.lineage_links
                        GROUP BY target_node
                    )
                    GROUP BY ALL)

                    SELECT  node as id,
                            node as name,
                            node_type as type,
                            entity_path,
                            date_diff(day,last_event_date,current_date()) days_last_interaction,
                            last_event_date,
                            COALESCE(total_connections,0) total_connections,
                            t1.lineage_source_table
                            FROM main.ad_lineage_grafos_test.lineage_nodes t1
                            LEFT JOIN CONNECTION_BY_NODE t2 ON t1.node = t2.id
                            {filter_str}
                    """)
                        
@app.route('/links')
def get_links(filter_str: Optional[str]):
    """
    Retrieve links from the database.

    Returns:
        list: A list of dictionaries containing link information.
    """
    lineage_source_table = request.args.get('lineage_source_table') 
    if lineage_source_table == "all" or lineage_source_table is None:
        filter_str = ""
    elif lineage_source_table in ["hms_table_lineage", "table_lineage"]:    
        filter_str = f"""WHERE lineage_source_table = '{lineage_source_table}'"""
    elif filter_str is not None:
        filter_str = f"""WHERE lineage_source_table = '{lineage_source_table}'"""

    logger.info(f"Using the folowing filter to links: {filter_str}")

    return sqlQuery(f"""
            SELECT source_node as source, 
                target_node as target,
                entity_path,
                source_node_type as source_type,
                target_node_type as target_type,
                last_event_date,
                lineage_source_table
                FROM main.ad_lineage_grafos_test.lineage_links
                {filter_str}    
            """)

@app.route('/dag_data')
def dag_data():
    """
    Retrieve DAG data including nodes and links.

    Returns:
        flask.Response: JSON response containing nodes and links for the DAG.
    """
    try:
        if request.args.get('lineage_source_table'):
            filter_str = f"""WHERE lineage_source_table = '{request.args.get('lineage_source_table')}'"""
            logger.info(f"Using the folowing filter: {filter_str}")
        else:
            filter_str = ""

        # fake_dag = generate_fake_dag()
        logger.info("Fetching dag data...")
        nodes = get_nodes(filter_str)
        logger.info(f"Retrieved {len(nodes)} nodes")
        links = get_links(filter_str)
        logger.info(f"Retrieved {len(links)} links")

        return jsonify({"nodes": nodes, "links": links})
        # return jsonify({"nodes": fake_dag["nodes"], "links": fake_dag["links"]})
    except Exception as e:
        logger.error(f"Error in dag_data: {str(e)}", exc_info=True)

        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=8000)
