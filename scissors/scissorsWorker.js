//As of Firefox 3.6.4, object allocation is still very slow. (Except when it's not?)
//Avoid allocating objects inside loops.

//If setTimout starts running things in new threads, work cancellation will need
//to be fixed so that it synchronizes correctly.

if ( this.importScripts != undefined ) {
	// We're running this script in a Web Worker, so set up environment
	
	importScripts("bucketQueue.js", "scissorsServer.js", "util.js");

	var scissorsServer = new ScissorsServer(new Scissors()); // Protocol object
	onmessage = function(event) {
		scissorsServer.postMessage(event);
	};
}

if ( !Number.prototype.equals ) {
	// Needed for the BucketQueue
	Number.prototype.equals = function(other) {
		if ( !other ) {
			return false;
		}
		
		return this.valueOf() == other.valueOf();
	};
}

// Temporary fix to deal with memory issues.
var MAX_IMAGE_SIZE_FOR_TRAINING = 1000*1000;

////Begin Scissors class ////
function Scissors() {
	this.server = null;

	this.width = -1;
	this.height = -1;
	this.mask = null;

	this.curPoint = null; // Corrent point we're searching on.
	this.searchGranBits = 8; // Bits of resolution for BucketQueue.
	this.searchGran = 1 << this.earchGranBits; //bits.
	this.pointsPerPost = 1000;

	// Precomputed image data. All in ranges 0 >= x >= 1 and all inverted (1 - x).
	this.greyscale = null; // Greyscale of image
	this.laplace = null; // Laplace zero-crossings (either 0 or 1).
	this.gradient = null; // Gradient magnitudes.
	this.gradX = null; // X-differences.
	this.gradY = null; // Y-differences.
	// this.gradDir = null; // Precomputed gradient directions.

	this.parents = null; // Matrix mapping point => parent along shortest-path to root.

	this.working = false; // Currently computing shortest paths?

	// Begin Training:
	this.trained = false;
	this.trainingPoints = null;

	this.edgeWidth = 2;
	this.trainingLength = 32;

	this.edgeGran = 256;
	this.edgeTraining = null;

	this.gradPointsNeeded = 32;
	this.gradGran = 1024;
	this.gradTraining = null;

	this.insideGran = 256;
	this.insideTraining = null;

	this.outsideGran = 256;
	this.outsideTraining = null;
	// End Training
}

Scissors.prototype.dx = function(x,y) {
	var width = this.width;
	var grey = this.greyscale;
	
	if ( x+1 == width ) {
		// If we're at the end, back up one
		x--;
	}

	return grey[index(y, x+1, width)] - grey[index(y, x, width)];
};

Scissors.prototype.dy = function(x,y) {
	var width = this.width;
	var grey = this.greyscale;
	
	if ( y+1 == grey.length / width ) {
		// If we're at the end, back up one
		y--;
	}

	return grey[index(y, x, width)] - grey[index(y+1, x, width)];
};

Scissors.prototype.gradMagnitude = function(x,y) {
	var dx = this.dx(x,y); var dy = this.dy(x,y);
	return Math.sqrt(dx*dx + dy*dy);
};

Scissors.prototype.lap = function(x,y) { 
	// Laplacian of Gaussian
	var width = this.width;
	var grey = this.greyscale;
	
	function index(y, x) {
		return y*width + x;
	}
	
	var lap = -16 * grey[index(y, x)];
	lap += grey[index(y-2, x)];
	lap += grey[index(y-1, x-1)] + 2*grey[index(y-1, x)] + grey[index(y-1, x+1)];
	lap += grey[index(y, x-2)]   + 2*grey[index(y, x-1)] + 2*grey[index(y, x+1)] + grey[index(y, x+2)];
	lap += grey[index(y+1, x-1)] + 2*grey[index(y+1, x)] + grey[index(y+1, x+1)];
	lap += grey[index(y+2, x)];
	
	return lap;
};

Scissors.prototype.computeGradient = function() {
	// Returns a 2D array of gradient magnitude values for greyscale. The values
	// are scaled between 0 and 1, and then flipped, so that it works as a cost
	// function.
	var greyscale = this.greyscale;
	var mask = this.mask;
	
	var gradient = new Float32Array(greyscale.length);
	var width = this.width;
	
	var max = 0; // Maximum gradient found, for scaling purposes

	for (var y = 0; y < greyscale.length / width; y++) {
		for (var x = 0; x < width; x++) {
			var p = index(y, x, width);
			if ( mask && !mask[p] ) {
				continue;
			}
			
			var grad = this.gradMagnitude(x,y);
			gradient[p] = grad;
			max = Math.max(grad, max);
		}
	}

//	gradient[greyscale.length-1] = new Array();
//	for (var i = 0; i < gradient[0].length; i++) {
//		gradient[greyscale.length-1][i] = gradient[greyscale.length-2][i];
//	}

	// Flip and scale.
	for (var i = 0; i < gradient.length; i++) {
			gradient[i] = 1 - (gradient[i] / max);
	}
	
	return gradient;
};

Scissors.prototype.computeLaplace = function() {
	// Returns a 2D array of Laplacian of Gaussian values
	var greyscale = this.greyscale;
	var mask = this.mask;
	
	var laplace = new Float32Array(greyscale.length);
	var width = this.width;

	function index(i, j) {
		return i*width + j;
	}
	
	// Make the edges low cost here.

	var height = greyscale.length / width;
	
	for (var i = 1; i < width; i++) {
		// Pad top, since we can't compute Laplacian
		laplace[index(0, i)] = 1;
		laplace[index(1, i)] = 1;
	}

	for (var y = 2; y < height-2; y++) {
		laplace[y] = new Array();
		// Pad left, ditto
		laplace[index(y, 0)] = 1;
		laplace[index(y, 1)] = 1;

		for (var x = 2; x < width-2; x++) {
			p = index(y, x);
			
			if ( mask && !mask[p] ) {
				continue;
			}
			
			// Threshold needed to get rid of clutter.
			laplace[p] = (this.lap(x,y) > 0.33) ? 0 : 1;
		}

		// Pad right, ditto
		laplace[index(y, width-2)] = 1;
		laplace[index(y, width-1)] = 1;
	}
	
	for (var i = 1; i < width; i++) {
		// Pad bottom, ditto
		laplace[index(greyscale.length-2, i)] = 1;
		laplace[index(greyscale.length-1, i)] = 1;
	}

	return laplace;
};

Scissors.prototype.computeGradX = function() {
	// Returns 2D array of x-gradient values for greyscale
	var greyscale = this.greyscale;
	var mask = this.mask;
	
	var gradX = new Float32Array(greyscale.length);
	var width = this.width;

	for ( var y = 0; y < greyscale.length / width; y++ ) {
		for ( var x = 0; x < width; x++ ) {
			p = index(y, x, width);
			if ( mask && !mask[p] ) {
				continue;
			}
			
			gradX[p] = this.dx(x,y);
		}
	}

	return gradX;
};

Scissors.prototype.computeGradY = function() {
	// Returns 2D array of x-gradient values for greyscale
	var greyscale = this.greyscale;
	var mask = this.mask;
	
	var gradY = new Float32Array(greyscale.length);
	var width = this.width;

	for ( var y = 0; y < greyscale.length / width; y++ ) {
		for ( var x = 0; x < width; x++ ) {
			p = index(y, x, width);
			if ( mask && !mask[p] ) {
				continue;
			}
			
			gradY[p] = this.dy(x,y);
		}
	}

	return gradY;
};

Scissors.prototype.gradUnitVector = function(px, py, out) {
	var gradX = this.gradX;
	var gradY = this.gradY;
	var width = this.width;
	
	// Returns the gradient vector at (px,py), scaled to a magnitude of 1
	var ox = gradX[index(py, px, width)]; var oy = gradY[index(py, px, width)];

	var gvm = Math.sqrt(ox*ox + oy*oy);
	gvm = Math.max(gvm, 1e-100); // To avoid possible divide-by-0 errors

	out.x = ox / gvm;
	out.y = oy / gvm;
};

// Pre-created to reduce allocation in inner loops
var __dgpuv = new Point(-1, -1); var __gdquv = new Point(-1, -1);

Scissors.prototype.gradDirection = function(px, py, qx, qy) {
	// Compute the gradiant direction, in radians, between to points
	this.gradUnitVector(px, py, __dgpuv);
	this.gradUnitVector(qx, qy, __gdquv);

	var dp = __dgpuv.y * (qx - px) - __dgpuv.x * (qy - py);
	var dq = __gdquv.y * (qx - px) - __gdquv.x * (qy - py);

	// Make sure dp is positive, to keep things consistant
	if (dp < 0) {
		dp = -dp; dq = -dq;
	}

	if ( px != qx && py != qy ) {
		// We're going diagonally between pixels
		dp *= Math.SQRT1_2;
		dq *= Math.SQRT1_2;
	}

	return Scissors._2_3_PI * (Math.acos(dp) + Math.acos(dq));
};
Scissors._2_3_PI = (2 / (3 * Math.PI)); // Precompute'd

Scissors.prototype.computeSides = function() {
	// Returns 2 2D arrays, containing inside and outside greyscale values.
	// These greyscale values are the intensity just a little bit along the
	// gradient vector, in either direction, from the supplied point. These
	// values are used when using active-learning Intelligent Scissors
	var greyscale = this.greyscale;
	var mask = this.mask;
	var gradX = this.gradX;
	var gradY = this.gradY;
	var dist = this.edgeWidth;
	
	var sides = new Object();
	sides.inside = new Float32Array(greyscale.length);
	sides.outside = new Float32Array(greyscale.length);

	var guv = new Point(-1, -1); // Current gradient unit vector

	var width = this.width;
	var height = gradX.length / width;
	
	for ( var y = 0; y < height; y++ ) {
		for ( var x = 0; x < width; x++ ) {
			p = index(y, x, width);
			
			if ( mask && !mask[p] ) {
				continue;
			}
			
			//console.log(gradX.length + " " + gradY.length + " " + new Point(x,y) + " " + guv);

			this.gradUnitVector(gradX, gradY, x, y, guv);

			//console.log(guv + "= (" + guv.x + ", " + guv.y + ")");

			//(x, y) rotated 90 = (y, -x)

			var ix = Math.round(x + dist*guv.y);
			var iy = Math.round(y - dist*guv.x);
			var ox = Math.round(x - dist*guv.y);
			var oy = Math.round(y + dist*guv.x);

			ix = Math.max(Math.min(ix, width-1), 0);
			ox = Math.max(Math.min(ox, width-1), 0);
			iy = Math.max(Math.min(iy, height-1), 0);
			oy = Math.max(Math.min(oy, height-1), 0);

			sides.inside[p] = greyscale[index(iy, ix, width)];
			sides.outside[p] = greyscale[index(oy, ox, width)];
		}
	}

	return sides;
};

Scissors.prototype.setWorking = function(working) {
	// Sets working flag and informs DOM side
	this.working = working;

	if ( this.server ) {
		this.server.setWorking(working);
	}
};

// Begin training methods //
Scissors.prototype.getTrainingIdx = function(granularity, value) {
	return Math.round((granularity - 1) * value);
};

Scissors.prototype.getTrainedEdge = function(edge) {
	return this.edgeTraining[this.getTrainingIdx(this.edgeGran, edge)];
};

Scissors.prototype.getTrainedGrad = function(grad) {
	return this.gradTraining[this.getTrainingIdx(this.gradGran, grad)];
};

Scissors.prototype.getTrainedInside = function(inside) {
	return this.insideTraining[this.getTrainingIdx(this.insideGran, inside)];
};

Scissors.prototype.getTrainedOutside = function(outside) {
	return this.outsideTraining[this.getTrainingIdx(this.outsideGran, outside)];
};
// End training methods //

Scissors.prototype.status = function(msg) {
	// Update the status message on the DOM side
	if ( this.server != null ) {
		this.server.status(msg);
	}
};

Scissors.prototype.setDimensions = function(width, height) {
	this.width = width;
	this.height = height;
};

Scissors.prototype.setData = function(greyscale, mask) {
	if ( this.width == -1 || this.height == -1 ) {
		// The width and height should have already been set
		throw new Error("Dimensions have not been set.");
	}
	
	this.mask = mask;
	this.greyscale = greyscale;

	this.status(PREPROCESSING_STR + " 1/6");
	this.laplace = this.computeLaplace();
	this.status(PREPROCESSING_STR + " 2/6");
	this.gradient = this.computeGradient();
	this.status(PREPROCESSING_STR + " 3/6");
	this.gradX = this.computeGradX();
	this.status(PREPROCESSING_STR + " 4/6");
	this.gradY = this.computeGradY();
	this.status(PREPROCESSING_STR + " 5/6");
	
	if ( this.width * this.height <= MAX_IMAGE_SIZE_FOR_TRAINING ) {
		var sides = this.computeSides();
		this.status(PREPROCESSING_STR + " 6/6");
		this.inside = sides.inside;
		this.outside = sides.outside;
		this.edgeTraining = new Float32Array(this.edgeGran);
		this.gradTraining = new Float32Array(this.gradGran);
		this.insideTraining = new Float32Array(this.insideGran);
		this.outsideTraining = new Float32Array(this.outsideGran);
	}
};

Scissors.prototype.findTrainingPoints = function(p) {
	// Grab the last handful of points for training
	var points = new Uint32Array();

	if ( this.parents != null ) {
		for ( var i = 0; i < this.trainingLength && p; i++ ) {
			points.push(p);
			p = this.parents[p];
		}
	}

	return points;
};

Scissors.prototype.resetTraining = function() {
	this.trained = false; // Training is ignored with this flag set
};

Scissors.prototype.doTraining = function(p) {
	if ( this.width * this.height > MAX_IMAGE_SIZE_FOR_TRAINING ) {
		return;
	}
	
	// Compute training weights and measures
	this.trainingPoints = this.findTrainingPoints(p);

	if ( this.trainingPoints.length < 8 ) {
		return; // Not enough points, I think. It might crash if length = 0.
	}

	var buffer = new Array();
	this.calculateTraining(buffer, this.edgeGran, this.greyscale, this.edgeTraining);
	this.calculateTraining(buffer, this.gradGran, this.gradient, this.gradTraining);
	this.calculateTraining(buffer, this.insideGran, this.inside, this.insideTraining);
	this.calculateTraining(buffer, this.outsideGran, this.outside, this.outsideTraining);

	if ( this.trainingPoints.length < this.gradPointsNeeded ) {
		// If we have two few training points, the gradient weight map might not
		// be smooth enough, so average with normal weights.
		this.addInStaticGrad(this.trainingPoints.length, this.gradPointsNeeded);
	}

	this.trained = true;
};

Scissors.prototype.calculateTraining = function(buffer, granularity, input, output) {
	// Build a map of raw-weights to trained-weights by favoring input values
	buffer.length = granularity;
	for ( var i = 0; i < granularity; i++ ) {
		buffer[i] = 0;
	}

	var maxVal = 1;
	for ( var i = 0; i < this.trainingPoints.length; i++ ) {
		var p = this.trainingPoints[i];
		var idx = this.getTrainingIdx(granularity, input[p]);
		buffer[idx] += 1;

		maxVal = Math.max(maxVal, buffer[idx]);
	}

	// Invert and scale.
	for ( var i = 0; i < granularity; i++ ) {
		buffer[i] = 1 - buffer[i] / maxVal;
	}

	// Blur it, as suggested. Gets rid of static.
	gaussianBlur(buffer, output);
};

function gaussianBlur(buffer, out) {
	// Smooth values over to fill in gaps in the mapping
	out[0] = 0.4*buffer[0] + 0.5*buffer[1] + 0.1*buffer[1];
	out[1] = 0.25*buffer[0] + 0.4*buffer[1] + 0.25*buffer[2] + 0.1*buffer[3];

	for ( var i = 2; i < buffer.length-2; i++ ) {
		out[i] = 0.05*buffer[i-2] + 0.25*buffer[i-1] + 0.4*buffer[i] + 0.25*buffer[i+1] + 0.05*buffer[i+2];
	}

	len = buffer.length;
	out[len-2] = 0.25*buffer[len-1] + 0.4*buffer[len-2] + 0.25*buffer[len-3] + 0.1*buffer[len-4];
	out[len-1] = 0.4*buffer[len-1] + 0.5*buffer[len-2] + 0.1*buffer[len-3];
}

Scissors.prototype.addInStaticGrad = function(have, need) {
	// Average gradient raw-weights to trained-weights map with standard weight
	// map so that we don't end up with something to spiky
	for ( var i = 0; i < this.gradGran; i++ ) {
		this.gradTraining[i] = Math.min(this.gradTraining[i],  1 - i*(need - have)/(need*this.gradGran));
	}
};

Scissors.prototype.dist = function(p, q) {
	// The grand culmunation of most of the code: the weighted distance function
	var width = this.width;
	var px = p % width; var py = Math.round(p / width);
	var qx = q % width; var qy = Math.round(q / width);

	var grad =  this.gradient[q];
	
	if ( px == qx || py == qy ) {
		// The distance is Euclidean-ish; non-diagonal edges should be shorter
		grad *= Math.SQRT1_2;
	}

	var lap = this.laplace[q];
	var dir = this.gradDirection(px, py, qx, qy);

	if ( this.trained ) {
		// Apply training magic
		var gradT = this.getTrainedGrad(grad);
		var edgeT = this.getTrainedEdge(this.greyscale[p]);
		var insideT = this.getTrainedInside(this.inside[p]);
		var outsideT = this.getTrainedOutside(this.outside[p]);

		return 0.3*gradT + 0.3*lap + 0.1*(dir + edgeT + insideT + outsideT);
	} else {
		// Normal weights
		return 0.43*grad + 0.43*lap + 0.11*dir;
	}
};

Scissors.prototype.adj = function(p) {
	var list = new Array();

	var width = this.width;
	var px = p % width; var py = Math.floor(p / width);
	
	var sx = Math.max(px-1, 0);
	var sy = Math.max(py-1, 0);
	var ex = Math.min(px+1, width-1);
	var ey = Math.min(py+1, this.height-1);

	var idx = 0;
	for ( var y = sy; y <= ey; y++ ) {
		for ( var x = sx; x <= ex; x++ ) {
			flat = index(y, x, width);
			if ( (x != px || y != py) && (!this.mask || this.mask[flat]) ) {
				list[idx++] = flat;
			}
		}
	}

	return list;
};

Scissors.prototype.setPoint = function(sp) {
	this.setWorking(true);

	// Can't use sp.index(), since this object was JSON-ified.
	this.curPoint = index(sp.y, sp.x, this.width);

	this.visited = new Uint8Array(this.greyscale.length);
	this.parents = new Uint32Array(this.greyscale.length);

	this.cost = new Float32Array(this.greyscale.length);
	for ( var i = 0; i < this.greyscale.length; i++ ) {
		this.cost[i] = Infinity;
	}

	this.pq = new BucketQueue(this.searchGranBits, function(p) {
		return Math.round(this.searchGran * this.costArr[p]);
	});
	this.pq.searchGran = this.searchGran;
	this.pq.costArr = this.cost;

	this.pq.push(new Number(this.curPoint));
	this.cost[this.curPoint] = 0;
};

Scissors.prototype.doWork = function() {
	if ( !this.working ) {
		return;
	}

	this.timeout = null;
	
	var pointCount = 0;
	var newPoints = new Array();
	while ( !this.pq.isEmpty() && pointCount < this.pointsPerPost ) {
		var p = this.pq.pop().valueOf();
		newPoints.push(p);
		newPoints.push(this.parents[p]);

		this.visited[p] = true;

		var adjList = this.adj(p);
		for ( var i = 0; i < adjList.length; i++) {
			var q = adjList[i];

			var pqCost = this.cost[p] + this.dist(p, q);
			if ( pqCost < this.cost[q] ) {
				if ( this.cost[q] != Number.Infinity ) {
					// Already in PQ, must remove it so we can re-add it.
					this.pq.remove(new Number(q));
				}

				this.cost[q] = pqCost;
				this.parents[q] = p;
				this.pq.push(new Number(q));
			}
		}

		pointCount++;
	}

	if ( this.server && this.working ) {
		this.server.postResults(newPoints);
	}

	if ( this.pq.isEmpty() ) {
		this.setWorking(false);
		this.status(READY_STR);
	}

	return newPoints;
};
//// End Scissors class ////