"use strict";

class Controller {

    constructor(detailView){
        this.filterArr = [];
        this.nodes = detailView.sigInst.camera.graph.nodes();
        this.edgeDict = undefined;
        this.detailView = detailView;
    }



    loadNodeNav() {
        var numBins = 40;
        var data = dataFactory(10000, numBins, false);
        var keys = Object.keys(this.nodes[0]);

        keys.forEach(function(key){
            if (key[0]===key[0].toUpperCase()) {
                var div = document.createElement('div');
                div.style = "color:#fff; margin-left: 5px;"
                div.innerHTML = key;
                document.getElementById('nav_nodes_content').appendChild(div);
            }
        });

        $("#histogramSlider").histogramSlider({
            data: data,
            sliderRange: [0, 1000000],
            optimalRange: [0, 1000000],
            selectedRange: [150000, 750000],
            numberOfBins: numBins, 
            showTooltips: false,
            showSelectedRange: false
        });
        /*
        numBins = 20;

        $("#histogramSlider2").histogramSlider({
            data: dataFactory(300, numBins, false),
            sliderRange: [0, 1000000],
            optimalRange: [0, 1000000],
            selectedRange: [200000, 750000],
            numberOfBins: numBins,
            showSelectedRange: false,
            showTooltips: false
        });*/

        //renderData(data);
        
        function dataFactory(itemCount, numberOfBins, group) {
            var data = { "items": [] };

            for (var i = 0; i < itemCount; i++) {
                var rnd = Math.floor(Math.random() * numberOfBins) + 1;
                var rnd2 = Math.floor(Math.random() * 120000);
                var v = ((1000000 / numberOfBins) - rnd2) * rnd;
                if (group) {
                    data.items.push({ "value": v, "count": rnd });
                } else {
                    data.items.push({ "value": v });
                }
            }

            return data;
        }
    }

    loadEdgeNav(edges) {
        /*var keys = Object.keys(edges[0]);

        keys.forEach(function(key){
            if (key[0]===key[0].toUpperCase()) {
                var div = document.createElement('div');
                div.style = "color:#fff; margin-left: 5px;"
                div.innerHTML = key;

                document.getElementById('nav_edges_content').appendChild(div);
                
                console.log(key);
            }
        });*/
    }


    /**
     * builds edgeDict dictionary with key: edge.source_node value:edgeList
     * should be called as soon as all edges are loaded
     *
     * @param edges sigma edges
     */
    buildEdgeDict(edges) {
        let _self = this;
        _self.edgeDict = {};

        edges.forEach(function(edge) {
            if (! (edge.source in _self.edgeDict)) {
                _self.edgeDict[edge.source] = [];
            }
            _self.edgeDict[edge.source].push(edge);
        });
    }

    /**
     * add a new filter
     *
     * @param filter filter to be added
     */
    addFilter(filter){
        this.filterArr.push(filter);
        this.recalcBoxes();
    }

    /**
     * updates existing filter at position for a given feature
     *
     * @param idx index of filter to be changed
     * @param feature feature-space to be changed
     * @param boundaries min-max of feature to be changed
     */
    updateFilter(idx, feature, boundaries) {
        this.filterArr[idx].nodeFilterMap.set(feature, boundaries);
        this.recalcBoxes();
    }

    /**
     *  removes a filter at a given index
     * @param idx
     */
    removeFilter(idx) {
        this.filterArr.splice(idx,1);
        this.recalcBoxes();
    }

    /**
     * retrieves all edges (outgoing/incoming dependend on current setup) for a supplied node
     * @param node_id id of the node to be queried
     * @returns {*} a list of edges without specific order, empty list if id is not known
     */
    getEdgesForNodes(node_id) {
        if (! (node_id in this.edgeDict)) {
            return [];
        } else {
            return this.edgeDict[node_id];
        }
    }

    /**
     * checks filter assignments again and updates all related views
     */
    recalcBoxes() {
        let boxNodes = this.getNodesPerBox();
        let boxEdges = this.getEdgesPerBox(boxNodes);

        // update colors of detail view
        this.detailView.recalcColoring(boxNodes, boxEdges);
    }

    /**
     * checks for each node to which filter it belongs to
     * checks are performed multidimensional (against all possible features)
     * every node is in max 1 single box
     * all nodes that do not match any filter are returned with the unmapped key
     *
     * @return {{mapped *[], unmapped: Array}} mapped: array of array of nodes, unmapped: array of all other nodes
     */
    getNodesPerBox() {
        let _self = this;

        // used to store box arrays
        let boxArr = [],
            i,
            unmapArr = [];

        // init 2D array
        for (i = 0; i < _self.filterArr.length; i++ ) {
            boxArr[i] = [];
        }

        // check for each node if it fits into a given multidimensional box
        _self.nodes.forEach(function(node) {
            // check each filter entry
            for (i=0; i<_self.filterArr.length; i++) {
                if (_self.filterArr[i].fitsForNode(node)) {
                    boxArr[i].push(node);
                    // return as node should only be added to first match
                    return;
                }
            }
            // no fitting filter found, add to unmapped
            unmapArr.push(node);
        });

        return {mapped:boxArr, unmapped:unmapArr};
    }

    /**
     * checks for each box which edges apply to all further filters
     * checks are performed for all possible features of an edge
     * all edges that do not met the required restrictions are added to the unmapped
     * edges of the unmapped nodes
     *
     * @return {{mapped *[], unmapped: Array}} mapped: array of array of edges, unmapped: array of all other egdes
     */
    getEdgesPerBox(boxNodes) {
        let _self = this;

        let boxArr = [],
            i,
            unmapArr = [];

        // if no boxes are given we retrieve them
        if (boxNodes === undefined) {
            boxNodes = this.getNodesPerBox();
        }

        // check all edges for each node box
        for (i=0; i<boxNodes.mapped.length;i++) {
            //init new array
            boxArr[i] = [];

            // check for each edge if it violates any edge-filters
            boxNodes.mapped[i].forEach(function(node){
                _self.getEdgesForNodes(node.id).forEach(function(edge){
                    if(_self.filterArr[i].fitsForEdge(edge)) {
                        boxArr[i].push(edge);
                    } else {
                        unmapArr.push(edge);
                    };
                });
            });
        }

        // push all egdes of all unmapped nodes to the new 'unmapped' array
        boxNodes.unmapped.forEach(function(node){
            _self.getEdgesForNodes(node.id).forEach(function(edge){
                unmapArr.push(edge);
            });
        });

        return {mapped:boxArr, unmapped:unmapArr};
    }

    /**
     * returns a list of the specified filter colors in the respective order
     * @returns {any[]}
     */
    getFilterColors() {
        return this.filterArr.map(filter => filter.markingColor);
    }
}

class Filter {
    constructor(filterArr, markingColor){
        this.nodeFilterMap = new Map();
        this.edgeFilterMap = new Map();
        this.markingColor = markingColor;
        filterArr.forEach(function(el){
            this.nodeFilterMap.set(el.feature, el.boundary);
        }, this);
    }

    /**
     * Multi-dimensional filtering
     * checks if a given node is within the boundaries of each feature (dimension)
     *
     * @param node node to be checked
     * @returns {boolean} true, if node is inside hyperplane (= no boundary is violated)
     */
    fitsForNode(node) {
        for (let feature of this.nodeFilterMap.keys()) {
            let boundary = this.nodeFilterMap.get(feature);
            if (boundary.min > node[feature] || boundary.max < node[feature]) {
                // node outside of this filter
                return false;
            }
        }

        // all checks passed - this node is within the multidimensional feature box
        return true;
    }

    /**
     * Multi-dimensional filtering
     * checks if a given edge is within the boundaries of each feature (dimension)
     *
     * @param edge edge to be checked
     * @returns {boolean} true, if no boundary is violated for the edge
     */
    fitsForEdge(edge) {
        for (let feature of this.edgeFilterMap.keys()) {
            let boundary = this.edgeFilterMap.get(feature);
            if (boundary.min > edge[feature] || boundary.max < edge[feature]) {
                // edge does not match criteria
                return false;
            }
        }

        // all checks passed - this node is within the multidimensional feature box
        return true;
    }
};