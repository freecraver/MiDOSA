"use strict";

class DetailView {

    constructor() {
        this.selectionCanvas = undefined;
        this.sigInst = undefined;
        this.selectionBoxArr = [];
        this.min_val = 0;
        this.max_val = 1000;
        this.x_axis = undefined;
        this.y_axis = undefined;
        this.scalingParamMap = new Map();
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
     * @param callback_function function to be executed as soon as loading finishes
     */
    readNodes(file, node_id_col, x_axis, y_axis, callback_function) {
        this.x_axis = x_axis;
        this.y_axis = y_axis;
        let _self = this;

        // read nodes using oboe streaming
        oboe(file)
            .done(function(json){
                let rawNodes = json; //load data

                // get scaling parameter from raw data (we don't have sigma nodes at this point)
                _self.fetchScalingParams(x_axis, rawNodes);
                _self.fetchScalingParams(y_axis, rawNodes);

                rawNodes.forEach(function(rawNode){
                    rawNode.x = _self.getScaled(rawNode[x_axis], x_axis);
                    rawNode.y = _self.getScaled(rawNode[y_axis], y_axis);
                    rawNode.id = rawNode[node_id_col].toString();
                    rawNode.size = 0.1;
                    _self.sigInst.graph.addNode(rawNode);
                });

                _self.sigInst.refresh();
                _self.initDetailSelectionCanvas();
                callback_function();
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
                let featureCoord = _self.getFeatureCoordinatesFromSigma(sigmaCoord);

                // notify controller
                controller.updateFilter(filterIdx, _self.x_axis, {min: featureCoord.x1, max:featureCoord.x2});
                controller.updateFilter(filterIdx, _self.y_axis, {min: featureCoord.y1, max:featureCoord.y2});
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
        let featureCoord = view.getFeatureCoordinatesFromSigma(sigmaCoord);

        let filter = new Filter([
                {feature:view.x_axis, boundary:{min: featureCoord.x1, max:featureCoord.x2}},
                {feature:view.y_axis, boundary:{min: featureCoord.y1, max:featureCoord.y2}}
            ],
            colorStr);

        view.selectionCanvas.add(rect);
        view.selectionBoxArr.push(rect);
        controller.addFilter(filter);
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
                controller.removeFilter(idx);
            }
            this.selectionCanvas.remove(activeRectangle);
        }
    }

    /**
     * colors all mapped nodes to the respective color of the filter
     *
     * @param boxResult result of filter search [containing 'mapped' & 'unmapped' nodes]
     */
    recalcColoring(boxResult) {
        let colorArr = controller.getFilterColors();
        let _self = this;

        // color all matched nodes
        for (let i = 0; i< boxResult.mapped.length; i++) {
            let curColor = colorArr[i];
            boxResult.mapped[i].forEach(function(node) {
                node.color = curColor;
            });
        }

        // color all unmatched nodes
        boxResult.unmapped.forEach(function(node) {
            node.color = _self.sigInst.settings('defaultNodeColor');
        });

        _self.sigInst.refresh({ skipIndexation: true });
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


        // return rectangle fitted to sigma space
        return {
            x1: sigRectangle.x1 + x_min_prop * sigWidth,
            x2: sigRectangle.x1 + x_max_prop * sigWidth,
            y1: sigRectangle.y1 + y_min_prop * sigHeight,
            y2: sigRectangle.y1 + y_max_prop * sigHeight
        };
    }

    /**
     * Translates sigma coordinates to feature coordinates by applying un/re-scaling
     * @param sigmaRectangle rectangle of sigma coordinates
     *
     * @returns {{x1: number, x2: number, y1: number, y2: number}}
     */
    getFeatureCoordinatesFromSigma(sigmaRectangle) {
        // TODO: take scaling and panning of camera into consideration :-(
        let x1 = this.getUnscaled(sigmaRectangle.x1, this.x_axis),
            x2 = this.getUnscaled(sigmaRectangle.x2, this.x_axis),
            y1 = this.getUnscaled(sigmaRectangle.y1, this.y_axis),
            y2 = this.getUnscaled(sigmaRectangle.y2, this.y_axis);

        // return min/max as left-most variable does not need to be the biggest (lat/lng)
        return {
            x1: Math.min(x1, x2),
            x2: Math.max(x1, x2),
            y1: Math.min(y1, y2),
            y2: Math.max(y1, y2)
        };
    }

    /**
     * fetches min/max values for feature
     *
     * @param feature feature to be queried
     * @param nodes nodes to be checked (optional: if not present the nodes of the sigma instance are used)
     * @returns {min: number, max: number} minima/maxima
     */
    fetchScalingParams(feature, nodes){
        let _self = this;

        if (_self.scalingParamMap.has(feature)) {
            return _self.scalingParamMap.get(feature);
        } else {

            // no nodes supplied -> get from sigma
            if (nodes == undefined) {
                nodes = _self.sigInst.camera.graph.nodes();
            }

            // calculate max-min
            let max = Math.max.apply(Math, nodes.map(function (o) {
                return o[feature];
            }));
            let min = Math.min.apply(Math, nodes.map(function (o) {
                return o[feature];
            }));

            // cache for consecutive queries
            _self.scalingParamMap.set(feature, {min: min, max: max});
            return {min: min, max: max};
        }
    }

    /**
     * scale value from old interval to interval [DETAIL_MIN_VAL, DETAIL_MAX_VAL]
     * or perform longitude/latitude projection for coordinates
     * @param value
     * @param scalingVals
     * @param scalingAxis either 'X' or 'Y'
     * @returns number position in interval
     */
    getScaled(value, feature) {
        let scalingVals = this.fetchScalingParams(feature);

        // approx
        if (feature.toLowerCase().includes("latitude")) {
            return this.max_val/180 * (90 - value);
        } else if (feature.toLowerCase().includes("longitude")) {
            return this.max_val/720 * (180 + value);
        }

        // apply standard interval scaling
        return this.min_val + (this.max_val-this.min_val)/(scalingVals.max - scalingVals.min) *(value-scalingVals.min);
    }

    /**
     * revert scaling from [DETAIL_MIN_VAL, DETAIL_MAX_VAL] to old interval
     * or revert longitude/latitude projection for coordinates
     * @param scaledValue
     * @param feature
     * @returns {number}
     */
    getUnscaled(scaledValue, feature) {
        // TODO: change coordinate approximation scaling

        let scalingVals = this.fetchScalingParams(feature);

        // approx
        if (feature.toLowerCase().includes("latitude")) {
            return 90 - 180 * scaledValue / this.max_val;
        } else if (feature.toLowerCase().includes("longitude")) {
            return 720 * scaledValue / this.max_val - 180;
        }

        // apply standard interval scaling
        return scalingVals.min + (scalingVals.max - scalingVals.min) / (this.max_val - this.min_val) * (scaledValue - this.min_val);
    }

};