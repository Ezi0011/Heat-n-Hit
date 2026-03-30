const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const TILE_SIZE = 64;
const MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,0,1,0,1,0,1,0,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,0,1,0,1,0,1,0,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1]
];

const SPAWNS = [
  { x: 1 * TILE_SIZE + 12, y: 1 * TILE_SIZE + 12 },
  { x: 11 * TILE_SIZE + 12, y: 1 * TILE_SIZE + 12 },
  { x: 1 * TILE_SIZE + 12, y: 5 * TILE_SIZE + 12 },
  { x: 11 * TILE_SIZE + 12, y: 5 * TILE_SIZE + 12 }
];

const COLORS = ["red", "blue", "green", "orange"];

const gameState = {
  map: MAP,
  players: {}
};

function getUsedSpawnCount() {
  return Object.keys(gameState.players).length;
}

function createPlayer(socketId) {
  const index = getUsedSpawnCount();

  if (index >= SPAWNS.length) {
    return null;
  }

  return {
    id: socketId,
    x: SPAWNS[index].x,
    y: SPAWNS[index].y,
    width: 40,
    height: 40,
    speed: 4,
    color: COLORS[index],
    moving: {
      up: false,
      down: false,
      left: false,
      right: false
    }
  };
}

function isWallAt(x, y, width, height) {
  const leftCol = Math.floor(x / TILE_SIZE);
  const rightCol = Math.floor((x + width - 1) / TILE_SIZE);
  const topRow = Math.floor(y / TILE_SIZE);
  const bottomRow = Math.floor((y + height - 1) / TILE_SIZE);

  for (let row = topRow; row <= bottomRow; row++) {
    for (let col = leftCol; col <= rightCol; col++) {
      if (!MAP[row] || MAP[row][col] === undefined) return true;
      if (MAP[row][col] === 1) return true;
    }
  }

  return false;
}

function movePlayer(player) {
  let nextX = player.x;
  let nextY = player.y;

  if (player.moving.up) nextY -= player.speed;
  if (player.moving.down) nextY += player.speed;
  if (player.moving.left) nextX -= player.speed;
  if (player.moving.right) nextX += player.speed;

  if (!isWallAt(nextX, player.y, player.width, player.height)) {
    player.x = nextX;
  }

  if (!isWallAt(player.x, nextY, player.width, player.height)) {
    player.y = nextY;
  }
}

io.on("connection", (socket) => {
  console.log("Client connecté :", socket.id);

  socket.on("joinAsController", () => {
    if (gameState.players[socket.id]) return;

    const player = createPlayer(socket.id);

    if (!player) {
      socket.emit("gameFull");
      return;
    }

    gameState.players[socket.id] = player;
    socket.emit("joined", { playerId: socket.id, color: player.color });
    console.log("Joueur ajouté :", socket.id);
  });

  socket.on("move", ({ direction }) => {
    const player = gameState.players[socket.id];
    if (!player) return;
    if (player.moving[direction] !== undefined) {
      player.moving[direction] = true;
    }
  });

  socket.on("stopMove", ({ direction }) => {
    const player = gameState.players[socket.id];
    if (!player) return;
    if (player.moving[direction] !== undefined) {
      player.moving[direction] = false;
    }
  });

  socket.on("shoot", () => {
    const player = gameState.players[socket.id];
    if (!player) return;
    console.log("shoot :", socket.id);
  });

  socket.on("disconnect", () => {
    if (gameState.players[socket.id]) {
      delete gameState.players[socket.id];
      console.log("Joueur supprimé :", socket.id);
    } else {
      console.log("Client déconnecté :", socket.id);
    }
  });
});

setInterval(() => {
  Object.values(gameState.players).forEach(movePlayer);
  io.emit("gameState", gameState);
}, 1000 / 30);

server.listen(3000, "0.0.0.0", () => {
  console.log("Serveur lancé sur http://localhost:3000");
});