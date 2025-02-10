class Minimap {
    constructor(svg, minimap, data, width, height) {
        this.svg = svg;
        this.minimap = minimap;
        this.data = data;
        this.width = width;
        this.height = height;
        this.minimapWidth = 150;
        this.minimapHeight = 150;
        this.padding = 5;
        
        this.init();
    }

    init() {
        this.minimap.selectAll("*").remove();
        
        const bounds = this.calculateBounds();
        this.minimapScale = this.calculateMinimapScale(bounds);
        
        this.minimapContainer = this.minimap.append("g")
            .attr("class", "minimap-container")
            .attr("transform", `translate(0, 0)`);
        
        this.minimapBackground = this.minimapContainer.append("rect")
            .attr("width", this.minimapWidth - 2 * (this.padding - 5))
            .attr("height", this.minimapHeight - 2 * (this.padding -5))
            .attr("fill", "#1a1a1a")
            .attr("stroke", "#333")
            .attr("pointer-events", "all");

        this.minimapNode = this.minimapContainer.append("g")
            .selectAll("circle")
            .data(this.data.nodes)
            .enter().append("circle")
            .attr("r", 0.5)
            .attr("fill", "#666");

        this.minimapView = this.minimapContainer.append("rect")
            .attr("class", "minimap-view")
            .attr("stroke", "#ff6b6b")
            .attr("stroke-width", 1.5)
            .attr("fill", "none")
            .attr("pointer-events", "all")
            .style("cursor", "move");

        this.updateMinimap();
        this.setupDragBehavior();
    }

    calculateBounds() {
        const nodes = this.data.nodes;
        if (nodes.length === 0) return { x: 0, y: 0, width: this.width, height: this.height };

        const xExtent = d3.extent(nodes, d => d.x);
        const yExtent = d3.extent(nodes, d => d.y);

        const padding = Math.max(this.width, this.height) * 0.05;
        return {
            x: xExtent[0] - padding,
            y: yExtent[0] - padding,
            width: xExtent[1] - xExtent[0] + padding * 2,
            height: yExtent[1] - yExtent[0] + padding * 2,
            centerX: (xExtent[0] + xExtent[1]) / 2,
            centerY: (yExtent[0] + yExtent[1]) / 2
        };
    }

    calculateMinimapScale(bounds) {
        const availableWidth = this.minimapWidth - 2 * this.padding;
        const availableHeight = this.minimapHeight - 2 * this.padding;
        
        return Math.min(
            availableWidth / bounds.width,
            availableHeight / bounds.height
        ) * 0.9;
    }

    updateMinimap() {
        const bounds = this.calculateBounds();
        this.minimapScale = this.calculateMinimapScale(bounds);

        const minimapVisibleWidth = bounds.width * this.minimapScale;
        const minimapVisibleHeight = bounds.height * this.minimapScale;

        const xOffset = (this.minimapWidth - 2 * this.padding - minimapVisibleWidth) / 2;
        const yOffset = (this.minimapHeight - 2 * this.padding - minimapVisibleHeight) / 2;

        this.minimapNode
            .attr("cx", d => (d.x - bounds.x) * this.minimapScale + xOffset)
            .attr("cy", d => (d.y - bounds.y) * this.minimapScale + yOffset);

        this.currentBounds = bounds;
        this.currentOffsets = { xOffset, yOffset };
    }

    updateMinimapView(transform) {
        const bounds = this.currentBounds;
        const { xOffset, yOffset } = this.currentOffsets;

        if (!bounds || !xOffset || !yOffset) return;

        // Calculate the visible portion of the graph
        const viewWidth = this.width / transform.k;
        const viewHeight = this.height / transform.k;

        // Calculate view rectangle position
        const viewX = (-transform.x / transform.k - bounds.x) * this.minimapScale + xOffset;
        const viewY = (-transform.y / transform.k - bounds.y) * this.minimapScale + yOffset;

        // Calculate constrained dimensions
        const availableWidth = this.minimapWidth - 2 * this.padding;
        const availableHeight = this.minimapHeight - 2 * this.padding;

        // Calculate scaled dimensions
        const scaledWidth = viewWidth * this.minimapScale;
        const scaledHeight = viewHeight * this.minimapScale;

        // Constrain the viewport size
        const constrainedWidth = Math.min(scaledWidth, availableWidth);
        const constrainedHeight = Math.min(scaledHeight, availableHeight);

        // Constrain the viewport position
        const constrainedX = Math.max(this.padding, 
            Math.min(viewX, this.minimapWidth - this.padding - constrainedWidth));
        const constrainedY = Math.max(this.padding,
            Math.min(viewY, this.minimapHeight - this.padding - constrainedHeight));

        // Update view rectangle with constrained values
        this.minimapView
            .attr("x", constrainedX)
            .attr("y", constrainedY)
            .attr("width", constrainedWidth)
            .attr("height", constrainedHeight);
    }

    setupDragBehavior() {
        const minimapDrag = d3.drag()
            .on("drag", (event) => {
                if (!this.currentBounds || !this.currentOffsets) return;
                
                const bounds = this.currentBounds;
                const { xOffset, yOffset } = this.currentOffsets;
                const transform = d3.zoomTransform(this.svg.node());

                const x = (event.x - xOffset) / this.minimapScale + bounds.x;
                const y = (event.y - yOffset) / this.minimapScale + bounds.y;

                const newTransform = d3.zoomIdentity
                    .translate(-x * transform.k, -y * transform.k)
                    .scale(transform.k);

                this.svg.call(this.zoom.transform, newTransform);
            });

        this.minimapView.call(minimapDrag);
        this.minimapBackground.call(minimapDrag);
    }

    setZoom(zoom) {
        this.zoom = zoom;
    }

    updateDimensions(width, height) {
        this.width = width;
        this.height = height;
        this.updateMinimap();
    }
}