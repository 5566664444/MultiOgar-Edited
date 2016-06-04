function Cell(nodeId, owner, position, mass, gameServer) {
    this.nodeId = nodeId;
    this.owner = owner; // playerTracker that owns this cell
    this.color = {
        r: 0,
        g: 255,
        b: 0
    };
    this.position = position;
    this._size = 0;
    this._mass = 0;
    this._squareSize = 0;
    this.setMass(mass); // Starting mass of the cell
    this.cellType = -1; // 0 = Player Cell, 1 = Food, 2 = Virus, 3 = Ejected Mass
    this.spiked = 0;    // If 1, then this cell has spikes around it

    this.killedBy; // Cell that ate this cell
    this.gameServer = gameServer;

    this.moveEngineTicks = 0; // Amount of times to loop the movement function
    this.moveEngineSpeed = 0;
    this.moveDecay = 0.85;
    this.angle = 0; // Angle of movement
    this.collisionRestoreTicks = 0; // Ticks left before cell starts checking for collision with client's cells
}

module.exports = Cell;

// Fields not defined by the constructor are considered private and need a getter/setter to access from a different class

Cell.prototype.getName = function() {
    if (this.owner)
        return this.owner.name;
    return "";
};

Cell.prototype.getSkin = function () {
    if (this.owner)
        return this.owner.skin;
    return "";
};

Cell.prototype.setColor = function(color) {
    this.color.r = color.r;
    this.color.g = color.g;
    this.color.b = color.b;
};

Cell.prototype.getColor = function() {
    return this.color;
};

Cell.prototype.getType = function() {
    return this.cellType;
};

Cell.prototype.getSize = function() {
    return this._size;
};

Cell.prototype.getMass = function () {
    return this._mass;
};

Cell.prototype.setMass = function (mass) {
    this._mass = mass;
    this._size = Math.ceil(Math.sqrt(100 * mass));
    this._squareSize = this._size * this._size;
    if (this.owner)
        this.owner.massChanged();
};

Cell.prototype.getSquareSize = function() {
    return this._squareSize;
};

Cell.prototype.addMass = function(n) {
    // Check if the cell needs to autosplit before adding mass
    if (this.getMass() > this.gameServer.config.playerMaxMass && this.owner.cells.length < this.gameServer.config.playerMaxCells) {
        var splitMass = this.getMass() / 2;
        var randomAngle = Math.random() * 6.28; // Get random angle
        this.gameServer.createPlayerCell(this.owner, this, randomAngle, splitMass);
    } else {
        this.setMass(Math.min(this.getMass(), this.gameServer.config.playerMaxMass));
    }
    this.setMass(this.getMass() + n);
};

Cell.prototype.getSpeed = function() {
    var speed = 2.1106 / Math.pow(this.getSize(), 0.449);
    return speed * (1 / 0.04) * this.gameServer.config.playerSpeed * 2; // have no idea why it twice slower
};

Cell.prototype.setAngle = function(radians) {
    this.angle = radians;
};

Cell.prototype.getAngle = function() {
    return this.angle;
};

Cell.prototype.setMoveEngineData = function(speed, ticks, decay) {
    this.moveEngineSpeed = speed;
    this.moveEngineTicks = ticks;
    this.moveDecay = isNaN(decay) ? 0.75 : decay;
};

Cell.prototype.getEatingRange = function() {
    return 0; // 0 for ejected cells
};

Cell.prototype.getKiller = function() {
    return this.killedBy;
};

Cell.prototype.setKiller = function(cell) {
    this.killedBy = cell;
};

// Functions

Cell.prototype.collisionCheck = function(bottomY, topY, rightX, leftX) {
    return this.position.x > leftX && 
        this.position.x < rightX &&
        this.position.y > topY && 
        this.position.y < bottomY;
};

// This collision checking function is based on CIRCLE shape
Cell.prototype.collisionCheck2 = function(objectSquareSize, objectPosition) {
    // IF (O1O2 + r <= R) THEN collided. (O1O2: distance b/w 2 centers of cells)
    // (O1O2 + r)^2 <= R^2
    // approximately, remove 2*O1O2*r because it requires sqrt(): O1O2^2 + r^2 <= R^2

    var dx = this.position.x - objectPosition.x;
    var dy = this.position.y - objectPosition.y;

    return (dx * dx + dy * dy + this.getSquareSize() <= objectSquareSize);
};

Cell.prototype.visibleCheck = function (box, centerPos, cells) {
    // Checks if this cell is visible to the player
    var isThere = false;
    if (this.cellType == 1) {
        // dot collision detector
        isThere = this.collisionCheck(box.bottomY, box.topY, box.rightX, box.leftX);
    } else {
        // rectangle collision detector
        var cellSize = this.getSize();
        var minx = this.position.x - cellSize;
        var miny = this.position.y - cellSize;
        var maxx = this.position.x + cellSize;
        var maxy = this.position.y + cellSize;
        var d1x = box.leftX - maxx;
        var d1y = box.topY - maxy;
        var d2x = minx - box.rightX;
        var d2y = miny - box.bottomY;
        isThere = d1x < 0 && d1y < 0 && d2x < 0 && d2y < 0;
    }
    if (!isThere) return 0;
    
    // To save perfomance, check if any client's cell collides with this cell
    for (var i = 0; i < cells.length; i++) {
        var cell = cells[i];
        if (!cell) continue;
        
        // circle collision detector
        var dx = cell.position.x - this.position.x;
        var dy = cell.position.y - this.position.y;
        var r = cell.getSize() + this.getSize();
        if (dx * dx + dy * dy < r * r) {
            // circle collision detected
            return 2;
        }
    }
    // Not colliding with any
    return 1;
};

Cell.prototype.calcMovePhys = function(config) {
    // Move, twice as slower
    var X = this.position.x + ((this.moveEngineSpeed / 2) * Math.sin(this.angle) >> 0);
    var Y = this.position.y + ((this.moveEngineSpeed / 2) * Math.cos(this.angle) >> 0);

    // Movement engine
    if (this.moveEngineSpeed <= this.moveDecay * 3 && this.cellType == 0) this.moveEngineSpeed = 0;
    var speedDecrease = this.moveEngineSpeed - this.moveEngineSpeed * this.moveDecay;
    this.moveEngineSpeed -= speedDecrease / 2; // Decaying speed twice as slower
    if (this.moveEngineTicks >= 0.5) this.moveEngineTicks -= 0.5; // Ticks passing twice as slower

    // Ejected cell collision
    if (this.cellType == 3) {
        for (var i = 0; i < this.gameServer.nodesEjected.length; i++) {
            var check = this.gameServer.nodesEjected[i];

            if (check.nodeId == this.nodeId) continue; // Don't check for yourself

            var dist = this.getDist(this.position.x, this.position.y, check.position.x, check.position.y);
            var allowDist = this.getSize() + check.getSize(); // Allow cells to get in themselves a bit

            if (dist < allowDist) {
                // Two ejected cells collided
                var deltaX = this.position.x - check.position.x;
                var deltaY = this.position.y - check.position.y;
                var angle = Math.atan2(deltaX, deltaY);
                
                this.gameServer.setAsMovingNode(check);
                check.moveEngineTicks += 1;
                this.moveEngineTicks += 1;

                var move = allowDist - dist;

                X += Math.sin(angle) * move / 2;
                Y += Math.cos(angle) * move / 2;
            }
        }
    }

    //// Border check - Bouncy physics
    var radius = 40;
    if (X < config.borderLeft && this.position.x != X) {
        // Flip angle horizontally - Left side
        this.angle = 6.28 - this.angle;
        var p = this.getLineIntersect(
            this.position.x, this.position.y, X, Y,
            config.borderLeft, config.borderBottom,
            config.borderLeft, config.borderTop);
        X = p.x;
        Y = p.y;
    }
    if (X > config.borderRight && this.position.y != X) {
        // Flip angle horizontally - Right side
        this.angle = 6.28 - this.angle;
        var p = this.getLineIntersect(
            this.position.x, this.position.y, X, Y,
            config.borderRight, config.borderBottom,
            config.borderRight, config.borderTop);
        X = p.x;
        Y = p.y;
    }
    if (Y < config.borderTop && this.position.y != Y) {
        // Flip angle vertically - Top side
        this.angle = (this.angle <= 3.14) ? 3.14 - this.angle : 9.42 - this.angle;
        var p = this.getLineIntersect(
            this.position.x, this.position.y, X, Y,
            config.borderRight, config.borderTop,
            config.borderLeft, config.borderTop);
        X = p.x;
        Y = p.y;
    }
    if (Y > config.borderBottom && this.position.y != Y) {
        // Flip angle vertically - Bottom side
        this.angle = (this.angle <= 3.14) ? 3.14 - this.angle : 9.42 - this.angle;
        var p = this.getLineIntersect(
            this.position.x, this.position.y, X, Y,
            config.borderRight, config.borderBottom,
            config.borderLeft, config.borderBottom);
        X = p.x;
        Y = p.y;
    }

    // Set position
    this.position.x = X;
    this.position.y = Y;
};

Cell.prototype.getLineIntersect = function(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y) {
    var z1 = p1x - p0x;
    var z2 = p3x - p2x;
    var w1 = p1y - p0y;
    var w2 = p3y - p2y;
    var k2 = (z1 * (p2y - p0y) + w1 * (p0x - p2x)) / (w1 * z2 - z1 * w2);
    return {
        x: p2x + z2 * k2,
        y: p2y + w2 * k2
    };
}

// Override these

Cell.prototype.sendUpdate = function() {
    // Whether or not to include this cell in the update packet
    return true;
};

Cell.prototype.onConsume = function(consumer, gameServer) {
    // Called when the cell is consumed
};

Cell.prototype.onAdd = function(gameServer) {
    // Called when this cell is added to the world
};

Cell.prototype.onRemove = function(gameServer) {
    // Called when this cell is removed
};

Cell.prototype.onAutoMove = function(gameServer) {
    // Called on each auto move engine tick
};

Cell.prototype.moveDone = function(gameServer) {
    // Called when this cell finished moving with the auto move engine
};

// Lib

Cell.prototype.abs = function(x) {
    return x < 0 ? -x : x;
};

Cell.prototype.getDist = function(x1, y1, x2, y2) {
    var xs = x2 - x1;
    xs = xs * xs;

    var ys = y2 - y1;
    ys = ys * ys;

    return Math.sqrt(xs + ys);
};
