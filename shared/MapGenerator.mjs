export class MapGenerator {
    static createMap(width, height) {
        const map = [];

        for (let y = 0; y < height; y += 1) {
            map[y] = [];

            for (let x = 0; x < width; x += 1) {
                map[y][x] = 0;
            }
        }

        const spawns = this.generateSpawns(width, height);

        spawns.forEach((spawn) => {
            map[spawn.gridY][spawn.gridX] = 4;
        });

        return map;
    }

    static generateSpawns(width, height) {
        const spawnCols = 6;
        const spawnRows = 3;
        const stepX = width / spawnCols;
        const stepY = height / spawnRows;
        const spawns = [];

        for (let row = 0; row < spawnRows; row += 1) {
            for (let col = 0; col < spawnCols; col += 1) {
                const gridX = Math.floor(col * stepX + stepX / 2);
                const gridY = Math.floor(row * stepY + stepY / 2);

                spawns.push({
                    gridX,
                    gridY,
                    x: gridX,
                    y: gridY
                });
            }
        }

        return spawns;
    }
}
