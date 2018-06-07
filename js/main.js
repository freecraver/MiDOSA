"use strict";

// Settings
const NODES_FILE = "res/nodes.json";
const EDGES_FILE = "res/edges.json";//json-file with ID-column
const SOURCE_NODE_COL = "ORIGIN_AIRPORT";
const TARGET_NODE_COL = "DESTINATION_AIRPORT";
const EDGE_ID_COL = "EDGE_ID";
const X_AXIS = "LONGITUDE";
const Y_AXIS = "LATITUDE";
const NODE_ID_COL = "IATA_CODE";
const USE_WEB_GL = true;

let dtView;
let controller;

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


$(function() {

    let callback_node_load_complete = function() {
        controller = new Controller(dtView);
        dtView.readEdges(EDGES_FILE, $("#detail_progress"), EDGE_ID_COL, SOURCE_NODE_COL, TARGET_NODE_COL);
    };

    dtView = new DetailView();
    dtView.initSigma('detail_graph_container', 'detail_panel', USE_WEB_GL);
    dtView.readNodes(NODES_FILE, NODE_ID_COL, X_AXIS, Y_AXIS, callback_node_load_complete);

});

