
function Message(msgType) {
	this.msgType = msgType;
}

Message.GRADIENT  = -4;
Message.RESULTS   = -3;
Message.WORKING   = -2;
Message.STATUS    = -1;

Message.ERROR     =  0;

Message.POINT	  =  1;
Message.CONTINUE  =  2;
Message.STOP      =  3;
Message.IMAGE 	  =  4;
Message.RESET     =  5;
Message.TRAIN     =  6;
Message.SEARCH    =  7;

// No arguments => only need one instance.
Message.RESET_MESSAGE = new Message(Message.RESET);
Message.STOP_MESSAGE = new Message(Message.STOP);
Message.CONTINUE_MESSAGE = new Message(Message.CONTINUE);

function ScissorsWorker(scissorsURL) {
	this.worker = new Worker(scissorsURL);
	this.worker.enclosingScissorsWorker = this; // For onmessage proxy.
	
	this.width = -1;
	this.height = -1;
	
	this.working = false;
	this.processing = false; // Won't accept resultant data when false.
	
	this.gradient = null;
	this.parentPoints = null;
	
	this.curPoint = null;
	
	this.onmessage = null;
	this.onerror = function(event) {};
	this.onstatus = function(msg) {};
	this.ondata = function(data) {};
	
	this.worker.onmessage = function(event) {
		this.enclosingScissorsWorker._processMessage(event);
	};
	
	this.worker.onerror = function(event) {
		this.enclosingScissorsWorker.onerror(event);
	};
}

ScissorsWorker.prototype.destroy = function() {
	this.gradient = null;
	this.parentPoints = null;
	this.worker.terminate();
};

ScissorsWorker.prototype.initialProcessingDone = function() {
	return this.gradient != null;
};

ScissorsWorker.prototype.toWorkerSpace = function(p) {
	return translate(p, -this.aoi[0], -this.aoi[1]);
};

ScissorsWorker.prototype.toImageSpace = function(p) {
	return translate(p, this.aoi[0], this.aoi[1]);
};

ScissorsWorker.prototype.setTraining = function(train) {
	this._postTrainMessage(train);
};

ScissorsWorker.prototype.computeGreyscale = function(data) {
	// Returns 2D augmented array containing greyscale data
	// Greyscale values found by averaging color channels
	// Input should be in a flat RGBA array, with values between 0 and 255
	var greyscale = new Float32Array(data.length / 4);

	for (var i = 0; i < data.length; i += 4) {
		greyscale[i/4] = (data[i] + data[i+1] + data[i+2]) / (3*255);
	}
	
	return greyscale;
};

ScissorsWorker.prototype.setImageData = function(image, aoi, mask) {
	var imageData;
	if ( aoi ) {
		// AOI is supplied so image should be a 2D Context.
		this.aoi = aoi;
		imageData = image.getImageData(aoi[0], aoi[1], aoi[2], aoi[3]);
	} else {
		// AOI is not supplied, so image should be an ImageData.
		this.aoi = [0, 0, image.width, image.height];
		imageData = image;
	}
	
	var grey = this.computeGreyscale(imageData.data);

	if ( !mask ) {
		mask = null;
	}
	
	this.width = aoi[2];
	this.height = aoi[3];
	this.gradient = null;
	this._postImageMessage(grey, mask);
};

ScissorsWorker.prototype.setPoint = function(p) {
	this.curPoint = p;
	this._resetParentPoints();
	this.processing = true;
	
	this._postPointMessage(this.toWorkerSpace(p));
};

ScissorsWorker.prototype.hasPoint = function() {
	return this.getPoint() != null;
};

ScissorsWorker.prototype.getPoint = function() {
	return this.curPoint;
};

ScissorsWorker.prototype.getInvertedGradient = function(p) {
	p = this.toWorkerSpace(p);
	
	if ( !this.gradient ) {
		return Infinity;
	}
	
	if ( p.x < 0 || p.x >= this.width ||
	     p.y < 0 || p.y >= this.height  ) {
		return Infinity;
	}
	
	return this.gradient[p.index(this.width)];
};

ScissorsWorker.prototype.getParentPoint = function(p) {
	aoi = this.aoi;
	p = this.toWorkerSpace(p);
	return this.toImageSpace(this.parentPoints[p.index(this.width)]);
};

ScissorsWorker.prototype.getPathFrom = function(p) {
	var subpath = new Array();
	var width = this.width;
	
	p = this.toWorkerSpace(p);
	var pi = index(p.y, p.x, width);
	while (pi) {
		subpath.push(this.toImageSpace(fromIndex(pi, width)));
		pi = this.parentPoints[pi];
	}
	
	return subpath;
};

ScissorsWorker.prototype.hasPathFor = function(p) {
	return !!this.getParentPoint(p);
};

ScissorsWorker.prototype.getParentInfo = function() {
	return this.parentPoints;
};

ScissorsWorker.prototype.stop = function() {
	this._postStopMessage();
	this.processing = false;
};

ScissorsWorker.prototype.resetTraining = function() {
	this._postResetMessage();
};

ScissorsWorker.prototype.isWorking = function() {
	return working;
};

ScissorsWorker.prototype.postMessage = function(event) {
	this.worker.postMessage(event);
};

ScissorsWorker.prototype._resetParentPoints = function() {
	this.parentPoints = new Uint32Array(this.width * this.height);
};

ScissorsWorker.prototype._processMessage = function(event) {
	var data = event.data;
	
	switch (data.msgType) {
		case Message.RESULTS:
			this._processResultsMessage(data);
			break;
		case Message.STATUS:
			this._processStatusMessage(data);
			break;
		case Message.GRADIENT:
			this._processGradientMessage(data);
			break;
		case Message.WORKING:
			this._processWorkingMessage(data);
			break;
		default:
			this._processUnknownMessage(event);
	}
};

ScissorsWorker.prototype._processResultsMessage = function(data) {
	if ( !this.processing ) {
		return;
	}
	
	this._postContinueMessage(); // Pipe clear for next batch.
	
	var width = this.width;
	
	var results = data.results;
	for ( var i = 0; i < results.length; i += 2 ) {
		var p = results[i];
		var q = results[i+1];
		this.parentPoints[p] = q;
		
		results[i] = this.toImageSpace(fromIndex(p, width));
		results[i+1] = this.toImageSpace(fromIndex(q, width));
	}
	
	this.ondata(results);
};

ScissorsWorker.prototype._processGradientMessage = function(data) {
	this.gradient = data.gradient;
};

ScissorsWorker.prototype._processStatusMessage = function(data) {
	this.onstatus(data.status);
};

ScissorsWorker.prototype._processUnknownMessage = function(event) {
	if ( this.onmessage != null ) {
		this.onmessage(event);
	} else {
		throw new Error("Unknown message type: '" + event.data.msgType + "'");
	}
};

ScissorsWorker.prototype._processWorkingMessage = function(data) {
	this.working = data.working;
};

ScissorsWorker.prototype._postContinueMessage = function() {
	this.worker.postMessage(Message.CONTINUE_MESSAGE);
};

ScissorsWorker.prototype._postImageMessage = function(data, mask) {
	var msg = new Message(Message.IMAGE);
	msg.imageData = data;
	msg.mask = mask;
	msg.width = this.width;
	msg.height = this.height;
	this.worker.postMessage(msg);
};

ScissorsWorker.prototype._postPointMessage = function(p) {
	var msg = new Message(Message.POINT);
	msg.point = p;
	this.worker.postMessage(msg);
};

ScissorsWorker.prototype._postResetMessage = function() {
	this.worker.postMessage(Message.RESET_MESSAGE);
};

ScissorsWorker.prototype._postStopMessage = function() {
	this.worker.postMessage(Message.STOP_MESSAGE);
};

ScissorsWorker.prototype._postTrainMessage = function(train) {
	var msg = new Message(Message.TRAIN);
	msg.train = train;
	this.worker.postMessage(msg);
};
