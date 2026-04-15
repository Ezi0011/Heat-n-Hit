console.log("controller loaded");

const playerInfo = document.getElementById("playerInfo");
const buttons = document.querySelectorAll(".dir");
const bomb = document.getElementById("shootBtn");
const nameDialog = document.getElementById("nameDialog");
const playerNameInput = document.getElementById("playerName");
const nameBtn = document.getElementById("nameBtn");
const gameControls = document.getElementById("gameControls");

const socket = io();

let playerName = "";
let playerId = null;
let matchState = null;

function setControlsEnabled(enabled) {
  buttons.forEach((button) => {
    button.disabled = !enabled;
  });

  bomb.disabled = !enabled;
}

function setPlayerInfo(message) {
  playerInfo.textContent = message;
}

function formatPlayerMessage(name, status) {
  return `${name || "Joueur"} | ${status}`;
}

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hexToRgb(color) {
  if (typeof color !== "string") {
    return null;
  }

  const normalized = color.replace("#", "");
  if (normalized.length !== 6) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 16);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((channel) => clampChannel(channel).toString(16).padStart(2, "0")).join("")}`;
}

function mixColors(baseColor, targetColor, ratio) {
  const base = hexToRgb(baseColor);
  const target = hexToRgb(targetColor);

  if (!base || !target) {
    return baseColor;
  }

  return rgbToHex({
    r: base.r + ((target.r - base.r) * ratio),
    g: base.g + ((target.g - base.g) * ratio),
    b: base.b + ((target.b - base.b) * ratio)
  });
}

function applyPlayerTheme(color) {
  const rgb = hexToRgb(color);
  if (!rgb) {
    return;
  }

  const normalized = color.replace("#", "").toLowerCase();
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--player-accent", color);
  rootStyle.setProperty("--player-accent-strong", mixColors(color, "#ffffff", 0.14));
  rootStyle.setProperty("--player-accent-soft", `${color}33`);
  rootStyle.setProperty("--player-panel", `${mixColors(color, "#ffffff", 0.18)}22`);
  rootStyle.setProperty(
    "--player-control-outline",
    normalized === "ffffff" ? "rgba(0, 0, 0, 0.95)" : "rgba(255, 255, 255, 0.95)"
  );
  rootStyle.setProperty(
    "--player-control-text",
    normalized === "ffffff" ? "#000000" : "#ffffff"
  );
}

function getSelfState() {
  if (!matchState || !playerId) {
    return null;
  }

  return matchState.registeredPlayers?.[playerId] || null;
}

function renderControllerState() {
  const self = getSelfState();
  const activePlayers = matchState?.activePlayers || [];
  const isActive = activePlayers.includes(playerId);
  const roundLabel = matchState?.currentRound?.label || "Tournoi";

  if (!playerId) {
    setControlsEnabled(false);
    return;
  }

  if (!matchState || !self) {
    setPlayerInfo(formatPlayerMessage(playerName, "🔄 En attente de synchronisation..."));
    setControlsEnabled(false);
    return;
  }

  if (self.color) {
    applyPlayerTheme(self.color);
  }

  let message = formatPlayerMessage(self.name, "⏳ En attente...");
  let enabled = false;

  if (matchState.state === "completed") {
    if (matchState.winner?.id === playerId) {
      message = formatPlayerMessage(self.name, "🏆 Vainqueur du tournoi !");
    } else {
      message = formatPlayerMessage(self.name, "🎮 Tournoi terminé !");
    }
  } else if (matchState.state === "transition") {
    if (self.status === "qualified") {
      message = formatPlayerMessage(self.name, "🎯 Qualifié pour la finale !");
    } else if (self.status === "eliminated") {
      message = formatPlayerMessage(self.name, "❌ Éliminé...");
    } else {
      message = formatPlayerMessage(self.name, `🔜 ${matchState.message || "Prochaine manche !"}`);
    }
  } else {
    switch (self.status) {
      case "waiting":
        message = formatPlayerMessage(self.name, "🧑‍💻 Inscrit dans le lobby");
        break;
      case "queued":
        message = formatPlayerMessage(self.name, `⏳ En attente du quart ${self.quarterIndex || "?"}`);
        break;
      case "playing":
        message = formatPlayerMessage(
          self.name,
          matchState.phase === "final" ? "🔥 Finale en cours !" : `⚔️ ${roundLabel} en cours !`
        );
        enabled = isActive && matchState.state === "playing";
        break;
      case "qualified":
        if (matchState.phase === "final" && isActive) {
          message = formatPlayerMessage(self.name, "🔥 Finale en cours !");
          enabled = matchState.state === "playing";
        } else {
          message = formatPlayerMessage(self.name, "🎯 Qualifié pour la finale !");
        }
        break;
      case "winner":
        message = formatPlayerMessage(self.name, "🏆 Vainqueur du tournoi !");
        break;
      case "eliminated":
      default:
        message = formatPlayerMessage(self.name, "❌ Éliminé...");
        break;
    }
  }

  setPlayerInfo(message);
  setControlsEnabled(enabled);
}

nameBtn.addEventListener("click", () => {
  playerName = playerNameInput.value.trim() || "Joueur";
  if (!playerName) {
    return;
  }

  nameDialog.style.display = "none";
  gameControls.style.display = "flex";
  setPlayerInfo(formatPlayerMessage(playerName, "🔄 Connexion au tournoi..."));
  setControlsEnabled(false);
  socket.emit("joinAsController", { name: playerName });
});

playerNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    nameBtn.click();
  }
});

playerNameInput.focus();
setControlsEnabled(false);

socket.on("connect", () => {
  setPlayerInfo("🔌 Connecté au serveur...");
});

socket.on("joined", (data) => {
  playerId = data.playerId;
  if (data.name) {
    playerName = data.name;
  }
  if (data.color) {
    applyPlayerTheme(data.color);
  }

  setPlayerInfo(formatPlayerMessage(playerName, "🧑‍💻 Inscrit dans le lobby"));
  renderControllerState();
});

socket.on("matchState", (state) => {
  matchState = state;
  renderControllerState();
});

socket.on("matchError", (message) => {
  setPlayerInfo(`⚠️ ${message}`);
  setControlsEnabled(false);
  nameDialog.style.display = "flex";
  gameControls.style.display = "none";
  playerNameInput.focus();
});

socket.on("gameFull", () => {
  setPlayerInfo("🚫 Tournoi plein - impossible de rejoindre");
  nameDialog.style.display = "flex";
  gameControls.style.display = "none";
  playerNameInput.value = "";
  playerNameInput.focus();
  setControlsEnabled(false);
});

socket.on("roundQualified", (data) => {
  setPlayerInfo(formatPlayerMessage(playerName, `🎯 Qualifié après ${data.roundLabel} !`));
  setControlsEnabled(false);
});

socket.on("gameOver", (data) => {
  setPlayerInfo(formatPlayerMessage(playerName, `❌ Éliminé par ${data.killerName}...`));
  setControlsEnabled(false);
});

socket.on("gameWon", (data) => {
  setPlayerInfo(formatPlayerMessage(playerName, `🏆 Victoire ! ${data.winnerName}`));
  setControlsEnabled(false);
});

socket.on("disconnect", () => {
  setPlayerInfo("📴 Déconnecté");
  setControlsEnabled(false);
});

buttons.forEach((button) => {
  const direction = button.dataset.direction;

  button.addEventListener("touchstart", (event) => {
    event.preventDefault();
    socket.emit("move", { direction });
  });

  button.addEventListener("touchend", (event) => {
    event.preventDefault();
    socket.emit("stopMove");
  });

  button.addEventListener("touchcancel", (event) => {
    event.preventDefault();
    socket.emit("stopMove");
  });

  button.addEventListener("mousedown", () => {
    socket.emit("move", { direction });
  });

  button.addEventListener("mouseup", () => {
    socket.emit("stopMove");
  });

  button.addEventListener("mouseleave", () => {
    socket.emit("stopMove");
  });
});

bomb.addEventListener("touchstart", (event) => {
  event.preventDefault();
  socket.emit("shoot");
});

bomb.addEventListener("mousedown", () => {
  socket.emit("shoot");
});
