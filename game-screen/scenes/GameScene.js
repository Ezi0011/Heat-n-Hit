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
        this.projectiles = new Map();
        this.playerNames = new Map();
        this.mapGraphics = null;
        this.socket = null;
        this.statusText = null;
        this.hasWinner = false;
        this.victoryOverlay = null;
        this.victoryWinnerText = null;
        this.victorySubtitleText = null;
        this.victoryRays = [];
    }

    preload() {
        if (!this.textures.exists("mountain-bg")) {
            this.load.image("mountain-bg", "assets/mountain-bg.jpg");
        }
    }

    create() {
        this.mapGraphics = this.add.graphics();
        this.createStatusText();
        this.setupFixedCamera();
        this.connectToServer();
    }

    update() {
        if (!this.hasWinner || !this.victoryRays.length) {
            return;
        }

        this.victoryRays.forEach((ray, index) => {
            ray.rotation += 0.0018 + index * 0.00035;
        });
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

        this.socket.on("playerWon", (data) => {
            this.showVictoryOverlay(data.winnerName);
        });
    }

    applyGameState(state) {
        if (!state || !Array.isArray(state.map) || state.map.length === 0) {
            return;
        }

        const mapRows = state.map.length;
        const mapCols = state.map[0].length;
        const mapResized = this.level.length === 0 || mapRows !== this.mapRows || mapCols !== this.mapCols;
        const mapChanged = mapResized || this.hasMapContentChanged(state.map);

        this.tileSize = state.tileSize ?? this.tileSize;
        this.level = state.map;
        this.mapRows = mapRows;
        this.mapCols = mapCols;
        this.worldWidth = this.mapCols * this.tileSize;
        this.worldHeight = this.mapRows * this.tileSize;

        if (mapChanged) {
            this.drawMap();
        }

        if (mapResized) {
            this.setupFixedCamera();
        }

        this.syncPlayers(state.players || {});
        this.syncProjectiles(state.projectiles || []);

        const playerEntries = Object.entries(state.players || {});
        if (!this.hasWinner && playerEntries.length === 1) {
            const [, winner] = playerEntries[0];
            this.showVictoryOverlay(winner.name);
            return;
        }

        if (!this.hasWinner) {
            const playerCount = playerEntries.length;
            this.setStatus(`Screen connected.\nPlayers: ${playerCount}\nOpen /controller on phone.`);
        }
    }

    hasMapContentChanged(nextMap) {
        if (this.level.length !== nextMap.length) {
            return true;
        }

        for (let row = 0; row < nextMap.length; row += 1) {
            if (!Array.isArray(this.level[row]) || this.level[row].length !== nextMap[row].length) {
                return true;
            }

            for (let col = 0; col < nextMap[row].length; col += 1) {
                if (this.level[row][col] !== nextMap[row][col]) {
                    return true;
                }
            }
        }

        return false;
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
                player.setDepth(20);

                const nameText = this.add.text(targetX, targetY - 30, serverPlayer.name || "Player", {
                    fontSize: "14px",
                    color: "#ffffff",
                    backgroundColor: "#000000",
                    padding: { x: 4, y: 2 }
                });
                nameText.setOrigin(0.5, 1);
                nameText.setDepth(30);

                this.players.set(id, player);
                this.playerNames.set(id, nameText);
                return;
            }

            const player = this.players.get(id);
            const nameText = this.playerNames.get(id);
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

            this.tweens.killTweensOf(nameText);
            this.tweens.add({
                targets: nameText,
                x: targetX,
                y: targetY - 30,
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

            const nameText = this.playerNames.get(id);
            if (nameText) {
                this.tweens.killTweensOf(nameText);
                nameText.destroy();
                this.playerNames.delete(id);
            }
        });
    }

    syncProjectiles(serverProjectiles) {
        const activeIds = new Set(serverProjectiles.map((p) => p.id));

        serverProjectiles.forEach((serverProjectile) => {
            const targetX = this.gridToWorldX(serverProjectile.gridX);
            const targetY = this.gridToWorldY(serverProjectile.gridY);
            const fillColor = this.parseColor(serverProjectile.color);

            if (!this.projectiles.has(serverProjectile.id)) {
                const projectile = this.add.circle(targetX, targetY, 10, fillColor);
                projectile.gridX = serverProjectile.gridX;
                projectile.gridY = serverProjectile.gridY;
                projectile.setDepth(50);
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
        const message = `${data.killerName} killed ${data.victimName}!`;
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

    showVictoryOverlay(winnerName) {
        if (this.hasWinner) {
            if (this.victoryWinnerText) {
                this.victoryWinnerText.setText(winnerName);
            }
            return;
        }

        this.hasWinner = true;
        this.setStatus("");

        const width = this.scale.width;
        const height = this.scale.height;
        const centerX = width / 2;
        const centerY = height / 2;

        const container = this.add.container(0, 0);
        container.setScrollFactor(0);
        container.setDepth(500);
        container.setAlpha(0);

        const darkVeil = this.add.rectangle(centerX, centerY, width, height, 0x03080d, 0.38);
        const glaze = this.add.rectangle(centerX, centerY, width, height, 0x08131d, 0.12);

        const rays = this.createVictoryRays(centerX, centerY - 10);
        this.victoryRays = rays;

        const panel = this.add.rectangle(centerX, centerY + 10, 760, 360, 0x091421, 0.86)
            .setStrokeStyle(4, 0xffd67a, 0.75);
        const innerPanel = this.add.rectangle(centerX, centerY + 10, 708, 308, 0x102436, 0.82)
            .setStrokeStyle(2, 0xa7ebff, 0.26);

        const topLine = this.add.rectangle(centerX, centerY - 114, 420, 4, 0xa7ebff, 0.55);
        const bottomLine = this.add.rectangle(centerX, centerY + 136, 420, 4, 0xffd67a, 0.55);

        const title = this.add.text(centerX, centerY - 82, "VICTOIRE", {
            fontSize: "66px",
            fontStyle: "bold",
            color: "#fff2bf",
            fontFamily: "Arial Black, Arial",
            stroke: "#17334c",
            strokeThickness: 8
        }).setOrigin(0.5);

        this.victoryWinnerText = this.add.text(centerX, centerY + 2, winnerName, {
            fontSize: "56px",
            fontStyle: "bold",
            color: "#ffffff",
            fontFamily: "Arial Black, Arial",
            align: "center",
            wordWrap: { width: 620, useAdvancedWrap: true }
        }).setOrigin(0.5);

        this.victorySubtitleText = this.add.text(centerX, centerY + 82, "est le dernier joueur en lice", {
            fontSize: "24px",
            color: "#dceef7",
            fontFamily: "Arial"
        }).setOrigin(0.5);

        const hint = this.add.text(centerX, centerY + 130, "Partie terminee", {
            fontSize: "20px",
            color: "#ffcf80",
            fontFamily: "Arial",
            letterSpacing: 2
        }).setOrigin(0.5);

        container.add([
            darkVeil,
            glaze,
            ...rays,
            panel,
            innerPanel,
            topLine,
            bottomLine,
            title,
            this.victoryWinnerText,
            this.victorySubtitleText,
            hint
        ]);

        this.victoryOverlay = container;

        this.tweens.add({
            targets: container,
            alpha: 1,
            duration: 380,
            ease: "Quad.Out"
        });

        this.tweens.add({
            targets: [panel, innerPanel],
            scaleX: { from: 0.88, to: 1 },
            scaleY: { from: 0.88, to: 1 },
            duration: 460,
            ease: "Back.Out"
        });

        this.tweens.add({
            targets: [title, this.victoryWinnerText, this.victorySubtitleText],
            y: "-=8",
            yoyo: true,
            repeat: -1,
            duration: 1800,
            ease: "Sine.InOut"
        });
    }

    createVictoryRays(centerX, centerY) {
        const rays = [];

        for (let i = 0; i < 10; i += 1) {
            const ray = this.add.rectangle(centerX, centerY, 18, 420, 0xffd67a, 0.08);
            ray.setOrigin(0.5, 1);
            ray.setAngle(i * 18);
            rays.push(ray);
        }

        return rays;
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
