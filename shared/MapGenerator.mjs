export class MapGenerator {
    static EMPTY = 0;
    static SOLID_WALL = 1;
    static DESTRUCTIBLE_WALL = 2;
    static SPAWN = 4;

    // Backward-compatible aliases used by the server.
    static MUR_SOLIDE = 1;
    static MUR_DESTRUCTIBLE = 2;

    static createMap(width, height) {
        const map = this.createEmptyMap(width, height);
        const spawns = this.generateSpawns(width, height);

        this.placeSpawns(map, spawns);
        this.placeWalls(map, spawns, width, height);
        this.placeSpawnProtectionWalls(map, spawns, width, height);

        return map;
    }

    static createFinalMap(width, height) {
        const map = this.createEmptyMap(width, height);
        const spawns = this.generateSpawns(width, height);

        this.placeSpawns(map, spawns);
        this.placeFinalWalls(map, spawns, width, height);
        this.placeSpawnProtectionWalls(map, spawns, width, height);

        return map;
    }

    static createEmptyMap(width, height) {
        const map = [];

        for (let y = 0; y < height; y += 1) {
            map[y] = [];

            for (let x = 0; x < width; x += 1) {
                map[y][x] = this.EMPTY;
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
        this.placeRandomWalls(map, spawns, width, height, {
            wallChance: 0.20,
            solidChance: 0.5,
            spawnSafeRadius: 1,
            avoidBorders: true
        });
    }

    static placeFinalWalls(map, spawns, width, height) {
        // Zone reservee au design de la map finale.
        // Modifie cette fonction pour changer uniquement l'arene de finale.
        this.placeRandomWalls(map, spawns, width, height, {
            wallChance: 0.15,
            solidChance: 0,
            spawnSafeRadius: 1,
            avoidBorders: true
        });
    }

    static placeRandomWalls(map, spawns, width, height, options = {}) {
        const wallChance = options.wallChance ?? 0.18;
        const solidChance = options.solidChance ?? 0.5;
        const spawnSafeRadius = options.spawnSafeRadius ?? 1;
        const avoidBorders = options.avoidBorders ?? true;

        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                if (!this.canPlaceWall(map, spawns, width, height, x, y, spawnSafeRadius, avoidBorders)) {
                    continue;
                }

                if (Math.random() >= wallChance) {
                    continue;
                }

                map[y][x] = Math.random() < solidChance
                    ? this.SOLID_WALL
                    : this.DESTRUCTIBLE_WALL;
            }
        }
    }

    static canPlaceWall(map, spawns, width, height, x, y, spawnSafeRadius = 1, avoidBorders = true) {
        if (x < 0 || x >= width || y < 0 || y >= height) {
            return false;
        }

        if (map[y][x] !== this.EMPTY) {
            return false;
        }

        if (this.isNearSpawn(x, y, spawns, spawnSafeRadius)) {
            return false;
        }

        return !avoidBorders || (x > 0 && y > 0 && x < width - 1 && y < height - 1);
    }

    static placeSpawnProtectionWalls(map, spawns, width, height) {
        const dist = 2;

        for (const spawn of spawns) {
            const positions = [
                { x: spawn.x - dist, y: spawn.y },
                { x: spawn.x + dist, y: spawn.y }
            ];

            for (const pos of positions) {
                if (pos.x < 0 || pos.x >= width || pos.y < 0 || pos.y >= height) {
                    continue;
                }

                map[pos.y][pos.x] = this.SOLID_WALL;
            }
        }
    }

    static placeFinalTile(map, spawns, width, height, x, y, tileType) {
        if (!this.canPlaceWall(map, spawns, width, height, x, y, 1, false)) {
            return false;
        }

        map[y][x] = tileType;
        return true;
    }

    static placeSpawns(map, spawns) {
        spawns.forEach((spawn) => {
            map[spawn.y][spawn.x] = this.SPAWN;
        });
    }
}
