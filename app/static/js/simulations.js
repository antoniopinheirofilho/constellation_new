class GraphSimulation {
    constructor(data, width, height) {
        this.data = data;
        this.width = width;
        this.height = height;
        this.simulation = null;
        this.onTick = null;
        this.isUpdating = false;
        this.container = null;
    }

    setContainer(container) {
        this.container = container;
        return this;
    }

    initialize() {
        this.simulation = d3.forceSimulation(this.data.nodes)
            .force("link", d3.forceLink(this.data.links)
                .id(d => d.id)
                .distance(300)  // Increased distance for more spread
                .strength(0.05))  // Further reduced strength for looser connections
            .force("charge", d3.forceManyBody()
                .strength(-500)  // Increased repulsion for more spread
                .distanceMax(1000))  // Increased range of repulsion
            .force("collide", d3.forceCollide()
                .radius(30)     // Increased radius for more separation
                .strength(0.8)) // Slightly increased strength for better separation
            .force("center", d3.forceCenter(this.width / 2, this.height / 2)) // Added center force
            .alphaDecay(0.03)  // Slower decay for more movement
            .velocityDecay(0.3) // Reduced friction for more movement
            .alpha(1);

        this.data.nodes.forEach(node => {
            if (typeof node.x === 'undefined' || typeof node.y === 'undefined') {
                node.x = this.width / 2 + (Math.random() - 0.5) * this.width * 1.5; // Wider initial spread
                node.y = this.height / 2 + (Math.random() - 0.5) * this.height * 1.5; // Wider initial spread
            }
        });

        return this;
    }

    setTickCallback(callback) {
        this.onTick = callback;

        let frameId = null;

        this.simulation.on("tick", () => {
            if (this.onTick && !this.isUpdating) {
                this.isUpdating = true;

                if (frameId !== null) {
                    cancelAnimationFrame(frameId);
                }

                frameId = requestAnimationFrame(() => {
                    this.onTick();
                    this.isUpdating = false;
                    frameId = null;
                });
            }
        });

        return this;
    }

    getSimulation() {
        return this.simulation;
    }

    updateData(newData) {
        this.data = newData;

        const oldNodes = new Map(this.simulation.nodes().map(d => [d.id, d]));
        newData.nodes.forEach(node => {
            const oldNode = oldNodes.get(node.id);
            if (oldNode) {
                node.x = oldNode.x;
                node.y = oldNode.y;
                node.vx = oldNode.vx;
                node.vy = oldNode.vy;
            }
        });

        this.simulation.nodes(newData.nodes);
        this.simulation.force("link").links(newData.links);

        this.simulation
            .alpha(0.5) // Increased alpha for more movement
            .velocityDecay(0.3) // Reduced friction for more movement
            .restart();

        return this;
    }

    stop() {
        if (this.simulation) {
            this.simulation.stop();
        }
    }

    restart() {
        if (this.simulation) {
            this.simulation
                .alpha(0.5) // Increased alpha for more movement
                .velocityDecay(0.3) // Reduced friction for more movement
                .restart();
        }
    }

    updateDimensions(width, height) {
        this.width = width;
        this.height = height;

        // Update center force with new dimensions
        this.simulation.force("center", d3.forceCenter(width / 2, height / 2));

        this.simulation.alpha(0.3).restart(); // Increased alpha for more adjustment
    }

    setStrength(multiplier = 1) {
        this.simulation
            .force("link")
            .strength(d => 0.05 * multiplier); // Reduced base strength

        this.simulation
            .force("charge")
            .strength(d => -500 * multiplier); // Increased base repulsion

        this.simulation
            .force("collide")
            .strength(0.8 * multiplier); // Slightly increased collision strength

        this.simulation.alpha(0.3).restart(); // Increased alpha for more adjustment
    }
}

// Make GraphSimulation available globally
window.GraphSimulation = GraphSimulation;