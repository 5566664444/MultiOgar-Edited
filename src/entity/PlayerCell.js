var Cell = require('./Cell');

function PlayerCell() {
    Cell.apply(this, Array.prototype.slice.call(arguments));
    
    this.cellType = 0;
    this._canRemerge = false;
}

module.exports = PlayerCell;
PlayerCell.prototype = new Cell();

// Main Functions

PlayerCell.prototype.simpleCollide = function(check, d) {
    // Simple collision check
    var len = 2 * d >> 0; // Width of cell + width of the box (Int)

    return (this.abs(this.position.x - check.x) < len) &&
        (this.abs(this.position.y - check.y) < len);
};

PlayerCell.prototype.updateRemerge = function (gameServer) {
    if (this.owner == null) {
        this._canRemerge = false;
        return;
    }
    if (this.owner.mergeOverride) { // force merge from console
        this._canRemerge = true;
        return;
    }
    var tick = gameServer.getTick();
    var age = this.getAge(tick);
    if (age < 3) {
        // do not remerge if cell age is smaller than 3 ticks
        this._canRemerge = false;
        return;
    }
    var baseTtr = gameServer.config.playerRecombineTime;        // default baseTtr = 30
    var ttr = Math.max(baseTtr, (this.getSize() * 0.2) >> 0);   // ttr in seconds
    // seconds to ticks (tickStep = 0.040 sec)
    ttr /= 0.040;
    this._canRemerge = age >= ttr;
}

PlayerCell.prototype.canRemerge = function () {
    return this._canRemerge;
};

// Movement

PlayerCell.prototype.calcMove = function (x, y, gameServer) {
    // No mouse update
    if (!this.owner.shouldMoveCells && this.owner.notMoved)
        return;
    this.owner.notMoved = false;
    
    var dx = x - this.position.x;
    var dy = y - this.position.y;
    var squared = dx * dx + dy * dy;
    if (squared < 1) return;     // stop threshold
    
    // distance
    var d = Math.sqrt(squared);
    // normalized distance (0..1)
    d = Math.min(d, 32) / 32;
    
    var speed = this.getSpeed() * d;
    if (speed <= 0) return;
    
    var angle = Math.atan2(dx, dy);
    if (isNaN(angle)) return;
    // Move cell
    this.position.x += speed * Math.sin(angle);
    this.position.y += speed * Math.cos(angle);
};

PlayerCell.prototype.collision = function(gameServer) {
    var config = gameServer.config;
    var r = this.getSize(); // Cell radius

    // Collision check for other cells
    for (var i = 0; i < this.owner.cells.length; i++) {
        var cell = this.owner.cells[i];

        if (cell == null) continue; // Error
        if (this.nodeId == cell.nodeId) continue;

        if (!cell.canRemerge() || !this.canRemerge()) {
            // Cannot remerge - Collision with your own cells
            
            var manifold = gameServer.checkCellCollision(this, cell); // Calculation info
            if (manifold != null) { // Collided
                // Call gameserver's function to collide cells
                gameServer.resolveCollision(manifold);
            }
        }
    }

    gameServer.gameMode.onCellMove(this, gameServer);
    
    // Check to ensure we're not passing the world border (shouldn't get closer than a quarter of the cell's diameter)
    if (this.position.x < config.borderLeft + r / 2) {
        this.position.x = config.borderLeft + r / 2;
    }
    if (this.position.x > config.borderRight - r / 2) {
        this.position.x = config.borderRight - r / 2;
    }
    if (this.position.y < config.borderTop + r / 2) {
        this.position.y = config.borderTop + r / 2;
    }
    if (this.position.y > config.borderBottom - r / 2) {
        this.position.y = config.borderBottom - r / 2;
    }
};

// Override

PlayerCell.prototype.getEatingRange = function() {
    return this.getSize() / 3.14;
};

PlayerCell.prototype.onConsume = function(consumer, gameServer) {
    // Add an inefficiency for eating other players' cells
    var factor = ( consumer.owner === this.owner ? 1 : gameServer.config.playerMassAbsorbed );
    // Anti-bot measure
    factor = (consumer.getMass() >= 625 && this.getMass() <= 17 && gameServer.config.playerBotGrowEnabled == 1) ? 0 : factor;
    consumer.addMass(factor * this.getMass());
};

PlayerCell.prototype.onAdd = function(gameServer) {
    // Add to special player node list
    gameServer.nodesPlayer.push(this);
    // Gamemode actions
    gameServer.gameMode.onCellAdd(this);
};

PlayerCell.prototype.onRemove = function(gameServer) {
    var index;
    // Remove from player cell list
    index = this.owner.cells.indexOf(this);
    if (index != -1) {
        this.owner.cells.splice(index, 1);
    }
    // Remove from special player controlled node list
    index = gameServer.nodesPlayer.indexOf(this);
    if (index != -1) {
        gameServer.nodesPlayer.splice(index, 1);
    }
    // Gamemode actions
    gameServer.gameMode.onCellRemove(this);
};

PlayerCell.prototype.moveDone = function(gameServer) {
    // Well, nothing.
};
