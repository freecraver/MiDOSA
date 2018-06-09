"use strict";

class DetailView {

    constructor() {
        this.selectionCanvas = undefined;
        this.sigInst = undefined;
        this.selectionBoxArr = [];
        this.min_val = 0;
        this.max_val = 500;
        this.x_axis = undefined;
        this.y_axis = undefined;
        this.scalingParamMap = new Map();
        this.showAllEdges = false;
    }

    /**
     * create new sigma instance
     * at startup do not show edges do prevent cluttering
     *
     * @param container_id id of div where detail graph should be displayed
     * @param panel_id id of the bootstrap panel wrapping the container
     * @param use_web_gl if true, webgl is used for rendering (keep in mind that less functionality is supported)
     */
    initSigma(container_id, panel_id, use_web_gl) {
        let _self = this;

        if (!use_web_gl) {
            sigma.canvas.edges.def = sigma.canvas.edges.curvedArrow;
        }

        this.sigInst = new sigma({
            container:container_id,
            renderer: {
                container:document.getElementById(container_id),
                type: (use_web_gl ? 'webgl' : 'canvas')
            },
            settings: {
                minNodeSize: 1,
                maxNodeSize: 1,
                minArrowSize: 4,
                zoomMin: 0.1,
                autoRescale: false,
                hideEdgesOnMove: true
            }
        });

        // hide/show detail view on collapse click (fix for sigma.js)
        $("#" + panel_id + " .collapse-link").click(function(){ $("#" + container_id).toggle();});

        // hide/show unmapped edges on eye click
        $("#" + panel_id + " .edge_toggle").click(function() {
            $("#" + panel_id + " .edge_toggle > i").toggleClass('fa-eye fa-eye-slash');
            _self.showAllEdges = ! _self.showAllEdges;
            controller.recalcBoxes();
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
     * positions sigma camera to the center of our scale
     * and removes scaling
     */
    setCameraToCenter() {
        let center_pos = (this.max_val - this.min_val) / 2;
        this.sigInst.camera.goTo({x:center_pos, y:center_pos, ratio:1});
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

                _self.initDimensionSwitcher(rawNodes[0]);

                // get scaling parameter from raw data (we don't have sigma nodes at this point)
                _self.fetchScalingParams(x_axis, rawNodes);
                _self.fetchScalingParams(y_axis, rawNodes);

                rawNodes.forEach(function(rawNode){
                    rawNode.x = _self.getScaled(rawNode[x_axis], x_axis);
                    rawNode.y = _self.getScaled(rawNode[y_axis], y_axis);
                    rawNode.id = rawNode[node_id_col].toString();
                    rawNode.size = _self.sigInst.settings("minNodeSize");
                    _self.sigInst.graph.addNode(rawNode);
                });

                _self.sigInst.refresh();
                _self.initDetailSelectionCanvas();
                _self.setCameraToCenter();
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
                edge.hidden = !_self.showAllEdges;
                rawEdges.push(edge);
                graph.addEdge(edge);
                if (edgeCnt++ % 987 == 0){
                    progress_div.text("Loaded " + edgeCnt + " edges...");
                }
                return oboe.drop;
            })
            .done(function(json){
                progress_div.remove();
                controller.buildEdgeDict(_self.sigInst.camera.graph.edges());
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
                controller.updateFilter(filterIdx, _self.x_axis, {min: featureCoord.x1, max:featureCoord.x2}, false);
                controller.updateFilter(filterIdx, _self.y_axis, {min: featureCoord.y1, max:featureCoord.y2}, false);
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

        // update canvas size on screen resize
        $(window).resize(function() {
            $(".canvas-container").width($SIGMA_SCENE.width());
            $(".canvas-container").height($SIGMA_SCENE.height());
            $(".upper-canvas").width($SIGMA_SCENE.width());
            $(".upper-canvas").height($SIGMA_SCENE.height());
            $("#selection_canvas").width($SIGMA_SCENE.width());
            $("#selection_canvas").height($SIGMA_SCENE.height());
        });

    }

    /**
     * inits detail-view box toggle
     * enables users to switch dimensions
     * @param node node used to check available dimensions
     */
    initDimensionSwitcher(node){
        // get all keys
        let keys = Object.keys(node);
        let _self = this;

        for (let i = 0; i < keys.length; i++) {
            let val = node[keys[i]];

            // only numeric values for detail graph
            if (isNaN(val)) {
                continue;
            }

            $("#y_axis_selector ul").append('<li><a id="y_axis_sel_' + keys[i] +'">' + keys[i] + '</a></li>');
            $("#y_axis_sel_" + keys[i]).on('click', function (event) {
                $("#y_axis_sel_" + keys[i]).addClass("active");
                $("#y_axis_sel_" + _self.y_axis).removeClass("active");
                _self.setYDimension(keys[i]);
            });
            $("#x_axis_selector ul").append('<li><a id="x_axis_sel_' + keys[i] +'">' + keys[i] + '</a></li>');
            $("#x_axis_sel_" + keys[i]).on('click', function (event) {
                $("#x_axis_sel_" + keys[i]).addClass("active");
                $("#x_axis_sel_" + _self.x_axis).removeClass("active");
                _self.setXDimension(keys[i]);
            });
        }

        // set currently active selection
        $("#x_axis_sel_" + _self.x_axis).addClass("active");
        $("#y_axis_sel_" + _self.y_axis).addClass("active");
    }

    /**
     * sets the active x-dimension for the detail view
     * changes the positions of all nodes and selection boxes
     *
     * @param feature_name feature to be used as new x-axis
     */
    setXDimension(feature_name){
        let _self = this;

        _self.x_axis = feature_name;

        // update all node positions
        _self.sigInst.camera.graph.nodes().forEach(function(node){
            node.x = _self.getScaled(node[feature_name], feature_name);
        });

        _self.sigInst.refresh();

        // update selection boxes
        controller.recalcSelectionBoxes();
    }

    /**
     * sets the active y-dimension for the detail view
     * changes the positions of all nodes and selection boxes
     *
     * @param feature_name feature to be used as new y-axis
     */
    setYDimension(feature_name){
        let _self = this;

        _self.y_axis = feature_name;

        // update all node positions
        _self.sigInst.camera.graph.nodes().forEach(function(node){
            node.y = _self.getScaled(node[feature_name], feature_name);
        });

        _self.sigInst.refresh();

        // update selection boxes
        controller.recalcSelectionBoxes();
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
     * colors all mapped nodes and edges to the respective color of the filter
     *
     * @param nodeBoxResult result of filter search [containing 'mapped' & 'unmapped' nodes]
     * @param edgeBoxResult result of filter search [containing 'mapped' & 'unmapped' edges]
     */
    recalcColoring(nodeBoxResult, edgeBoxResult) {
        this.recalcNodeColoring(nodeBoxResult);
        // change coloring & refresh graph
        this.recalcEdgeColoring(edgeBoxResult, true);
    }

    /**
     * colors all mapped nodes to the respective color of the filter
     *
     * @param boxResult result of filter search [containing 'mapped' & 'unmapped' nodes]
     * @param refresh if true the sigma graph is updated
     */
    recalcNodeColoring(boxResult, refresh=false) {
        let colorArr = controller.getFilterColors();
        let _self = this;

        // color all matched nodes
        for (let i = 0; i< boxResult.mapped.length; i++) {
            let curColor = colorArr[i];
            boxResult.mapped[i].forEach(function(node) {
                node.color = curColor;
            });
        }

        // if we've made a selection color other nodes grey
        let nodeColor = (boxResult.mapped.length > 0 ? 'rgb(224,224,224)' : _self.sigInst.settings('defaultNodeColor'));

        // color all unmatched nodes
        boxResult.unmapped.forEach(function(node) {
            node.color = nodeColor;
        });

        if (refresh) {
            _self.sigInst.refresh({skipIndexation: true});
        }
    }

    /**
     * colors all mapped edges to the respective color of the filter
     *
     * @param boxResult result of filter search [containing 'mapped' & 'unmapped' edges]
     * @param refresh if true the sigma graph is updated
     */
    recalcEdgeColoring(boxResult, refresh=false) {
        let colorArr = controller.getFilterColors();
        let _self = this;

        // color all matched nodes
        for (let i = 0; i< boxResult.mapped.length; i++) {
            let curColor = colorArr[i];
            boxResult.mapped[i].forEach(function(edge) {
                edge.hidden = false;
                edge.color = curColor;
            });
        }

        // if we've made a selection color other edges grey
        let edgeColor = (boxResult.mapped.length > 0 ? 'rgb(224,224,224)' : _self.sigInst.settings('defaultNodeColor'));

        // hide or mark all unmatched edges
        boxResult.unmapped.forEach(function(edge) {
            edge.hidden = !_self.showAllEdges;
            edge.color = edgeColor;
        });

        if (refresh) {
            _self.sigInst.refresh({skipIndexation: true});
        }
    }

    /**
     *  Change selection boxes in detail view according to supplied filters
     *  This can be used to keep selection boxes up to date with filter changes
     *  from outside
     *
     * @param idx index of the rectangle to be changed
     * @param nodeFilterMap all node filters of the related filter
     */
    recalcSelectionBoxes(idx, nodeFilterMap) {
        let x_min = -99999,
            x_max = 999999,
            y_min = -99999,
            y_max = 999999;

        if (nodeFilterMap.has(this.x_axis)) {
            let boundary = nodeFilterMap.get(this.x_axis);
            x_min = boundary.min;
            x_max = boundary.max;
        }

        if (nodeFilterMap.has(this.y_axis )) {
            let boundary = nodeFilterMap.get(this.y_axis);
            y_min = boundary.min;
            y_max = boundary.max;
        }

        let sigmaRectangle = this.getSigmaCoordinatesFromFeature({x1:x_min, x2:x_max, y1:y_min, y2:y_max});
        let fabricRectangle = this.getFabricRectangleFromSigmaCoordinates(sigmaRectangle);

        // update rectangle size
        let recToChange = this.selectionBoxArr[idx];
        recToChange.left = fabricRectangle.left;
        recToChange.top = fabricRectangle.top;
        recToChange.width = fabricRectangle.width;
        recToChange.height = fabricRectangle.height;
        // tell fabric to redraw border
        recToChange.dirty = true;

        this.selectionCanvas.renderAll();
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
     * translate from sigma coordinates to fabric rectangle
     *
     * @param sigmaCoordinates
     * @returns {{x1: number, x2: number, y1: number, y2: number}}
     */
    getFabricRectangleFromSigmaCoordinates(sigmaCoordinates) {
        let sigRectangle = this.sigInst.camera.getRectangle(this.sigInst.renderers[0].width, this.sigInst.renderers[0].height);
        let fbRectangle = this.selectionCanvas.calcViewportBoundaries();
        let fbWidth = fbRectangle.tr.x - fbRectangle.tl.x,
            fbHeight = fbRectangle.bl.y - fbRectangle.tl.y,
            sigWidth = sigRectangle.x2 - sigRectangle.x1,
            sigHeight = sigRectangle.height;

        // calculate proportional distance within sigma space
        let x_min_prop = (sigmaCoordinates.x1 - sigRectangle.x1) / sigWidth,
            x_max_prop = (sigmaCoordinates.x2 - sigRectangle.x1) / sigWidth,
            y_min_prop = (sigmaCoordinates.y1 - sigRectangle.y1) / sigHeight,
            y_max_prop = (sigmaCoordinates.y2 - sigRectangle.y1) / sigHeight;


        // return rectangle fitted to zoomed and panned fabric space
        return {
            left: fbRectangle.tl.x + x_min_prop * fbWidth,
            top: fbRectangle.tl.y + y_min_prop * fbHeight,
            width: fbRectangle.tl.x + x_max_prop * fbWidth - (fbRectangle.tl.x + x_min_prop * fbWidth),
            height: fbRectangle.tl.y + y_max_prop * fbHeight - (fbRectangle.tl.y + y_min_prop * fbHeight)
        };
    }

    /**
     * Translates sigma coordinates to feature coordinates by applying un/re-scaling
     * @param sigmaRectangle rectangle of sigma coordinates
     *
     * @returns {{x1: number, x2: number, y1: number, y2: number}}
     */
    getFeatureCoordinatesFromSigma(sigmaRectangle) {
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
     * Translates feature coordinates to sigma coordinates by applying scaling
     * @param featureRectangle rectangle of feature coordinates
     *
     * @returns {{x1: number, x2: number, y1: number, y2: number}}
     */
    getSigmaCoordinatesFromFeature(featureRectangle) {
        let x1 = this.getScaled(featureRectangle.x1, this.x_axis),
            x2 = this.getScaled(featureRectangle.x2, this.x_axis),
            y1 = this.getScaled(featureRectangle.y1, this.y_axis),
            y2 = this.getScaled(featureRectangle.y2, this.y_axis);

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
     * @param value original feature-value to be fitted into sigma-space
     * @param feature feature for which the value should be scaled
     * @returns number position in interval
     */
    getScaled(value, feature) {
        let scalingVals = this.fetchScalingParams(feature);

        // apply standard interval scaling
        let scaledVal = this.min_val + (this.max_val-this.min_val)/(scalingVals.max - scalingVals.min) *(value-scalingVals.min);

        // latitude is higher at "top" (north pole)
        if (feature.toLowerCase().includes("latitude")) {
            scaledVal *= -1;
            scaledVal += this.max_val;
        }

        return scaledVal;
    }

    /**
     * revert scaling from [DETAIL_MIN_VAL, DETAIL_MAX_VAL] to old interval
     * @param scaledValue value from sigma-space to be converted back to original feature space
     * @param feature feature for which the value should be unscaled
     * @returns {number}
     */
    getUnscaled(scaledValue, feature) {
        let scalingVals = this.fetchScalingParams(feature);

        // inverse for latitude
        if (feature.toLowerCase().includes("latitude")) {
            scaledValue -= this.max_val;
            scaledValue *= -1;
        }

        // apply standard interval scaling
        return scalingVals.min + (scalingVals.max - scalingVals.min) / (this.max_val - this.min_val) * (scaledValue - this.min_val);;
    }

};