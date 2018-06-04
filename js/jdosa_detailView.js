"use strict";

class DetailView {

    constructor() {
        this.selectionCanvas = undefined;
        this.sigInst = undefined;
        this.selectionBoxArr = [];
        this.filterArr = [];
        this.min_val = 0;
        this.max_val = 1000;
        this.x_axis = undefined;
        this.y_axis = undefined;
    }

    /**
     * create new sigma instance
     * at startup do not show edges do prevent cluttering
     *
     * @param container_id id of div where detail graph should be displayed
     * @param panel_id id of the bootstrap panel wrapping the container
     */
    initSigma(container_id, panel_id) {
        let _self = this;

        sigma.canvas.edges.def = sigma.canvas.edges.curvedArrow;
        this.sigInst = new sigma({
            container:container_id,
            renderer: {
                container:document.getElementById(container_id),
                type: sigma.renderers.canvas
            },
            settings: {
                minNodeSize: 0.1,
                maxNodeSize: 1,
                drawEdges: false,
                minArrowSize: 4,
                zoomMin: 0.1
            }
        });

        // hide/show detail view on collapse click (fix for sigma.js)
        $("#" + panel_id + " .collapse-link").click(function(){ $("#" + container_id).toggle();});

        // hide/show edges on eye click
        $("#" + panel_id + " .edge_toggle").click(function() {
            $("#" + panel_id + " .edge_toggle > i").toggleClass('fa-eye fa-eye-slash');
            _self.sigInst.settings("drawEdges", !_self.sigInst.settings("drawEdges")); //toggle
            _self.sigInst.refresh();
        });

        // add new selection box on click
        $("#" + panel_id + " .add_selection").click(function (){_self.addSelection(_self);});

        // key binder
        $(document).keydown(function(e) {
            switch(e.which) {
                case 46: // remove
                    _self.removeActiveSelection();
                    break;
                default: return;
            }
            e.preventDefault(); // prevent the default action (scroll / move caret)
        });
    }

    /**
     * read in all nodes from the specified JSON-file
     * and sets default axis
     *
     * @param file path to the JSON-file to be loaded
     * @param node_id_col column name from file used as ID
     * @param x_axis  column name from file used as horizontal axis
     * @param y_axis  column name from file used as vertical axis
     */
    readNodes(file, node_id_col, x_axis, y_axis) {
        this.x_axis = x_axis;
        this.y_axis = y_axis;
        let _self = this;

        // read nodes using oboe streaming
        oboe(file)
            .done(function(json){
                let rawNodes = json; //load data
                let scalingArr = _self.getScalingParams(rawNodes);

                rawNodes.forEach(function(rawNode){
                    rawNode.x = _self.getScaled(rawNode[x_axis], scalingArr.x, "X");
                    rawNode.y = _self.getScaled(rawNode[y_axis], scalingArr.y, "Y");
                    rawNode.id = rawNode[node_id_col].toString();
                    rawNode.size = 0.1;
                    _self.sigInst.graph.addNode(rawNode);
                });

                _self.sigInst.refresh();
                _self.initDetailSelectionCanvas();
            });
    }

    /**
     * reads in all edges from the specified JSON-File
     * and reports progress to a supplied div
     *
     * @param file path to the JSON-file to be loaded
     * @param progress_div a jquery-element that displays the current progress
     * @param edge_id_col column name from file used as ID
     * @param source_node_col column name from file used as source element
     * @param target_node_col  column name from file used as target element
     */
    readEdges(file, progress_div, edge_id_col, source_node_col, target_node_col) {
        let _self  = this;
        let rawEdges = [];
        let edgeCnt = 0;
        let graph = this.sigInst.graph;

        progress_div.css("visibility", "visible");
        oboe(file)
            .node("!.*", function(edge) {
                edge.id = edge[edge_id_col];
                edge.source = edge[source_node_col];
                edge.target = edge[target_node_col];
                rawEdges.push(edge);
                graph.addEdge(edge);
                if (edgeCnt++ % 987 == 0){
                    progress_div.text("Loaded " + edgeCnt + " edges...");
                }
                return oboe.drop;
            })
            .done(function(json){
                progress_div.remove();
                _self.sigInst.refresh();
            });
    }

    /**
     * inits the fabric canvas which is used to create selection rectangles and
     * also inits the transmission of mouse events to the sigma canvas
     */
    initDetailSelectionCanvas() {
        let _self = this;

        let $SIGMA_SCENE = $("#detail_graph_container .sigma-scene");

        // create new selection canvas
        let copyCanvas = document.createElement("canvas");
        copyCanvas.id = "selection_canvas";
        copyCanvas.width = $SIGMA_SCENE.width();
        copyCanvas.height = $SIGMA_SCENE.height();
        $SIGMA_SCENE.parent()[0].appendChild(copyCanvas);

        _self.selectionCanvas = new fabric.Canvas("selection_canvas");
        //set background to transparent to allow rendering of other layers
        _self.selectionCanvas.setBackgroundColor(null);

        $("#detail_graph_container .canvas-container").on('mousewheel DOMMouseScroll', function (event) {
            wheelHandler(event, _self.sigInst, _self.selectionCanvas);
        });

        _self.selectionCanvas.on('mouse:down', function(opt) {
            var evt = opt.e;
            // if no object is selected we try to pan both canvas
            if (_self.selectionCanvas.getActiveObject() == null) {
                this.isDragging = true;
                this.selection = false;
                this.lastPosX = evt.clientX;
                this.lastPosY = evt.clientY;
                downHandler(evt, _self.sigInst);
            }
        });
        _self.selectionCanvas.on('mouse:move', function(opt) {
            if (this.isDragging) {
                // panning of whole canvas
                var e = opt.e;
                this.viewportTransform[4] += e.clientX - this.lastPosX;
                this.viewportTransform[5] += e.clientY - this.lastPosY;
                this.requestRenderAll();
                this.lastPosX = e.clientX;
                this.lastPosY = e.clientY;
                moveHandler(e, _self.sigInst);
            } else if (_self.selectionCanvas.getActiveObject() != null) {
                // move or transform a selection rectangle
                let rect = _self.selectionCanvas.getActiveObject();
                let filterIdx = _self.selectionBoxArr.indexOf(rect);
                let sigmaCoord = _self.getSigmaCoordinatesFromFabric(rect);

                _self.filterArr[filterIdx].entryMap.set(_self.x_axis, {min: sigmaCoord.x1, max:sigmaCoord.x2});
                _self.filterArr[filterIdx].entryMap.set(_self.y_axis, {min: sigmaCoord.y1, max:sigmaCoord.y2});
                _self.getBoxes(_self);
            }
        });
        _self.selectionCanvas.on('mouse:up', function(opt) {
            this.isDragging = false;
            this.selection = true;
            upHandler(opt.e, _self.sigInst);
        });

        $("#detail_graph_container .canvas-container").on('click', function (event) {
            clickHandler(event, _self.sigInst);
        });

        $("#detail_graph_container .canvas-container").on('mouseout', function (event) {
            _self.selectionCanvas.isDragging = false;
            upHandler(event, _self.sigInst);
        });

    }

    /**
     * adds a new selection box
     */
    addSelection(view) {

        let selectionCnt = view.selectionBoxArr.length;
        let rgbVals = colorPool[selectionCnt % colorPool.length];
        let colorStr = "rgb("+ rgbVals[0] + "," + rgbVals[1] + "," + rgbVals[2] + ")";

        // set initial size relative to current zoom
        let sizeFactor = view.sigInst.camera.ratio;

        // position new elements within current view
        let positionOffset= view.selectionCanvas.calcViewportBoundaries().tl;

        // create a rectangle object
        let rect = new fabric.Rect({
            left:  positionOffset.x + 150 * sizeFactor,
            top: positionOffset.y + 150 * sizeFactor,
            fill: 'transparent',
            stroke: colorStr,
            opacity: 0.75,
            hasRotatingPoint: false,
            width: 200 * sizeFactor,
            height: 100 * sizeFactor,
            cornerSize: 5,
            transparentCorners: true
        });

        let sigmaCoord = view.getSigmaCoordinatesFromFabric(rect);

        let filter = new Filter([
                {feature:view.x_axis, boundary:{min: sigmaCoord.x1, max:sigmaCoord.x2}},
                {feature:view.y_axis, boundary:{min: sigmaCoord.y1, max:sigmaCoord.y2}}
            ],
            colorStr);

// "add" rectangle onto canvas
        view.selectionCanvas.add(rect);
        view.selectionBoxArr.push(rect);
        view.filterArr.push(filter);
    }

    /**
     * removes the currently selected box in the detail view
     * does nothing if no box is selected
     */
    removeActiveSelection() {
        let activeRectangle = this.selectionCanvas.getActiveObject();

        if (activeRectangle != null) {
            let idx = this.selectionBoxArr.indexOf(activeRectangle);
            if (idx > -1) {
                this.selectionBoxArr.splice(idx, 1);
                this.filterArr.splice(idx, 1); // indexes are the same
            }
            this.selectionCanvas.remove(activeRectangle);
        }
    }

    /**
     * returns array of outgoing edges within selections
     */
    getBoxes(view) {

        let allNodes = view.sigInst.camera.graph.nodes();
        allNodes.forEach(function(node) {
            node.color = view.sigInst.settings('defaultNodeColor');
        });

        view.filterArr.forEach(function(el) {
            let x_min = -99999,
                x_max = 999999,
                y_min = -99999,
                y_max = 999999;

            // get boundaries for current features from filter
            if (el.entryMap.has(view.x_axis)) {
                let boundaries = el.entryMap.get(view.x_axis);
                x_min = boundaries.min;
                x_max = boundaries.max;
            }
            if (el.entryMap.has(view.y_axis)) {
                let boundaries = el.entryMap.get(view.y_axis);
                y_min = boundaries.min;
                y_max = boundaries.max;
            }

            // sigma quadtree calculation is buggy -> therefore check all nodes (not dramatic as we don't have many nodes)
            // sigma wants to have same y_min twice (potential error in sigInst.camera.getRectangle ?)
            //let curNodes = sigInst.camera.quadtree.area({x1: x_min, x2: x_max, y1: y_min, y2: y_min, height: y_max-y_min});
            let curNodes = allNodes.filter(node => node["read_cam0:x"] >= x_min && node["read_cam0:x"] <= x_max
                && node["read_cam0:y"] >= y_min && node["read_cam0:y"] <= y_max);
            curNodes.forEach(function(node){
                node.color = el.markingColor;
            });
        });
        view.sigInst.refresh({ skipIndexation: true });
    }

    /**
     * translate from fabric canvas coordinates to sigma coordinates
     *
     * @param fbSelectionRectangle
     * @returns {{x1: number, x2: number, y1: number, y2: number}}
     */
     getSigmaCoordinatesFromFabric(fbSelectionRectangle) {
        let sigRectangle = this.sigInst.camera.getRectangle(this.sigInst.renderers[0].width, this.sigInst.renderers[0].height);
        let fbRectangle = this.selectionCanvas.calcViewportBoundaries();
        let fbWidth = fbRectangle.tr.x - fbRectangle.tl.x,
            fbHeight = fbRectangle.bl.y - fbRectangle.tl.y,
            sigWidth = sigRectangle.x2 - sigRectangle.x1,
            sigHeight = sigRectangle.height;

        // calculate proportional distance within fabric space
        let x_min_prop = (fbSelectionRectangle.left - fbRectangle.tl.x) / fbWidth,
            x_max_prop = (fbSelectionRectangle.left + fbSelectionRectangle.width * fbSelectionRectangle.scaleX - fbRectangle.tl.x) / fbWidth,
            y_min_prop = (fbSelectionRectangle.top - fbRectangle.tl.y) / fbHeight,
            y_max_prop = (fbSelectionRectangle.top + fbSelectionRectangle.height * fbSelectionRectangle.scaleY - fbRectangle.tl.y) / fbHeight;

        /*console.log("Translated pairs (" + fbSelectionRectangle.left + "," + (sigRectangle.x1 + x_min_prop * sigWidth) + ");("
                                         + (fbSelectionRectangle.left + fbSelectionRectangle.width * fbSelectionRectangle.scaleX) + "," + (sigRectangle.x1 + x_max_prop * sigWidth) + ");("
                                         + fbSelectionRectangle.top + "," + (sigRectangle.y1 + y_min_prop * sigHeight) + ");("
                                         + (fbSelectionRectangle.top + fbSelectionRectangle.height * fbSelectionRectangle.scaleY) + "," + (sigRectangle.y1 + y_max_prop * sigHeight) +")");
        */

        // return rectangle fitted to sigma space
        return {
            x1: sigRectangle.x1 + x_min_prop * sigWidth,
            x2: sigRectangle.x1 + x_max_prop * sigWidth,
            y1: sigRectangle.y1 + y_min_prop * sigHeight,
            y2: sigRectangle.y1 + y_max_prop * sigHeight
        };
    }

    /**
     * Calculates min/max values for x/y axis
     * @param nodes
     * @returns {{x: {min: number, max: number}, y: {min: number, max: number}}}
     */
    getScalingParams(nodes){
        let _self = this;
        let max_x = Math.max.apply(Math,nodes.map(function(o){return o[_self.x_axis];}));
        let min_x = Math.min.apply(Math,nodes.map(function(o){return o[_self.x_axis];}));
        let max_y = Math.max.apply(Math,nodes.map(function(o){return o[_self.y_axis];}));
        let min_y = Math.min.apply(Math,nodes.map(function(o){return o[_self.y_axis];}));

        return {x: {min: min_x,max: max_x},y: {min: min_y,max: max_y}};
    }

    /**
     * scale value from old interval to interval [DETAIL_MIN_VAL, DETAIL_MAX_VAL]
     * or perform longitude/latitude projection for coordinates
     * @param value
     * @param scalingVals
     * @param scalingAxis either 'X' or 'Y'
     * @returns number position in interval
     */
    getScaled(value, scalingVals, scalingAxis="X") {
        if ((this.x_axis.toLowerCase().includes("latitude") || this.y_axis.toLowerCase().includes("latitude"))
            && (this.x_axis.toLowerCase().includes("longitude") || this.y_axis.toLowerCase().includes("longitude"))) {
            // apply latitude/longitude projection when both axis are coordinates
            if (scalingAxis === "X") {
                if (this.x_axis.toLowerCase().includes("latitude")) {
                    return this.max_val/180 * (90 - value);
                } else {
                    return this.max_val/720 * (180 + value);
                }
            } else {
                if (this.y_axis.toLowerCase().includes("latitude")) {
                    return this.max_val/180 * (90 - value);
                } else {
                    return this.max_val/720 * (180 + value);
                }
            }
        }

        // apply standard interval scaling
        return this.min_val + (this.max_val-this.min_val)/(scalingVals.max - scalingVals.min) *(value-scalingVals.min);
    }

}

class Filter {
    constructor(filterArr, markingColor){
        this.entryMap = new Map();
        this.markingColor = markingColor;
        filterArr.forEach(function(el){
            this.entryMap.set(el.feature, el.boundary);
        }, this);
    }
};