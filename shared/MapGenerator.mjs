export class MapGenerator {
    static MUR_SOLIDE = 1;
    static MUR_DESTRUCTIBLE = 2;
    static SPAWN = 4;


    static createMap(width, height) {
        const map = this.createEmptyMap(width, height);
        const spawns = this.generateSpawns(width, height);

        this.placeSpawns(map, spawns);
        this.placeWalls(map, spawns, width, height);
        this.placeSpawnProtectionWalls(map, spawns, width, height);

        return map;
    }

    static createEmptyMap(width, height) {
        const map = [];

        for (let y = 0; y < height; y++) {
            map[y] = [];

            for (let x = 0; x < width; x++) {
                map[y][x] = 0;
            }
        }
        return map;
    }

    static generateSpawns(width, height) {
        const spawnCols = 8;
        const spawnRows = 2;
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

    static isNearSpawn(x, y, spawns, radius = 1) {
        for (const spawn of spawns) {
            const dx = Math.abs(x - spawn.x);
            const dy = Math.abs(y - spawn.y);

            if (dx <= radius && dy <= radius) {
                return true;
            }
        }

        return false;
    }

    static placeWalls(map, spawns, width, height) {
        const wallChance = 0.18;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                
                // Ne jamais écraser un spawn
                if (map[y][x] !== 0) {
                    continue;
                }

                // Safe zone autour des spawns
                if (this.isNearSpawn(x, y, spawns, 1)) {
                    continue;
                }


                // On garde les bords plus ouverts pour le wrap
                const isNearBorder =
                    x === 0 || y === 0 || x === width - 1 || y === height - 1;

                if (isNearBorder) {
                    continue;
                }

                if (Math.random() < wallChance) {
                    if (Math.random() < 0.5) {
                        map[y][x] = this.MUR_SOLIDE;
                    } else {
                        map[y][x] = this.MUR_DESTRUCTIBLE;
                    }
                    
                }

            }
        }
    }

    static placeSpawnProtectionWalls(map, spawns, width, height) {
    const dist = 2;

    for (const spawn of spawns) {
        const positions = [
            //{ x: spawn.x, y: spawn.y - dist },
            //{ x: spawn.x, y: spawn.y + dist },
            { x: spawn.x - dist, y: spawn.y },
            { x: spawn.x + dist, y: spawn.y }
        ];

        for (const pos of positions) {
            if (pos.x < 0 || pos.x >= width || pos.y < 0 || pos.y >= height) {
                continue;
            }

            if (map[pos.y][pos.x] === 0) {
                map[pos.y][pos.x] = 1;
            }
        }
    }
}

    static placeSpawns(map, spawns) {
        spawns.forEach(spawn => {
            map[spawn.y][spawn.x] = 4;
        });
    }
}
