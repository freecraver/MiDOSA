"use strict";

class Controller {

    constructor(detailView){
        this.filterArr = [];
        this.nodes = detailView.sigInst.camera.graph.nodes();
        this.detailView = detailView;
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
     * checks filter assignments again and updates all related views
     */
    recalcBoxes() {
        let boxNodes = this.getNodesPerBox();

        // update colors of detail view
        this.detailView.recalcColoring(boxNodes);
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
};