
var PREPROCESSING_STR = "Preprocessing image. Please wait...";
var PROCESSING_STR = "Mapping out edges. Feel free to choose an edge.";
var READY_STR = "Processing complete. Feel free to start or continue your edge.";
var TRAINING_STR = "Training. Please wait...";
var STOPPED_STR = "Processing stopped. Click somewhere to begin a new edge or click submit.";
var TRAINING_TRUE_STR = "Will adapt edge detection.";
var TRAINING_FALSE_STR = "Won't adapt edge detection.";

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

function ScissorsServer(scissors) {
	this.scissors = scissors;
	this.scissors.server = this;
	
	this.expectingImage = false;
	this.postPartials = true;
	this.train = false;
}

ScissorsServer.prototype.postMessage = function(event) {
	var data = event.data;

	switch (data.msgType) {
		case Message.CONTINUE:
			this._processContinueMessage(data);
			break;
		case Message.POINT:
			this._processPointMessage(data);
			break;
		case Message.STOP:
			this._processStopMessage(data);
			break;
		case Message.DIMENSION:
			this._processDimensionMessage(data);
			break;
		case Message.IMAGE:
			this._processImageMessage(data);
			break;
		case Message.RESET:
			this._processResetMessage(data);
			break;
		case Message.TRAIN:
			this._processTrainMessage(data);
			break;
		case Message.CONTINUE:
			this._processContinueMessage(data);
		default:
			throw new Error("Uknown message type: '" + data.msgType + "'");
	}
};

ScissorsServer.prototype.status = function(status) {
	var msg = new Message(Message.STATUS);
	msg.status = status;
	postMessage(msg);
};

ScissorsServer.prototype.postResults = function(data) {
	var msg = new Message(Message.RESULTS);
	msg.results = data;
	postMessage(msg);
};

ScissorsServer.prototype.setWorking = function(working) {
	var msg = new Message(Message.WORKING);
	msg.working = working;
	postMessage(msg);
	
	if ( !working ) {
		this.status(READY_STR);
	}
};

ScissorsServer.prototype._processContinueMessage = function(data) {
	if ( this.scissors.working ) {
		this.scissors.doWork();
	}
};

ScissorsServer.prototype._processDimensionMessage = function(data) {
	this.scissors.setDimensions(data.width, data.height);
};

ScissorsServer.prototype._processImageMessage = function(data) {
	this._processDimensionMessage(data);
	this.status(PREPROCESSING_STR);
	this.setWorking(true);
	this.scissors.setData(data.imageData, data.mask);
	this.setWorking(false);
	this._postGradientMessage(this.scissors.gradient);
	this.status(READY_STR);
};

ScissorsServer.prototype._postGradientMessage = function(gradient) {
	var msg = new Message(Message.GRADIENT);
	msg.gradient = gradient;
	postMessage(msg);
};

ScissorsServer.prototype._processPointMessage = function(data) {
	this.setWorking(true);
	if ( this.train ) {
		this.status(TRAINING_STR);
		this.scissors.doTraining(data.point);
	}
	this.status(PROCESSING_STR);
	this.scissors.setPoint(data.point);
	this.scissors.doWork();
};

ScissorsServer.prototype._processResetMessage = function(data) {
	this.scissors.resetTraining();
};

ScissorsServer.prototype._processStopMessage = function(data) {
	this.scissors.setWorking(false);
	this.status(STOPPED_STR);
};

ScissorsServer.prototype._processTrainMessage = function(data) {
	this.train = data.train;
	if ( this.train ) {
		this.status(TRAINING_TRUE_STR);
	} else {
		this.status(TRAINING_FALSE_STR);
	}
};
