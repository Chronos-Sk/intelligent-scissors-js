
function Masker() {
	this.id = "masker";
	
	this.image = null;
	
	this.canvas = null;
	this.ctx = null;
	this.maskBuffer = null;
	this.maskCtx = null;
	
	this.maxDimension = 640; // Pixels
	this.width = -1;
	this.height = -1;
	
	this.drawing = false;
	this.prevPoint = null;
	this.points = [];
	this.pathStarts = [];
	this.radius = 12; // # of pixels in the shrunken image.
	this.color = "#F0F";
	this.opacity = 0.5;

	return this;
}

Masker.prototype.setUp = function(container, image) {
	this.image = image;

	// Tie global listeners to the document DOM element
	this.globalListenerTarget = document;
	this.globalListeners = new Array();
	
	this.calculateSize();
	this.constructCanvases(container);
	this.registerListeners();
	this.paint();
};

Masker.prototype.tearDown = function() {
	this.canvas.parentNode.removeChild(this.canvas);
	this.deregisterListeners();
	
	// Clear references for garbage collector.
	this.canvas = null;
	this.ctx = null;
	this.maskBuffer = null;
	this.maskCtx = null;
	this.points = [];
};

Masker.prototype.calculateSize = function() {
	var image = this.image;
	var maxDimension = this.maxDimension;
	
	var width = image.width;
	var height = image.height;
	
	scale = Math.min(maxDimension / width, maxDimension / height);
	if ( scale < 1 ) {
		width = Math.floor(width * scale);
		height = Math.floor(height * scale);
	}
	
	this.width = width;
	this.height = height;
};

Masker.prototype.constructCanvases = function(container) {
	// Displayed canvas
	var canvas = this.newCanvas();
	canvas.id = this.id;
	
	var style = canvas.style;
	style.position = "absolute";
	style.top = "0px";
	style.left = "0px";
	style.cursor = "pointer";
	container.appendChild(canvas);
	
	this.canvas = canvas;
	this.ctx = canvas.getContext('2d');
	
	// Canvas drawn on by user
	var maskBuffer = this.newCanvas();
	this.maskBuffer = maskBuffer;
	this.maskCtx = maskBuffer.getContext('2d');
};

Masker.prototype.newCanvas = function(width, height) {
	if ( !width || !height ) {
		width = this.width;
		height = this.height;
	}
	
	var canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	
	return canvas;
};

Masker.prototype.registerListeners = function() {
	this.canvas.addEventListener("mousedown", wrapHandler(this, this.mouseDown));
	this.addGlobalListener("mouseup", this.mouseUp);
	this.addGlobalListener("mousemove", this.mouseMove);
};

Masker.prototype.addGlobalListener = function(type, listener, bubble) {
	var wrapper = wrapHandler(this, listener);
	wrapper.type = type;
	wrapper.bubble = bubble;
	
	this.globalListenerTarget.addEventListener(type, wrapper, bubble);
	this.globalListeners.push(wrapper);
};

Masker.prototype.deregisterListeners = function() {
	// Only have to worry about the global ones
	var globalListenerTarget = this.globalListenerTarget;
	var globalListeners = this.globalListeners;
	
	for ( var i = 0; i < globalListeners.length; i++ ) {
		var listener = globalListeners[i];
		globalListenerTarget.removeEventListener(listener.type,listener,listener.bubble);
	}
};

Masker.prototype.paint = function() {
	var ctx = this.ctx;
	ctx.drawImage(this.image, 0, 0, this.width, this.height);
	ctx.drawImage(this.maskBuffer, 0, 0, this.width, this.height);
};

Masker.prototype.clearMask = function() {
	this.maskCtx.clearRect(0, 0, this.width, this.height);
	this.points = [];
	this.pathStarts = [];
	this.paint();
};

Masker.prototype.getMask = function() {
	var points = this.points;
	if ( points.length == 0 ) {
		// There are no masked pixels
		return null;
	}
	
	// First, we need to resize our mask to fit the original image
	var fullWidth = this.image.width;
	var fullHeight = this.image.height;
	
	var scaleX = fullWidth / this.width;
	var scaleY = fullHeight / this.height;
	
	// First determine area of interest
	var sx = this.width, sy = this.height, ex = 0, ey = 0;

	// Add 1 to radius for margin to avoid edge artifacts in the shortest-paths tree
	var margin = this.radius + 1;
	
	// Iterate over line end points to find bounding box
	for ( var i = 0; i < points.length; i++ ) {
		p = points[i];
		sx = Math.min(p.x - margin, sx);
		sy = Math.min(p.y - margin, sy);
		ex = Math.max(p.x + margin, ex);
		ey = Math.max(p.y + margin, ey);
	}
	
	// Clip bounding box to image
	sx = Math.max(sx, 0);
	sy = Math.max(sy, 0);
	ex = Math.min(ex, this.width);
	ey = Math.min(ey, this.height);
	
	// Scale to find corresponding box in full-size image
	var fsx = Math.floor(sx * scaleX);
	var fsy = Math.floor(sy * scaleY);
	var fex = Math.ceil(ex * scaleX);
	var fey = Math.ceil(ey * scaleY);

	// Find final width and height
	var maskedWidth = fex - fsx;
	var maskedHeight = fey - fsy;
	
	// Upscale the masking image to full size
	var fullSizeCanvas = this.newCanvas(maskedWidth, maskedHeight);
	var fullSize = fullSizeCanvas.getContext('2d');
//	fullSize.drawImage(this.maskBuffer, sx, sy, ex-sx, ey-sy, 0, 0, maskedWidth, maskedHeight);
	fullSize.lineWidth = this.radius * 2 * Math.max(scaleX, scaleY);
	fullSize.lineCap = "round";
	
	var pathIdx = 0;
	var pathStarts = this.pathStarts.slice(0); // Copy of pathStarts
	pathStarts.push(points.length);
	fullSize.stroke();
	prevPoint = null;
	for ( var i = 0; i < points.length; i++ ) {
		var p = points[i];
		p.x = p.x * scaleX - fsx;
		p.y = p.y * scaleY - fsy;
		
		if ( pathStarts[pathIdx] != i ) {
			// Firefox sometimes ignores lineJoin, so we draw line segments separately to
			// ensures mask consistency
			fullSize.beginPath();
			fullSize.moveTo(prevPoint.x, prevPoint.y);
			fullSize.lineTo(p.x, p.y);
			fullSize.stroke();
		} else {
			pathIdx++;
		}
		
		prevPoint = p;
	}
	fullSize.stroke();
	
	var maskPixels = fullSize.getImageData(0, 0, maskedWidth, maskedHeight).data;

	//  The mask pixels are those with alpha > 0
	var mask = new Uint8Array(maskedWidth * maskedHeight);
	for ( var y = 0; y < maskedHeight; y++ ) {
		for ( var x = 0; x < maskedWidth; x++ ) {
			idx = index(y, x, maskedWidth);
			mask[idx] = (maskPixels[idx*4 + 3] > 0);
		}
	}
	
	return {'points': mask, 'image': fullSizeCanvas, 'aoi': [fsx, fsy, maskedWidth, maskedHeight]};
};

Masker.prototype.addLine = function(a, b) {
	var maskCtx = this.maskCtx;

	maskCtx.save();
	maskCtx.lineWidth = this.radius * 2;
	maskCtx.lineCap = "round";
	maskCtx.strokeStyle = this.color;
	maskCtx.globalAlpha = this.opacity;
	
	// 'copy' is not working in Firefox. 'xor' works because the alpha is exactly 0.5.
	maskCtx.globalCompositeOperation = "xor";
	
	maskCtx.beginPath();
	maskCtx.moveTo(a.x, a.y);
	maskCtx.lineTo(b.x, b.y);
	maskCtx.stroke();
	this.paint();
	
	maskCtx.restore();
	
	// Record point for when calculating exact mask
	this.points.push(b);
};

Masker.prototype.startDrawing = function(event) {
	this.drawing = true;
	this.prevPoint = this.getPoint(event);
	this.pathStarts.push(this.points.length);
	this.addLine(this.prevPoint, this.prevPoint);
};

Masker.prototype.stopDrawing = function() {
	this.drawing = false;
};

Masker.prototype.mouseDown = function(event) {
	event.preventDefault();
	this.startDrawing(event);
};

Masker.prototype.mouseUp = function(event) {
	this.stopDrawing();
};

Masker.prototype.mouseMove = function(event) {
	if ( this.drawing ) {
		event.preventDefault();
		
		var point = this.getPoint(event);
		this.addLine(this.prevPoint, point);
		this.prevPoint = point;
	}
};

Masker.prototype.getPoint = function(event) {
	return getRelativePoint(this.canvas, event.clientX, event.clientY);
};
