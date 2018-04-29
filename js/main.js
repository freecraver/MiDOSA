const nodes_file = "res/nodes.json" ;//json-file with ID-column

let detailGraph;
let rawNodes;
let x_axis = "LATITUDE";
let y_axis = "LONGITUDE";
let id_col = "IATA_CODE";
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

$(function() {

    // create new sigma instance
    sigInst = new sigma({
        container:document.getElementById('detail_graph_container'),
        settings: {
            minNodeSize: 0.1,
            maxNodeSize: 1
        }
    });
    detailGraph = sigInst.graph;

    $.getJSON(nodes_file, function(json) {
        rawNodes = json; //load data
        let scalingArr = getScalingParams(rawNodes);

        rawNodes.forEach(function(rawNode){
            rawNode.x = getScaled(rawNode[x_axis], scalingArr.x, "X");
            rawNode.y = getScaled(rawNode[y_axis], scalingArr.y, "Y");
            rawNode.id = rawNode[id_col].toString();
            rawNode.size = 0.1;
            console.log(rawNode);
            detailGraph.addNode(rawNode);
        });

        sigInst.refresh();
    });
});