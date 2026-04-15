const TILE_TYPE = {
    BASIC: 0, 
    WALL: 1,
    DESTRUCTIBLE: 2, 
    SPAWN: 4
};

const TILE_SIZE = 16;
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

const CHAR_START_X = 706;
const CHAR_START_Y = 17;
const CHAR_SPACING_VERTICAL = 24;
const CHAR_SPACING_HORIZONTAL = 20;

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
        this.roundText = null;
        this.roundSubtitleText = null;
        this.roundTextValue = "";
        this.roundTextHideEvent = null;
        this.roundBanner = null;
        this.roundBannerShadow = null;
        this.roundBannerGlow = null;
        this.roundBannerPanel = null;
        this.roundBannerInner = null;
        this.roundBannerLeftAccent = null;
        this.roundBannerRightAccent = null;
        this.roundBannerBaseY = 18;
        this.matchState = null;
        this.pendingMatchState = null;
        this.hasWinner = false;
        this.victoryOverlay = null;
        this.victoryWinnerText = null;
        this.victorySubtitleText = null;
        this.victoryRays = [];
        this.restartButton = null;
        this.restartButtonText = null;
        this.isRestartingTournament = false;

        this.handleSocketConnect = () => {
            this.refreshStatus();
        };

        this.handleSocketDisconnect = () => {
            this.setStatus("Disconnected from server.");
            this.setRoundText("");
        };

        this.handleGameState = (state) => {
            this.applyGameState(state);
        };

        this.handleMatchState = (state) => {
            this.applyMatchState(state);
        };

        this.handlePlayerHit = (data) => {
            this.showHitPopup(data);
        };

        this.handlePlayerWon = (data) => {
            this.showVictoryOverlay(data.winnerName);
        };
    }

    init(data) {
        if (data?.socket) {
            this.socket = data.socket;
        }

        if (data?.matchState) {
            this.pendingMatchState = data.matchState;
        }

        this.propLayout = [];
    }

    preload() {
        if (!this.textures.exists("mountain-bg")) {
            this.load.image("mountain-bg", "assets/mountain-bg.jpg");
        }
        if (!this.textures.exists("projectile-fireball")) {
            this.load.image("projectile-fireball", "assets/projectile-fireball.png");
        }
        this.load.image("mainAssets", "assets/mainAssets.png");
    
        this.load.on('complete', () => {
            const tex = this.textures.get('mainAssets');
            const directions = ['right', 'left', 'up', 'down'];
            
            for (let i = 0; i < 16; i++) {
                const y = CHAR_START_Y + (i * CHAR_SPACING_VERTICAL);
                
                directions.forEach((dir, dirIndex) => {
                    const x = CHAR_START_X + (dirIndex * CHAR_SPACING_HORIZONTAL);
            
                    if (!tex.has(`player_${i}_${dir}`)) {
                        tex.add(`player_${i}_${dir}`, 0, x, y, 16, 16);
                    }
                });
            }
        });
    }

    create() {
        this.canvasTexture = this.textures.createCanvas('mapCanvas', this.worldWidth, this.worldHeight);

        this.mapImage = this.add.image(0, 0, 'mapCanvas').setOrigin(0);
        this.mapImage.setDepth(0);

        this.mapGraphics = this.add.graphics();
        //this.createStatusText();
        this.createRoundText();
        this.setupFixedCamera();
        this.connectToServer();
        this.events.once("shutdown", () => this.detachSocketListeners());

        if (this.pendingMatchState) {
            this.applyMatchState(this.pendingMatchState);
            this.pendingMatchState = null;
        }
    }

    update() {
        if (!this.hasWinner || this.victoryRays.length === 0) {
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

    createRoundText() {
        const centerX = this.scale.width / 2;

        this.roundBanner = this.add.container(centerX, this.roundBannerBaseY);
        this.roundBanner.setScrollFactor(0);
        this.roundBanner.setDepth(110);
        this.roundBanner.setVisible(false);
        this.roundBanner.setAlpha(0);

        this.roundBannerShadow = this.add.rectangle(0, 42, 554, 92, 0x01060a, 0.42);
        this.roundBannerGlow = this.add.rectangle(0, 40, 470, 62, 0x7fd6ff, 0.12);
        this.roundBannerPanel = this.add.rectangle(0, 38, 520, 78, 0x08131d, 0.94)
            .setStrokeStyle(3, 0xa7ebff, 0.82);
        this.roundBannerInner = this.add.rectangle(0, 38, 484, 52, 0x102436, 0.88)
            .setStrokeStyle(1, 0xffd67a, 0.22);
        this.roundBannerLeftAccent = this.add.rectangle(-205, 38, 52, 6, 0xffd67a, 1).setAngle(-24);
        this.roundBannerRightAccent = this.add.rectangle(205, 38, 52, 6, 0xffd67a, 1).setAngle(24);

        this.roundSubtitleText = this.add.text(0, 18, "", {
            color: "#d6efff",
            fontSize: "13px",
            fontStyle: "bold",
            fontFamily: "Arial",
            letterSpacing: 2
        }).setOrigin(0.5);

        this.roundText = this.add.text(0, 44, "", {
            color: "#fff3b0",
            fontSize: "34px",
            fontStyle: "bold",
            fontFamily: "Arial Black, Arial",
            stroke: "#17334c",
            strokeThickness: 6
        }).setOrigin(0.5);

        this.roundText.setShadow(0, 4, "rgba(0, 0, 0, 0.35)", 8);

        this.roundBanner.add([
            this.roundBannerShadow,
            this.roundBannerGlow,
            this.roundBannerPanel,
            this.roundBannerInner,
            this.roundBannerLeftAccent,
            this.roundBannerRightAccent,
            this.roundSubtitleText,
            this.roundText
        ]);
    }

    connectToServer() {
        if (!this.socket) {
            if (typeof window.io !== "function") {
                this.setStatus("Socket.IO client not found.\nStart the Node server.");
                return;
            }

            this.socket = window.io();
        }

        this.detachSocketListeners();

        this.socket.on("connect", this.handleSocketConnect);
        this.socket.on("disconnect", this.handleSocketDisconnect);
        this.socket.on("gameState", this.handleGameState);
        this.socket.on("matchState", this.handleMatchState);
        this.socket.on("playerHit", this.handlePlayerHit);
        this.socket.on("playerWon", this.handlePlayerWon);
    }

    detachSocketListeners() {
        if (!this.socket) {
            return;
        }

        this.socket.off("connect", this.handleSocketConnect);
        this.socket.off("disconnect", this.handleSocketDisconnect);
        this.socket.off("gameState", this.handleGameState);
        this.socket.off("matchState", this.handleMatchState);
        this.socket.off("playerHit", this.handlePlayerHit);
        this.socket.off("playerWon", this.handlePlayerWon);
    }

    applyMatchState(state) {
        this.matchState = state;

        if (state.phase === "lobby") {
            this.scene.start("BootScene", {
                socket: this.socket,
                matchState: state
            });
            return;
        }

        if (state.state !== "completed") {
            this.hasWinner = false;
            this.isRestartingTournament = false;
        }

        this.refreshStatus();
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
        this.refreshStatus();
    }

    refreshStatus() {
        if (this.hasWinner) {
            return;
        }

        if (!this.matchState) {
            this.setStatus("Screen connected.\nWaiting for match state...");
            this.setRoundText("");
            return;
        }

        const playerCount = (this.matchState.activePlayers || []).length;
        const roundLabel = this.matchState.currentRound?.label || "";
        const roundMessage = this.matchState.message || "";
        const countdownSeconds = typeof this.matchState.countdownSeconds === "number"
            ? this.matchState.countdownSeconds
            : null;

        if (roundLabel) {
            if (countdownSeconds !== null) {
                this.setRoundText(`${roundLabel} - ${countdownSeconds}s`);
            } else {
                const qualifierCount = this.matchState.currentRound?.qualifierCount;
                const qualifierText = this.matchState.phase === "quarterfinals" && typeof qualifierCount === "number"
                    ? ` - ${qualifierCount} qualifie(s)`
                    : "";
                this.setRoundText(`${roundLabel}${qualifierText}`);
            }
        } else {
            this.setRoundText("");
        }

        const lines = [];
        lines.push(`Etat: ${this.matchState.state}`);

        if (roundMessage) {
            lines.push(roundMessage);
        }

        if (this.matchState.phase === "quarterfinals") {
            lines.push(`Finalistes actuels: ${this.matchState.finalists?.length || 0}`);
        }

        if (this.matchState.phase === "final") {
            lines.push("Finale en cours");
        }

        if (this.matchState.state === "completed" && this.matchState.winner) {
            lines.push(`Vainqueur: ${this.matchState.winner.name}`);
        } else {
            lines.push(`Joueurs sur l'arene: ${playerCount}`);
        }

        this.setStatus(lines.join("\n"));
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
            const dir = serverPlayer.direction || "down"; // Default to down if undefined

            const colorIndex = serverPlayer.colorIndex || 0;
            const frameName = `player_${colorIndex}_${dir}`;

            if (!this.players.has(id)) {

                const player = this.add.sprite(targetX, targetY, "mainAssets", frameName);

                player.setDisplaySize(56, 56);
                player.setOrigin(0.5, 0.56);
                player.setDepth(100);
                player.assignedColorIndex = colorIndex;
                player.baseScaleX = player.scaleX;
                player.baseScaleY = player.scaleY;
                player.gridX = serverPlayer.gridX;
                player.gridY = serverPlayer.gridY;
                this.applyPlayerDirectionPose(player, dir);
                this.resetPlayerWalkPose(player);

                const nameText = this.add.text(targetX, targetY - 30, serverPlayer.name || "Player", {
                    fontSize: "14px",
                    color: "#ffffff",
                    backgroundColor: "#000000",
                    padding: { x: 4, y: 2 }
                });
                nameText.setOrigin(0.5, 1);
                nameText.setDepth(150);

                this.players.set(id, player);
                this.playerNames.set(id, nameText);
                return;
            } else {
                const player = this.players.get(id);
                const modelRow = player.assignedColorIndex ?? colorIndex;
                player.setFrame(`player_${modelRow}_${dir}`);
            }

            const player = this.players.get(id);
            const nameText = this.playerNames.get(id);
            player.assignedColorIndex = colorIndex;
            player.setFrame(`player_${colorIndex}_${dir}`);
            this.applyPlayerDirectionPose(player, dir);

            if (player.gridX === serverPlayer.gridX && player.gridY === serverPlayer.gridY) {
                this.resetPlayerWalkPose(player);
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
            this.playPlayerWalkAnimation(player, dir, serverPlayer.moveDuration ?? 120);

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

    applyPlayerDirectionPose(player, dir) {
        player.setCrop();
        player.setOrigin(0.5, dir === "up" ? 0.58 : 0.56);
        player.currentDirection = dir;
    }

    resetPlayerWalkPose(player) {
        if (!player) {
            return;
        }

        player.setScale(player.baseScaleX ?? 4, player.baseScaleY ?? 4);
        player.setAngle(0);
    }

    playPlayerWalkAnimation(player, dir, moveDuration) {
        const baseScaleX = player.baseScaleX ?? player.scaleX;
        const baseScaleY = player.baseScaleY ?? player.scaleY;
        const isHorizontal = dir === "left" || dir === "right";
        const targetScaleX = isHorizontal ? baseScaleX * 0.8 : baseScaleX * 1.1;
        const targetScaleY = isHorizontal ? baseScaleY * 1.15 : baseScaleY * 0.82;
        const targetAngle = dir === "left" ? -10 : dir === "right" ? 10 : 0;
        const stepDuration = Math.max(35, Math.floor(moveDuration / 4));

        this.resetPlayerWalkPose(player);

        this.tweens.add({
            targets: player,
            scaleX: targetScaleX,
            scaleY: targetScaleY,
            angle: targetAngle,
            duration: stepDuration,
            yoyo: true,
            repeat: 1,
            ease: "Quad.InOut",
            onComplete: () => this.resetPlayerWalkPose(player)
        });
    }

    syncProjectiles(serverProjectiles) {
        const activeIds = new Set(serverProjectiles.map((projectile) => projectile.id));

        serverProjectiles.forEach((serverProjectile) => {
            const targetX = this.gridToWorldX(serverProjectile.gridX);
            const targetY = this.gridToWorldY(serverProjectile.gridY);
            const projectileAngle = this.getProjectileAngle(serverProjectile.direction);

            if (!this.projectiles.has(serverProjectile.id)) {
                const projectile = this.add.sprite(targetX, targetY, "projectile-fireball");
                projectile.setDisplaySize(70, 35);
                projectile.setAngle(projectileAngle);
                projectile.gridX = serverProjectile.gridX;
                projectile.gridY = serverProjectile.gridY;
                projectile.direction = serverProjectile.direction;
                projectile.setDepth(50);
                this.projectiles.set(serverProjectile.id, projectile);
                return;
            }

            const projectile = this.projectiles.get(serverProjectile.id);
            projectile.setAngle(projectileAngle);
            projectile.direction = serverProjectile.direction;

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

    getProjectileAngle(direction) {
        switch (direction) {
            case "left":
                return 180;
            case "up":
                return -90;
            case "down":
                return 90;
            case "right":
            default:
                return 0;
        }
    }

    showHitPopup(data) {
        const message = `${data.killerName} killed ${data.victimName}!`;
        const text = this.add.text(this.cameras.main.centerX, 90, message, {
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
        this.setRoundText("");

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

        const panel = this.add.rectangle(centerX, centerY + 10, 920, 440, 0x091421, 0.86)
            .setStrokeStyle(4, 0xffd67a, 0.75);
        const innerPanel = this.add.rectangle(centerX, centerY + 10, 860, 376, 0x102436, 0.82)
            .setStrokeStyle(2, 0xa7ebff, 0.26);

        const topLine = this.add.rectangle(centerX, centerY - 142, 520, 5, 0xa7ebff, 0.55);
        const bottomLine = this.add.rectangle(centerX, centerY + 172, 520, 5, 0xffd67a, 0.55);

        const title = this.add.text(centerX, centerY - 104, "VICTOIRE", {
            fontSize: "84px",
            fontStyle: "bold",
            color: "#fff2bf",
            fontFamily: "Arial Black, Arial",
            stroke: "#17334c",
            strokeThickness: 8
        }).setOrigin(0.5);

        this.victoryWinnerText = this.add.text(centerX, centerY + 16, winnerName, {
            fontSize: "74px",
            fontStyle: "bold",
            color: "#ffffff",
            fontFamily: "Arial Black, Arial",
            align: "center",
            wordWrap: { width: 760, useAdvancedWrap: true }
        }).setOrigin(0.5);

        this.victorySubtitleText = this.add.text(centerX, centerY + 108, "remporte le tournoi", {
            fontSize: "32px",
            color: "#dceef7",
            fontFamily: "Arial"
        }).setOrigin(0.5);

        const hint = this.add.text(centerX, centerY + 168, "Tournoi termine", {
            fontSize: "24px",
            color: "#ffcf80",
            fontFamily: "Arial",
            letterSpacing: 2
        }).setOrigin(0.5);

        this.restartButton = this.add.rectangle(centerX, centerY + 242, 340, 86, 0x2dbd4f, 1)
            .setStrokeStyle(4, 0xcaffd5, 0.95)
            .setInteractive({ useHandCursor: true })
            .setScrollFactor(0)
            .setDepth(520);
        this.restartButtonText = this.add.text(centerX, centerY + 242, "RELANCER", {
            fontSize: "36px",
            fontStyle: "bold",
            color: "#0d2412",
            fontFamily: "Arial Black, Arial"
        })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(521);

        this.restartButton.on("pointerover", () => {
            if (this.isRestartingTournament) {
                return;
            }

            this.restartButton.setFillStyle(0x3ad65f);
        });

        this.restartButton.on("pointerout", () => {
            if (this.isRestartingTournament) {
                return;
            }

            this.restartButton.setFillStyle(0x2dbd4f);
        });

        this.restartButton.on("pointerdown", () => {
            this.requestTournamentRestart();
        });

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

    setRoundText(message) {
        if (!this.roundText || !this.roundBanner) {
            return;
        }

        if (!message) {
            if (this.roundTextHideEvent) {
                this.roundTextHideEvent.remove(false);
                this.roundTextHideEvent = null;
            }

            this.tweens.killTweensOf(this.roundBanner);
            this.tweens.killTweensOf(this.roundBannerGlow);
            this.roundTextValue = "";
            this.roundText.setText("");
            this.roundSubtitleText?.setText("");
            this.roundBanner.setAlpha(1);
            this.roundBanner.setScale(1);
            this.roundBanner.setY(this.roundBannerBaseY);
            this.roundBanner.setVisible(false);
            return;
        }

        if (message === this.roundTextValue) {
            return;
        }

        if (this.roundTextHideEvent) {
            this.roundTextHideEvent.remove(false);
            this.roundTextHideEvent = null;
        }

        this.tweens.killTweensOf(this.roundBanner);
        this.tweens.killTweensOf(this.roundBannerGlow);

        const bannerStyle = this.getRoundBannerStyle(message);
        this.roundTextValue = message;
        this.roundText.setText(message.toUpperCase());
        this.roundSubtitleText?.setText(bannerStyle.subtitle);
        this.roundText.setColor(bannerStyle.titleColor);
        this.roundText.setStroke(bannerStyle.titleStroke, 6);
        this.roundSubtitleText?.setColor(bannerStyle.subtitleColor);
        this.roundBannerPanel.setFillStyle(this.parseColor(bannerStyle.panelFill), 0.95);
        this.roundBannerPanel.setStrokeStyle(3, this.parseColor(bannerStyle.panelStroke), 0.84);
        this.roundBannerInner.setFillStyle(this.parseColor(bannerStyle.innerFill), 0.88);
        this.roundBannerInner.setStrokeStyle(1, this.parseColor(bannerStyle.innerStroke), 0.3);
        this.roundBannerGlow.setFillStyle(this.parseColor(bannerStyle.glowFill), 0.16);
        this.roundBannerLeftAccent.setFillStyle(this.parseColor(bannerStyle.accentFill), 1);
        this.roundBannerRightAccent.setFillStyle(this.parseColor(bannerStyle.accentFill), 1);

        this.roundBanner.setVisible(true);
        this.roundBanner.setAlpha(0);
        this.roundBanner.setScale(0.94);
        this.roundBanner.setY(this.roundBannerBaseY - 10);
        this.roundBannerGlow.setScale(0.9, 0.92);

        this.tweens.add({
            targets: this.roundBanner,
            alpha: 1,
            scaleX: 1,
            scaleY: 1,
            y: this.roundBannerBaseY,
            duration: 320,
            ease: "Back.Out"
        });

        this.tweens.add({
            targets: this.roundBannerGlow,
            scaleX: 1.06,
            scaleY: 1.12,
            alpha: { from: 0.12, to: 0.24 },
            duration: 360,
            yoyo: true,
            ease: "Sine.Out"
        });

        this.roundTextHideEvent = this.time.delayedCall(2200, () => {
            this.tweens.add({
                targets: this.roundBanner,
                alpha: 0,
                y: this.roundBannerBaseY - 8,
                duration: 260,
                onComplete: () => {
                    this.roundBanner.setVisible(false);
                    this.roundBanner.setAlpha(1);
                    this.roundBanner.setScale(1);
                    this.roundBanner.setY(this.roundBannerBaseY);
                }
            });
            this.roundTextHideEvent = null;
        });
    }

    getRoundBannerStyle(message) {
        const normalized = String(message || "").toLowerCase();

        if (normalized.includes("final")) {
            return {
                subtitle: "AFFRONTEMENT FINAL",
                titleColor: "#fff1bf",
                titleStroke: "#5a2200",
                subtitleColor: "#ffd7a1",
                panelFill: "#2b1208",
                panelStroke: "#ffb25c",
                innerFill: "#4a1d0a",
                innerStroke: "#ffe2ad",
                glowFill: "#ff8a3d",
                accentFill: "#ffd67a"
            };
        }

        return {
            subtitle: "MANCHE DE QUALIFICATION",
            titleColor: "#f4fbff",
            titleStroke: "#13344d",
            subtitleColor: "#cdefff",
            panelFill: "#08131d",
            panelStroke: "#8fe7ff",
            innerFill: "#163046",
            innerStroke: "#ffe3a0",
            glowFill: "#5ecbff",
            accentFill: "#ffd67a"
        };
    }

    requestTournamentRestart() {
        if (!this.socket || this.isRestartingTournament) {
            return;
        }

        this.isRestartingTournament = true;

        if (this.restartButton) {
            this.restartButton.disableInteractive();
            this.restartButton.setFillStyle(0x5d6d79);
        }

        if (this.restartButtonText) {
            this.restartButtonText.setText("RELANCE...");
        }

        this.socket.emit("restartTournament");
    }
}
