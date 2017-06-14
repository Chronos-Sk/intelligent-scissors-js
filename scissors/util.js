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
};

Point.prototype.index = function(width) {
	return this.y*width + this.x;
};

Point.prototype.translate = function(tx, ty) {
	this.x += tx;
	this.y += ty;
};

function index(i, j, width) {
	return i*width + j;
}

function fromIndex(idx, width) {
	return new Point(idx % width, Math.floor(idx / width));
}

function translate(p, tx, ty) {
	if ( !p ) {
		return p;
	}
	
	return new Point(p.x + tx, p.y + ty);
}

//Converts absolute coordinates to element coordinates.
function getRelativePoint(element, x, y) {
	var p = computeOffset(element);
	
	p.x = x - p.x;
	p.y = y - p.y;

	// Eclipse has a nonsensical type warning here for some reason. Can't figure out why.
	return p;
}

// Computes the absolute offset of an element
function computeOffset(element) {
	var x = 0, y = 0;
	
	while (element) {
		x += element.offsetLeft;
		y += element.offsetTop;
		element = element.offsetParent;
	}
	
	x -= window.pageXOffset;
	y -= window.pageYOffset;
	
	return new Point(x, y);
}

function wrapHandler(_this, handler) {
	// Wraps the supplied handler so that it has an appropriate "this" reference.
	return function(event) {
		return handler.apply(_this, [event]);
	};
}