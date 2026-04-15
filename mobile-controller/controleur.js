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
