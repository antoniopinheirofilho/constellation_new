# Constellation: Interactive Data Lineage Visualization

A sophisticated web application for visualizing and exploring data lineage relationships using D3.js and Flask. This tool provides an interactive graph visualization with features like search, filtering, and detailed node exploration.

<img width="1323" alt="Constellation Screenshot" src="https://github.com/user-attachments/assets/9b061538-5505-46e6-8256-2ae3fa0a249d" />

## Features

- **Interactive Graph Visualization**
  - Force-directed layout using D3.js
  - Smooth zooming and panning
  - Minimap for navigation in large graphs
  - Node and edge highlighting
  - Custom node coloring based on types

- **Advanced Search & Filtering**
  - Real-time search functionality
  - Type-based filtering
  - Upstream/downstream level exploration
  - Node label toggling
  - Option to hide unselected nodes

- **Rich User Interface**
  - Detailed tooltips with node information
  - Performance indicators
  - Loading progress visualization
  - Responsive design
  - Dark mode interface

- **Technical Features**
  - Databricks SQL integration
  - Efficient graph data handling
  - BFS-based node relationship exploration
  - Configurable node styling
  - Event-driven architecture

## Prerequisites

- Python 3.7+
- Flask
- Databricks SQL connector
- D3.js v7.8.5
- Modern web browser with JavaScript enabled

## Installation

### Deploy as a Databricks App (Recommended)

1. In your Databricks workspace, navigate to Apps and click "Create App"

2. Select "Import App" and upload the repository files

3. Configure the app settings:
   ```
   App Name: Constellation
   Entry Point: app.py
   Requirements: requirements.txt
   ```

4. Set the following environment variables in the app configuration:
   ```
   DATABRICKS_HOST: your-databricks-host
   DATABRICKS_WAREHOUSE_ID: your-warehouse-id
   ```

5. Deploy the app and access it via the provided URL

### Local Development Setup (Alternative)

1. Clone the repository:
```bash
git clone https://github.com/yourusername/constellation.git
cd constellation
```

2. Create and activate a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows, use: venv\Scripts\activate
```

3. Install required Python packages:
```bash
pip install -r requirements.txt
```

4. Set up environment variables for Databricks connection:
```bash
export DATABRICKS_HOST="your-databricks-host"
export DATABRICKS_TOKEN="your-databricks-token"
```

## Configuration

### Databricks SQL Connection
Update the SQL warehouse configuration in `app.py`:
```python
cfg = Config()  # Pull environment variables for auth
with sql.connect(
    server_hostname=cfg.host,
    http_path=f"/sql/1.0/warehouses/your-warehouse-id",
    credentials_provider=lambda: cfg.authenticate
)
```

### UI Customization
The application's appearance can be customized through the CSS variables in `static/styles/main.css`:
```css
:root {
    --bg-primary: #111827;
    --bg-secondary: #1f2937;
    --accent-color: #ff6b6b;
    /* ... other variables ... */
}
```

## Usage

Deploy on Databricks Apps

## Implementation Details

### Force Simulation Parameters
```javascript
// Key simulation parameters
forceLink()
    .distance(300)    // Link length
    .strength(0.05)   // Link strength
forceManyBody()
    .strength(-500)   // Node repulsion
    .distanceMax(1000)
forceCollide()
    .radius(30)      // Node separation
    .strength(0.8)   // Collision strength
```

### Event Handling
- Debounced tooltip updates
- Smooth transitions for visual changes
- Level-based connection exploration
- Efficient node and link highlighting
- Responsive zoom handling

### Minimap Implementation
- Scales dynamically with graph size
- Maintains aspect ratio
- Provides draggable viewport
- Updates in real-time with graph changes

### Search Optimization
- Instant feedback with suggestions
- Smart node selection and focusing
- Keyboard-friendly navigation
- Efficient node filtering

### Zoom Management
```javascript
// Zoom configuration
zoom = d3.zoom()
    .scaleExtent([0.1, 8])     // Zoom range
    .extent([[0, 0], [width, height]])

// Custom zoom controls
zoomToFit()      // Auto-fit graph
zoomToNode()     // Focus specific node
resetZoom()      // Reset to default view

// Smooth transitions
svg.transition()
    .duration(750)
    .call(zoom.transform, transform)
```

### Visibility Control System
```javascript
// Visibility states
showLabels       // Label visibility
hideUnselected   // Selection-based hiding
typesUnchecked   // Type-based filtering

// Visibility checks
isNodeVisible(node) {
    // Type filtering
    if (typesUnchecked.has(node.type)) return false
    
    // Selection filtering
    if (hideUnselected && selectedNode) {
        return connectedNodes.has(node.id)
    }
    
    return true
}
```

## Development

### Project Structure
```
constellation/
├── app.py                 # Flask application
├── static/
│   ├── js/
│   │   ├── minimap.js
│   │   ├── interactions.js
│   │   ├── simulations.js
│   │   ├── zoom.js
│   │   └── search.js
│   └── styles/
│       └── main.css
└── templates/
    ├── dexco_d3_dag_viz.html
    └── dexco_d3_dag_viz_subgraph.html
```

### Adding New Features
1. Create new JavaScript modules in `static/js/`
2. Update the HTML templates to include new modules
3. Add corresponding styles in `main.css`
4. Update Flask routes in `app.py` if needed

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Acknowledgments

- D3.js for visualization capabilities
- Flask for backend services
- Databricks for data infrastructure

## Support

For issues and feature requests, please use the GitHub issue tracker.
