export class GameScene extends Phaser.Scene {
    constructor() {
        super("GameScene");

        this.mapCols = 32;
        this.mapRows = 18;
        this.tileSize = 64;

        this.worldWidth = this.mapCols * this.tileSize;
        this.worldHeight = this.mapRows * this.tileSize;

        this.player = null;
        this.cursors = null;
        this.level = [];
    }

    preload() {
    }

    create() {
        this.createLevel();
        this.drawMap();
        this.createPlayer();
        this.createInputs();
        this.setupFixedCamera();
    }

    update() {
    if (!this.player || this.player.isMoving) return;

    if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) {
        this.tryMovePlayer(-1, 0);
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) {
        this.tryMovePlayer(1, 0);
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.up)) {
        this.tryMovePlayer(0, -1);
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.down)) {
        this.tryMovePlayer(0, 1);
    }
}

    drawMap() {
        const graphics = this.add.graphics();

        graphics.fillStyle(0x161616, 1);
        graphics.fillRect(0, 0, this.worldWidth, this.worldHeight);

        for (let row = 0; row < this.mapRows; row++) {
            for (let col = 0; col < this.mapCols; col++) {
                const x = col * this.tileSize;
                const y = row * this.tileSize;

                if (this.level[row][col] === 1) {
                    graphics.fillStyle(0x6666ff, 1);
                    graphics.fillRect(x, y, this.tileSize, this.tileSize);
                }

                graphics.lineStyle(1, 0x333333, 1);
                graphics.strokeRect(x, y, this.tileSize, this.tileSize);
            }
        }
    }

   createPlayer() {
    const startGridX = 5;
    const startGridY = 5;

    const startX = startGridX * this.tileSize + this.tileSize / 2;
    const startY = startGridY * this.tileSize + this.tileSize / 2;

    this.player = this.add.rectangle(startX, startY, 36, 36, 0xff6600);
    this.physics.add.existing(this.player);

    this.player.gridX = startGridX;
    this.player.gridY = startGridY;
    this.player.isMoving = false;
    this.player.moveDuration = 120;
}

    createInputs() {
        this.cursors = this.input.keyboard.createCursorKeys();
    }

    setupFixedCamera() {
        const cam = this.cameras.main;

        // caméra fixe sur le centre
        
        cam.centerOn(this.worldWidth / 2, this.worldHeight / 2);

        // zoom pour afficher toute la map
        const zoomX = cam.width / this.worldWidth;
        const zoomY = cam.height / this.worldHeight;
        const zoom = Math.min(zoomX, zoomY);

        cam.setZoom(zoom);
        cam.roundPixels = true;
    }

    wrapEntity(entity) {
        if (entity.x < 0) {
            entity.x = this.worldWidth;
        } else if (entity.x > this.worldWidth) {
            entity.x = 0;
        }

        if (entity.y < 0) {
            entity.y = this.worldHeight;
        } else if (entity.y > this.worldHeight) {
            entity.y = 0;
        }
    }

    tryMovePlayer(dx, dy) {
        let nextGridX = this.player.gridX + dx;
        let nextGridY = this.player.gridY + dy;

        // wrap horizontal
        if (nextGridX < 0) {
            nextGridX = this.mapCols - 1;
        } else if (nextGridX >= this.mapCols) {
            nextGridX = 0;
        }

        // wrap vertical
        if (nextGridY < 0) {
            nextGridY = this.mapRows - 1;
        } else if (nextGridY >= this.mapRows) {
            nextGridY = 0;
        }

        // case bloquée = on annule
        if (this.isBlocked(nextGridX, nextGridY)) {
            return;
        }

        const targetX = nextGridX * this.tileSize + this.tileSize / 2;
        const targetY = nextGridY * this.tileSize + this.tileSize / 2;

        this.player.isMoving = true;
        this.player.gridX = nextGridX;
        this.player.gridY = nextGridY;

        this.tweens.add({
            targets: this.player,
            x: targetX,
            y: targetY,
            duration: this.player.moveDuration,
            onComplete: () => {
                this.player.isMoving = false;
            }
        });
}
    

    createLevel() {
        this.level = [];

        for (let row = 0; row < this.mapRows; row++) {
            const line = [];

            for (let col = 0; col < this.mapCols; col++) {
                line.push(0); // 0 = case libre
            }

            this.level.push(line);
        }

        // Exemples de murs
        this.level[5][8] = 1;
        this.level[5][9] = 1;
        this.level[5][10] = 1;

        this.level[8][12] = 1;
        this.level[9][12] = 1;
        this.level[10][12] = 1;

        this.level[3][20] = 1;
        this.level[4][20] = 1;
        this.level[5][20] = 1;
    }

    isBlocked(gridX, gridY) {
        return this.level[gridY][gridX] === 1;
    }

}