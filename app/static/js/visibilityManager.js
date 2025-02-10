class VisibilityManager {
    constructor(node, link, label) {
        this.node = node;
        this.link = link;
        this.label = label;
        
        this.showLabels = false;
        this.hideUnselected = false;
        this.selectedNode = null;
        this.connectedNodes = null;
        this.typesUnchecked = new Set();
    }

    setShowLabels(show) {
        this.showLabels = show;
        this.updateVisibility();
    }

    setHideUnselected(hide) {
        this.hideUnselected = hide;
        // If there's no selection and we're trying to hide unselected nodes,
        // we should show nothing
        this.updateVisibility();
    }

    setSelectedNode(node, connectedNodes) {
        this.selectedNode = node;
        this.connectedNodes = connectedNodes;
        this.updateVisibility();
    }

    updateTypeFilter(type, checked) {
        if (!checked) {
            this.typesUnchecked.add(type);
        } else {
            this.typesUnchecked.delete(type);
        }
        this.updateVisibility();
    }

    resetSelection() {
        this.selectedNode = null;
        this.connectedNodes = null;
        this.updateVisibility();
    }

    isNodeVisible(d) {
        // If hiding unselected nodes but no node is selected, hide all nodes
        if (this.hideUnselected && !this.selectedNode) {
            return false;
        }

        // Hidden by type filter
        if (this.typesUnchecked.has(d.type)) {
            return false;
        }

        // Hidden by selection state
        if (this.hideUnselected && this.selectedNode) {
            return this.connectedNodes?.has(d.id) ?? false;
        }

        return true;
    }

    isLinkVisible(l) {
        // If hiding unselected nodes but no node is selected, hide all links
        if (this.hideUnselected && !this.selectedNode) {
            return false;
        }

        // Hidden by type filter
        if (this.typesUnchecked.has(l.source.type) || this.typesUnchecked.has(l.target.type)) {
            return false;
        }

        // Hidden by selection state
        if (this.hideUnselected && this.selectedNode) {
            return this.connectedNodes?.has(l.source.id) && this.connectedNodes?.has(l.target.id);
        }

        return true;
    }

    updateVisibility() {
        // Update node visibility
        this.node.style("display", d => this.isNodeVisible(d) ? "block" : "none");
        
        // Update link visibility
        this.link.style("display", l => this.isLinkVisible(l) ? "block" : "none");
        
        // Update label visibility
        this.label.style("display", d => 
            (this.showLabels && this.isNodeVisible(d)) ? "block" : "none"
        );
    }
}
