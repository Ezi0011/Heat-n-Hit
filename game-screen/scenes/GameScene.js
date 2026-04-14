const TILE_TYPE = {
    BASIC: 0, 
    WALL: 1,
    DESTRUCTIBLE: 2, 
    SPAWN: 4
};

const TILE_SIZE = 16;
const SRC_SIZE = 16;
const TILE_MAP = {
    WALL: { x: 278, y: 20 },
    DESTRUCTIBLE: { x: 392, y: 77 },
    SPAWN: { x: 240, y: 153 },
    FLOORS: [
        { x: 125, y: 20 },
        { x: 144, y: 20 },
        { x: 163, y: 20 },
        { x: 182, y: 20 }
    ]
};

const CHAR_X = 706;
const CHAR_START_Y = 17;
const CHAR_SPACING_VERTICAL = 23;
const CHAR_SPACING_HORIZONTAL = 20;

const PROP_START_X = 824;
const PROP_START_Y = 206;
const PROP_SPACING = 18;

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

        this.propLayout = [];
    }

    preload() {
        if (!this.textures.exists("mountain-bg")) {
            this.load.image("mountain-bg", "assets/mountain-bg.jpg");
        }
        this.load.image("mainAssets", "assets/mainAssets.png");
    }

    create() {
        this.mapGraphics = this.add.graphics();
//        this.createStatusText();
        this.setupFixedCamera();
        this.connectToServer();
        this.canvasTexture = this.textures.createCanvas('mapCanvas', this.worldWidth, this.worldHeight);
        this.add.image(0, 0, 'mapCanvas').setOrigin(0);
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

    drawMap()
    {
        if (!this.canvasTexture || !this.level.length) return;

        if (this.propLayout.length === 0) {
            this.propLayout = this.level.map(row => row.map(() => {
                return Math.random() > 0.1 ? -1 : Math.floor(Math.random() * 8);
            }));
        }

        const ctx = this.canvasTexture.context;
        const tilesetImg = this.textures.get('mainAssets').getSourceImage();

        ctx.fillStyle = '#161616';
        ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);

        let charIndex = 0;

        for (let row = 0; row < this.mapRows; row++) {
            for (let col = 0; col < this.mapCols; col++) {
                const dx = col * this.tileSize;
                const dy = row * this.tileSize;
                const tileType = this.level[row][col];

                let groundSource;
                let floorIndex;
                
                if (tileType === TILE_TYPE.WALL) {
                    groundSource = TILE_MAP.WALL;
                } else if (tileType === TILE_TYPE.DESTRUCTIBLE) {
                    groundSource = TILE_MAP.DESTRUCTIBLE;
                } else if (tileType === TILE_TYPE.SPAWN) {
                    groundSource = TILE_MAP.SPAWN;
                } else {
                    if ( (row+col) % 2 == 0 ) {
                        floorIndex = (row % 2 == 0) ? 0 : 1;
                    } else {
                        floorIndex = (row % 2 == 0) ? 2 : 3;
                    }
                    groundSource = TILE_MAP.FLOORS[floorIndex];
                }

                ctx.drawImage(
                    tilesetImg,
                    groundSource.x, groundSource.y, TILE_SIZE, TILE_SIZE,
                    dx, dy, this.tileSize, this.tileSize
                );

                /*
                if (tileType === TILE_TYPE.BASIC) {
                    const propIdx = this.propLayout[row] ? this.propLayout[row][col] : -1;
                    if (propIdx !== -1) {
                        const propCol = Math.floor(propIdx / 4);
                        const propRow = propIdx % 4;
                        const px = PROP_START_X + (propCol * PROP_SPACING);
                        const py = PROP_START_Y + (propRow * PROP_SPACING);

                        ctx.drawImage(
                            tilesetImg, 
                            px, py, SRC_SIZE, SRC_SIZE, 
                            dx, dy, this.tileSize, this.tileSize
                        );
                    }
                }

                /*
                // --- LAYER 3: CHARACTERS (OVERLAY) ---
                // Only draw characters if it's a SPAWN tile
                if (tileType === TILE_TYPE.SPAWN) {
                    const cx = CHAR_X;
                    const cy = CHAR_START_Y + (charIndex * CHAR_SPACING_VERTICAL);
                    charIndex += 1;

                    ctx.drawImage(
                        tilesetImg, 
                        cx, cy, SRC_SIZE, SRC_SIZE, 
                        dx, dy, this.tileSize, this.tileSize
                    );
                }
                */
            }
        }

        this.canvasTexture.refresh();
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
