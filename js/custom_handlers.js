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