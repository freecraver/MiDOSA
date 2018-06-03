"use strict";

const nodes_file = "res/nodes.json";
const edges_file = "res/edges.json";//json-file with ID-column

let detailGraph;
let selectionCanvas;
let rawNodes;
let rawEdges;
let x_axis = "LATITUDE";
let y_axis = "LONGITUDE";
let node_id_col = "IATA_CODE";
let source_node_col = "ORIGIN_AIRPORT";
let target_node_col = "DESTINATION_AIRPORT";
let edge_id_col = "EDGE_ID";
let sigInst;
let selectionBoxArr = [];
let filterArr = [];
const DETAIL_MIN_VAL = 0; //for scaling
const DETAIL_MAX_VAL = 1000; //for scaling

const colorPool = [[188,179,66],
    [132,98,202],
    [96,175,75],
    [201,97,177],
    [75,176,146],
    [205,73,59],
    [104,140,205],
    [200,129,67],
    [196,92,119],
    [118,125,56]];

class Filter {
    constructor(filterArr, markingColor){
        this.entryMap = new Map();
        this.markingColor = markingColor;
        filterArr.forEach(function(el){
            this.entryMap.set(el.feature, el.boundary);
        }, this);
    }
};

/**
 * Calculates min/max values for x/y axis
 * @param nodes
 * @returns {{x: {min: number, max: number}, y: {min: number, max: number}}}
 */
function getScalingParams(nodes){
    let max_x = Math.max.apply(Math,nodes.map(function(o){return o[x_axis];}));
    let min_x = Math.min.apply(Math,nodes.map(function(o){return o[x_axis];}));
    let max_y = Math.max.apply(Math,nodes.map(function(o){return o[y_axis];}));
    let min_y = Math.min.apply(Math,nodes.map(function(o){return o[y_axis];}));

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
function getScaled(value, scalingVals, scalingAxis="X") {
    if ((x_axis.toLowerCase().includes("latitude") || y_axis.toLowerCase().includes("latitude"))
        && (x_axis.toLowerCase().includes("longitude") || y_axis.toLowerCase().includes("longitude"))) {
        // apply latitude/longitude projection when both axis are coordinates
        if (scalingAxis === "X") {
            if (x_axis.toLowerCase().includes("latitude")) {
                return DETAIL_MAX_VAL/180 * (90 - value);
            } else {
                return DETAIL_MAX_VAL/720 * (180 + value);
            }
        } else {
            if (y_axis.toLowerCase().includes("latitude")) {
                return DETAIL_MAX_VAL/180 * (90 - value);
            } else {
                return DETAIL_MAX_VAL/720 * (180 + value);
            }
        }
    }

    // apply standard interval scaling
    return DETAIL_MIN_VAL + (DETAIL_MAX_VAL-DETAIL_MIN_VAL)/(scalingVals.max - scalingVals.min) *(value-scalingVals.min);
}

function readEdges() {
    rawEdges = [];
    let edgeCnt = 0;

    $("#detail_progress").css("visibility", "visible");
    oboe(edges_file)
        .node("!.*", function(edge) {
            edge.id = edge[edge_id_col];
            edge.source = edge[source_node_col];
            edge.target = edge[target_node_col];
            rawEdges.push(edge);
            detailGraph.addEdge(edge);
            if (edgeCnt++ % 987 == 0){
                $("#detail_progress").text("Loaded " + edgeCnt + " edges...");
            }
            return oboe.drop;
    })
        .done(function(json){
            $("#detail_progress").remove();
            sigInst.refresh();
        });
}

function initDetailSelectionCanvas() {
    let $SIGMA_SCENE = $("#detail_graph_container .sigma-scene");

    // create new selection canvas
    let copyCanvas = document.createElement("canvas");
    copyCanvas.id = "selection_canvas";
    copyCanvas.width = $SIGMA_SCENE.width();
    copyCanvas.height = $SIGMA_SCENE.height();
    $SIGMA_SCENE.parent()[0].appendChild(copyCanvas);

    selectionCanvas = new fabric.Canvas("selection_canvas");
    //set background to transparent to allow rendering of other layers
    selectionCanvas.setBackgroundColor(null);

    $("#detail_graph_container .canvas-container").on('mousewheel DOMMouseScroll', function (event) {
        wheelHandler(event, sigInst, selectionCanvas);
    });

    selectionCanvas.on('mouse:down', function(opt) {
        var evt = opt.e;
        // if no object is selected we try to pan both canvas
        if (selectionCanvas.getActiveObject() == null) {
            this.isDragging = true;
            this.selection = false;
            this.lastPosX = evt.clientX;
            this.lastPosY = evt.clientY;
            console.log("trigger down");
            downHandler(evt, sigInst);
        }
    });
    selectionCanvas.on('mouse:move', function(opt) {
        if (this.isDragging) {
            // panning of whole canvas
            var e = opt.e;
            this.viewportTransform[4] += e.clientX - this.lastPosX;
            this.viewportTransform[5] += e.clientY - this.lastPosY;
            this.requestRenderAll();
            this.lastPosX = e.clientX;
            this.lastPosY = e.clientY;
            console.log("trigger move");
            moveHandler(e, sigInst);
        } else if (selectionCanvas.getActiveObject() != null) {
            // move or transform a selection rectangle
            let rect = selectionCanvas.getActiveObject();
            let filterIdx = selectionBoxArr.indexOf(rect);
            let sigmaCoord = getSigmaCoordinatesFromFabric(rect);

            filterArr[filterIdx].entryMap.set(x_axis, {min: sigmaCoord.x1, max:sigmaCoord.x2});
            filterArr[filterIdx].entryMap.set(y_axis, {min: sigmaCoord.y1, max:sigmaCoord.y2});
            getBoxes();
        }
    });
    selectionCanvas.on('mouse:up', function(opt) {
        this.isDragging = false;
        this.selection = true;
        upHandler(opt.e, sigInst);
    });

    $("#detail_graph_container .canvas-container").on('click', function (event) {
        clickHandler(event, sigInst);
    });

    $("#detail_graph_container .canvas-container").on('mouseout', function (event) {
        selectionCanvas.isDragging = false;
        upHandler(event, sigInst);
    });

}

$(function() {
    // create new sigma instance
    // at startup do not show edges do prevent cluttering
    sigma.canvas.edges.def = sigma.canvas.edges.curvedArrow;
    sigInst = new sigma({
        container:'detail_graph_container',
        renderer: {
            container:document.getElementById('detail_graph_container'),
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
    detailGraph = sigInst.graph;

    // read nodes using oboe streaming
    oboe(nodes_file)
        .done(function(json){
            rawNodes = json; //load data
            let scalingArr = getScalingParams(rawNodes);

            rawNodes.forEach(function(rawNode){
                rawNode.x = getScaled(rawNode[x_axis], scalingArr.x, "X");
                rawNode.y = getScaled(rawNode[y_axis], scalingArr.y, "Y");
                rawNode.id = rawNode[node_id_col].toString();
                rawNode.size = 0.1;
                detailGraph.addNode(rawNode);
            });

            sigInst.refresh();
            //readEdges();
            initDetailSelectionCanvas();
        });

    // hide/show detail view on collapse click (fix for sigma.js)
    $(".detail_panel .collapse-link").click(function(){ $("#detail_graph_container").toggle();});

    // hide/show edges on eye click
    $(".detail_panel  .edge_toggle").click(function() {
        $(".detail_panel  .edge_toggle > i").toggleClass('fa-eye fa-eye-slash');
        sigInst.settings("drawEdges", !sigInst.settings("drawEdges")); //toggle
        sigInst.refresh();
    });

    // add new selection box on click
    $(".detail_panel .add_selection").click(addSelection);

    // key binder
    $(document).keydown(function(e) {
        switch(e.which) {
            case 46: // remove
                removeActiveSelection();
                break;
            default: return;
        }
        e.preventDefault(); // prevent the default action (scroll / move caret)
    });
});


/**
 * adds a new selection box
 */
function addSelection() {

    let selectionCnt = selectionBoxArr.length;
    let rgbVals = colorPool[selectionCnt % colorPool.length];
    let colorStr = "rgb("+ rgbVals[0] + "," + rgbVals[1] + "," + rgbVals[2] + ")";

    // set initial size relative to current zoom
    let sizeFactor = sigInst.camera.ratio;

    // position new elements within current view
    let positionOffset= selectionCanvas.calcViewportBoundaries().tl;

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

    let sigmaCoord = getSigmaCoordinatesFromFabric(rect);

    let filter = new Filter([
        {feature:x_axis, boundary:{min: sigmaCoord.x1, max:sigmaCoord.x2}},
        {feature:y_axis, boundary:{min: sigmaCoord.y1, max:sigmaCoord.y2}}
    ],
        colorStr);

// "add" rectangle onto canvas
    selectionCanvas.add(rect);
    selectionBoxArr.push(rect);
    filterArr.push(filter);
}

/**
 * removes the currently selected box in the detail view
 * does nothing if no box is selected
 */
function removeActiveSelection() {
    let activeRectangle = selectionCanvas.getActiveObject();

    if (activeRectangle != null) {
        let idx = selectionBoxArr.indexOf(activeRectangle);
        if (idx > -1) {
            selectionBoxArr.splice(idx, 1);
            filterArr.splice(idx, 1); // indexes are the same
        }
        selectionCanvas.remove(activeRectangle);
    }
}

/**
 * returns array of outgoing edges within selections
 */
function getBoxes() {

    let allNodes = sigInst.camera.graph.nodes();
    allNodes.forEach(function(node) {
        node.color = sigInst.settings('defaultNodeColor');
    });

    filterArr.forEach(function(el) {
        let x_min = -99999,
            x_max = 999999,
            y_min = -99999,
            y_max = 999999;

        // get boundaries for current features from filter
        if (el.entryMap.has(x_axis)) {
            let boundaries = el.entryMap.get(x_axis);
            x_min = boundaries.min;
            x_max = boundaries.max;
        }
        if (el.entryMap.has(y_axis)) {
            let boundaries = el.entryMap.get(y_axis);
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
    sigInst.refresh({ skipIndexation: true });
}

/**
 * translate from fabric canvas coordinates to sigma coordinates
 *
 * @param fbSelectionRectangle
 * @returns {{x1: number, x2: number, y1: number, y2: number}}
 */
function getSigmaCoordinatesFromFabric(fbSelectionRectangle) {
    let sigRectangle = sigInst.camera.getRectangle(sigInst.renderers[0].width, sigInst.renderers[0].height);
    let fbRectangle = selectionCanvas.calcViewportBoundaries();
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