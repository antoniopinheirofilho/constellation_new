class SearchHandler {
    constructor(data, mouseInteractions, zoomHandler, fetchData,cleanupPreviousGraph) {
        this.data = data;
        this.mouseInteractions = mouseInteractions;
        this.zoomHandler = zoomHandler;
        this.searchInput = d3.select("#search");
        this.suggestionsContainer = d3.select("#suggestions");
        this.hideUnselectedCheckbox = d3.select("#hideUnselected");
        this.fetchData = fetchData;
        this.cleanupPreviousGraph = cleanupPreviousGraph;
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        this.searchInput.on("input", () => this.updateSuggestions());
        this.searchInput.on("keydown", (event) => this.handleKeyNavigation(event));
        
        // Hide suggestions when clicking outside
        d3.select("body").on("click", (event) => {
            if (!event.target.closest('.search-container')) {
                this.suggestionsContainer.style("display", "none");
            }
        });

        // Clear search on Escape key
        this.searchInput.on("keyup", (event) => {
            if (event.key === "Escape") {
                this.clearSearch();
            }
        });
    }

    updateSuggestions() {
        const input = this.searchInput.property("value").toLowerCase();
        
        if (!input.trim()) {
            this.mouseInteractions.resetGraph();
            this.suggestionsContainer.style("display", "none");
            this.hideUnselectedCheckbox.property("checked", false);
            return;
        }
        const matchingNodes = this.data.full_nodes_ids.filter(node => 
            node.name.toLowerCase().includes(input) || 
            node.type.toLowerCase().includes(input)
        );

        this.suggestionsContainer.html("");

        if (matchingNodes.length > 0) {
            matchingNodes.slice(0, 5).forEach((node, index) => {
                this.suggestionsContainer.append("div")
                    .attr("class", `search-result-item ${index === 0 ? 'selected' : ''}`)
                    .text(`${node.name} (${node.type})`)
                    .on("click", (event) => {
                        event.stopPropagation();
                        this.selectNode(node);
                    });
            });
            this.suggestionsContainer.style("display", "block");
        } else {
            this.suggestionsContainer.style("display", "none");
        }
    }

    selectNode(node) {
        // Update search input
        this.searchInput.property("value", node.name);
        
        // Create a synthetic event for node click
        const syntheticEvent = {
            stopPropagation: () => {},
            target: node
        };
        
        // First handle the node selection
        this.mouseInteractions.handleNodeClick(syntheticEvent, node);
        
        // Then handle the zoom transition
        const scale = 2; // Consistent zoom level
        const transform = d3.zoomIdentity
            .translate(
                this.zoomHandler.width / 2 - node.x * scale,
                this.zoomHandler.height / 2 - node.y * scale
            )
            .scale(scale);
            
        // Apply the zoom transition
        this.zoomHandler.svg
            .transition()
            .duration(750)
            .call(this.zoomHandler.zoom.transform, transform);
        
        // Hide suggestions
        this.suggestionsContainer.style("display", "none");
    }

    clearSearch() {
        this.searchInput.property("value", "");
        this.suggestionsContainer.style("display", "none");
        this.hideUnselectedCheckbox.property("checked", false);
        this.mouseInteractions.resetGraph();
    }

    handleKeyNavigation(event) {
        const suggestions = this.suggestionsContainer.selectAll(".search-result-item");
        const selectedIndex = suggestions.nodes().findIndex(node => 
            node.classList.contains("selected")
        );

        switch (event.key) {
            case "ArrowUp":
                event.preventDefault();
                if (selectedIndex > 0) {
                    suggestions.classed("selected", (d, i) => i === selectedIndex - 1);
                }
                break;

            case "ArrowDown":
                event.preventDefault();
                if (selectedIndex < suggestions.size() - 1) {
                    suggestions.classed("selected", (d, i) => i === selectedIndex + 1);
                }
                break;

            case "Enter":
                event.preventDefault();
                if (selectedIndex !== -1) {
                    const selectedNode = this.data.full_nodes_ids.find(node => 
                        `${node.name} (${node.type})` === suggestions.nodes()[selectedIndex].textContent
                    );
                    if (selectedNode) {
                        console.log(selectedNode)
                        this.fetchData(selectedNode.name)
                    }
                }
                break;
        }
    }
}
