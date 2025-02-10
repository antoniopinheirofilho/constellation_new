class ZoomHandler {
    constructor(svg, container, node, link, label, minimapInstance, width, height) {
        this.svg = svg;
        this.container = container;
        this.node = node;
        this.link = link;
        this.label = label;
        this.minimapInstance = minimapInstance;
        this.width = width;
        this.height = height;
        this.zoom = null;

        this.initializeZoom();
        this.setupZoomControls();
    }

    initializeZoom() {
        // Increased zoom range and extent
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 8])  // Increased max zoom
            .extent([[0, 0], [this.width, this.height]])
            .on("zoom", (event) => {
                this.container.attr("transform", event.transform);
                this.minimapInstance.updateMinimapView(event.transform);
            });

        this.svg.call(this.zoom);
        this.minimapInstance.setZoom(this.zoom);
    }

    setupZoomControls() {
        const addHighlight = (button) => {
            button.classList.remove('clicked');
            void button.offsetWidth; // Force reflow
            button.classList.add('clicked');
            setTimeout(() => {
                button.classList.remove('clicked');
            }, 1500);
        };

        // Set up zoom in button
        const zoomInBtn = document.querySelector("#zoom-in");
        d3.select("#zoom-in").on("click", () => {
            this.svg.transition()
                .duration(300)
                .call(this.zoom.scaleBy, 1.5);
            addHighlight(zoomInBtn);
        });

        // Set up zoom out button
        const zoomOutBtn = document.querySelector("#zoom-out");
        d3.select("#zoom-out").on("click", () => {
            this.svg.transition()
                .duration(300)
                .call(this.zoom.scaleBy, 0.75);
            addHighlight(zoomOutBtn);
        });

        // Set up zoom reset button
        const zoomResetBtn = document.querySelector("#zoom-reset");
        d3.select("#zoom-reset").on("click", () => {
            this.resetZoom();
            addHighlight(zoomResetBtn);
        });
    }

    zoomToFit() {
        const bounds = this.getGraphBounds();
        const padding = 50; // Reduced padding

        // Calculate scale with more generous limits
        const scale = Math.min(
            this.width / (bounds.width + padding * 2),
            this.height / (bounds.height + padding * 2),
            2 // Increased max scale for initial fit
        );

        // Calculate the transform
        const transform = d3.zoomIdentity
            .translate(
                (this.width - bounds.width * scale) / 2 - bounds.x * scale,
                (this.height - bounds.height * scale) / 2 - bounds.y * scale
            )
            .scale(scale);

        // Apply transform with longer duration for smoother transition
        this.svg.transition()
            .duration(1000)
            .call(this.zoom.transform, transform);
    }

    getGraphBounds() {
        const nodePositions = this.node.data();
        const xs = nodePositions.map(d => d.x);
        const ys = nodePositions.map(d => d.y);

        // Add padding to bounds
        const padding = 20;
        return {
            x: Math.min(...xs) - padding,
            y: Math.min(...ys) - padding,
            width: Math.max(...xs) - Math.min(...xs) + padding * 2,
            height: Math.max(...ys) - Math.min(...ys) + padding * 2
        };
    }

    getZoom() {
        return this.zoom;
    }

    setTransform(transform) {
        this.svg.call(this.zoom.transform, transform);
    }

    resetZoom() {
        const bounds = this.getGraphBounds();
        const padding = 50;

        // Calculate scale forcing it to the minimum
        const scale = Math.max(
            0.1,  // Force minimum scale
            Math.min(
                this.width / (bounds.width + padding * 2),
                this.height / (bounds.height + padding * 2)
            )
        );

        // Calculate the transform to center the graph
        const transform = d3.zoomIdentity
            .translate(
                (this.width - bounds.width * scale) / 2 - bounds.x * scale,
                (this.height - bounds.height * scale) / 2 - bounds.y * scale
            )
            .scale(scale);

        // Apply transform with smooth transition
        this.svg.transition()
            .duration(750)
            .call(this.zoom.transform, transform);
    }

    getCurrentTransform() {
        return d3.zoomTransform(this.svg.node());
    }

    updateDimensions(width, height) {
        this.width = width;
        this.height = height;
        
        // Update SVG dimensions
        this.svg.attr("width", width)
            .attr("height", height);
        
        // Update zoom extent
        this.zoom.extent([[0, 0], [width, height]]);
        
        // Recalculate zoom transform to fit new dimensions
        this.zoomToFit();
    }

    zoomToNode(node) {
        const scale = 2; // Adjust this value to change zoom level
        const transform = d3.zoomIdentity
            .translate(this.width / 2, this.height / 2)
            .scale(scale)
            .translate(-node.x, -node.y);

        this.svg.transition()
            .duration(750)
            .call(this.zoom.transform, transform);
    }
}
