export class BootScene extends Phaser.Scene {
    constructor() {
        super("BootScene");

        this.socket = null;
        this.matchState = null;
        this.playerListContainer = [];
        this.currentScreen = "launch";
        this.startButton = null;
        this.startButtonText = null;
        this.connectionInfoText = null;
        this.playerListY = 0;
        this.listLayout = null;
    }

    preload() {
        this.load.image("launch-bg", "assets/launch-bg.png");
    }

    create() {
        if (typeof window.io !== "function") {
            this.showError("Socket.IO client not found.\nStart the Node server.");
            return;
        }

        this.connectToServer();
        this.renderLaunchScreen();
    }

    connectToServer() {
        this.socket = window.io();

        this.socket.on("connect", () => {
            console.log("Screen connected");
        });

        this.socket.on("disconnect", () => {
            this.showError("Disconnected from server");
        });

        this.socket.on("matchState", (state) => {
            this.matchState = state;

            if (state.state === "playing") {
                if (this.currentScreen !== "playing") {
                    this.currentScreen = "playing";
                    this.scene.start("GameScene", { socket: this.socket });
                }
                return;
            }

            if (this.currentScreen === "waiting") {
                this.updateWaitingScreen();
            }
        });
    }

    renderLaunchScreen() {
        this.currentScreen = "launch";
        this.clearScreen();

        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        const centerX = this.cameras.main.centerX;
        const centerY = this.cameras.main.centerY;

        this.drawBackdrop(width, height);

        const buttonShadow = this.add.rectangle(centerX, centerY + 164, 390, 106, 0x04140b, 0.5);
        const button = this.add.rectangle(centerX, centerY + 154, 390, 106, 0x2dbd4f, 1)
            .setInteractive({ useHandCursor: true })
            .setStrokeStyle(5, 0xcaffd5, 0.95);
        const buttonInner = this.add.rectangle(centerX, centerY + 146, 350, 30, 0x81f39c, 0.22);

        button.on("pointerover", () => {
            button.setFillStyle(0x3ad65f);
            buttonInner.setFillStyle(0x9bffb2, 0.3);
        });
        button.on("pointerout", () => {
            button.setFillStyle(0x2dbd4f);
            buttonInner.setFillStyle(0x81f39c, 0.22);
        });
        button.on("pointerdown", () => {
            this.renderWaitingScreen();
        });

        this.add.text(centerX, centerY + 154, "LANCER", {
            fontSize: "42px",
            fontStyle: "bold",
            color: "#0d2412",
            fontFamily: "Arial Black, Arial"
        }).setOrigin(0.5);

        this.add.text(centerX, height - 34, "Copyright Nicolas Langlois & Flavio Zamperlini & Paul Koster", {
            fontSize: "15px",
            color: "#f8dfc2",
            fontFamily: "Arial",
            stroke: "#1a0902",
            strokeThickness: 3
        }).setOrigin(0.5);
    }

    renderWaitingScreen() {
        this.currentScreen = "waiting";
        this.clearScreen();

        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        const centerX = this.cameras.main.centerX;

        this.drawBackdrop(width, height);

        const panelWidth = Math.min(width - 100, 920);
        const panelHeight = Math.min(height - 80, 600);
        const panelTop = 40;
        const panelLeft = centerX - panelWidth / 2;

        this.add.rectangle(centerX, panelTop + panelHeight / 2, panelWidth, panelHeight, 0x07111b, 0.8)
            .setStrokeStyle(3, 0x8fe7ff, 0.4);

        this.add.text(centerX, panelTop + 48, "SALLE DES JOUEURS", {
            fontSize: "40px",
            fontStyle: "bold",
            color: "#fff3b0",
            fontFamily: "Arial Black, Arial"
        }).setOrigin(0.5);

        this.add.text(centerX, panelTop + 88, "Les manettes connectees apparaissent ici avant le lancement.", {
            fontSize: "20px",
            color: "#d8edf8",
            fontFamily: "Arial",
            align: "center"
        }).setOrigin(0.5);

        const listTop = panelTop + 130;
        const listHeight = panelHeight - 245;
        const listWidth = panelWidth - 100;
        const listLeft = panelLeft + 50;

        this.add.rectangle(centerX, listTop + listHeight / 2, listWidth, listHeight, 0x0d2030, 0.9)
            .setStrokeStyle(2, 0x89d8ff, 0.3);

        this.playerListContainer = [];
        this.playerListY = listTop + 26;
        this.listLayout = {
            left: listLeft + 28,
            width: listWidth - 56,
            top: listTop + 18,
            rowHeight: 54,
            maxRows: Math.max(1, Math.floor((listHeight - 36) / 54))
        };

        this.startButton = this.add.rectangle(centerX, panelTop + panelHeight - 54, 320, 74, 0xffb347, 1)
            .setInteractive({ useHandCursor: true })
            .setStrokeStyle(4, 0xffefc2, 0.9);
        this.startButtonText = this.add.text(centerX, panelTop + panelHeight - 54, "DEMARRER", {
            fontSize: "30px",
            fontStyle: "bold",
            color: "#17212c",
            fontFamily: "Arial Black, Arial"
        }).setOrigin(0.5);

        this.startButton.on("pointerover", () => this.refreshStartButton(true));
        this.startButton.on("pointerout", () => this.refreshStartButton(false));
        this.startButton.on("pointerdown", () => {
            if (this.matchState && Object.keys(this.matchState.connectedPlayers || {}).length > 0) {
                this.socket.emit("startMatch");
            }
        });

        this.connectionInfoText = this.add.text(centerX, panelTop + panelHeight - 108, "En attente de joueurs...", {
            fontSize: "18px",
            color: "#cbe6f5",
            fontFamily: "Arial",
            align: "center"
        }).setOrigin(0.5);

        this.updateWaitingScreen();
    }

    updateWaitingScreen() {
        if (this.currentScreen !== "waiting") {
            return;
        }

        this.playerListContainer.forEach((obj) => obj.destroy());
        this.playerListContainer = [];

        const players = this.matchState?.connectedPlayers || {};
        const playerIds = Object.keys(players);
        const centerX = this.cameras.main.centerX;

        if (playerIds.length === 0) {
            const emptyText = this.add.text(centerX, this.playerListY + 70, "Aucun joueur connecte pour le moment.", {
                fontSize: "24px",
                color: "#9ec9df",
                fontFamily: "Arial"
            }).setOrigin(0.5);
            this.playerListContainer.push(emptyText);
            this.connectionInfoText?.setText("Connecte au moins une manette pour demarrer.");
            this.refreshStartButton(false, true);
            return;
        }

        const visiblePlayers = playerIds.slice(0, this.listLayout.maxRows);

        visiblePlayers.forEach((socketId, index) => {
            const player = players[socketId];
            const rowY = this.listLayout.top + index * this.listLayout.rowHeight;
            const row = this.add.rectangle(
                this.cameras.main.centerX,
                rowY + 18,
                this.listLayout.width,
                42,
                index % 2 === 0 ? 0x123147 : 0x0f2738,
                0.96
            ).setStrokeStyle(1, 0x7fd6ff, 0.18);

            const badge = this.add.circle(this.listLayout.left + 18, rowY + 18, 15, 0xffb347, 1);
            const badgeText = this.add.text(this.listLayout.left + 18, rowY + 18, `${index + 1}`, {
                fontSize: "16px",
                fontStyle: "bold",
                color: "#17212c",
                fontFamily: "Arial"
            }).setOrigin(0.5);

            const safeName = this.truncateName(player.name || "Joueur", 34);
            const text = this.add.text(this.listLayout.left + 48, rowY + 18, safeName, {
                fontSize: "24px",
                color: "#ffffff",
                fontFamily: "Arial",
                wordWrap: { width: this.listLayout.width - 120, useAdvancedWrap: true }
            }).setOrigin(0, 0.5);

            this.playerListContainer.push(row, badge, badgeText, text);
        });

        if (playerIds.length > visiblePlayers.length) {
            const remaining = playerIds.length - visiblePlayers.length;
            const overflowText = this.add.text(centerX, this.playerListY + this.listLayout.maxRows * this.listLayout.rowHeight + 10, `+ ${remaining} autre(s) joueur(s)`, {
                fontSize: "18px",
                color: "#9ec9df",
                fontFamily: "Arial"
            }).setOrigin(0.5, 0);
            this.playerListContainer.push(overflowText);
        }

        this.connectionInfoText?.setText(`${playerIds.length} joueur(s) pret(s)`);
        this.refreshStartButton(false, false);
    }

    refreshStartButton(isHovering, disabled = false) {
        if (!this.startButton || !this.startButtonText) {
            return;
        }

        if (disabled) {
            this.startButton.setFillStyle(0x5d6d79);
            this.startButton.disableInteractive();
            this.startButtonText.setAlpha(0.65);
            return;
        }

        this.startButton.setFillStyle(isHovering ? 0xffc56a : 0xffb347);
        this.startButton.setInteractive({ useHandCursor: true });
        this.startButtonText.setAlpha(1);
    }

    truncateName(name, maxLength) {
        if (name.length <= maxLength) {
            return name;
        }

        return `${name.slice(0, Math.max(0, maxLength - 3))}...`;
    }

    drawBackdrop(width, height) {
        this.add.image(width / 2, height / 2, "launch-bg")
            .setDisplaySize(width, height)
            .setAlpha(0.96);

        this.add.rectangle(width / 2, height / 2, width, height, 0x051019, 0.35);

        const glow = this.add.graphics();
        glow.fillStyle(0xffc972, 0.08);
        glow.fillEllipse(width / 2, height * 0.82, width * 0.6, height * 0.18);
    }

    clearScreen() {
        this.children.removeAll();
        this.playerListContainer.forEach((obj) => obj.destroy());
        this.playerListContainer = [];
        this.startButton = null;
        this.startButtonText = null;
        this.connectionInfoText = null;
        this.listLayout = null;
    }

    showError(message) {
        this.clearScreen();
        this.add.rectangle(0, 0, this.cameras.main.width, this.cameras.main.height, 0x05090d).setOrigin(0);
        this.add.text(this.cameras.main.centerX, this.cameras.main.centerY, message, {
            fontSize: "28px",
            color: "#ff6b6b",
            fontFamily: "Arial",
            align: "center",
            wordWrap: { width: 700 }
        }).setOrigin(0.5);
    }
}
