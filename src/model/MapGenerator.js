export class MapGenerator {

    static createMap(width, height) {
        const map = [];

        for (let y = 0; y < height; y++) {
            map[y] = [];

            for (let x = 0; x < width; x++) {
                map[y][x] = 0;
            }
        }

        const spawns = this.generateSpawns(width, height);

        spawns.forEach(spawn => {
            map[spawn.y][spawn.x] = 4;
        });

        return map;
    }

    static generateSpawns(width, height) {
        const spawnCols = 8;
        const spawnRows = 3;

        const stepX = width / spawnCols;
        const stepY = height / spawnRows;

        const spawns = [];

        for (let row = 0; row < spawnRows; row++) {
            for (let col = 0; col < spawnCols; col++) {
                const gridX = col * stepX + Math.floor(stepX / 2);
                const gridY = row * stepY + Math.floor(stepY / 2);

                spawns.push({
                    x: gridX,
                    y: gridY
                });
            }
        }

        return spawns;
    }
}