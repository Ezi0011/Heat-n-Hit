const path = require("path");
const os = require("os");
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
const QUARTER_COUNT = 4;
const MOVE_DURATION = 120;
const GAME_TICK_MS = 100;
const MOVE_TICKS = 2;
const SHOOT_COOLDOWN_TICKS = 3;
const PROJECTILE_MAX_TICKS = 50;
const ROUND_TRANSITION_MS = 2800;
const ROUND_COUNTDOWN_SECONDS = 10;

const COLORS = [
  "#000000",
  "#575757",
  "#ad2323",
  "#2a4bd7",
  "#1c6914",
  "#814a19",
  "#631e93",
  "#a0a0a0",
  "#81c57a",
  "#9dafff",
  "#29d0d0",
  "#ff9233",
  "#ffee33",
  "#e9debb",
  "#ffcdf3",
  "#ffffff"
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
  const SPAWNS = MapGenerator.generateSpawns(MAP_COLS, MAP_ROWS);
  const MAX_PLAYERS = SPAWNS.length * QUARTER_COUNT;

  const createFreshMap = (roundType = "quarterfinal") => {
    if (roundType === "final") {
      return MapGenerator.createFinalMap(MAP_COLS, MAP_ROWS);
    }

    return MapGenerator.createMap(MAP_COLS, MAP_ROWS);
  };

  function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();

    for (const networkInterface of Object.values(interfaces)) {
      if (!Array.isArray(networkInterface)) {
        continue;
      }

      for (const address of networkInterface) {
        if (address.family === "IPv4" && !address.internal) {
          return address.address;
        }
      }
    }

    return "localhost";
  }

  function getControllerUrl() {
    return `http://${getLocalIpAddress()}:${PORT}/controller/`;
  }

  const gameState = {
    tileSize: TILE_SIZE,
    map: createFreshMap(),
    players: {},
    projectiles: []
  };

  const matchState = {
    state: "lobby",
    phase: "lobby",
    message: "En attente de joueurs.",
    registeredPlayers: {},
    quarterGroups: Array.from({ length: QUARTER_COUNT }, () => []),
    currentRound: null,
    finalists: [],
    winnerId: null,
    transitionTimer: null,
    transitionInterval: null,
    countdownSeconds: null
  };

  function clearTransitionTimer() {
    if (matchState.transitionTimer) {
      clearTimeout(matchState.transitionTimer);
      matchState.transitionTimer = null;
    }

    if (matchState.transitionInterval) {
      clearInterval(matchState.transitionInterval);
      matchState.transitionInterval = null;
    }

    matchState.countdownSeconds = null;
  }

  function scheduleTransition(callback, delayMs = ROUND_TRANSITION_MS) {
    clearTransitionTimer();
    matchState.transitionTimer = setTimeout(() => {
      matchState.transitionTimer = null;
      callback();
    }, delayMs);
  }

  function getPublicRegisteredPlayers() {
    const entries = Object.values(matchState.registeredPlayers)
      .sort((left, right) => left.order - right.order)
      .map((player) => [
        player.id,
        {
          id: player.id,
          name: player.name,
          color: player.color,
          colorIndex: player.colorIndex,
          status: player.status,
          quarterIndex: player.quarterIndex,
          finalQualified: player.finalQualified
        }
      ]);

    return Object.fromEntries(entries);
  }

  function buildMatchStatePayload() {
    const publicPlayers = getPublicRegisteredPlayers();
    const finalists = matchState.finalists
      .map((playerId) => matchState.registeredPlayers[playerId])
      .filter(Boolean)
      .map((player) => ({
        id: player.id,
        name: player.name,
        color: player.color,
        colorIndex: player.colorIndex
      }));

    return {
      state: matchState.state,
      phase: matchState.phase,
      message: matchState.message,
      countdownSeconds: matchState.countdownSeconds,
      controllerUrl: getControllerUrl(),
      connectedPlayers: publicPlayers,
      registeredPlayers: publicPlayers,
      activePlayers: Object.keys(gameState.players),
      quarterGroups: matchState.quarterGroups.map((group) =>
        group
          .map((playerId) => matchState.registeredPlayers[playerId])
          .filter(Boolean)
          .map((player) => ({
            id: player.id,
            name: player.name,
            color: player.color,
            colorIndex: player.colorIndex
          }))
      ),
      currentRound: matchState.currentRound
        ? {
            type: matchState.currentRound.type,
            index: matchState.currentRound.index,
            label: matchState.currentRound.label,
            qualifierCount: matchState.currentRound.qualifierCount,
            participantIds: [...matchState.currentRound.participantIds]
          }
        : null,
      finalists,
      winner: matchState.winnerId && matchState.registeredPlayers[matchState.winnerId]
        ? {
            id: matchState.winnerId,
            name: matchState.registeredPlayers[matchState.winnerId].name,
            color: matchState.registeredPlayers[matchState.winnerId].color,
            colorIndex: matchState.registeredPlayers[matchState.winnerId].colorIndex
          }
        : null
    };
  }

  function emitGameState() {
    io.emit("gameState", gameState);
  }

  function emitMatchState() {
    io.emit("matchState", buildMatchStatePayload());
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

  function resetArena(roundType = "quarterfinal") {
    gameState.map = createFreshMap(roundType);
    gameState.projectiles = [];
    gameState.players = {};
  }

  function disableAllPlayers() {
    Object.values(gameState.players).forEach((player) => {
      player.movingDirection = null;
      player.moveTimer = 0;
    });
    gameState.projectiles = [];
  }

  function getQualifierCount(groupSize) {
    if (groupSize <= 0) {
      return 0;
    }

    if (matchState.currentRound?.type === "final") {
      return 1;
    }

    return Math.max(1, Math.ceil(groupSize * 0.25));
  }

  function buildQuarterGroups(playerIds) {
    const groups = Array.from({ length: QUARTER_COUNT }, () => []);
    let cursor = 0;

    for (let groupIndex = 0; groupIndex < QUARTER_COUNT; groupIndex += 1) {
      const playersRemaining = playerIds.length - cursor;
      const groupsRemaining = QUARTER_COUNT - groupIndex;

      if (playersRemaining <= 0) {
        break;
      }

      const targetGroupSize = Math.min(
        SPAWNS.length,
        Math.ceil(playersRemaining / groupsRemaining)
      );

      groups[groupIndex] = playerIds.slice(cursor, cursor + targetGroupSize);
      cursor += targetGroupSize;
    }

    return groups;
  }

  function shuffleArray(values) {
    const shuffled = [...values];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }

    return shuffled;
  }

  function assignRoundColors(participantIds) {
    const shuffledColorIndexes = shuffleArray(COLORS.map((_color, index) => index));

    participantIds.forEach((playerId, participantIndex) => {
      const player = matchState.registeredPlayers[playerId];
      if (!player) {
        return;
      }

      const colorIndex = shuffledColorIndexes[participantIndex];
      player.colorIndex = colorIndex;
      player.color = COLORS[colorIndex];
    });
  }

  function registerPlayer(socketId, name) {
    const playerCount = Object.keys(matchState.registeredPlayers).length;
    if (playerCount >= MAX_PLAYERS) {
      return null;
    }

    const player = {
      id: socketId,
      name: name || "Joueur",
      color: COLORS[playerCount % COLORS.length],
      colorIndex: playerCount % COLORS.length,
      order: playerCount,
      status: "waiting",
      quarterIndex: null,
      finalQualified: false
    };

    matchState.registeredPlayers[socketId] = player;
    return player;
  }

  function createActivePlayer(playerId, spawnIndex) {
    const registeredPlayer = matchState.registeredPlayers[playerId];
    const spawn = SPAWNS[spawnIndex];

    return {
      id: playerId,
      name: registeredPlayer.name,
      color: registeredPlayer.color,
      colorIndex: registeredPlayer.colorIndex,
      gridX: spawn.gridX,
      gridY: spawn.gridY,
      moveDuration: MOVE_DURATION,
      direction: "right",
      movingDirection: null,
      moveTimer: 0,
      shootCooldown: 0
    };
  }

  function notifyRoundQualified(playerIds, roundLabel) {
    playerIds.forEach((playerId) => {
      const playerSocket = io.sockets.sockets.get(playerId);
      if (!playerSocket) {
        return;
      }

      playerSocket.emit("roundQualified", {
        roundLabel
      });
    });
  }

  function updateStatusesForQuarterSetup(roundIndex, participantIds) {
    Object.values(matchState.registeredPlayers).forEach((player) => {
      if (matchState.finalists.includes(player.id)) {
        player.status = "qualified";
        player.finalQualified = true;
        return;
      }

      if (participantIds.includes(player.id)) {
        player.status = "playing";
        return;
      }

      if (player.quarterIndex !== null && player.quarterIndex > roundIndex + 1) {
        player.status = "queued";
      }
    });
  }

  function updateStatusesForFinalSetup(participantIds) {
    Object.values(matchState.registeredPlayers).forEach((player) => {
      if (participantIds.includes(player.id)) {
        player.status = "playing";
        player.finalQualified = true;
        return;
      }

      if (matchState.finalists.includes(player.id)) {
        player.status = "qualified";
        player.finalQualified = true;
      }
    });
  }

  function startRound(roundConfig) {
    clearTransitionTimer();
    const participantIds = roundConfig.participantIds
      .filter((playerId) => Boolean(matchState.registeredPlayers[playerId]));

    if (participantIds.length === 0) {
      if (roundConfig.type === "final") {
        startFinalRound();
      } else {
        goToNextQuarter(roundConfig.index);
      }
      return;
    }

    const resolvedRoundConfig = {
      ...roundConfig,
      participantIds,
      qualifierCount: roundConfig.type === "final"
        ? 1
        : getQualifierCount(participantIds.length)
    };

    resetArena(resolvedRoundConfig.type);
    assignRoundColors(participantIds);

    matchState.state = "transition";
    matchState.currentRound = resolvedRoundConfig;
    matchState.countdownSeconds = ROUND_COUNTDOWN_SECONDS;
    matchState.message = `${resolvedRoundConfig.label} commence dans ${ROUND_COUNTDOWN_SECONDS} s`;

    if (resolvedRoundConfig.type === "quarterfinal") {
      updateStatusesForQuarterSetup(resolvedRoundConfig.index - 1, resolvedRoundConfig.participantIds);
    } else {
      updateStatusesForFinalSetup(resolvedRoundConfig.participantIds);
    }

    const shuffledSpawnIndexes = shuffleArray(SPAWNS.map((_spawn, index) => index));

    resolvedRoundConfig.participantIds.forEach((playerId, participantIndex) => {
      if (!matchState.registeredPlayers[playerId]) {
        return;
      }

      const spawnIndex = shuffledSpawnIndexes[participantIndex];
      gameState.players[playerId] = createActivePlayer(playerId, spawnIndex);
    });

    emitMatchState();
    emitGameState();

    matchState.transitionInterval = setInterval(() => {
      if (matchState.countdownSeconds === null) {
        return;
      }

      matchState.countdownSeconds -= 1;

      if (matchState.countdownSeconds > 0) {
        matchState.message = `${resolvedRoundConfig.label} commence dans ${matchState.countdownSeconds} s`;
        emitMatchState();
        return;
      }

      if (matchState.transitionInterval) {
        clearInterval(matchState.transitionInterval);
        matchState.transitionInterval = null;
      }

      matchState.countdownSeconds = null;
      matchState.state = "playing";
      matchState.message = `${resolvedRoundConfig.label} en cours`;
      emitMatchState();
      emitGameState();
      checkRoundCompletion();
    }, 1000);
  }

  function goToNextQuarter(nextQuarterIndex) {
    if (nextQuarterIndex >= matchState.quarterGroups.length) {
      startFinalRound();
      return;
    }

    const participantIds = matchState.quarterGroups[nextQuarterIndex]
      .filter((playerId) => Boolean(matchState.registeredPlayers[playerId]));

    const label = `Quart ${nextQuarterIndex + 1}/4`;

    if (participantIds.length === 0) {
      matchState.currentRound = {
        type: "quarterfinal",
        index: nextQuarterIndex + 1,
        label,
        qualifierCount: 0,
        participantIds: []
      };
      matchState.state = "transition";
      matchState.message = `${label} vide, passage au suivant`;
      emitMatchState();
      scheduleTransition(() => goToNextQuarter(nextQuarterIndex + 1), 1200);
      return;
    }

    startRound({
      type: "quarterfinal",
      index: nextQuarterIndex + 1,
      label,
      qualifierCount: getQualifierCount(participantIds.length),
      participantIds
    });
  }

  function startFinalRound() {
    const participantIds = matchState.finalists
      .filter((playerId) => Boolean(matchState.registeredPlayers[playerId]));

    if (participantIds.length === 0) {
      matchState.phase = "completed";
      matchState.state = "completed";
      matchState.currentRound = {
        type: "final",
        index: 1,
        label: "Finale",
        qualifierCount: 1,
        participantIds: []
      };
      matchState.message = "Finale impossible: aucun qualifie.";
      emitMatchState();
      emitGameState();
      return;
    }

    matchState.phase = "final";

    startRound({
      type: "final",
      index: 1,
      label: "Finale",
      qualifierCount: 1,
      participantIds
    });
  }

  function startTournament() {
    const registeredIds = Object.values(matchState.registeredPlayers)
      .sort((left, right) => left.order - right.order)
      .map((player) => player.id)
      .slice(0, MAX_PLAYERS);

    if (registeredIds.length === 0) {
      return;
    }

    clearTransitionTimer();
    matchState.phase = "quarterfinals";
    matchState.state = "transition";
    matchState.message = "Preparation du tournoi...";
    matchState.winnerId = null;
    matchState.finalists = [];
    matchState.currentRound = null;
    matchState.quarterGroups = buildQuarterGroups(registeredIds);

    Object.values(matchState.registeredPlayers).forEach((player) => {
      player.status = "queued";
      player.finalQualified = false;
      player.quarterIndex = null;
    });

    matchState.quarterGroups.forEach((group, groupIndex) => {
      group.forEach((playerId) => {
        const player = matchState.registeredPlayers[playerId];
        if (player) {
          player.quarterIndex = groupIndex + 1;
        }
      });
    });

    emitMatchState();
    goToNextQuarter(0);
  }

  function restartTournament() {
    clearTransitionTimer();
    resetArena();

    matchState.phase = "lobby";
    matchState.currentRound = null;
    matchState.finalists = [];
    matchState.winnerId = null;
    matchState.quarterGroups = Array.from({ length: QUARTER_COUNT }, () => []);

    const registeredPlayers = Object.values(matchState.registeredPlayers);
    if (registeredPlayers.length === 0) {
      matchState.state = "lobby";
      matchState.message = "En attente de joueurs.";
    } else {
      matchState.state = "waiting";
      matchState.message = "Tournoi relance. Appuyez sur demarrer.";
    }

    registeredPlayers.forEach((player) => {
      player.status = "waiting";
      player.quarterIndex = null;
      player.finalQualified = false;
    });

    emitGameState();
    emitMatchState();
  }

  function finishTournament(survivorIds) {
    disableAllPlayers();
    matchState.phase = "completed";
    matchState.state = "completed";

    Object.values(matchState.registeredPlayers).forEach((player) => {
      if (survivorIds.includes(player.id)) {
        player.status = "winner";
        return;
      }

      if (player.finalQualified) {
        player.status = "eliminated";
      }
    });

    if (survivorIds.length === 1) {
      const winnerId = survivorIds[0];
      const winner = matchState.registeredPlayers[winnerId];
      matchState.winnerId = winnerId;
      matchState.message = `${winner.name} remporte le tournoi`;

      const winnerSocket = io.sockets.sockets.get(winnerId);
      if (winnerSocket) {
        winnerSocket.emit("gameWon", {
          winnerName: winner.name
        });
      }

      io.emit("playerWon", {
        winnerId,
        winnerName: winner.name
      });
    } else {
      matchState.winnerId = null;
      matchState.message = "Tournoi termine sans vainqueur.";
    }

    emitMatchState();
    emitGameState();
  }

  function finishQuarterRound(survivorIds) {
    const currentRound = matchState.currentRound;
    disableAllPlayers();

    currentRound.participantIds.forEach((playerId) => {
      const player = matchState.registeredPlayers[playerId];
      if (!player) {
        return;
      }

      if (survivorIds.includes(playerId)) {
        player.status = "qualified";
        player.finalQualified = true;

        if (!matchState.finalists.includes(playerId)) {
          matchState.finalists.push(playerId);
        }
        return;
      }

      player.status = "eliminated";
    });

    matchState.state = "transition";
    matchState.message = `${currentRound.label} termine. ${survivorIds.length} qualifie(s) pour la finale.`;

    notifyRoundQualified(survivorIds, currentRound.label);
    emitMatchState();
    emitGameState();

    scheduleTransition(() => goToNextQuarter(currentRound.index), ROUND_TRANSITION_MS);
  }

  function checkRoundCompletion() {
    if (matchState.state !== "playing" || !matchState.currentRound) {
      return;
    }

    const aliveIds = matchState.currentRound.participantIds
      .filter((playerId) => Boolean(gameState.players[playerId]));
    const targetCount = matchState.currentRound.qualifierCount;

    if (aliveIds.length > targetCount) {
      return;
    }

    if (matchState.currentRound.type === "final") {
      finishTournament(aliveIds);
      return;
    }

    finishQuarterRound(aliveIds);
  }

  function shootProjectile(player) {
    const projectile = {
      id: Date.now() + Math.random(),
      ownerId: player.id,
      gridX: player.gridX,
      gridY: player.gridY,
      direction: player.direction,
      age: 0,
      maxTime: PROJECTILE_MAX_TICKS,
      color: player.color
    };

    gameState.projectiles.push(projectile);
  }

  function handlePlayerHit(victimId, killerId) {
    const victim = gameState.players[victimId];
    if (!victim) {
      return;
    }

    const killer = matchState.registeredPlayers[killerId];
    const victimSocket = io.sockets.sockets.get(victimId);

    if (victimSocket) {
      victimSocket.emit("gameOver", {
        reason: "hit",
        killerColor: killer?.color || "#ffffff",
        killerName: killer?.name || "Inconnu"
      });
    }

    io.emit("playerHit", {
      victimId,
      killerId,
      victimColor: victim.color,
      killerColor: killer?.color || "#ffffff",
      victimName: victim.name,
      killerName: killer?.name || "Inconnu"
    });

    if (matchState.registeredPlayers[victimId]) {
      matchState.registeredPlayers[victimId].status = "eliminated";
    }

    delete gameState.players[victimId];
    emitGameState();
    emitMatchState();
    checkRoundCompletion();
  }

  function updateProjectiles() {
    const offsets = {
      left: { dx: -1, dy: 0 },
      right: { dx: 1, dy: 0 },
      up: { dx: 0, dy: -1 },
      down: { dx: 0, dy: 1 }
    };

    gameState.projectiles = gameState.projectiles.filter((projectile) => {
      projectile.age += 1;

      if (projectile.age >= projectile.maxTime) {
        return false;
      }

      const offset = offsets[projectile.direction];
      if (!offset) {
        return false;
      }

      const nextGridX = wrapGridX(projectile.gridX + offset.dx);
      const nextGridY = wrapGridY(projectile.gridY + offset.dy);

      const victimEntry = Object.entries(gameState.players).find(([, player]) => (
        player.gridX === nextGridX && player.gridY === nextGridY
      ));

      if (victimEntry) {
        handlePlayerHit(victimEntry[0], projectile.ownerId);
        return false;
      }

      if (getTile(nextGridX, nextGridY) === DESTRUCTIBLE_WALL) {
        destroyWall(nextGridX, nextGridY);
        return false;
      }

      if (getTile(nextGridX, nextGridY) === SOLID_WALL) {
        return false;
      }

      projectile.gridX = nextGridX;
      projectile.gridY = nextGridY;
      return true;
    });
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

  function updateGame() {
    if (matchState.state !== "playing") {
      return;
    }

    updateProjectiles();

    Object.values(gameState.players).forEach((player) => {
      player.shootCooldown = Math.max(0, player.shootCooldown - 1);

      if (!player.movingDirection) {
        return;
      }

      player.moveTimer -= 1;
      if (player.moveTimer > 0) {
        return;
      }

      if (tryMovePlayer(player, player.movingDirection)) {
        player.moveTimer = MOVE_TICKS;
      } else {
        player.moveTimer = 1;
      }
    });

    emitGameState();
  }

  function removePlayerFromFutureRounds(playerId) {
    matchState.quarterGroups = matchState.quarterGroups.map((group) =>
      group.filter((id) => id !== playerId)
    );
    matchState.finalists = matchState.finalists.filter((id) => id !== playerId);
  }

  function unregisterPlayer(socketId) {
    const player = matchState.registeredPlayers[socketId];
    if (!player) {
      return;
    }

    removePlayerFromFutureRounds(socketId);
    delete matchState.registeredPlayers[socketId];

    if (Object.keys(matchState.registeredPlayers).length === 0 && matchState.phase === "lobby") {
      matchState.state = "lobby";
      matchState.message = "En attente de joueurs.";
    }
  }

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    socket.emit("gameState", gameState);
    socket.emit("matchState", buildMatchStatePayload());

    socket.on("joinAsController", ({ name } = {}) => {
      if (matchState.phase !== "lobby" && matchState.state !== "waiting") {
        socket.emit("matchError", "Le tournoi a deja commence.");
        return;
      }

      if (matchState.registeredPlayers[socket.id]) {
        const existingPlayer = matchState.registeredPlayers[socket.id];
        socket.emit("joined", {
          playerId: existingPlayer.id,
          name: existingPlayer.name,
          color: existingPlayer.color,
          colorIndex: existingPlayer.colorIndex
        });
        return;
      }

      const player = registerPlayer(socket.id, name);
      if (!player) {
        socket.emit("gameFull");
        return;
      }

      if (matchState.state === "lobby") {
        matchState.state = "waiting";
        matchState.message = "Les joueurs rejoignent le lobby.";
      }

      socket.emit("joined", {
        playerId: player.id,
        name: player.name,
        color: player.color,
        colorIndex: player.colorIndex
      });

      console.log("Player joined lobby:", socket.id, "Name:", player.name);
      emitMatchState();
    });

    socket.on("startMatch", () => {
      if (matchState.state !== "waiting") {
        return;
      }

      startTournament();
    });

    socket.on("restartTournament", () => {
      if (matchState.state !== "completed") {
        return;
      }

      restartTournament();
    });

    socket.on("move", ({ direction } = {}) => {
      if (matchState.state !== "playing") {
        return;
      }

      const player = gameState.players[socket.id];
      if (!player) {
        return;
      }

      player.direction = direction;
      player.movingDirection = direction;
      if (player.moveTimer <= 0) {
        player.moveTimer = 0;
      }
    });

    socket.on("stopMove", () => {
      const player = gameState.players[socket.id];
      if (!player) {
        return;
      }

      player.movingDirection = null;
    });

    socket.on("shoot", () => {
      if (matchState.state !== "playing") {
        return;
      }

      const player = gameState.players[socket.id];
      if (!player || player.shootCooldown > 0) {
        return;
      }

      shootProjectile(player);
      player.shootCooldown = SHOOT_COOLDOWN_TICKS;
      emitGameState();
    });

    socket.on("disconnect", () => {
      const wasActive = Boolean(gameState.players[socket.id]);

      if (wasActive) {
        delete gameState.players[socket.id];
      }
      unregisterPlayer(socket.id);

      if (wasActive) {
        emitGameState();
        checkRoundCompletion();
      }

      emitMatchState();
      console.log("Client disconnected:", socket.id);
    });
  });

  function listen() {
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Game screen: http://localhost:${PORT}/`);
      console.log(`Controller: ${getControllerUrl()}`);

      setInterval(updateGame, GAME_TICK_MS);
    });
  }

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.warn(`Port ${PORT} already in use, trying next port...`);
      PORT += 1;

      if (PORT > DEFAULT_PORT + 10) {
        console.error("No available ports found in range", DEFAULT_PORT, DEFAULT_PORT + 10);
        process.exit(1);
      }

      listen();
      return;
    }

    throw error;
  });

  listen();
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
