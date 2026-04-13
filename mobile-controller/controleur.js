console.log("controleur chargé");

const playerInfo = document.getElementById("playerInfo");
const buttons = document.querySelectorAll(".dir");
const bomb = document.getElementById("shootBtn");
const nameDialog = document.getElementById("nameDialog");
const playerNameInput = document.getElementById("playerName");
const nameBtn = document.getElementById("nameBtn");
const gameControls = document.getElementById("gameControls");

const socket = io();
let playerName = "";

// Événements pour l'écran de nom
nameBtn.addEventListener("click", () => {
  playerName = playerNameInput.value.trim() || "Joueur";
  if (playerName.length > 0) {
    nameDialog.style.display = "none";
    gameControls.style.display = "flex";
    socket.emit("joinAsController", { name: playerName });
  }
});

playerNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    nameBtn.click();
  }
});

// Focus sur l'input au chargement
playerNameInput.focus();

socket.on("connect", () => {
  console.log("connecté au serveur");
  playerInfo.textContent = "Connecté au serveur...";
});

socket.on("joined", (data) => {
  console.log("joueur assigné :", data);
  playerInfo.textContent = `${playerName} | ${data.color} | ID: ${data.playerId}`;
});

socket.on("gameFull", () => {
  playerInfo.textContent = "Partie pleine - Impossible de rejoindre";
  nameDialog.style.display = "flex";
  gameControls.style.display = "none";
  playerNameInput.value = "";
  playerNameInput.focus();
});

socket.on("gameOver", (data) => {
  console.log("Game over:", data);
  playerInfo.textContent = `💀 GAME OVER - tué par ${data.killerName}`;
  buttons.forEach(btn => btn.disabled = true);
  bomb.disabled = true;
});

socket.on("disconnect", () => {
  console.log("déconnecté");
  playerInfo.textContent = "Déconnecté";
});

buttons.forEach((btn) => {
  const dir = btn.dataset.direction;

  btn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    socket.emit("move", { direction: dir });
  });

  btn.addEventListener("touchend", (e) => {
    e.preventDefault();
    socket.emit("stopMove", { direction: dir });
  });

  btn.addEventListener("touchcancel", (e) => {
    e.preventDefault();
    socket.emit("stopMove", { direction: dir });
  });

  btn.addEventListener("mousedown", () => {
    socket.emit("move", { direction: dir });
  });

  btn.addEventListener("mouseup", () => {
    socket.emit("stopMove", { direction: dir });
  });

  btn.addEventListener("mouseleave", () => {
    socket.emit("stopMove", { direction: dir });
  });
});

bomb.addEventListener("touchstart", (e) => {
  e.preventDefault();
  socket.emit("shoot");
});

bomb.addEventListener("mousedown", () => {
  socket.emit("shoot");
});