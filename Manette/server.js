const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ROOT_DIR = path.resolve(__dirname, "..");
const CONTROLLER_DIR = __dirname;
const PORT = 3000;

const TILE_SIZE = 64;
const MAP_COLS = 32;
const MAP_ROWS = 18;
const MOVE_DURATION = 120;

const COLORS = [
  "#ff595e",
  "#1982c4",
  "#8ac926",
  "#ffca3a",
  "#6a4c93",
  "#ff924c"
];

const MAP = createMap(MAP_COLS, MAP_ROWS);
const SPAWNS = generateSpawns(MAP_COLS, MAP_ROWS);

const gameState = {
  tileSize: TILE_SIZE,
  map: MAP,
  players: {}
};

app.use(express.static(ROOT_DIR));
app.use("/controller", express.static(CONTROLLER_DIR));

app.get("/controller", (_req, res) => {
  res.redirect("/controller/");
});

function createMap(width, height) {
  const map = [];

  for (let y = 0; y < height; y += 1) {
    map[y] = [];

    for (let x = 0; x < width; x += 1) {
      map[y][x] = 0;
    }
  }

  generateSpawns(width, height).forEach((spawn) => {
    map[spawn.gridY][spawn.gridX] = 4;
  });

  return map;
}

function generateSpawns(width, height) {
  const spawnCols = 8;
  const spawnRows = 3;
  const stepX = width / spawnCols;
  const stepY = height / spawnRows;
  const spawns = [];

  for (let row = 0; row < spawnRows; row += 1) {
    for (let col = 0; col < spawnCols; col += 1) {
      spawns.push({
        gridX: col * stepX + Math.floor(stepX / 2),
        gridY: row * stepY + Math.floor(stepY / 2)
      });
    }
  }

  return spawns;
}

function emitGameState() {
  io.emit("gameState", gameState);
}

function getUsedSpawnCount() {
  return Object.keys(gameState.players).length;
}

function createPlayer(socketId) {
  const index = getUsedSpawnCount();

  if (index >= SPAWNS.length) {
    return null;
  }

  const spawn = SPAWNS[index];

  return {
    id: socketId,
    color: COLORS[index % COLORS.length],
    gridX: spawn.gridX,
    gridY: spawn.gridY,
    moveDuration: MOVE_DURATION
  };
}

function wrapGridX(gridX) {
  if (gridX < 0) {
    return MAP_COLS - 1;
  }

  if (gridX >= MAP_COLS) {
    return 0;
  }

  return gridX;
}

function wrapGridY(gridY) {
  if (gridY < 0) {
    return MAP_ROWS - 1;
  }

  if (gridY >= MAP_ROWS) {
    return 0;
  }

  return gridY;
}

function isBlocked(gridX, gridY) {
  return MAP[gridY][gridX] === 1;
}

function tryMovePlayer(player, direction) {
  const offsets = {
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 },
    up: { dx: 0, dy: -1 },
    down: { dx: 0, dy: 1 }
  };

  const offset = offsets[direction];

  if (!offset) {
    return false;
  }

  const nextGridX = wrapGridX(player.gridX + offset.dx);
  const nextGridY = wrapGridY(player.gridY + offset.dy);

  if (isBlocked(nextGridX, nextGridY)) {
    return false;
  }

  player.gridX = nextGridX;
  player.gridY = nextGridY;

  return true;
}

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  socket.emit("gameState", gameState);

  socket.on("joinAsController", () => {
    if (gameState.players[socket.id]) {
      socket.emit("joined", {
        playerId: socket.id,
        color: gameState.players[socket.id].color
      });
      return;
    }

    const player = createPlayer(socket.id);

    if (!player) {
      socket.emit("gameFull");
      return;
    }

    gameState.players[socket.id] = player;
    socket.emit("joined", { playerId: socket.id, color: player.color });
    console.log("Player joined:", socket.id);
    emitGameState();
  });

  socket.on("move", ({ direction } = {}) => {
    const player = gameState.players[socket.id];

    if (!player) {
      return;
    }

    if (tryMovePlayer(player, direction)) {
      emitGameState();
    }
  });

  socket.on("stopMove", () => {
    // Kept for controller compatibility. Tile movement is handled on move.
  });

  socket.on("shoot", () => {
    const player = gameState.players[socket.id];

    if (!player) {
      return;
    }

    console.log("Shoot:", socket.id);
  });

  socket.on("disconnect", () => {
    if (gameState.players[socket.id]) {
      delete gameState.players[socket.id];
      console.log("Player removed:", socket.id);
      emitGameState();
      return;
    }

    console.log("Client disconnected:", socket.id);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Game screen: http://localhost:${PORT}/`);
  console.log(`Controller: http://localhost:${PORT}/controller/`);
});
