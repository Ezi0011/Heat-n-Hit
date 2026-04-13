export class GameScene extends Phaser.Scene {
    constructor() {
        super("GameScene");

        this.mapCols = 32;
        this.mapRows = 18;
        this.tileSize = 64;

        this.worldWidth = this.mapCols * this.tileSize;
        this.worldHeight = this.mapRows * this.tileSize;

        this.level = [];
        this.players = new Map();
        this.mapGraphics = null;
        this.socket = null;
        this.statusText = null;
    }

    preload() {
    }

    create() {
        this.mapGraphics = this.add.graphics();
        //panneau de status de con 
        this.createStatusText();
        this.setupFixedCamera();
        this.connectToServer();
    }

    update() {
    }

    createStatusText() {
        this.statusText = this.add.text(20, 20, "Connecting to server...", {
            color: "#ffffff",
            fontSize: "24px",
            backgroundColor: "#000000",
            padding: {
                x: 10,
                y: 6
            }
        });

        this.statusText.setScrollFactor(0);
        this.statusText.setDepth(100);
    }

    connectToServer() {
        if (typeof window.io !== "function") {
            this.setStatus("Socket.IO client not found.\nStart the Node server.");
            return;
        }

        this.socket = window.io();

        this.socket.on("connect", () => {
            this.setStatus("Screen connected.\nOpen /controller on phone.");
        });

        this.socket.on("disconnect", () => {
            this.setStatus("Disconnected from server.");
        });

        this.socket.on("gameState", (state) => {
            this.applyGameState(state);
        });

        this.socket.on("playerHit", (data) => {
            this.showHitPopup(data);
        });
    }

    applyGameState(state) {
        if (!state || !Array.isArray(state.map) || state.map.length === 0) {
            return;
        }

        const mapRows = state.map.length;
        const mapCols = state.map[0].length;
        const mapChanged = this.level.length === 0 || mapRows !== this.mapRows || mapCols !== this.mapCols;

        this.tileSize = state.tileSize ?? this.tileSize;
        this.level = state.map;
        this.mapRows = mapRows;
        this.mapCols = mapCols;
        this.worldWidth = this.mapCols * this.tileSize;
        this.worldHeight = this.mapRows * this.tileSize;

        if (mapChanged) {
            this.drawMap();
            this.setupFixedCamera();
        }

        this.syncPlayers(state.players || {});
        this.syncProjectiles(state.projectiles || []);

        const playerCount = Object.keys(state.players || {}).length;
        this.setStatus(`Screen connected.\nPlayers: ${playerCount}\nOpen /controller on phone.`);
    }

    drawMap() {
        if (!this.mapGraphics) {
            return;
        }

        const graphics = this.mapGraphics;
        graphics.clear();

        graphics.fillStyle(0x161616, 1);
        graphics.fillRect(0, 0, this.worldWidth, this.worldHeight);

        for (let row = 0; row < this.mapRows; row += 1) {
            for (let col = 0; col < this.mapCols; col += 1) {
                const x = col * this.tileSize;
                const y = row * this.tileSize;

                if (this.level[row][col] === 1) {
                    graphics.fillStyle(0x6666ff, 1);
                    graphics.fillRect(x, y, this.tileSize, this.tileSize);
                } else if (this.level[row][col] === 4) {
                    graphics.fillStyle(0x000000, 1);
                    graphics.fillRect(x, y, this.tileSize, this.tileSize);
                } else if (this.level[row][col] === 2) {
                    graphics.fillStyle(0x996633, 1);
                    graphics.fillRect(x, y, this.tileSize, this.tileSize);
                }

                graphics.lineStyle(1, 0x333333, 1);
                graphics.strokeRect(x, y, this.tileSize, this.tileSize);
            }
        }
    }

    setupFixedCamera() {
        const cam = this.cameras.main;

        cam.setBounds(0, 0, this.worldWidth, this.worldHeight);
        cam.centerOn(this.worldWidth / 2, this.worldHeight / 2);

        const zoomX = cam.width / this.worldWidth;
        const zoomY = cam.height / this.worldHeight;
        const zoom = Math.min(zoomX, zoomY);

        cam.setZoom(zoom);
        cam.roundPixels = true;
    }

    syncPlayers(serverPlayers) {
        const activeIds = new Set(Object.keys(serverPlayers));

        activeIds.forEach((id) => {
            const serverPlayer = serverPlayers[id];
            const targetX = this.gridToWorldX(serverPlayer.gridX);
            const targetY = this.gridToWorldY(serverPlayer.gridY);
            const fillColor = this.parseColor(serverPlayer.color);

            if (!this.players.has(id)) {
                const player = this.add.rectangle(targetX, targetY, 36, 36, fillColor);
                player.gridX = serverPlayer.gridX;
                player.gridY = serverPlayer.gridY;
                this.players.set(id, player);
                return;
            }

            const player = this.players.get(id);
            player.setFillStyle(fillColor);

            if (player.gridX === serverPlayer.gridX && player.gridY === serverPlayer.gridY) {
                return;
            }

            player.gridX = serverPlayer.gridX;
            player.gridY = serverPlayer.gridY;

            this.tweens.killTweensOf(player);
            this.tweens.add({
                targets: player,
                x: targetX,
                y: targetY,
                duration: serverPlayer.moveDuration ?? 120,
                ease: "Linear"
            });
        });

        Array.from(this.players.entries()).forEach(([id, player]) => {
            if (activeIds.has(id)) {
                return;
            }

            this.tweens.killTweensOf(player);
            player.destroy();
            this.players.delete(id);
        });
    }

    syncProjectiles(serverProjectiles) {
        const activeIds = new Set(serverProjectiles.map(p => p.id));

        serverProjectiles.forEach((serverProjectile) => {
            const targetX = this.gridToWorldX(serverProjectile.gridX);
            const targetY = this.gridToWorldY(serverProjectile.gridY);
            const fillColor = this.parseColor(serverProjectile.color);

            if (!this.projectiles.has(serverProjectile.id)) {
                const projectile = this.add.circle(targetX, targetY, 10, fillColor);
                projectile.gridX = serverProjectile.gridX;
                projectile.gridY = serverProjectile.gridY;
                this.projectiles.set(serverProjectile.id, projectile);
                return;
            }

            const projectile = this.projectiles.get(serverProjectile.id);
            projectile.setFillStyle(fillColor);

            if (projectile.gridX === serverProjectile.gridX && projectile.gridY === serverProjectile.gridY) {
                return;
            }

            projectile.gridX = serverProjectile.gridX;
            projectile.gridY = serverProjectile.gridY;

            this.tweens.killTweensOf(projectile);
            this.tweens.add({
                targets: projectile,
                x: targetX,
                y: targetY,
                duration: 80,
                ease: "Linear"
            });
        });

        Array.from(this.projectiles.entries()).forEach(([id, projectile]) => {
            if (activeIds.has(id)) {
                return;
            }

            projectile.destroy();
            this.projectiles.delete(id);
        });
    }

    showHitPopup(data) {
        const message = `Player ${data.killerColor} killed Player ${data.victimColor}!`;
        const text = this.add.text(this.cameras.main.centerX, 40, message, {
            fontSize: "28px",
            color: "#ffffff",
            backgroundColor: "#000000",
            padding: { x: 12, y: 8 }
        });

        text.setOrigin(0.5, 0);
        text.setDepth(200);

        this.tweens.add({
            targets: text,
            alpha: 0,
            duration: 2400,
            delay: 1200,
            onComplete: () => text.destroy()
        });
    }

    gridToWorldX(gridX) {
        return gridX * this.tileSize + this.tileSize / 2;
    }

    gridToWorldY(gridY) {
        return gridY * this.tileSize + this.tileSize / 2;
    }

    parseColor(color) {
        if (typeof color !== "string") {
            return 0xff6600;
        }

        return Number.parseInt(color.replace("#", ""), 16);
    }

    setStatus(message) {
        if (!this.statusText) {
            return;
        }

        this.statusText.setText(message);
    }
}
