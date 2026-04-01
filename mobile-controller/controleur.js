console.log("controleur chargé");

const status = document.getElementById("status");
const buttons = document.querySelectorAll(".dir");
const bomb = document.getElementById("shootBtn");

const socket = io();

socket.on("connect", () => {
  console.log("connecté au serveur");
  status.textContent = "Connecté au serveur";
  socket.emit("joinAsController");
});

socket.on("joined", (data) => {
  console.log("joueur assigné :", data);
  status.textContent = "Joueur : " + data.color;
});

socket.on("gameFull", () => {
  status.textContent = "Partie pleine";
});

socket.on("gameOver", (data) => {
  console.log("Game over:", data);
  status.textContent = `💀 GAME OVER - tué par ${data.killerColor}`;
  buttons.forEach(btn => btn.disabled = true);
  bomb.disabled = true;
});

socket.on("disconnect", () => {
  console.log("déconnecté");
  status.textContent = "Déconnecté";
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