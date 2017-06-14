
function Point(x,y) {
	this.x = x;
	this.y = y;
}

Point.prototype.equals = function(q) {
	return (this.x == q.x) && (this.y == q.y);
};

Point.prototype.toString = function() {
	 return "(" + this.x + ", " + this.y + ")";
};

function testPQ() {
	pq = new PointQueue(1000, 1000);
	
	try {
		for ( var i = 0; i < 100; i++ ) {
			p = new Point(Math.floor(Math.random()*1000), Math.floor(Math.random()*1000));
		}
	} catch (err) {
		throw new Error("Push: " + err.message);
	}
	
	try {
		for ( var i = 1; i < pq.items.length; i++ ) {
			if ( pq.less(pq.items[i], pq.items[(i-1) >> 1]) ) {
				throw new Error("Iterate: (" + pq.items[(i-1)>>1] + " => " + pq.items[i] + ")");
			}
		}
	} catch (err) {
		throw new Error("Iterate: " + err.message);
	}
	
	try {
		for ( var i = 0; i < pq.items.length; i++ ) {
			fIdx = pq.find(pq.items[i]);
			if ( (!fIdx && fIdx != 0) || fIdx < 0 ) {
				throw new Error("Find: " + i + " => " + fIdx);
			}
			
			if ( !pq.items[i].equals(pq.items[fIdx]) ) {
				throw new Error("Find: " + i + " => " + fIdx);
			}
		}
	} catch (err) {
		throw new Error("Find: " + err.message);
	}
	
	try {
		var prev = -1;
		while ( !pq.isEmpty() ) {
			var next = pq.pop();
			
			if ( pq.less(next, prev) ) {
				throw new Error("Pop: (" + prev + " => " + next + ")");
			}
			
			prev = next;
	
			try {
				for ( var i = 0; i < pq.items.length; i++ ) {
					fIdx = pq.find(pq.items[i]);
					if ( (!fIdx && fIdx != 0) || fIdx < 0 ) {
						throw new Error("Find: " + i + " => " + fIdx);
					}
					
					if ( !pq.items[i].equals(pq.items[fIdx]) ) {
						throw new Error("Find: " + i + " => " + fIdx);
					}
				}
			} catch (err) {
				throw new Error("Find: " + err.message);
			}
		}
	} catch (err) {
		throw new Error("Pop: " + err.message);
	}
	
	return true;
}

function PointQueue(width, height, less_comparator) {
	this.less = typeof(less_comparator) != 'undefined' ? less_comparator : function(p,q) {
		return (p.x < q.x) || (p.x == q.x && p.y < q.y);
	};
	
	this.items = new Array();
	
	this.width = width;
	this.height = height;
	this.map = new Array();
	
	for ( var y = 0; y < this.height; y++ ) {
		this.map[y] = new Array();
		
		for ( var x = 0; x < this.width; x++ ) {
			this.map[y][x] = -1;
		}
	}
	
	// this.mapIdx = function(p) {
		// return p.y * this.width + p.x;
	// }
	this.setPos = function(p, idx) {
		this.map[p.y][p.x] = idx;
	};
	this.getPos = function(x, y) {
		return this.map[y][x];
	};
	
	this.peek = function() {
		return this.items[0];
	};
	
	this.pop = function() {
		// if ( this.items.length == 0 ) {
			// throw new Error("PointQueue is empty");
		// }
		
		var ret = this.items[0];
		
		this.swap(0, this.items.length - 1);
		this.sink(0);
		this.items.length = this.items.length - 1;
		this.setPos(ret, -1);
		
		return ret;
	};
	
	this.push = function(item) {
		// if ( this.find(item) != -1 ) {
			// throw new Error("Point already in PointQueue.");
		// }
		
		var loc = this.items.length;
		this.items[loc] = item;
		this.setPos(item, loc);
		
		this.swim(loc);
	};
	
	this.find = function(x, y) {
		return this.getPos(x, y);
	
		// var id = this.getPos(item);
		
		// //msg = "Find: (" + item.x + "," + item.y + ") => ";
		
		// if ( !(id + 1) ) { //Undefined, NaN, or -1
			// id = -1;
			// //msg += "-1";
		// } else {
			// //msg += "(" + this.items[id].x + "," + this.items[id].y + ")";
		// }
		
		// //postMessage(msg);
		
		// return id;
	};
	
	// this.find = function(item) {
		// for ( var i = 0; i < this.items.length; i++ ) {
			// if ( item.equals(this.items[i]) ) {
				// return i;
			// }
		// }
		
		// return -1;
	// }
	
	this.decreaseKey = function(item) {
		this.sink(this.find(item));
	};
	
	this.isEmpty = function() {
		return this.items.length == 0;
	};
	
	this.sink = function(idx) {
		var left = (idx << 1) + 1;
		var right = left + 1;
		var small = idx;
		if ( left < this.items.length && this.less(this.items[left], this.items[idx]) ) {
			small = left;
		}
		if ( right < this.items.length && this.less(this.items[right], this.items[small]) ) {
			small = right;
		}
		if ( small != idx ) {
			this.swap(idx, small);
			this.sink(small);
		}
	};
	
	this.swim = function(idx) {
		var parent = (idx-1) >> 1;
		while ( idx > 0 && this.less(this.items[idx], this.items[parent]) ) {
			this.swap(idx, parent);
			
			idx = parent;
			parent = (idx-1) >> 1;
		}
	};
	
	this.swap = function(p, q) {
		var pt = this.items[p];
		var qt = this.items[q];
		
		this.items[p] = qt;
		this.items[q] = pt;
		
		this.setPos(pt, q);
		this.setPos(qt, p);
	};
}