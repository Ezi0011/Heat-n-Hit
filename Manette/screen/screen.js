const socket = io();
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const TILE_SIZE = 64;

let gameState = {
  map: [],
  players: {}
};

socket.on("gameState", (state) => {
  gameState = state;
  render();
});

function drawMap() {
  const map = gameState.map;

  for (let row = 0; row < map.length; row++) {
    for (let col = 0; col < map[row].length; col++) {
      const tile = map[row][col];

      if (tile === 1) {
        ctx.fillStyle = "#5c5c5c";
      } else {
        ctx.fillStyle = "#d8c08a";
      }

      ctx.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = "#333";
      ctx.strokeRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }
}

function drawPlayers() {
  Object.values(gameState.players).forEach((player) => {
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, player.width, player.height);
  });
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawMap();
  drawPlayers();
}