    "use strict";

    /**
     * used to distribute all changes between different views
     */
    class Controller {

        /**
         *
         * @param detailView reference to an initialized detailView instance that should be connected to the controller
         */
        constructor(detailView , overView){
            this.filterArr = [];
            this.nodes = detailView.sigInst.camera.graph.nodes();
            this.edges = undefined;
            this.edgeDict = undefined;
            this.detailView = detailView;
            this.overView = overView;
            this.filterPanel = new FilterPanel('selection-panel');
            this.useOutgoingEdges = true;
            this.filterSelected = false;
        }

        prepareJsonData(key, data) {
            //var retData = {};
            var itemData = {"items" : []};
            itemData.min=null;
            itemData.max=null;
            itemData.offset=0;

            for (var v in data) {
                for (var w in data[v]) {
                    if (w===key) {
                        itemData.items.push({"value" : data[v][w]});
                        if (itemData.min === null) {
                            itemData.min = data[v][w];
                        }
                        if (itemData.max === null) {
                            itemData.max = data[v][w];
                        }
                        if (data[v][w] < itemData.min) {
                            itemData.min = data[v][w];
                        }
                        if (data[v][w] > itemData.max) {
                            itemData.max = data[v][w];
                        }
                    }
                }

            }
            if (itemData.min < 0) {
                itemData.offset = Math.ceil(Math.abs(itemData.min));
            }
            return itemData;
        }

        createHistogramElement(elementId, name, data, drawHist) {
            var div = document.createElement('div');
            div.style="height:50px;";

            var innerdiv = document.createElement('div');
            innerdiv.id=name+"_histogram";
            innerdiv.style = "float:right; width:40%; padding-right: 10px;";

            var span = document.createElement('div');
            span.style = "color:#fff; padding-left: 10px; width:20%; text-align: right; padding-top: 3%; font-size: 10px;";
            span.className = "noselect";
            span.innerHTML=name.replace("_"," ");            

            div.appendChild(innerdiv);
            div.appendChild(span);
            document.getElementById(elementId).appendChild(div);

            if (drawHist===1) {
                var numBins = 40;
                var u = Math.min(0,Math.floor(data.min + data.offset));
                var o = Math.max(0,Math.ceil(data.max + data.offset));
                $(innerdiv).histogramSlider({
                    data: data,
                    sliderRange: [u,o],
                    optimalRange:[-1,-1],
                    selectedRange: [u,o],
                    height: 25,
                    numberOfBins: numBins, 
                    name: name,
                    controller: this,
                    showTooltips: false,
                    showSelectedRange: false
                });




/*
                $("#histogramSlider2").histogramSlider({
                    data: data,
                    sliderRange: [u,o],
                    optimalRange:[-1,-1],
                    selectedRange: [u,o],
                    height: 25,
                    numberOfBins: numBins, 
                    name: 'histogramSlider2',
                    controller: this,
                    showTooltips: true,
                    showSelectedRange: true
                });
                */
            }
        }

        loadNodeNav(nodes) {
            let _self = this;
            var domParent = document.getElementById('nav_nodes_content');
            domParent.innerHTML='';
            
            var keys = Object.keys(nodes[0]);            

            keys.forEach(function(key){
                if (key[0]===key[0].toUpperCase()) {
                    var numBins = 40;
                    //var data = dataFactory(10000, numBins, false);
                    var ndata = _self.prepareJsonData(key, _self.nodes);
                    
                    // create structure for 1 Slider Element                
                    if (key==="LATITUDE" || key==="LONGITUDE") {
                        _self.createHistogramElement('nav_nodes_content', key, ndata, 1);
                    }
                    else {
                        _self.createHistogramElement('nav_nodes_content', key, ndata, 0);
                    }
                }
            });

            // only for testing purposes
            function dataFactory(itemCount, numberOfBins, group) {
                var data = { "items": [] };

                for (var i = 0; i < itemCount; i++) {
                    var rnd = Math.floor(Math.random() * numberOfBins) + 1;
                    var rnd2 = Math.floor(Math.random() * 1200000);
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

        loadEdgeNav() {
            let _self = this;

            var domParent = document.getElementById('nav_edges_content');
            domParent.innerHTML='';

            var keys = Object.keys(_self.edges[0]);

            keys.forEach(function(key){
                if (key[0]===key[0].toUpperCase()) {
                    var numBins = 40;
                    var ndata = _self.prepareJsonData(key, _self.edges);

                    // create structure for 1 Slider Element                
                    if (key==="SCHEDULED_DEPARTURE" || key==="DEPARTURE_TIME" || key==="DEPARTURE_DELAYS" || key==="TAXI_OUT" || key==="WHEELS_OFF" ||
                        key === "SCHEDULED_TIME" || key==="ELAPSED_TIME" || key==="AIR_TIME" || key==="DISTANCE" || key==="WHEELS_ON" || key==="TAXI_IN" || 
                        key==="SCHEDULED_ARRIVAL" || key==="ARRIVAL_TIME"|| key==="ARRIVAL_DELAY"|| key==="AIR_SYSTEM_DELAY" || key==="SECURITY_DELAY" || 
                        key==="AIRLINE_DELAY" || key==="LATE_AIRCRAFT_DELAY"|| key==="WEATHER_DELAY") {
                        _self.createHistogramElement('nav_edges_content', key, ndata, 1);
                    }
                }
            });
        }


        /**
         * builds edgeDict dictionary with key: edge.source_node value:edgeList
         * should be called as soon as all edges are loaded
         *
         * @param edges sigma edges
         */
        buildEdgeDict(edges) {
            let _self = this;
            _self.edges = edges;
            _self.loadEdgeNav(edges);
            _self.edgeDict = {};

            edges.forEach(function(edge) {
                if (_self.useOutgoingEdges) {
                    if (!(edge.source in _self.edgeDict)) {
                        _self.edgeDict[edge.source] = [];
                    }
                    _self.edgeDict[edge.source].push(edge);
                } else {
                    if (!(edge.target in _self.edgeDict)) {
                        _self.edgeDict[edge.target] = [];
                    }
                    _self.edgeDict[edge.target].push(edge);
                }
            });
        }

        /**
         * moves a filter higher or lower in order
         *
         * @param filterIdx current index of the filter
         * @param isUpwards if true, index is reduced (upwards in sight)
         * @return the new index of the changed filter
         */
        moveFilter(filterIdx, isUpwards) {
            let newIdx = isUpwards ? filterIdx-1 : filterIdx+1;

            if (newIdx < 0 || newIdx >= this.filterArr.length) {
                // illegal change
                return filterIdx;
            }

            let switchFilter = this.filterArr[newIdx];
            this.filterArr[newIdx] = this.filterArr[filterIdx];
            this.filterArr[filterIdx] = switchFilter;

            // update filter panel
            this.filterPanel.switchFilterPanels(filterIdx, newIdx);
            // update detail view
            this.recalcBoxes();

            return newIdx;
        }

        /**
         * add a new filter
         *
         * @param filter filter to be added
         */
        addFilter(filter){

            var hs = $('#LATITUDE_histogram-slider');
            var options = $('#LATITUDE_histogram-slider').slider('option');

            this.filterArr.push(filter);
            this.filterPanel.addFilter(this.filterArr.length - 1, this.filterArr[this.filterArr.length-1].markingColor);
            this.recalcBoxes();

            //this.overView.addNode(new GroupedNode(this.filterArr.length-1));
        }

        /**
         * updates existing filter at position for a given feature
         *
         * @param idx index of filter to be changed
         * @param feature feature-space to be changed
         * @param boundaries min-max of feature to be changed
         * @param updateSelections if true, rectangles of detail view are updated
         */
        updateFilter(idx, feature, boundaries, updateSelections = true, updateHistograms = true) {
            this.filterArr[idx].nodeFilterMap.set(feature, boundaries);
            this.filterArr[idx].edgeFilterMap.set(feature, boundaries);

            if (updateSelections) {
                // only executed if flag is set
                // this ensures that selection box resizing does not trigger another resize of the changed box
                this.detailView.recalcSelectionBoxes(idx, this.filterArr[idx].nodeFilterMap);
            }
            if (updateHistograms) {
                if (feature==='LATITUDE') {
                    $('#'+feature+'_histogram-slider').slider('setValue',[boundaries.min, boundaries.max]);
                }
                if (feature==='LONGITUDE') {
                    $('#'+feature+'_histogram-slider').slider('setValue',[boundaries.min+170, boundaries.max+170]);   
                }
            }
            this.recalcBoxes();
        }

        /**
         * updates color of rectangle, nodes and edges
         *
         * @param idx index of filter to be changed
         * @param color new color for the respective filter
         */
        updateFilterColor(idx, color) {
            this.filterArr[idx].markingColor = color;

            this.recalcBoxes();
            this.detailView.setSelectionColor(idx, color);
        }

        /**
         *  removes a filter at a given index
         * @param idx
         */
        removeFilter(idx) {
            this.filterArr.splice(idx,1);
            this.filterPanel.removeFilter(idx);
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
         * updates all selection boxes of the detail view
         * this is useful if the active dimension for detail view changes
         */
        recalcSelectionBoxes(){
            let i;
            for (i=0; i< this.filterArr.length; i++) {
                this.detailView.recalcSelectionBoxes(i, this.filterArr[i].nodeFilterMap);
            }
        }

        /**
         * checks for each node to which filter it belongs to
         * checks are performed multidimensional (against all possible features)
         * every node is in max 1 single box
         * all nodes that do not match any filter are returned with the unmapped key
         *
         * @return {{Array, Array}} mapped: array of array of nodes, unmapped: array of all other nodes
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
         * @return {{Array, Array}} mapped: array of array of edges, unmapped: array of all other egdes
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
                this.edgeFilterMap.set(el.feature, el.boundary);
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

    class GroupedNode {
        constructor(id, nodes, outeredges, inneredges, markingColor) {
            this.id = id;
            this.nodes = nodes;
            this.outeredges = outeredges;
            this.inneredges = inneredges;
            this.markingColor = markingColor;
        }
    };