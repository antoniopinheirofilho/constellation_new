class MouseInteractions {
    constructor(svg, node, link, label, tooltip, width, height, zoom, colorScale) {
        this.svg = svg;
        this.node = node;
        this.link = link;
        this.label = label;
        this.width = width;
        this.height = height;
        this.zoom = zoom;
        this.colorScale = colorScale;
        this.selectedNode = null;
        this.connectedNodes = null;
        this.tooltipTimeout = null;
        this.indicators = null;
        this.labels = null;
        this.total_nodes_count = null;
        this.total_links_count = null;
        this.typesUnchecked = new Set();
        
        // Initialize both tooltips
        this.hoverTooltip = tooltip;
        this.selectedNodeTooltip = d3.select("body").append("div")
            .attr("class", "tooltip selected-tooltip")
            .style("opacity", 0);
        
        this.isTooltipPinned = false;

        // Initialize visibility manager
        this.visibilityManager = new VisibilityManager(node, link, label);

        this.initializeEventListeners();
    }

    objectTypeFilter(event, type, checked, hideUnselected) {
        this.visibilityManager.updateTypeFilter(type, checked);
    }

    initializeEventListeners() {
        // Node event listeners
        this.node
            .on("mouseenter", (event, d) => this.handleMouseOver(event, d))
            .on("mouseleave", (event, d) => this.handleMouseOut(event, d))
            .on("click", (event, d) => {
                event.stopPropagation();
                this.handleNodeClick(event, d);
            });

        // Link event listeners
        this.link
            .on("mouseenter", (event, d) => this.handleLinkMouseOver(event, d))
            .on("mouseleave", (event, d) => this.handleLinkMouseOut(event, d));

        // Add tooltip hover handlers to both tooltips
        this.hoverTooltip
            .on("mouseenter", () => this.handleTooltipMouseOver())
            .on("mouseleave", () => this.handleTooltipMouseOut());

        this.selectedNodeTooltip
            .on("mouseenter", () => this.handleTooltipMouseOver())
            .on("mouseleave", () => this.handleTooltipMouseOut());

        this.svg.on("click", (event) => {
            if (event.target.tagName === 'svg' || event.target.classList.contains('container')) {
                this.resetSelection();
            }
        });

        // Adding upstream/downstream level change listeners
        d3.select("#upstream-level").on("change", (event) => {
            if (this.selectedNode) {
                const {maxUpstream} = this.findMaxLevels(this.selectedNode);
                const value = parseInt(event.target.value);
                
                if (value > maxUpstream) {
                    event.target.value = maxUpstream;
                    this.showLevelMessage('upstream', `Maximum level is ${maxUpstream}`);
                } else if (value < 0) {
                    event.target.value = 0;
                    this.showLevelMessage('upstream', 'Minimum level is 0');
                }
                this.refreshConnections(this.selectedNode);
            }
        });

        d3.select("#downstream-level").on("change", (event) => {
            if (this.selectedNode) {
                const {maxDownstream} = this.findMaxLevels(this.selectedNode);
                const value = parseInt(event.target.value);
                
                if (value > maxDownstream) {
                    event.target.value = maxDownstream;
                    this.showLevelMessage('downstream', `Maximum level is ${maxDownstream}`);
                } else if (value < 0) {
                    event.target.value = 0;
                    this.showLevelMessage('downstream', 'Minimum level is 0');
                }
                this.refreshConnections(this.selectedNode);
            }
        });
    }

    handleTooltipMouseOver() {
        clearTimeout(this.tooltipTimeout);
    }
    
    handleTooltipMouseOut() {
        if (!this.isTooltipPinned) {
            this.tooltipTimeout = setTimeout(() => {
                this.hoverTooltip
                    .transition()
                    .duration(300)
                    .ease(d3.easeCubicOut)
                    .style("opacity", 0)
                    .on("end", () => {
                        this.hoverTooltip.style("display", "none");
                    });
            }, 300);  // Slightly longer delay before starting to fade
        }
    }

    constrainTooltipPosition(x, y, tooltipElement, graphBounds) {
        const tooltip = tooltipElement.node();
        const tooltipBounds = tooltip.getBoundingClientRect();
        
        // Add padding from edges
        const padding = 10;
        
        // Constrain x position
        x = Math.max(graphBounds.left + padding, x);
        x = Math.min(graphBounds.right - tooltipBounds.width - padding, x);
        
        // Constrain y position
        y = Math.max(graphBounds.top + padding, y);
        y = Math.min(graphBounds.bottom - tooltipBounds.height - padding, y);
        
        return { x, y };
    }

    updateTooltipPositionOnZoom(event) {
        if (this.selectedNode && this.isTooltipPinned) {
            const transform = event.transform;
            const svgBounds = this.svg.node().getBoundingClientRect();
            
            // Calculate screen coordinates for the selected node
            const screenX = svgBounds.left + (this.selectedNode.x * transform.k + transform.x);
            const screenY = svgBounds.top + (this.selectedNode.y * transform.k + transform.y);
            
            this.selectedNodeTooltip
                .style("left", (screenX + 10) + "px")
                .style("top", (screenY - 10) + "px")
                .style("transform", `scale(${Math.min(1.2, Math.max(0.3, transform.k))})`);
        }
    }

    updateTooltipScale(scale) {
        // Scale tooltip proportionally with zoom, with limits
        const tooltipScale = Math.min(1.2, Math.max(0.3, scale));
        
        this.hoverTooltip
            .style("transform", `scale(${tooltipScale})`)
            .style("transform-origin", "top left");
            
        this.selectedNodeTooltip
            .style("transform", `scale(${tooltipScale})`)
            .style("transform-origin", "top left");
    }

    calculateTooltipPosition(event, d) {
        const transform = d3.zoomTransform(this.svg.node());
        const svgBounds = this.svg.node().getBoundingClientRect();
        
        // If we have direct node data (for pinned tooltips)
        if (d && d.x !== undefined && d.y !== undefined) {
            // Transform node coordinates to screen space
            const screenX = svgBounds.left + (d.x * transform.k + transform.x);
            const screenY = svgBounds.top + (d.y * transform.k + transform.y);
            
            return {
                x: screenX + (20 * transform.k), // Scale the offset with zoom
                y: screenY - (10 * transform.k)
            };
        } 
        // For hover tooltips using mouse position
        else {
            // Get mouse position relative to SVG
            const point = d3.pointer(event, this.svg.node());
            
            // Apply zoom transform
            const screenX = svgBounds.left + (point[0] * transform.k + transform.x);
            const screenY = svgBounds.top + (point[1] * transform.k + transform.y);
            
            return {
                x: screenX + (20 * transform.k),
                y: screenY - (10 * transform.k)
            };
        }
    }

    showTooltip(tooltip, event, content, isPinned = false) {
        const transform = d3.zoomTransform(this.svg.node());
        const tooltipScale = Math.min(1.2, Math.max(0.3, transform.k));
        
        const svgPoint = d3.pointer(event, this.svg.node());
        const transformedX = (svgPoint[0] - transform.x) / transform.k;
        const transformedY = (svgPoint[1] - transform.y) / transform.k;

        const screenPoint = {
            x: event.clientX,
            y: event.clientY
        };

        tooltip
            .style("display", "block")
            .html(content)
            .style("left", (screenPoint.x + 10) + "px")
            .style("top", (screenPoint.y - 10) + "px")
            .style("transform", `scale(${tooltipScale})`)
            .style("transform-origin", "top left")
            .transition()
            .duration(200)
            .ease(d3.easeCubicOut)
            .style("opacity", 1);

        // Add click handler for close button
        tooltip.select(".tooltip-close").on("click", () => {
            tooltip.transition()
                .duration(300)
                .ease(d3.easeCubicOut)
                .style("opacity", 0)
                .on("end", () => {
                    tooltip.style("display", "none");
                });
            if (isPinned) {
                this.isTooltipPinned = false;
            }
        });
    }

    generateTooltipContent(d, isLink = false) {
        if (isLink) {
            return `
                <div class="tooltip-header">
                    <h3 class="tooltip-title" style="font-size: 0.9rem; margin-right: 1rem;">Connection Details</h3>
                    <button class="tooltip-close">✕</button>
                </div>
                <div class="tooltip-content">
                    <div class="tooltip-info">
                        <div class="tooltip-row">
                            <span class="tooltip-label">Source</span>
                            <span class="tooltip-value">${d.source.name}</span>
                        </div>
                        <div class="tooltip-row">
                            <span class="tooltip-label">Target</span>
                            <span class="tooltip-value">${d.target.name}</span>
                        </div>
                    </div>
                </div>
                <div class="tooltip-footer">
                    <a href="${d.entity_path}" target="_blank">View Connection Details →</a>
                </div>`;
        } else {
            return `
                <div class="tooltip-header">
                    <h3 class="tooltip-title">${d.name}</h3>
                    <button class="tooltip-close">✕</button>
                </div>
                <div class="tooltip-content">
                    <div class="tooltip-info">
                        <div class="tooltip-row">
                            <span class="tooltip-label">Type</span>
                            <span class="tooltip-value">
                                <span class="tooltip-type" style="background-color: ${this.colorScale(d.type)}">${d.type}</span>
                            </span>
                        </div>
                        <div class="tooltip-row">
                            <span class="tooltip-label">Days Since Last Event</span>
                            <span class="tooltip-value">${d.days_last_interaction}</span>
                        </div>
                        <div class="tooltip-row">
                            <span class="tooltip-label">Total Connections</span>
                            <span class="tooltip-value">${d.total_connections}</span>
                        </div>
                    </div>
                </div>
                <div class="tooltip-footer">
                    <a href="${d.entity_path}" target="_blank">View Data Asset →</a>
                </div>`;
        }
    }

    handleMouseOver(event, d) {
        clearTimeout(this.tooltipTimeout);
        
        // Always handle hover tooltip, even if a node is selected
        const content = this.generateTooltipContent(d);
        this.showTooltip(this.hoverTooltip, event, content);
    }

    handleMouseOut(event, d) {
        // Check if we're actually leaving the node and not entering a child element
        if (event.relatedTarget && (event.relatedTarget.closest('.node') === event.target)) {
            return;
        }
        
        // Always trigger the tooltip timeout for hover tooltips
        this.handleTooltipMouseOut();
    }

    handleLinkMouseOver(event, d) {
        clearTimeout(this.tooltipTimeout);
        const content = this.generateTooltipContent(d, true);
        this.showTooltip(this.hoverTooltip, event, content);
    }

    handleLinkMouseOut(event, d) {
        // Check if we're actually leaving the link and not entering a child element
        if (event.relatedTarget && (event.relatedTarget.closest('.link') === event.target)) {
            return;
        }
        this.handleTooltipMouseOut();
    }

    findMaxLevels(startNode) {
        let maxUpstream = 0;
        let maxDownstream = 0;
        
        // Find max upstream levels
        let upstreamQueue = [{node: startNode, depth: 0}];
        let upstreamVisited = new Set([startNode]);
        
        while(upstreamQueue.length > 0) {
            let {node: currentNode, depth} = upstreamQueue.shift();
            maxUpstream = Math.max(maxUpstream, depth);
            
            this.link.each(function(l) {
                if (l.target === currentNode && !upstreamVisited.has(l.source)) {
                    upstreamVisited.add(l.source);
                    upstreamQueue.push({node: l.source, depth: depth + 1});
                }
            });
        }
        
        // Find max downstream levels
        let downstreamQueue = [{node: startNode, depth: 0}];
        let downstreamVisited = new Set([startNode]);
        
        while(downstreamQueue.length > 0) {
            let {node: currentNode, depth} = downstreamQueue.shift();
            maxDownstream = Math.max(maxDownstream, depth);
            
            this.link.each(function(l) {
                if (l.source === currentNode && !downstreamVisited.has(l.target)) {
                    downstreamVisited.add(l.target);
                    downstreamQueue.push({node: l.target, depth: depth + 1});
                }
            });
        }
        
        return {maxUpstream, maxDownstream};
    }

    setHighlightsToZero(){
        let indicators_list = [this.total_nodes_count, this.total_links_count, 0]
        this.indicators = indicators_list;
        this.updateIndicators(null,null);
    }

    refreshConnections(node) {
        // Get all connected nodes with new levels
        const connectedNodes = this.getConnectedNodes(node);

        // Count the highlighted links
        let highlightedLinksCount = 0;
        this.link.each(l => {
            if (connectedNodes.has(l.source.id) && connectedNodes.has(l.target.id)) {
                highlightedLinksCount++;
            }
        });

        // Update percentage
        let percentage_h = (connectedNodes.size / this.indicators[0]*100).toFixed(2);
        this.indicators = [connectedNodes.size, highlightedLinksCount, percentage_h];

        // Store for future reference
        this.connectedNodes = connectedNodes;

        // Highlight nodes and links
        this.highlightConnections(node);

        // Update indicators
        this.updateIndicators(null, null);
    }

    updateIndicators(numbers, labels) {
        if(this.total_nodes_count === null && this.total_links_count === null){
            this.total_nodes_count = numbers[0]
            this.total_links_count = numbers[1]
        }
        if (this.indicators === null) {
            this.indicators = numbers;
        } 
        if (this.labels === null) {
            this.labels = labels;
        }

        const sections = ['left', 'center', 'right'];
        sections.forEach((section, i) => {
            const sectionElement = d3.select(`#indicator-${section}`);
            
            // Clear previous content
            sectionElement.html("");
    
            // Create SVG element for each section
            const svg = sectionElement.append("svg")
                .attr("width", "100%")
                .attr("height", "100%");
    
            // Add rectangle background
            svg.append("rect")
                .attr("width", "100%")
                .attr("height", "100%")
                .attr("fill", "#242d3f")
                .attr("rx", "3") // Smooth edges
                .attr("ry", "3");
    
            // Add value text
            svg.append("text")
                .attr("class", "value")
                .attr("x", "50%")
                .attr("y", "40%")
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "middle")
                .attr("fill", "white")
                .attr("font-size", "18px")
                .text(i === 2 ? parseFloat(this.indicators[i]).toFixed(2) : this.indicators[i]);
    
            // Add label text
            svg.append("text")
                .attr("class", "label")
                .attr("x", "50%")
                .attr("y", "70%")
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "middle")
                .attr("fill", "white")
                .attr("font-size", "12px")
                .text(this.labels[i]);
        });
    }

    resetSelection() {
        this.resetGraph();
        this.selectedNode = null;
        this.isTooltipPinned = false;
        
        // Hide both tooltips
        this.selectedNodeTooltip
            .transition()
            .duration(200)
            .style("opacity", 0)
            .style("display", "none");
            
        this.hoverTooltip
            .transition()
            .duration(200)
            .style("opacity", 0)
            .style("display", "none");
    }

    showAllNodes() {
        this.node.style("display", d => 
            !this.typesUnchecked.has(d.type) ? "block" : "none"
        );
        this.link.style("display", d => 
            (!this.typesUnchecked.has(d.source.type) && !this.typesUnchecked.has(d.target.type)) 
                ? "block" : "none"
        );
        
        // Also update labels if they're enabled
        if (d3.select("#showLabels").property("checked")) {
            this.label.style("display", d => 
                !this.typesUnchecked.has(d.type) ? "block" : "none"
            );
        }
    }

    hideAllNodesExcept(connectedNodes) {
        // Hide unconnected nodes
        this.node.style("display", d => 
            (connectedNodes.has(d.id) && !this.typesUnchecked.has(d.type)) ? "block" : "none"
        );
        // Hide unconnected links
        this.link.style("display", d => 
            (connectedNodes.has(d.source.id) && connectedNodes.has(d.target.id) &&
            !this.typesUnchecked.has(d.source.type) && !this.typesUnchecked.has(d.target.type))
                ? "block" : "none"
        );
        
        // Update labels if they're enabled
        if (d3.select("#showLabels").property("checked")) {
            this.label.style("display", d => 
                (connectedNodes.has(d.id) && !this.typesUnchecked.has(d.type)) ? "block" : "none"
            );
        }
    }

    getConnectedNodes(d) {
        const {maxUpstream, maxDownstream} = this.getMaxLevels(d);
        
        let upstreamLevelSelect = parseInt(document.getElementById('upstream-level').value);
        let downstreamLevelSelect = parseInt(document.getElementById('downstream-level').value);

        // Only enforce maximum limits, allow any value >= 0
        if (upstreamLevelSelect > maxUpstream) {
            upstreamLevelSelect = maxUpstream;
            document.getElementById('upstream-level').value = maxUpstream;
            this.showLevelMessage('upstream', `Maximum level is ${maxUpstream}`);
        } else if (upstreamLevelSelect < 0) {
            upstreamLevelSelect = 0;
            document.getElementById('upstream-level').value = 0;
            this.showLevelMessage('upstream', 'Minimum level is 0');
        }

        if (downstreamLevelSelect > maxDownstream) {
            downstreamLevelSelect = maxDownstream;
            document.getElementById('downstream-level').value = maxDownstream;
            this.showLevelMessage('downstream', `Maximum level is ${maxDownstream}`);
        } else if (downstreamLevelSelect < 0) {
            downstreamLevelSelect = 0;
            document.getElementById('downstream-level').value = 0;
            this.showLevelMessage('downstream', 'Minimum level is 0');
        }

        // Update select values if they were limited
        document.getElementById('upstream-level').value = upstreamLevelSelect;
        document.getElementById('downstream-level').value = downstreamLevelSelect;

        const upstreamNodes = this.bfs(d, true, upstreamLevelSelect);
        const downstreamNodes = this.bfs(d, false, downstreamLevelSelect);

        return new Set([...upstreamNodes, ...downstreamNodes]);
    }

    updateLevelSelects(connectedNodes) {
    // Find the current maximum depth in both directions for highlighted nodes
        let currentUpstream = 0;
        let currentDownstream = 0;

        this.link.each((l) => {
            if (connectedNodes.has(l.source.id) && connectedNodes.has(l.target.id)) {
                // For each highlighted link, calculate its depth from the selected node
                let depthFromSource = this.getDepthFromNode(this.selectedNode, l.source, true);
                let depthFromTarget = this.getDepthFromNode(this.selectedNode, l.target, false);
                
                currentUpstream = Math.max(currentUpstream, depthFromSource);
                currentDownstream = Math.max(currentDownstream, depthFromTarget);
            }
        });

        // Update select values
        const upstreamSelect = document.getElementById('upstream-level');
        const downstreamSelect = document.getElementById('downstream-level');
        
        upstreamSelect.value = currentUpstream;
        downstreamSelect.value = currentDownstream;
    }

    // Helper method to get depth of a node from the selected node
    getDepthFromNode(startNode, targetNode, isUpstream) {
        let queue = [{node: startNode, depth: 0}];
        let visited = new Set([startNode]);
        
        while(queue.length > 0) {
            let {node: currentNode, depth} = queue.shift();
            
            if(currentNode === targetNode) {
                return depth;
            }
            
            this.link.each(function(l) {
                let neighbor = null;
                if (isUpstream && l.target === currentNode) neighbor = l.source;
                if (!isUpstream && l.source === currentNode) neighbor = l.target;
                
                if (neighbor && !visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push({node: neighbor, depth: depth + 1});
                }
            });
        }
        return 0;
    }

    highlightConnections(d) {
        const connectedNodes = this.getConnectedNodes(d);

        // Highlight links
        this.link
            .attr("stroke", l => 
                (connectedNodes.has(l.source.id) && connectedNodes.has(l.target.id)) 
                    ? "var(--accent-color)" 
                    : "#999"
            )
            .classed("highlighted", l => 
                connectedNodes.has(l.source.id) && connectedNodes.has(l.target.id)
            );

        // Highlight nodes
        this.node
            .attr("fill", n => 
                connectedNodes.has(n.id) 
                    ? this.colorScale(n.type) 
                    : "#CCCCCC"
            );
    }

    bfs(startNode, isUpstream, maxDepth) {
        let queue = [{node: startNode, depth: 0}];
        let visited = new Set([startNode]);
        let connectedNodes = new Set([startNode.id]);
    
        while (queue.length > 0) {
            let {node: currentNode, depth: currentDepth} = queue.shift();
    
            if (currentDepth >= maxDepth) {
                break;
            }
    
            this.link.each(function (l) {
                let neighbor = null;
                if (isUpstream && l.target === currentNode) neighbor = l.source;
                if (!isUpstream && l.source === currentNode) neighbor = l.target;
    
                if (neighbor && !visited.has(neighbor)) {
                    connectedNodes.add(neighbor.id);
                    visited.add(neighbor);
                    queue.push({node: neighbor, depth: currentDepth + 1});
                    d3.select(this).classed("highlighted", true);
                }
            });
        }
        
        return connectedNodes;
    }

    setHideUnselectedNodes(hide) {
        this.visibilityManager.setHideUnselected(hide);
        
        if (this.selectedNode) {
            this.highlightConnections(this.selectedNode);
        }
    }

    getMaxLevels(node) {
        const {maxUpstream, maxDownstream} = this.findMaxLevels(node);
        return {maxUpstream, maxDownstream};
    }

    handleNodeClick(event, d) {
        if (this.selectedNode === d) {
            // Unselect node
            this.resetGraph();
            this.selectedNode = null;
            this.isTooltipPinned = false;
            this.visibilityManager.resetSelection();
            
            // Hide selected tooltip
            this.selectedNodeTooltip
                .transition()
                .duration(300)
                .ease(d3.easeCubicOut)
                .style("opacity", 0)
                .on("end", () => {
                    this.selectedNodeTooltip.style("display", "none");
                });
        } else {
            // Hide hover tooltip first
            this.hoverTooltip
                .transition()
                .duration(200)
                .style("opacity", 0)
                .on("end", () => {
                    this.hoverTooltip.style("display", "none");
                });
                
            // Select new node
            this.resetGraph();
            this.selectedNode = d;
            
            // Calculate position for pinned tooltip
            const position = this.calculateTooltipPosition(event, d);
            const graphBounds = document.getElementById('graph').getBoundingClientRect();
            const constrainedPos = this.constrainTooltipPosition(
                position.x,
                position.y,
                this.selectedNodeTooltip,
                graphBounds
            );
            
            // Show pinned tooltip for selected node
            const content = this.generateTooltipContent(d);
            this.selectedNodeTooltip
                .style("left", constrainedPos.x + "px")
                .style("top", constrainedPos.y + "px");
            this.showTooltip(this.selectedNodeTooltip, event, content, true);
            this.isTooltipPinned = true;

            // Get maximum possible levels for this node
            const { maxUpstream, maxDownstream } = this.findMaxLevels(d);

            // Set initial values to 3 or maximum available if less than 3
            document.getElementById('upstream-level').value = Math.min(3, maxUpstream);
            document.getElementById('downstream-level').value = Math.min(3, maxDownstream);

            // Get all connected nodes
            const connectedNodes = this.getConnectedNodes(d);

            // Update select values based on current highlighted paths
            this.updateLevelSelects(connectedNodes);

            // Count the highlighted links
            let highlightedLinksCount = 0;
            this.link.each(l => {
                if (connectedNodes.has(l.source.id) && connectedNodes.has(l.target.id)) {
                    highlightedLinksCount++;
                }
            });
            
            let percentage_h = (connectedNodes.size / this.indicators[0]*100).toFixed(2);
            this.indicators = [connectedNodes.size, highlightedLinksCount, percentage_h];
            
            // Store for future reference
            this.connectedNodes = connectedNodes;
            this.visibilityManager.setSelectedNode(d, connectedNodes);

            // Highlight nodes and links
            this.highlightConnections(d);

            this.updateIndicators(null, null);
        }
    }

    toggleLabels(show) {
        this.visibilityManager.setShowLabels(show);
    }

    resetGraph() {
        // Reset node and link styles
        this.node.attr("fill", "#CCCCCC").attr("r", 5).classed("highlighted", false);
        this.link.attr("stroke", "#999").classed("highlighted", false);
        this.visibilityManager.resetSelection();
        this.setHighlightsToZero();
    }

    showLevelMessage(type, message) {
        const messageElement = document.getElementById(`${type}-message`);
        if (messageElement) {
            messageElement.textContent = message;
            messageElement.classList.add('show');
            
            // Remove the show class after 3 seconds
            setTimeout(() => {
                messageElement.classList.remove('show');
            }, 3000);
        }
    }
}
