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
const DETAIL_MIN_VAL = 0; //for scaling
const DETAIL_MAX_VAL = 1000; //for scaling

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

    // create a rectangle object
    var rect = new fabric.Rect({
        left: 100,
        top: 100,
        fill: 'transparent',
        stroke: 'red',
        opacity: 0.75,
        hasRotatingPoint: false,
        width: 200,
        height: 100,
        cornerSize: 5,
        transparentCorners: true
    });

// "add" rectangle onto canvas
    selectionCanvas.add(rect);
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
            readEdges();
            initDetailSelectionCanvas();
        });

    // hide/show detail view on collapse click (fix for sigma.js)
    $(".detail_panel .collapse-link").click(function(){ $("#detail_graph_container").toggle();});

    // hide/show edges on eye click
    $(".detail_panel  .edge_toggle").click(function() {
        $(".detail_panel  .edge_toggle > i").toggleClass('fa-eye fa-eye-slash');
        sigInst.settings("drawEdges", !sigInst.settings("drawEdges")); //toggle
        sigInst.refresh();
    })
});

/**
 * This edge renderer will display edges as curves with arrow heading.
 * SOURCE: sigma.js - copied because minification seemed to introduce problems
 *
 * @param  {object}                   edge         The edge object.
 * @param  {object}                   source node  The edge source node.
 * @param  {object}                   target node  The edge target node.
 * @param  {CanvasRenderingContext2D} context      The canvas context.
 * @param  {configurable}             settings     The settings function.
 */
sigma.canvas.edges.curvedArrow =
    function(edge, source, target, context, settings) {
        var color = edge.color,
            prefix = settings('prefix') || '',
            edgeColor = settings('edgeColor'),
            defaultNodeColor = settings('defaultNodeColor'),
            defaultEdgeColor = settings('defaultEdgeColor'),
            cp = {},
            size = edge[prefix + 'size'] || 1,
            tSize = target[prefix + 'size'],
            sX = source[prefix + 'x'],
            sY = source[prefix + 'y'],
            tX = target[prefix + 'x'],
            tY = target[prefix + 'y'],
            aSize = Math.max(size * 2.5, settings('minArrowSize')),
            d,
            aX,
            aY,
            vX,
            vY;

        cp = (source.id === target.id) ?
            sigma.utils.getSelfLoopControlPoints(sX, sY, tSize) :
            sigma.utils.getQuadraticControlPoint(sX, sY, tX, tY);

        if (source.id === target.id) {
            d = Math.sqrt(Math.pow(tX - cp.x1, 2) + Math.pow(tY - cp.y1, 2));
            aX = cp.x1 + (tX - cp.x1) * (d - aSize - tSize) / d;
            aY = cp.y1 + (tY - cp.y1) * (d - aSize - tSize) / d;
            vX = (tX - cp.x1) * aSize / d;
            vY = (tY - cp.y1) * aSize / d;
        }
        else {
            d = Math.sqrt(Math.pow(tX - cp.x, 2) + Math.pow(tY - cp.y, 2));
            aX = cp.x + (tX - cp.x) * (d - aSize - tSize) / d;
            aY = cp.y + (tY - cp.y) * (d - aSize - tSize) / d;
            vX = (tX - cp.x) * aSize / d;
            vY = (tY - cp.y) * aSize / d;
        }

        if (!color)
            switch (edgeColor) {
                case 'source':
                    color = source.color || defaultNodeColor;
                    break;
                case 'target':
                    color = target.color || defaultNodeColor;
                    break;
                default:
                    color = defaultEdgeColor;
                    break;
            }

        context.strokeStyle = color;
        context.lineWidth = size;
        context.beginPath();
        context.moveTo(sX, sY);
        if (source.id === target.id) {
            context.bezierCurveTo(cp.x2, cp.y2, cp.x1, cp.y1, aX, aY);
        } else {
            context.quadraticCurveTo(cp.x, cp.y, aX, aY);
        }
        context.stroke();

        context.fillStyle = color;
        context.beginPath();
        context.moveTo(aX + vX, aY + vY);
        context.lineTo(aX + vY * 0.6, aY - vX * 0.6);
        context.lineTo(aX - vY * 0.6, aY + vX * 0.6);
        context.lineTo(aX + vX, aY + vY);
        context.closePath();
        context.fill();
    };