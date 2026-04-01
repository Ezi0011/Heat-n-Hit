const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ROOT_DIR = path.resolve(__dirname, "..");
const CONTROLLER_DIR = __dirname;
const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3000;
let PORT = DEFAULT_PORT;

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

app.use(express.static(ROOT_DIR));
app.use("/controller", express.static(CONTROLLER_DIR));

app.get("/controller", (_req, res) => {
  res.redirect("/controller/");
});

async function startServer() {
  const { MapGenerator } = await import("../shared/MapGenerator.mjs");
  const MAP = MapGenerator.createMap(MAP_COLS, MAP_ROWS);
  const SPAWNS = MapGenerator.generateSpawns(MAP_COLS, MAP_ROWS);

  const gameState = {
    tileSize: TILE_SIZE,
    map: MAP,
    players: {},
    projectiles: []
  };

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
      moveDuration: MOVE_DURATION,
      direction: "right"
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

  function shootProjectile(player) {
    const offsets = {
      left: { dx: -1, dy: 0 },
      right: { dx: 1, dy: 0 },
      up: { dx: 0, dy: -1 },
      down: { dx: 0, dy: 1 }
    };

    const offset = offsets[player.direction];
    if (!offset) {
      return;
    }

    const projectile = {
      id: Date.now() + Math.random(),
      ownerId: player.id,
      gridX: player.gridX,
      gridY: player.gridY,
      direction: player.direction,
      distance: 0,
      maxDistance: 6,
      color: player.color
    };

    gameState.projectiles.push(projectile);
  }

  function handlePlayerHit(victimId, killerId) {
    const victim = gameState.players[victimId];
    const killer = gameState.players[killerId];

    if (!victim || !killer) {
      return;
    }

    const victimSocket = io.sockets.sockets.get(victimId);
    if (victimSocket) {
      victimSocket.emit("gameOver", {
        reason: "hit",
        killerColor: killer.color
      });
    }

    io.emit("playerHit", {
      victimId,
      killerId,
      victimColor: victim.color,
      killerColor: killer.color
    });

    delete gameState.players[victimId];
    console.log(`Player ${victimId} was hit by ${killerId}`);
  }

  function updateProjectiles() {
    const offsets = {
      left: { dx: -1, dy: 0 },
      right: { dx: 1, dy: 0 },
      up: { dx: 0, dy: -1 },
      down: { dx: 0, dy: 1 }
    };

    gameState.projectiles = gameState.projectiles.filter((projectile) => {
      if (projectile.distance >= projectile.maxDistance) {
        return false;
      }

      const offset = offsets[projectile.direction];
      const nextGridX = wrapGridX(projectile.gridX + offset.dx);
      const nextGridY = wrapGridY(projectile.gridY + offset.dy);

      for (const [playerId, player] of Object.entries(gameState.players)) {
        if (playerId !== projectile.ownerId && player.gridX === nextGridX && player.gridY === nextGridY) {
          handlePlayerHit(playerId, projectile.ownerId);
          return false;
        }
      }

      if (isBlocked(nextGridX, nextGridY)) {
        return false;
      }

      projectile.gridX = nextGridX;
      projectile.gridY = nextGridY;
      projectile.distance += 1;
      return true;
    });
  }

  function updateGame() {
    updateProjectiles();
    emitGameState();
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

      player.direction = direction;

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

      shootProjectile(player);
      emitGameState();
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

  function listen() {
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Game screen: http://localhost:${PORT}/`);
      console.log(`Controller: http://localhost:${PORT}/controller/`);

      setInterval(updateGame, 100);
    });
  }

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`Port ${PORT} already in use, trying next port...`);
      PORT += 1;
      if (PORT > DEFAULT_PORT + 10) {
        console.error("No available ports found in range", DEFAULT_PORT, DEFAULT_PORT + 10);
        process.exit(1);
      }
      listen();
      return;
    }

    throw err;
  });

  listen();
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
