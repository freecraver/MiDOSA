"use strict";

let  // CAMERA MANAGEMENT:
    // ******************
    // The camera position when the user starts dragging:
    _startCameraX,
    _startCameraY,
    _startCameraAngle,

    // The latest stage position:
    _lastCameraX,
    _lastCameraY,
    _lastCameraAngle,
    _lastCameraRatio,

    // MOUSE MANAGEMENT:
    // *****************
    // The mouse position when the user starts dragging:
    _startMouseX,
    _startMouseY,

    _isMouseDown,
    _isMoving,
    _hasDragged,
    _downStartTime,
    _movingTimeoutId;

/**
 * The handler listening to the 'up' mouse event. It will stop dragging the
 * graph.
 *
 * @param {event} e A mouse event.
 * @param sigmaInstance
 */
function upHandler(e, sigmaInstance) {
    let settings  = sigmaInstance.settings;
    let camera = sigmaInstance.camera;

    if (settings('mouseEnabled') && _isMouseDown) {
        _isMouseDown = false;
        if (_movingTimeoutId)
            clearTimeout(_movingTimeoutId);

        camera.isMoving = false;

        // Update _isMoving flag:
        _isMoving = false;
    }
}

/**
 * The handler listening to the 'move' mouse event. It will effectively
 * drag the graph.
 *
 * @param {event} e A mouse event.
 * @param sigmaInstance
 */
function moveHandler(e, sigmaInstance) {
    let settings  = sigmaInstance.settings;
    let camera = sigmaInstance.camera;

    var x,
        y,
        pos;

    // Dispatch event:
    if (settings('mouseEnabled')) {

        if (_isMouseDown) {
            _isMoving = true;
            _hasDragged = true;

            if (_movingTimeoutId)
                clearTimeout(_movingTimeoutId);

            _movingTimeoutId = setTimeout(function() {
                _isMoving = false;
            }, settings('dragTimeout'));

            sigma.misc.animation.killAll(camera);

            camera.isMoving = true;
            pos = camera.cameraPosition(
                sigma.utils.getX(e) - _startMouseX,
                sigma.utils.getY(e) - _startMouseY,
                true
            );

            x = _startCameraX - pos.x;
            y = _startCameraY - pos.y;

            if (x !== camera.x || y !== camera.y) {
                _lastCameraX = camera.x;
                _lastCameraY = camera.y;

                camera.goTo({
                    x: x,
                    y: y
                });
            }

            if (e.preventDefault)
                e.preventDefault();
            else
                e.returnValue = false;

            e.stopPropagation();
            return false;
        }
    }
}

/**
 * The handler listening to the 'down' mouse event. It will start observing
 * the mouse position for dragging the graph.
 *
 * @param {event} e A mouse event.
 * @param sigmaInstance
 */
function downHandler(e, sigmaInstance) {
    let settings  = sigmaInstance.settings;
    let camera = sigmaInstance.camera;

    if (settings('mouseEnabled')) {
        _startCameraX = camera.x;
        _startCameraY = camera.y;

        _lastCameraX = camera.x;
        _lastCameraY = camera.y;

        _startMouseX = sigma.utils.getX(e);
        _startMouseY = sigma.utils.getY(e);

        _hasDragged = false;
        _downStartTime = (new Date()).getTime();

        switch (e.which) {
            case 2:
                // Middle mouse button pressed
                // Do nothing.
                break;
            case 3:
                // Right mouse button pressed
                break;
            // case 1:
            default:
                // Left mouse button pressed
                _isMouseDown = true;
        }
    }
}

/**
 * The handler listening to the 'click' mouse event. It will redispatch the
 * click event, but with normalized X and Y coordinates.
 *
 * @param {event} e A mouse event.
 * @param sigmaInstance
 */
function clickHandler(e, sigmaInstance) {
    let settings = sigmaInstance.settings;

    if (settings('mouseEnabled')) {
        var event = sigma.utils.mouseCoords(e);
        event.isDragging =
            (((new Date()).getTime() - _downStartTime) > 100) && _hasDragged;
    }

    if (e.preventDefault)
        e.preventDefault();
    else
        e.returnValue = false;

    e.stopPropagation();
    return false;
}

/**
 * The handler listening to the 'wheel' mouse event. It will basically zoom
 * in or not into the graph.
 *
 * @param {event} ev A propagated event.
 * @param sigmaInstance
 * @param canvas
 * @return {boolean}
 */
function wheelHandler(ev, sigmaInstance, canvas) {
    let e = ev.originalEvent;

    let pos,
        ratio,
        animation,
        wheelDelta = sigma.utils.getDelta(e);

    let settings = sigmaInstance.settings;
    let camera = sigmaInstance.camera;

    if (settings('mouseEnabled') && settings('mouseWheelEnabled') && wheelDelta !== 0) {
        ratio = wheelDelta > 0 ?
            1 / settings('zoomingRatio'):
            settings('zoomingRatio');

        // this seems to break zooming to anchor, as the supplied x/y positions are wrong
        // TODO: find error cause if fix is desired
        /*pos = camera.cameraPosition(
            sigma.utils.getX(e) - sigma.utils.getCenter(e).x,
            sigma.utils.getY(e) - sigma.utils.getCenter(e).y,
            false
        );*/

        animation = {
            duration: settings('mouseZoomDuration')
        };

        let canvasZoom = translateZoom(ratio, sigmaInstance);

        // hide fabric canvas while sigma is smoothly zooming
        $('#selection_canvas').hide();
        setTimeout(function() {
            $('#selection_canvas').show();
        }, settings('mouseZoomDuration'));

        //sigma.utils.zoomTo(camera, pos.x, pos.y, ratio, animation);
        sigma.utils.zoomTo(camera, 0, 0, ratio, animation);
        canvas.zoomToPoint({ x: canvas.width / 2, y: canvas.height/2}, canvasZoom);

        if (e.preventDefault)
            e.preventDefault();
        else
            e.returnValue = false;

        e.stopPropagation();
        return false;
    }
}

/**
 * converts sigma-zoom ratio to fabric-zoom ratio
 * @param ratio
 * @param sigmaInstance
 * @returns {number}
 */
function translateZoom(ratio, sigmaInstance) {
    let settings = sigmaInstance.settings;
    let camera = sigmaInstance.camera;

    let newRatio = Math.max(
        settings('zoomMin'),
        Math.min(
            settings('zoomMax'),
            camera.ratio * ratio
        )
    );

    return 1/newRatio;
}

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