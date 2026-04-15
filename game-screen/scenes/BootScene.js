export class BootScene extends Phaser.Scene {
    constructor() {
        super("BootScene");

        this.socket = null;
        this.matchState = null;
        this.pendingMatchState = null;
        this.playerListContainer = [];
        this.currentScreen = "launch";
        this.startButton = null;
        this.startButtonText = null;
        this.connectionInfoText = null;
        this.playerListY = 0;
        this.listLayout = null;
        this.playerListScrollIndex = 0;
        this.scrollbarTrack = null;
        this.scrollbarThumb = null;
        this.playerListAutoScrollTimer = null;
        this.playerListAutoScrollDirection = 1;
        this.playerListAutoScrollPauseUntil = 0;

        this.handleSocketConnect = () => {
            console.log("Screen connected");
        };

        this.handleSocketDisconnect = () => {
            this.showError("Disconnected from server");
        };

        this.handleMatchState = (state) => {
            this.matchState = state;

            if (state.phase !== "lobby") {
                if (this.currentScreen !== "playing") {
                    this.currentScreen = "playing";
                    this.scene.start("GameScene", {
                        socket: this.socket,
                        matchState: state
                    });
                }
                return;
            }

            if (state.state === "waiting" && this.currentScreen !== "waiting") {
                this.renderWaitingScreen();
                return;
            }

            if (this.currentScreen === "waiting") {
                this.updateWaitingScreen();
            }
        };

        this.handleSceneWheel = (pointer, _gameObjects, _deltaX, deltaY) => {
            if (this.currentScreen !== "waiting" || !this.listLayout) {
                return;
            }

            if (!this.isPointerInsidePlayerList(pointer)) {
                return;
            }

            const step = deltaY > 0 ? 1 : -1;
            if (step !== 0) {
                this.pausePlayerListAutoScroll();
                this.setPlayerListScrollIndex(this.playerListScrollIndex + step);
            }
        };

        this.handleScrollbarDrag = (_pointer, gameObject, _dragX, dragY) => {
            if (this.currentScreen !== "waiting" || gameObject !== this.scrollbarThumb || !this.listLayout) {
                return;
            }

            const maxStartIndex = this.getMaxPlayerListStartIndex();
            if (maxStartIndex <= 0) {
                return;
            }

            const thumbHeight = gameObject.height;
            const minY = this.listLayout.scrollbarTrackTop + (thumbHeight / 2);
            const maxY = this.listLayout.scrollbarTrackTop + this.listLayout.scrollbarTrackHeight - (thumbHeight / 2);
            const clampedY = Phaser.Math.Clamp(dragY, minY, maxY);
            const travel = maxY - minY;
            const ratio = travel <= 0 ? 0 : (clampedY - minY) / travel;

            this.pausePlayerListAutoScroll();
            this.setPlayerListScrollIndex(Math.round(ratio * maxStartIndex));
        };
    }

    init(data) {
        if (data?.socket) {
            this.socket = data.socket;
        }

        if (data?.matchState) {
            this.pendingMatchState = data.matchState;
        }
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
        this.events.once("shutdown", () => this.detachSocketListeners());

        if (this.pendingMatchState) {
            this.handleMatchState(this.pendingMatchState);
            this.pendingMatchState = null;
            if (this.currentScreen !== "launch") {
                return;
            }
        }

        this.renderLaunchScreen();
        this.scale.on("resize", this.handleSceneResize, this);
        this.input.on("wheel", this.handleSceneWheel, this);
        this.input.on("drag", this.handleScrollbarDrag, this);
        this.events.once("shutdown", this.handleSceneShutdown, this);
        this.events.once("destroy", this.handleSceneShutdown, this);
    }

    connectToServer() {
        if (!this.socket) {
            this.socket = window.io();
        }

        this.detachSocketListeners();

        this.socket.on("connect", this.handleSocketConnect);
        this.socket.on("disconnect", this.handleSocketDisconnect);
        this.socket.on("matchState", this.handleMatchState);
    }

    detachSocketListeners() {
        if (!this.socket) {
            return;
        }

        this.socket.off("connect", this.handleSocketConnect);
        this.socket.off("disconnect", this.handleSocketDisconnect);
        this.socket.off("matchState", this.handleMatchState);
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

        const panelWidth = Math.min(width - 80, 980);
        const panelHeight = Math.min(height - 48, 720);
        const panelTop = Math.max(24, (height - panelHeight) / 2);
        const panelLeft = centerX - panelWidth / 2;
        const panelBottom = panelTop + panelHeight;

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

        const qrBlockTop = panelTop + 108;
        const qrBlockHeight = 116;
        const qrBlockWidth = panelWidth - 100;
        const qrBlockLeft = panelLeft + 50;
        const qrBlockCenterY = qrBlockTop + (qrBlockHeight / 2);

        this.add.rectangle(centerX, qrBlockCenterY, qrBlockWidth, qrBlockHeight, 0x0d2030, 0.9)
            .setStrokeStyle(2, 0x89d8ff, 0.3);

        this.createQrCodeBlock(qrBlockLeft + 84, qrBlockTop + 57, qrBlockWidth - 210);

        const listTop = qrBlockTop + qrBlockHeight + 24;
        const footerHeight = 92;
        const listHeight = panelBottom - listTop - footerHeight - 20;
        const listWidth = panelWidth - 100;
        const listLeft = panelLeft + 50;

        this.add.rectangle(centerX, listTop + listHeight / 2, listWidth, listHeight, 0x0d2030, 0.9)
            .setStrokeStyle(2, 0x89d8ff, 0.3);

        this.playerListContainer = [];
        this.playerListY = listTop + 26;
        this.listLayout = {
            left: listLeft + 28,
            width: listWidth - 84,
            top: listTop + 18,
            rowHeight: 42,
            maxRows: Math.max(1, Math.floor((listHeight - 36) / 42)),
            viewportLeft: listLeft + 20,
            viewportTop: listTop + 18,
            viewportWidth: listWidth - 40,
            viewportHeight: listHeight - 36,
            scrollbarTrackX: listLeft + listWidth - 18,
            scrollbarTrackTop: listTop + 18,
            scrollbarTrackHeight: listHeight - 36
        };

        this.connectionInfoText = this.add.text(centerX, panelBottom - 92, "En attente de joueurs...", {
            fontSize: "17px",
            color: "#cbe6f5",
            fontFamily: "Arial",
            align: "center"
        }).setOrigin(0.5);

        this.startButton = this.add.rectangle(centerX, panelBottom - 42, 320, 68, 0xffb347, 1)
            .setInteractive({ useHandCursor: true })
            .setStrokeStyle(4, 0xffefc2, 0.9);
        this.startButtonText = this.add.text(centerX, panelBottom - 42, "DEMARRER", {
            fontSize: "28px",
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
        const maxStartIndex = this.getMaxPlayerListStartIndex(playerIds.length);
        this.playerListScrollIndex = Phaser.Math.Clamp(this.playerListScrollIndex, 0, maxStartIndex);

        if (playerIds.length === 0) {
            this.stopPlayerListAutoScroll();
            this.playerListScrollIndex = 0;
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

        this.ensurePlayerListAutoScroll(maxStartIndex);

        const visiblePlayers = playerIds.slice(
            this.playerListScrollIndex,
            this.playerListScrollIndex + this.listLayout.maxRows
        );

        visiblePlayers.forEach((socketId, index) => {
            const player = players[socketId];
            const rowY = this.listLayout.top + index * this.listLayout.rowHeight;
            const displayIndex = this.playerListScrollIndex + index + 1;
            const row = this.add.rectangle(
                this.cameras.main.centerX,
                rowY + 18,
                this.listLayout.width,
                34,
                index % 2 === 0 ? 0x123147 : 0x0f2738,
                0.96
            ).setStrokeStyle(1, 0x7fd6ff, 0.18);

            const badge = this.add.circle(this.listLayout.left + 18, rowY + 18, 13, 0xffb347, 1);
            const badgeText = this.add.text(this.listLayout.left + 18, rowY + 18, `${displayIndex}`, {
                fontSize: "14px",
                fontStyle: "bold",
                color: "#17212c",
                fontFamily: "Arial"
            }).setOrigin(0.5);

            const safeName = this.truncateName(player.name || "Joueur", 34);
            const text = this.add.text(this.listLayout.left + 48, rowY + 18, safeName, {
                fontSize: "20px",
                color: "#ffffff",
                fontFamily: "Arial",
                wordWrap: { width: this.listLayout.width - 120, useAdvancedWrap: true }
            }).setOrigin(0, 0.5);

            this.playerListContainer.push(row, badge, badgeText, text);
        });

        if (maxStartIndex > 0) {
            const track = this.add.rectangle(
                this.listLayout.scrollbarTrackX,
                this.listLayout.scrollbarTrackTop + (this.listLayout.scrollbarTrackHeight / 2),
                10,
                this.listLayout.scrollbarTrackHeight,
                0x0a1722,
                0.92
            ).setStrokeStyle(1, 0x7fd6ff, 0.24);

            const thumbHeight = Math.max(
                36,
                this.listLayout.scrollbarTrackHeight * (this.listLayout.maxRows / playerIds.length)
            );
            const thumbTravel = this.listLayout.scrollbarTrackHeight - thumbHeight;
            const thumbOffset = maxStartIndex <= 0 ? 0 : thumbTravel * (this.playerListScrollIndex / maxStartIndex);
            const thumb = this.add.rectangle(
                this.listLayout.scrollbarTrackX,
                this.listLayout.scrollbarTrackTop + (thumbHeight / 2) + thumbOffset,
                14,
                thumbHeight,
                0xffb347,
                1
            ).setStrokeStyle(2, 0xffefc2, 0.8).setInteractive({ useHandCursor: true });

            this.input.setDraggable(thumb);
            track.setInteractive({ useHandCursor: true });
            track.on("pointerdown", (pointer) => {
                const minY = this.listLayout.scrollbarTrackTop + (thumbHeight / 2);
                const maxY = this.listLayout.scrollbarTrackTop + this.listLayout.scrollbarTrackHeight - (thumbHeight / 2);
                const clampedY = Phaser.Math.Clamp(pointer.y, minY, maxY);
                const travel = maxY - minY;
                const ratio = travel <= 0 ? 0 : (clampedY - minY) / travel;
                this.pausePlayerListAutoScroll();
                this.setPlayerListScrollIndex(Math.round(ratio * maxStartIndex));
            });

            this.scrollbarTrack = track;
            this.scrollbarThumb = thumb;
            this.playerListContainer.push(track, thumb);
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

    getMaxPlayerListStartIndex(totalPlayers = Object.keys(this.matchState?.connectedPlayers || {}).length) {
        if (!this.listLayout) {
            return 0;
        }

        return Math.max(0, totalPlayers - this.listLayout.maxRows);
    }

    setPlayerListScrollIndex(nextIndex) {
        const maxStartIndex = this.getMaxPlayerListStartIndex();
        const clampedIndex = Phaser.Math.Clamp(nextIndex, 0, maxStartIndex);

        if (clampedIndex === this.playerListScrollIndex) {
            return;
        }

        this.playerListScrollIndex = clampedIndex;
        this.updateWaitingScreen();
    }

    isPointerInsidePlayerList(pointer) {
        if (!this.listLayout) {
            return false;
        }

        return (
            pointer.x >= this.listLayout.viewportLeft &&
            pointer.x <= this.listLayout.viewportLeft + this.listLayout.viewportWidth &&
            pointer.y >= this.listLayout.viewportTop &&
            pointer.y <= this.listLayout.viewportTop + this.listLayout.viewportHeight
        );
    }

    ensurePlayerListAutoScroll(maxStartIndex) {
        if (maxStartIndex <= 0) {
            this.stopPlayerListAutoScroll();
            return;
        }

        if (this.playerListAutoScrollTimer) {
            return;
        }

        this.playerListAutoScrollTimer = this.time.addEvent({
            delay: 1700,
            loop: true,
            callback: () => {
                if (this.currentScreen !== "waiting" || !this.listLayout) {
                    return;
                }

                if (this.time.now < this.playerListAutoScrollPauseUntil) {
                    return;
                }

                const currentMaxStartIndex = this.getMaxPlayerListStartIndex();
                if (currentMaxStartIndex <= 0) {
                    return;
                }

                if (this.playerListScrollIndex >= currentMaxStartIndex) {
                    this.playerListAutoScrollDirection = -1;
                } else if (this.playerListScrollIndex <= 0) {
                    this.playerListAutoScrollDirection = 1;
                }

                this.setPlayerListScrollIndex(this.playerListScrollIndex + this.playerListAutoScrollDirection);
            }
        });
    }

    stopPlayerListAutoScroll() {
        if (this.playerListAutoScrollTimer) {
            this.playerListAutoScrollTimer.remove(false);
            this.playerListAutoScrollTimer = null;
        }

        this.playerListAutoScrollDirection = 1;
        this.playerListAutoScrollPauseUntil = 0;
    }

    pausePlayerListAutoScroll(delayMs = 4500) {
        this.playerListAutoScrollPauseUntil = this.time.now + delayMs;
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

    createQrCodeBlock(qrLeft, qrTop, textWidth) {
        this.removeQrCodeBlock();

        const controllerUrl = this.getControllerUrl();
        const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=0&data=${encodeURIComponent(controllerUrl)}`;
        const qrSize = 96;

        const qrBackground = document.createElement("div");
        qrBackground.style.position = "fixed";
        qrBackground.style.width = `${qrSize}px`;
        qrBackground.style.height = `${qrSize}px`;
        qrBackground.style.background = "#ffffff";
        qrBackground.style.borderRadius = "10px";
        qrBackground.style.display = "flex";
        qrBackground.style.alignItems = "center";
        qrBackground.style.justifyContent = "center";
        qrBackground.style.zIndex = "9998";
        qrBackground.style.boxShadow = "0 10px 24px rgba(0, 0, 0, 0.28)";

        const qrImage = document.createElement("img");
        qrImage.src = qrImageUrl;
        qrImage.alt = "QR code pour rejoindre la manette";
        qrImage.style.width = "82px";
        qrImage.style.height = "82px";
        qrImage.style.display = "block";
        qrBackground.appendChild(qrImage);

        const label = document.createElement("div");
        label.style.position = "fixed";
        label.style.width = `${Math.max(220, textWidth)}px`;
        label.style.padding = "8px 12px";
        label.style.borderRadius = "12px";
        label.style.background = "rgba(7, 17, 27, 0.92)";
        label.style.color = "#d8edf8";
        label.style.fontFamily = "Arial, sans-serif";
        label.style.fontSize = "14px";
        label.style.lineHeight = "1.3";
        label.style.textAlign = "left";
        label.style.zIndex = "9998";
        label.style.boxShadow = "0 10px 24px rgba(0, 0, 0, 0.22)";

        label.innerHTML = [
            "<div style=\"font-size:17px;font-weight:bold;color:#fff3b0;margin-bottom:4px;\">Connexion rapide</div>",
            "<div>Scanne ce QR avec ton telephone pour ouvrir la manette.</div>",
            `<div style="margin-top:6px;color:#ffffff;word-break:break-all;">${controllerUrl}</div>`
        ].join("");

        document.body.appendChild(qrBackground);
        document.body.appendChild(label);

        this.qrCodeElement = qrBackground;
        this.qrCodeLabelElement = label;
        this.positionQrCodeBlock(qrLeft, qrTop, qrSize);
    }

    positionQrCodeBlock(qrLeft, qrTop, qrSize) {
        if (!this.qrCodeElement || !this.qrCodeLabelElement || !this.scale?.canvas) {
            return;
        }

        const bounds = this.scale.canvas.getBoundingClientRect();
        const left = bounds.left + qrLeft;
        const top = bounds.top + qrTop;

        this.qrCodeElement.style.left = `${Math.round(left)}px`;
        this.qrCodeElement.style.top = `${Math.round(top)}px`;

        this.qrCodeLabelElement.style.left = `${Math.round(left + qrSize + 18)}px`;
        this.qrCodeLabelElement.style.top = `${Math.round(top + 4)}px`;
    }

    getControllerUrl() {
        if (this.matchState?.controllerUrl) {
            return this.matchState.controllerUrl;
        }

        const controllerPath = "/controller/";
        const url = new URL(controllerPath, window.location.href);
        return url.toString();
    }

    removeQrCodeBlock() {
        if (this.qrCodeElement) {
            this.qrCodeElement.remove();
            this.qrCodeElement = null;
        }

        if (this.qrCodeLabelElement) {
            this.qrCodeLabelElement.remove();
            this.qrCodeLabelElement = null;
        }
    }

    handleSceneResize() {
        if (this.currentScreen === "waiting") {
            this.renderWaitingScreen();
        }
    }

    clearScreen() {
        this.children.removeAll();
        this.playerListContainer.forEach((obj) => obj.destroy());
        this.playerListContainer = [];
        this.startButton = null;
        this.startButtonText = null;
        this.connectionInfoText = null;
        this.listLayout = null;
        this.scrollbarTrack = null;
        this.scrollbarThumb = null;
        this.stopPlayerListAutoScroll();
        this.removeQrCodeBlock();
    }

    handleSceneShutdown() {
        this.scale.off("resize", this.handleSceneResize, this);
        this.input.off("wheel", this.handleSceneWheel, this);
        this.input.off("drag", this.handleScrollbarDrag, this);
        this.removeQrCodeBlock();
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
