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
    setPlayerInfo(`${playerName || "Joueur"} | en attente de synchronisation`);
    setControlsEnabled(false);
    return;
  }

  let message = `${self.name} | en attente`;
  let enabled = false;

  if (matchState.state === "completed") {
    if (matchState.winner?.id === playerId) {
      message = `${self.name} | vainqueur du tournoi`;
    } else {
      message = `${self.name} | tournoi termine`;
    }
  } else if (matchState.state === "transition") {
    if (self.status === "qualified") {
      message = `${self.name} | qualifie pour la finale`;
    } else if (self.status === "eliminated") {
      message = `${self.name} | elimine`;
    } else {
      message = `${self.name} | ${matchState.message || "prochaine manche"}`;
    }
  } else {
    switch (self.status) {
      case "waiting":
        message = `${self.name} | inscrit dans le lobby`;
        break;
      case "queued":
        message = `${self.name} | en attente du quart ${self.quarterIndex || "?"}`;
        break;
      case "playing":
        message = `${self.name} | ${roundLabel} en cours`;
        enabled = isActive && matchState.state === "playing";
        break;
      case "qualified":
        if (matchState.phase === "final" && isActive) {
          message = `${self.name} | finale en cours`;
          enabled = matchState.state === "playing";
        } else {
          message = `${self.name} | qualifie pour la finale`;
        }
        break;
      case "winner":
        message = `${self.name} | vainqueur du tournoi`;
        break;
      case "eliminated":
      default:
        message = `${self.name} | elimine`;
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
  setPlayerInfo(`${playerName} | connexion au tournoi...`);
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
  setPlayerInfo("Connecte au serveur...");
});

socket.on("joined", (data) => {
  playerId = data.playerId;
  if (data.name) {
    playerName = data.name;
  }

  setPlayerInfo(`${playerName} | inscrit`);
  renderControllerState();
});

socket.on("matchState", (state) => {
  matchState = state;
  renderControllerState();
});

socket.on("matchError", (message) => {
  setPlayerInfo(message);
  setControlsEnabled(false);
  nameDialog.style.display = "flex";
  gameControls.style.display = "none";
  playerNameInput.focus();
});

socket.on("gameFull", () => {
  setPlayerInfo("Tournoi plein - impossible de rejoindre");
  nameDialog.style.display = "flex";
  gameControls.style.display = "none";
  playerNameInput.value = "";
  playerNameInput.focus();
  setControlsEnabled(false);
});

socket.on("roundQualified", (data) => {
  setPlayerInfo(`${playerName} | qualifie apres ${data.roundLabel}`);
  setControlsEnabled(false);
});

socket.on("gameOver", (data) => {
  setPlayerInfo(`${playerName} | elimine par ${data.killerName}`);
  setControlsEnabled(false);
});

socket.on("gameWon", (data) => {
  setPlayerInfo(`${playerName} | victoire - ${data.winnerName}`);
  setControlsEnabled(false);
});

socket.on("disconnect", () => {
  setPlayerInfo("Deconnecte");
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
