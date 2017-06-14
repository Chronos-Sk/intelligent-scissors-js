// Masquerades as the real deal, in order to provide polygonal segmentation.

function Point(x,y) {
	this.x = x;
	this.y = y;
}

Point.prototype.equals = function(q) {
	if ( !q ) {
		return false;
	}
	
	return (this.x == q.x) && (this.y == q.y);
};

Point.prototype.toString = function() {
	 return "(" + this.x + ", " + this.y + ")";
};

Point.prototype.dist = function(p) {
	return Math.sqrt(Math.pow(this.x-p.x,2) + Math.pow(this.y-p.y,2));
}

function ScissorsWorker(scissorsURL) {
	// Nothing to do here.
}

ScissorsWorker.prototype.setTraining = function(train) {};

ScissorsWorker.prototype.setImageData = function(imageData) {};

ScissorsWorker.prototype.setPoint = function(p) {
	this.curPoint = p;
};

ScissorsWorker.prototype.hasPoint = function() {
	return this.getPoint() != null;
};

ScissorsWorker.prototype.getPoint = function() {
	return this.curPoint;
};

ScissorsWorker.prototype.getPathFrom = function(p) {
	return this.getLine(p, this.curPoint);
}

ScissorsWorker.prototype.hasPathFor = function(p) {
	return true;
}

ScissorsWorker.prototype.stop = function() {};

ScissorsWorker.prototype.resetTraining = function() {};

ScissorsWorker.prototype.isWorking = function() {
	return false;
};

// Bresenham's algorithm.
// Thank you, Phrogz, from StackOverflow.
ScissorsWorker.prototype.getLine = function(p, q) {
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
}