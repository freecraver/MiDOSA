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
        this.idxNodeMap = [];
        this.cnt = 0;
        this.min_val = 0;
        this.max_val = 500;
        this.x_axis = undefined;
        this.y_axis = undefined;
        this.activateEdgeLabels = false;
        this.nodeSuffix = '_node';
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
        console.log("init overview sigma");
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
                minNodeSize: 40,
                maxNodeSize: 40,
                minEdgeSize: 1,
                maxEdgeSize: 20,
                minArrowSize: 4,
                zoomMin: 0.01,
                autoRescale: true,
                hideEdgesOnMove: false,
                edgesPowRatio: 1,
                edgeLabelSize: 'proportional',

            }
        });
        //CustomShapes.init(this.sigInst);
        // hide/show detail view on collapse click (fix for sigma.js)
        $("#" + panel_id + " .collapse-link").click(function(){ $("#" + container_id).toggle();});

        // hide/show unmapped edges on eye click
        $("#" + panel_id + " .edge_toggle").click(function() {
            $("#" + panel_id + " .edge_toggle > i").toggleClass('fa-eye fa-eye-slash');
            _self.activateEdgeLabels = !_self.activateEdgeLabels;
            _self.toggleEdgeLabels(_self.activateEdgeLabels);
            _self.sigInst.refresh();
        });

        // key binder
        $(document).keydown(function(e) {
            e.preventDefault(); // prevent the default action (scroll / move caret)
        });
    }

    /**
     * Toggles the edge labels
     * @param flag indicates if edge labels shall be drawn.
     */
    toggleEdgeLabels(flag) {
        let _self = this;
        _self.sigInst.graph.edges().forEach(function(edge) {
            if (flag) {
                edge.label = edge.hlabel;
            } else {
                edge.label = '';
            }
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
     * inits the fabric canvas which is used to create the overview nodes and
     * also inits the transmission of mouse events to the sigma canvas
     * @param x_axis  column name from file used as horizontal axis
     * @param y_axis  column name from file used as vertical axis
     */
    initOverviewSelectionCanvas(x_axis, y_axis) {
        console.log("initOverviewSelectionCanvas");
        let _self = this;

        _self.x_axis = x_axis;
        _self.y_axis = y_axis;

        let $SIGMA_SCENE = $("#overview_graph_container .sigma-scene");

        // create new selection canvas
        let copyCanvas = document.createElement("canvas");
        copyCanvas.id = "overview_canvas";
        copyCanvas.width = $SIGMA_SCENE.width();
        copyCanvas.height = $SIGMA_SCENE.height();
        $SIGMA_SCENE.parent()[0].appendChild(copyCanvas);

        _self.selectionCanvas = new fabric.Canvas("overview_canvas");
        //set background to transparent to allow rendering of other layers
        _self.selectionCanvas.setBackgroundColor(null);

        $("#overview_graph_container .canvas-container").on('mousewheel DOMMouseScroll', function (event) {
            wheelHandler(event, _self.sigInst, _self.selectionCanvas);
        });

        _self.selectionCanvas.on('mouse:down', function(opt) {
            var evt = opt.e;
                this.isDragging = true;
                this.selection = false;
                this.lastPosX = evt.clientX;
                this.lastPosY = evt.clientY;
                downHandler(evt, _self.sigInst);
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
            }
        });
        _self.selectionCanvas.on('mouse:up', function(opt) {
            this.isDragging = false;
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

    /**
     * Returns the node id behind the mapping index
     * @param idx the filter index (mapping index)
     */
    getNodeId(idx) {
        return this.idxNodeMap[idx].id;
    }
    /**
     * Returns the node id behind the mapping index
     * @param idx the filter index (mapping index)
     */
    getNodePosition(idx) {
        return this.idxNodeMap[idx].pos;
    }

    /**
     * Adds a groupedNode to the canvas, which consists of nodes and edges
     * that are aggregated in a single node. Edges are not considered when
     * then node is initially added.
     * @param groupedNode The node that is added. Precondition: id, markingColor, nodes and edges must be set.
     */
    addNode(groupedNode) {        
        let _self = this;
        let i = this.cnt++;
        let id = i+_self.nodeSuffix;
        

        let node = new Object();
        node.id = id;

        node = _self.calculateNodePosition(node);
        node.size = _self.sigInst.settings("minNodeSize");
        node.type = 'square';
        node.color = groupedNode.markingColor;
        node.edges = groupedNode.edges;
        
        _self.idxNodeMap.push({'id': id, 'pos':_self.sigInst.graph.edges().length});
        _self.sigInst.graph.addNode(node);
        //_self.updateEdges(node);
        _self.sigInst.refresh();
        //_self.setCameraToCenter();
    }

    /**
     * Removes a node from the canvas.
     * @param idx the idx of the detailView filter
     */
    removeNode(idx) {
        let _self = this;
        let nodepos = _self.getNodePosition(idx);
        for (var i = 0; i < _self.idxNodeMap.length; i++) {
            if (_self.idxNodeMap[i].pos >= nodepos) {
                _self.idxNodeMap[i].pos = _self.idxNodeMap[i].pos-1;
            }
        }
        _self.sigInst.graph.dropNode(_self.getNodeId(idx));

        _self.idxNodeMap.splice(idx, 1);
        _self.sigInst.refresh();
    }

    /**
     * Updates the inner edges and nodes of an overview node.
     * @param idx the idx of the detailView-filter
     * @param the inner nodes
     * @param the outer nodes
     */
    updateNodeEdges(idx, nodes, edges) {
        let _self = this;
        var i;
        for (i=0; i<_self.sigInst.graph.nodes().length;i++) {
            var node = _self.sigInst.graph.nodes()[i];
            if (node.id === _self.getNodeId(idx)) {
                node.nodes = nodes;
                node.edges = edges;
                _self.updateEdges(node);
                break;
            }
        }
    }

    /**
     * Updates and draws edges to the canvas
     * @param newNode the node whichs edges are to be drawn.
     */
    updateEdges(newNode) {
        let _self = this;
        if (_self.idxNodeMap.length>=1) {
            _self.sigInst.graph.nodes().forEach(function(outerNode) {
                var newedge = new Object();
                newedge.id = outerNode.id+newNode.id;
                newedge.source = outerNode.id;
                newedge.target = newNode.id;
                
                newedge.color = outerNode.color;
                var update = false;
                var i;
                for (i=0; i<_self.sigInst.graph.edges().length;i++) {
                    var outerEdge = _self.sigInst.graph.edges()[i];
                    if (outerEdge.id==newedge.id) {
                        newedge = outerEdge;
                        update=true;
                        break;
                    }
                }
                
                newedge.size = 0;
                if (newNode.nodes!== undefined) {
                    newNode.nodes.forEach(function(n2) {
                        outerNode.edges.forEach(function(e) {
                            if (e.target===n2.id)
                                newedge.size = newedge.size+1;
                        });
                    });
                }
                var countedsize = newedge.size;
                
                newedge.hlabel = ''+countedsize; 
                if (_self.activateEdgeLabels) {
                    newedge.label = newedge.hlabel;
                }

                newedge.type = 'curvedArrow';
                newedge.size=(newedge.size/100)+1;
                if (update==false){
                    _self.sigInst.graph.addEdge(newedge);
                }
                if (countedsize == 0){
                    _self.sigInst.graph.dropEdge(newedge.id);
                }

            });

            _self.sigInst.graph.nodes().forEach(function(outerNode) {
                var newedge = new Object();
                newedge.id = newNode.id+outerNode.id;
                newedge.source =  newNode.id;
                newedge.target = outerNode.id;
                
                newedge.color = newNode.color;
                var update = false;
                var i;
                for (i=0; i<_self.sigInst.graph.edges().length;i++) {
                    var outerEdge = _self.sigInst.graph.edges()[i];
                    if (outerEdge.id==newedge.id) {
                        newedge = outerEdge;
                        update=true;
                        break;
                    }
                }

                newedge.size = 0;

                if (outerNode.nodes!== undefined) {
                    outerNode.nodes.forEach(function(n2) {
                        newNode.edges.forEach(function(e) {
                            if (e.target===n2.id)
                                newedge.size = newedge.size+1;
                        });
                    });
                }

                var countedsize = newedge.size;

                newedge.hlabel = ''+countedsize; 
                if (_self.activateEdgeLabels) {
                    newedge.label = newedge.hlabel;
                }

                newedge.size=(newedge.size/100)+1;
                newedge.type = 'curvedArrow';
                if (update==false){
                    _self.sigInst.graph.addEdge(newedge);
                }

                if (countedsize == 0){
                    _self.sigInst.graph.dropEdge(newedge.id);
                }

            });


        }
        _self.sigInst.refresh();
    }

    updateColor(idx, color) {
        console.log("update Color");
        let _self = this;
        var node = _self.sigInst.graph.nodes()[_self.getNodePosition(idx)];
        node.color = color;

        _self.sigInst.graph.edges().forEach(function(edge) {
            if (edge.source===node.id) {
                edge.color = color;
            }
        });
        _self.sigInst.refresh();
    }

    switchFilterIdx(filterIdx,newIdx) {
        let oldval = this.idxNodeMap[filterIdx];
        this.idxNodeMap[filterIdx] = this.idxNodeMap[newIdx];
        this.idxNodeMap[newIdx] = oldval;
    }

    /**
     * calculates a simple node positions for the sigma nodes
     * the node is not yet pushed to graph.nodes() or the mapping array
     * @param node The node the positioning is set for
     * @returns the node with calculated .x and .y
     */
    calculateNodePosition(node) {
        let _self = this;
        
        var nodeDistance = _self.sigInst.settings("minNodeSize");
        if (_self.idxNodeMap.length==0) {
            node.x = (_self.max_val/2);// - nodeDistance;
            node.y = (_self.max_val/2);// - nodeDistance;
            return node;
        }
        
        if (_self.cnt%2 == 0) {
            //var prevnode = _self.groupedNodeArr[_self.idxNodeMap.length-2];
            var sigmanode = _self.sigInst.graph.nodes()[_self.idxNodeMap.length-1];
            sigmanode.x = (_self.max_val/2) - nodeDistance; 

            node.x = (sigmanode.x) + nodeDistance*2;
            node.y = sigmanode.y;
            return node;
        } else {
            //var prevnode = _self.groupedNodeArr[_self.groupedNodeArr.length-3];
            var i = Math.max(_self.sigInst.graph.nodes().length-2,0);
            console.log("i: "+i);
            var sigmanode = _self.sigInst.graph.nodes()[i];

            node.x = (_self.max_val/2);
            node.y = sigmanode.y+nodeDistance*2;
            return node;
        }
    }
};