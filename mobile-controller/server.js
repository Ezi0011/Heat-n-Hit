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
  const SOLID_WALL = MapGenerator.MUR_SOLIDE;
  const DESTRUCTIBLE_WALL = MapGenerator.MUR_DESTRUCTIBLE;
  const MAP = MapGenerator.createMap(MAP_COLS, MAP_ROWS);
  const SPAWNS = MapGenerator.generateSpawns(MAP_COLS, MAP_ROWS);

  const gameState = {
    tileSize: TILE_SIZE,
    map: MAP,
    players: {},
    projectiles: []
  };

  const matchState = {
    state: "lobby",
    connectedPlayers: {},
    activePlayers: {}
  };

  function emitGameState() {
    io.emit("gameState", gameState);
  }

  function emitMatchState() {
    io.emit("matchState", {
      state: matchState.state,
      connectedPlayers: matchState.connectedPlayers,
      activePlayers: Object.keys(matchState.activePlayers)
    });
  }

  function checkForWinner() {
    if (matchState.state !== "playing") {
      return;
    }

    const aliveIds = Object.keys(gameState.players);
    if (aliveIds.length === 1) {
      const winnerId = aliveIds[0];
      const winnerPlayer = gameState.players[winnerId];
      const winnerSocket = io.sockets.sockets.get(winnerId);

      matchState.state = "finished";
      emitMatchState();

      if (winnerSocket) {
        winnerSocket.emit("gameWon", {
          winnerName: winnerPlayer.name
        });
      }

      io.emit("playerWon", {
        winnerId,
        winnerName: winnerPlayer.name
      });
      return;
    }

    if (aliveIds.length === 0) {
      matchState.state = "finished";
      emitMatchState();
    }
  }

  function getUsedSpawnCount() {
    return Object.keys(gameState.players).length;
  }

  function createPlayer(socketId, name) {
    const index = getUsedSpawnCount();

    if (index >= SPAWNS.length) {
      return null;
    }

    const spawn = SPAWNS[index];

    return {
      id: socketId,
      name: name || "Joueur",
      color: COLORS[index % COLORS.length],
      gridX: spawn.gridX,
      gridY: spawn.gridY,
      moveDuration: MOVE_DURATION,
      direction: "right",
      movingDirection: null,
      moveTimer: 0,
      shootCooldown: 0
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

  function getTile(gridX, gridY) {
    return gameState.map[gridY]?.[gridX];
  }

  function isBlocked(gridX, gridY) {
    const tile = getTile(gridX, gridY);
    return tile === SOLID_WALL || tile === DESTRUCTIBLE_WALL;
  }

  function destroyWall(gridX, gridY) {
    if (getTile(gridX, gridY) !== DESTRUCTIBLE_WALL) {
      return false;
    }

    gameState.map[gridY][gridX] = 0;
    return true;
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
      age: 0,
      maxTime: 50,
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
        killerColor: killer.color,
        killerName: killer.name
      });
    }

    io.emit("playerHit", {
      victimId,
      killerId,
      victimColor: victim.color,
      killerColor: killer.color,
      victimName: victim.name,
      killerName: killer.name
    });

    delete gameState.players[victimId];
    delete matchState.activePlayers[victimId];
    console.log(`Player ${victimId} was hit by ${killerId}`);
    emitGameState();
    checkForWinner();
  }

  function updateProjectiles() {
    const offsets = {
      left: { dx: -1, dy: 0 },
      right: { dx: 1, dy: 0 },
      up: { dx: 0, dy: -1 },
      down: { dx: 0, dy: 1 }
    };

    gameState.projectiles = gameState.projectiles.filter((projectile) => {
      projectile.age++;

      // Vérifie la durée de vie (20 secondes = 200 ticks de 100ms)
      if (projectile.age >= projectile.maxTime) {
        return false;
      }

      const offset = offsets[projectile.direction];
      const nextGridX = wrapGridX(projectile.gridX + offset.dx);
      const nextGridY = wrapGridY(projectile.gridY + offset.dy);

      for (const [playerId, player] of Object.entries(gameState.players)) {
        if (player.gridX === nextGridX && player.gridY === nextGridY) {
          handlePlayerHit(playerId, projectile.ownerId);
          return false;
        }
      }

      const nextTile = getTile(nextGridX, nextGridY);
      if (nextTile === DESTRUCTIBLE_WALL) {
        destroyWall(nextGridX, nextGridY);
        return false;
      }

      if (nextTile === SOLID_WALL) {
        return false;
      }

      // Collision avec les obstacles (valeur 1 sur la map)
      if (false && isBlocked(nextGridX, nextGridY)) {
        if (MAP[nextGridY][nextGridX] === 2) {
          MAP[nextGridY][nextGridX] = 0; // Détruire l'obstacle destructible
          io.emit("mapUpdated", {
            gridX: nextGridX,
            gridY: nextGridY,
            value: 0
          });
        }

        return false;
      }

      projectile.gridX = nextGridX;
      projectile.gridY = nextGridY;
      return true;
    });
  }

  function updateGame() {
    updateProjectiles();

    for (const player of Object.values(gameState.players)) {
      player.shootCooldown = Math.max(0, player.shootCooldown - 1);

      if (player.movingDirection && player.shootCooldown === 0) {
        player.moveTimer--;
        if (player.moveTimer <= 0) {
          if (tryMovePlayer(player, player.movingDirection)) {
            player.moveTimer = 2; // move every 200ms (2 ticks at 100ms each)
          }
        }
      }
    }

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
    socket.emit("matchState", {
      state: matchState.state,
      connectedPlayers: matchState.connectedPlayers,
      activePlayers: Object.keys(matchState.activePlayers)
    });

    socket.on("joinAsController", ({ name } = {}) => {
      if (matchState.state === "playing") {
        socket.emit("matchError", "La partie a déjà commencé");
        return;
      }

      if (matchState.connectedPlayers[socket.id]) {
        socket.emit("joined", {
          playerId: socket.id,
          name: matchState.connectedPlayers[socket.id].name
        });
        return;
      }

      matchState.connectedPlayers[socket.id] = {
        id: socket.id,
        name: name || "Joueur"
      };

      if (matchState.state === "lobby") {
        matchState.state = "waiting";
      }

      socket.emit("joined", {
        playerId: socket.id,
        name: matchState.connectedPlayers[socket.id].name
      });

      console.log("Player joined lobby:", socket.id, "Name:", name);
      emitMatchState();
    });

    socket.on("startMatch", () => {
      if (matchState.state !== "waiting") {
        return;
      }

      const connectedIds = Object.keys(matchState.connectedPlayers);
      if (connectedIds.length === 0) {
        return;
      }

      matchState.state = "playing";
      gameState.players = {};
      matchState.activePlayers = {};

      let spawnIndex = 0;
      for (const socketId of connectedIds) {
        if (spawnIndex >= SPAWNS.length) {
          break;
        }

        const connectedPlayer = matchState.connectedPlayers[socketId];
        const spawn = SPAWNS[spawnIndex];
        const playerData = {
          id: socketId,
          name: connectedPlayer.name,
          color: COLORS[spawnIndex % COLORS.length],
          gridX: spawn.gridX,
          gridY: spawn.gridY,
          moveDuration: MOVE_DURATION,
          direction: "right",
          movingDirection: null,
          moveTimer: 0,
          shootCooldown: 0,
          alive: true
        };

        gameState.players[socketId] = playerData;
        matchState.activePlayers[socketId] = true;
        spawnIndex += 1;
      }

      matchState.connectedPlayers = {};
      emitMatchState();
      emitGameState();
      checkForWinner();
    });

    socket.on("move", ({ direction } = {}) => {
      const player = gameState.players[socket.id];

      if (!player) {
        return;
      }

      player.direction = direction;
      player.movingDirection = direction;
    });

    socket.on("stopMove", () => {
      const player = gameState.players[socket.id];

      if (!player) {
        return;
      }

      player.movingDirection = null;
    });

    socket.on("shoot", () => {
      const player = gameState.players[socket.id];

      if (!player || player.shootCooldown > 0) {
        return;
      }

      shootProjectile(player);
      player.shootCooldown = 3; 
      emitGameState();
    });

    socket.on("disconnect", () => {
      if (matchState.connectedPlayers[socket.id]) {
        delete matchState.connectedPlayers[socket.id];
        console.log("Player removed from lobby:", socket.id);
        emitMatchState();
        return;
      }

      if (gameState.players[socket.id]) {
        delete gameState.players[socket.id];
        delete matchState.activePlayers[socket.id];
        console.log("Player removed from game:", socket.id);
        emitGameState();
        checkForWinner();
        emitMatchState();
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
