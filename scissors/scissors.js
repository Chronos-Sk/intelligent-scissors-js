// Created: A while ago

function Scissors() {
	this.lineColor = "red"; //new Array(255, 0, 0, 255);
	this.fadeColor = "black";
	this.fadeAlpha = 0.5;
	
	this.output = null; // Element to stick output text
	
	this.image_canvas = null; // Canvas for drawing image
	this.line_canvas = null; // Canvas for drawing commited lines
	this.scratch_canvas = null; // Canvas for drawing preview lines
	
	this.image_ctx = null;
	this.line_ctx = null;
	this.scratch_ctx = null;
	
	this.scissorsWorker = null;
	this.trainCheck = null;
	
	this.mousePoint = new Point(0, 0);
	this.exampleLineDrawn = false;
	
	this.isDrawing = false;
	
	this.snapSize = 2;
	this.startPointSize = 4;
	this.start = null;
	this.overStart = false;
	
	this.imageUrl = null;
	this.img = null;
	
	this.dragScrolling = false;
	this.dragScrollSpeed = 1.25;
	
	this.paths = new Array(); // Array of completed paths.
	this.currentPath = new Array(); // Array of subpaths (which are arrays of points)
	// Note: each subpath goes backwards, from the destination to the source.
}

// Creates a new canvas element and adds it to the DOM
Scissors.prototype.createCanvas = function(id, zIndex) {
	var imageNode = this.img;

	var canvas = document.createElement("canvas");
	canvas.id = id;
	canvas.width = imageNode.width;
	canvas.height = imageNode.height;
	
	var style = canvas.style;
	style.position = "absolute";
	style.top = "0px";
	style.left = "0px";
	style.zIndex = zIndex;
	
	if ( imageNode.nextSibling ) {
		imageNode.parentNode.insertBefore(canvas, imageNode.nextSibling);
	} else {
		imageNode.parentNode.appendChild(canvas);
	}
	
	return canvas;
};

// Converts absolute coordinates to canvas coordinates.
Scissors.prototype.getCanvasPoint = function(x, y) {
	return getRelativePoint(this.image_canvas, x, y);
};

// Initializes everything, creates all of the canvases, and starts the Web
// Workers.
Scissors.prototype.init = function(img, mask, visualize) {
	this.img = img;
	
	this.trainCheck = document.getElementById("trainCheck");
	this.output = document.getElementById("output");
	
	this.image_canvas = this.createCanvas("image_canvas", 0);
	this.line_canvas = this.createCanvas("line_canvas", 1);
	this.scratch_canvas = this.createCanvas("scratch_canvas", 2);
	this.image_ctx = this.image_canvas.getContext("2d");
	this.line_ctx = this.line_canvas.getContext("2d");
	this.scratch_ctx = this.scratch_canvas.getContext("2d");
	
	this.image_canvas.style.position = 'static'; // So Scissors takes up space.
	
	this.image_canvas.width = this.img.naturalWidth;
	this.image_canvas.height = this.img.naturalHeight;
	this.line_canvas.width = this.image_canvas.width;
	this.line_canvas.height = this.image_canvas.height;
	this.scratch_canvas.width = this.image_canvas.width;
	this.scratch_canvas.height = this.image_canvas.height;
	
	this.image_ctx.drawImage(this.img, 0, 0, this.image_canvas.width, this.image_canvas.height);
	
	this.scissorsWorker = new ScissorsWorker("scissors/scissorsWorker.js");

	this.drawFromPoint = null;
	this.drawData = null;
	
	this.visualize = visualize;
	if ( visualize ) {
		this.line_ctx.strokeRect(mask.aoi[0], mask.aoi[1], mask.aoi[2], mask.aoi[3]);
	}

	// wrapHandler is a function in util.js that makes sure the handler is called with the
	// appropriate "this" reference.
	this.scissorsWorker.ondata = wrapHandler(this, this.onData);
	this.scissorsWorker.onerror = wrapHandler(this, this.onError);
	this.scissorsWorker.onstatus = wrapHandler(this, this.onStatus);

	if ( mask ) {
		this.mask = mask.points;
		this.aoi = mask.aoi;
	}
	
	this.scissorsWorker.setImageData(this.image_ctx, this.aoi, this.mask);
	
	if ( mask && mask.image ) {
		this.fadeImage(mask.image);
	}
	
	this.scratch_canvas.addEventListener("mousemove", wrapHandler(this, this.mouseMove), false);
	this.scratch_canvas.addEventListener("mousedown", wrapHandler(this, this.mouseClick), true);
	this.scratch_canvas.addEventListener("mouseup", wrapHandler(this, this.mouseUp), true);
	this.scratch_canvas.addEventListener("mouseout", wrapHandler(this, this.endDragScrolling), true);
	this.scratch_canvas.addEventListener("contextmenu", function (event) {
		event.preventDefault();
	});
	
	var updateCursor = wrapHandler(this, this.updateCursor);
	this.updateCursorHandler = updateCursor;
	this.scratch_canvas.addEventListener("mouseover", updateCursor, true);
	
	var body = document.getElementsByTagName('body')[0];
	body.addEventListener("keydown", updateCursor, true);
	body.addEventListener("keyup", updateCursor, true);
};

Scissors.prototype.onData = function(data) {
	if ( this.isDrawing && !this.exampleLineDrawn && this.mousePoint ) {
		// If we haven't drawn the path to the current mouse point...
		
		// ...and we can draw that path.
		if ( this.scissorsWorker.hasPathFor(this.mousePoint) ) {
			// Draw it!
			this.updatePreview();
		}
	}
	
	if ( this.visualize ) {
		if (this.drawFromPoint != this.scissorsWorker.curPoint) {
			this.drawData = this.line_ctx.getImageData(0,0, this.image_canvas.width, this.image_canvas.height);
			this.drawFromPoint = this.scissorsWorker.curPoint;
		}
		
		var drawData = this.drawData;
		for ( var i = 0; i < data.length; i += 2 ) {
			q = data[i+1];

			if ( !q ) {
				continue;
			}
			
			idx = (q.y*drawData.width + q.x) * 4;
			
			drawData.data[idx] = 255;
			drawData.data[idx+1] = 0;
			drawData.data[idx+2] = 255;
			drawData.data[idx+3] = 255;
		}
		this.line_ctx.putImageData(drawData, 0, 0);
	}
};

Scissors.prototype.onError = function(event){
	this.output.textContent = event.message;
	throw new Error(event.message + " (" + event.filename + ":" + event.lineno + ")");
};

Scissors.prototype.onStatus = function(msg) {
	this.output.textContent = msg;
	this.updateCursor(msg);
};

Scissors.prototype.fadeImage = function(image) {
	var aoi = this.aoi;
	var fade = this.createCanvas("tempFade", -100);
	fadeCtx = fade.getContext('2d');

	fadeCtx.globalCompositeOperation = "xor";
	fadeCtx.fillStyle = this.fadeColor;
	fadeCtx.fillRect(0, 0, fade.width, fade.height);
	fadeCtx.drawImage(image, aoi[0], aoi[1], aoi[2], aoi[3]); // Subtract mask
	
	var image_ctx = this.image_ctx;
	image_ctx.save();
	image_ctx.globalAlpha = this.fadeAlpha;
	this.image_ctx.drawImage(fade, 0, 0, fade.width, fade.height);
	image_ctx.restore();
	
	fade.parentNode.removeChild(fade);
};

Scissors.prototype.destroy = function() {
	var container = this.img.parentNode;
	var children = container.childNodes;
	var idx = 0;
	while ( children.length > 1 ) {
		if ( children[idx].id != image_id ) {
			container.removeChild(children[idx]);
		} else {
			idx++;
		}
	}
	
	var body = document.getElementsByTagName('body')[0];
	body.removeEventListener('keydown', this.updateCursorHandler);
	body.removeEventListener('keyup', this.updateCursorHandler);
	
	this.scissorsWorker.destroy();
};

// Aborts the current computation and stops showing potential paths
Scissors.prototype.stopDrawing = function() {
	this.isDrawing = false;
	this.scissorsWorker.stop();
	this.scissorsWorker.resetTraining();
	this.scratch_ctx.clearRect(0, 0, this.scratch_canvas.width, this.scratch_canvas.height);
	
	if ( this.currentPath.length > 0 ) {
		this.paths.push(this.currentPath);
		this.currentPath = new Array();
	}
	
	this.start = null;
};

// Puts this object in the drawing state
Scissors.prototype.drawing = function(p) {
	this.isDrawing = true;
	this.start = p;
};

// Deletes all of the saved lines so far
Scissors.prototype.clearLines = function() {
	this.stopDrawing();
	this.paths = new Array(); // Clear stored paths
	this.line_ctx.clearRect(0, 0, this.line_canvas.width, this.line_canvas.height);
	
	this.start = null;
};

// Updates whether the algorithm should do live training, according to the
// trainCheck's value
Scissors.prototype.setTraining = function() {
	this.scissorsWorker.setTraining(this.trainCheck.value);
};

// Returns true if the last path saved is closed (i.e., its last point is
// equal to its first).
Scissors.prototype.isClosed = function() {
	// Closed attribute of most recent path, if any
	if ( this.isDrawing ) {
		return this.isPathClosed(this.currentPath);
	} else if ( this.paths.length > 0 ) {
		return this.isPathClosed(this.paths[this.paths.length-1]);
	} else {
		return false;
	}
};

// Returns whether the supplied path is closed
Scissors.prototype.isPathClosed = function(path) {
	return path.length > 0
		&& this.getFirstPoint(path).equals(this.getLastPoint(path));
};

// Set to true, and the algorithm will not allow the user to submit without
// drawing a closed path, or add a new path once one is closed
Scissors.prototype.setRequiresClosed = function(req) {
	this.reqClosed = req;
};

Scissors.prototype.requiresClosed = function() {
	return this.reqClosed;
};

// Returns true if the supplied point is considered to be over the start point
// of the current path
Scissors.prototype.isOverStart = function(p) {
	return this.start && this.start.dist(p) < this.startPointSize;
};

// Returns the last point in the supplied path (array of subpaths)
Scissors.prototype.getLastPoint = function(path) {
	return path[path.length-1][0];
};

// Returns the first point in the supplied path (array of subpaths)
Scissors.prototype.getFirstPoint = function(path) {
	return path[0][path[0].length-1];
};

// Attempts to snap the supplied point to either the starting point or a point
// with high gradient magnitude.
Scissors.prototype.snapPoint = function(p) {
	if ( this.requiresClosed() && this.isOverStart(p) ) {
		return this.start; // We're close enough to snap to start
	}
	
	var sx = p.x-this.snapSize;
	var sy = p.y-this.snapSize;
	var ex = p.x+this.snapSize;
	var ey = p.y+this.snapSize;
	
	var maxGrad = this.scissorsWorker.getInvertedGradient(p);
	var maxPoint = p;
	var testPoint = new Point();
	for ( var y = sy; y <= ey; y++ ) {
		testPoint.y = y;
		for ( var x = sx; x <= ex; x++ ) {
			testPoint.x = x;
			
			grad = this.scissorsWorker.getInvertedGradient(testPoint);
			if ( grad < maxGrad ) {
				maxGrad = grad;
				maxPoint.x = testPoint.x; maxPoint.y = testPoint.y;
			}
		}
	}
	
	return maxPoint;
};

Scissors.prototype.inAoi = function(p) {
	var aoi = this.aoi;
	var mask = this.mask;
	return !aoi || (p.x >= aoi[0] && p.x - aoi[0] <= aoi[2]
	             && p.y >= aoi[1] && p.y - aoi[1] <= aoi[3]
	             && mask[index(p.y-aoi[1], p.x-aoi[0], aoi[2])]);
};

// Captures mouse clicks and either updates the path, starts a new one, and/or
// finishes the current one.
Scissors.prototype.mouseClick = function(event) {
	var p = this.getCanvasPoint(event.clientX, event.clientY);

	if ( event.button == 2 ) { // Right mouse button
		this.rightClick(event);
	} else if ( event.button == 0 ) { // Left mouse button
		this.leftClick(event, p);
	}
	
	this.updateCursor(event);
	event.preventDefault();
};

Scissors.prototype.rightClick = function(event) {
	if ( this.requiresClosed() && this.isDrawing ) {
		// close path.
		this.currentPath.push(_this.getLine(this.start, this.getLastPoint(this.currentPath)));
		this.stopDrawing();
		this.redrawPaths();
	} else if ( !this.requiresClosed() ) {
		this.startDragScrolling(event);
	}
};

Scissors.prototype.leftClick = function(event, p) {
	if ( event.ctrlKey ) {
		this.startDragScrolling(event);
		return;
	}
	
	if ( !this.inAoi(p) ) {
		return;
	}
	
	if ( !event.altKey ) {
		p = this.snapPoint(p);
	}
	
	if ( this.isDrawing && this.scissorsWorker.hasPathFor(p) ) {
		// If we're drawing, and the chosen point has it's path calculated
		// add path to point and continue
		this.appendPath(p, this.currentPath);
		this.redrawPaths();
		
	}
	
	// Stop drawing if the user requests it (and we can), or when the path is
	// finished
	if ( (event.shiftKey && this.isDrawing && !this.requiresClosed())
			|| (this.requiresClosed() && this.isClosed()) ) {
		this.stopDrawing();
		this.redrawPaths();
	} else if ( !this.isDrawing ) {
		if ( this.requiresClosed() && this.isClosed() ) {
			window.alert('Path is already closed. Click "Undo" or "Clear Lines" to change the path.');
		}
		
		// Start drawing new segment
		this.drawing(p);
		this.drawStart();
		this.scissorsWorker.setPoint(p);
	} else {
		// We're continuing a edge as normal.
		this.scissorsWorker.setPoint(p);
	}
};

Scissors.prototype.mouseUp = function(event) {
	this.endDragScrolling();
	this.updateCursor(event);
};

// Captures mouse movement and updates preview paths accordingly 
Scissors.prototype.mouseMove = function(event) {
	var p = this.getCanvasPoint(event.clientX, event.clientY);
	
	if ( this.dragScrolling ) {
		this.updateDragScrolling(event);
	} else if ( this.isDrawing && this.inAoi(p)  ) {
		if ( !event.ctrlKey ) {
			p = this.snapPoint(p);
		}
		
		this.updatePreview();
	}

	this.mousePoint = p;
	this.updateCursor(event);
};

Scissors.prototype.endDragScrolling = function() {
	this.dragScrolling = false;
};

Scissors.prototype.startDragScrolling = function(event) {
	this.prevDragPoint = new Point(event.screenX, event.screenY);
	this.dragScrolling = true;
};

Scissors.prototype.updateDragScrolling = function(event) {
	var tx = this.prevDragPoint.x - event.screenX;
	var ty = this.prevDragPoint.y - event.screenY;
	
	// Prefer axis-aligned movement to reduce apparent jitteriness
	txa = Math.abs(tx);
	tya = Math.abs(ty);
	if ( (txa < 3 && tya > 5) || (txa * 9 < tya) ) {
		tx = 0;
	} else if ( (tya < 3 && txa > 5) || (tya * 9 < txa) ) {
		ty = 0;
	}

	var speed = this.dragScrollSpeed;
	window.scrollBy(tx * speed, ty * speed);
	this.prevDragPoint = new Point(event.screenX, event.screenY);
};

Scissors.prototype.updatePreview = function() {
	this.exampleLineDrawn = this.scissorsWorker.hasPathFor(this.mousePoint);
	
	this.scratch_ctx.clearRect(0, 0, this.scratch_canvas.width, this.scratch_canvas.height);
	this.drawPathFrom(this.mousePoint, this.scratch_ctx);
	
	this.overStart = this.isOverStart(this.mousePoint);
	this.drawStart();
};

//Draws a line from the supplied point to the start point onto the supplied
//context.
Scissors.prototype.drawPathFrom = function(p, imageCtx) {
	var subpath = this.scissorsWorker.getPathFrom(p);
	
	if (subpath.length < 2) {
		return;
	}
	
	imageCtx.strokeStyle = this.lineColor;
	imageCtx.beginPath();
	imageCtx.moveTo(subpath[0].x, subpath[1].y);
	for ( var i = 1; i < subpath.length; i++ ) {
		imageCtx.lineTo(subpath[i].x, subpath[i].y);
	}
	imageCtx.stroke();
};

// Draws the supplied path onto the context.
Scissors.prototype.drawPath = function(path, imageCtx) {
	imageCtx.strokeStyle = this.lineColor;
	
	for ( var i = 0; i < path.length; i++ ) { // Iterate over subpaths
		var subpath = path[i];
		imageCtx.beginPath();
		imageCtx.moveTo(subpath[0].x, subpath[0].y);
		for ( var j = 0; j < subpath.length; j++ ) { // and points.
			imageCtx.lineTo(subpath[j].x, subpath[j].y);
		}
		imageCtx.stroke();
	}
};

// Draws a circle representing the starting point of the current path.
Scissors.prototype.drawStart = function() {
	if ( this.start && this.requiresClosed() ) {
		this.line_ctx.beginPath();
		this.line_ctx.arc(this.start.x, this.start.y, this.startPointSize, 0, 2*Math.PI);
		this.line_ctx.fill();
		this.line_ctx.stroke();
	}
};

// Appends the subpath from the supplied point to the previous clicked point to
// the supplied path array
Scissors.prototype.appendPath = function(p, path) {
	subpath = this.scissorsWorker.getPathFrom(p);
	path.push(subpath);
};

// Bresenham's algorithm for constructing a straight line between two points.
// Thank you, Phrogz, from StackOverflow.
Scissors.prototype.getLine = function(p, q) {
	var line = new Array();
	
	// For faster access
	px = p.x; py = p.y;
	qx = q.x; qy = q.y;
	
	var dx = Math.abs(qx-px);
	var dy = Math.abs(qy-py);
	var sx = (px < qx) ? 1 : -1;
	var sy = (py < qy) ? 1 : -1;
	var err = dx - dy;

	while( (px != qx) || (py != qy) ) {

		// Do what you need to for this
		line.push(new Point(px, py));

		var e2 = 2 * err;
		
		if ( e2 > -dy ){
			err -= dy;
			px  += sx;
		}
		
		if ( e2 < dx ){
			err += dx;
			py  += sy;
		}
	}
	
	line.push(new Point(px, py));
	return line;
};

// Undoes the previously commited line
Scissors.prototype.undo = function() {
	// Remove last path component and redraw
	if ( this.isDrawing && this.currentPath.length == 0 ) {
		this.stopDrawing();
	} else {
		this.stopDrawing();
		if ( this.paths.length > 0 ) {
			var path = this.paths[this.paths.length - 1]; // Last element
			var removed = path.pop();
			
			// Start drawing from the start of the removed path
			this.scissorsWorker.setPoint(removed[removed.length-1]);

			this.currentPath = this.paths.pop(); // currentPath = path
			if ( this.currentPath.length > 0 ) {
				this.drawing(this.getFirstPoint(this.currentPath));
			} else {
				this.drawing(removed[removed.length-1]);
			}
		}
	}
	
	this.redrawPaths();
};

// Redraws everything except the image canvas
Scissors.prototype.redrawPaths = function() {
	// Clear canvas
	var line_ctx = this.line_ctx;
	line_ctx.clearRect(0, 0, this.line_canvas.width, this.line_canvas.height);
	
	for ( var i = 0; i < this.paths.length; i++ ) { // Iterate over paths...
		// and draw
		this.drawPath(this.paths[i], line_ctx);
	}

	// Redraw start point and current path
	if ( this.currentPath && this.currentPath.length > 0 ) {
		this.drawPath(this.currentPath, line_ctx);
	}
	
	this.drawStart(); // Must draw straight to canvas
};

// Completely replaces the paths array
Scissors.prototype.setPaths = function(paths) {
	this.stopDrawing();
	this.paths = paths;
	this.redrawPaths();
};

Scissors.prototype.updateCursor = function(event) {
	var target = this.scratch_canvas.style;
	
	if ( this.dragScrolling || event.ctrlKey ) {
		target.cursor = 'move'; // Drag scrolling
	} else if ( !this.scissorsWorker.initialProcessingDone() ) {
		target.cursor = 'wait'; // Processing
	} else if ( this.inAoi(this.mousePoint)) {
		if ( this.isDrawing && event.shiftKey ) {
			target.cursor = 'pointer'; // End path
		} else {
			target.cursor = 'crosshair'; // Normal point picking
		}
	} else {
		target.cursor = 'default';
	}
};

// Attempts to encode the current paths array and add it to the scissors_form
// form object.
Scissors.prototype.submitScissors = function() {
	if ( this.requiresClosed() && !this.isClosed() ) {
		window.alert("Outline must form a complete loop, which it currently doesn't.");
		return false; // Cancel submission
	}
	
	var form = document.getElementById('scissors_form');
	
	// Create hidden form element for path
	var pathInput = document.createElement('input');
	pathInput.setAttribute('type', 'hidden');
	pathInput.setAttribute('name', 'paths');
	pathInput.setAttribute('value', JSON.stringify(paths));
	
	form.appendChild(pathInput);
	return true;
};


