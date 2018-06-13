"use strict";

/**
 * used to handle everything related to the overview
 * handles Sigma instances and their interplay
 */
class OverView {

    /**
     * creates a new over view with given settings
     */
    constructor() {
        this.selectionCanvas = undefined;
        this.sigInst = undefined;
        this.groupedNodeArr = [];
        this.min_val = 0;
        this.max_val = 500;
        this.x_axis = undefined;
        this.y_axis = undefined;
        this.initOverviewSelectionCanvas();
    }

    /**
     * create new sigma instance
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
                minNodeSize: 10,
                maxNodeSize: 10,
                minArrowSize: 14,
                zoomMin: 0.1,
                autoRescale: true,
                hideEdgesOnMove: false
            }
        });

        // hide/show overview on collapse click (fix for sigma.js)
        $("#" + panel_id + " .collapse-link").click(function(){ $("#" + container_id).toggle();});

        // change incoming/outgoing edges on click
        $("#" + panel_id + " .change_edge_dir").click(function (){
            //controller.useOutgoingEdges = !controller.useOutgoingEdges;
            //controller.buildEdgeDict(_self.sigInst.camera.graph.edges());
            //controller.recalcBoxes();
            _self.sigInst.refresh({skipIndexation: true});
        });

        // key binder
        $(document).keydown(function(e) {
            e.preventDefault(); // prevent the default action (scroll / move caret)
        });
    }

    initOverviewSelectionCanvas() {
        let _self = this;

        let $SIGMA_SCENE = $("#overview_graph_container");

        // create new selection canvas
        let copyCanvas = document.createElement("canvas");
        copyCanvas.id = "overview_canvas";
        copyCanvas.width = $SIGMA_SCENE.width();
        copyCanvas.height = $SIGMA_SCENE.height();
        $SIGMA_SCENE.parent()[0].appendChild(copyCanvas);

        _self.selectionCanvas = new fabric.Canvas("overview_canvas");
        //set background to transparent to allow rendering of other layers
        _self.selectionCanvas.setBackgroundColor(null);

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

        $("#overview_graph_container .canvas-container").on('click', function (event) {
            clickHandler(event, _self.sigInst);
        });

        $("#overview_graph_container .canvas-container").on('mouseout', function (event) {
            _self.selectionCanvas.isDragging = false;
            upHandler(event, _self.sigInst);
        });

        // update canvas size on screen resize
        $(window).resize(function() {
            $(".canvas-container").width($SIGMA_SCENE.width());
            $(".canvas-container").height($SIGMA_SCENE.height());
            $(".upper-canvas").width($SIGMA_SCENE.width());
            $(".upper-canvas").height($SIGMA_SCENE.height());
            $("#overview_canvas").width($SIGMA_SCENE.width());
            $("#overview_canvas").height($SIGMA_SCENE.height());
        });
    }

    addNode(groupedNode) {
        console.log("overview addNode");
        let _self = this;
        groupedNode.size=_self.sigInst.settings("minNodeSize");
        _self.sigInst.graph.addNode(groupedNode);
        _self.sigInst.refresh();
    }

    removeNode(groupedNode) {

    }

    updateNode(groupedNode) {

    }

    /**
     * positions sigma camera to the center of our scale
     * and removes scaling
     */
    setCameraToCenter() {
        let center_pos = (this.max_val - this.min_val) / 2;
        this.sigInst.camera.goTo({x:center_pos, y:center_pos, ratio:1});
    }
};