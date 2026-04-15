const QR_VERSION = 4;
const QR_SIZE = 33;
const QR_DATA_CODEWORDS = 80;
const QR_ECC_CODEWORDS = 20;
const QR_FORMAT_BITS_MASK_0_L = 0x77c4;

const gfExp = new Array(512).fill(0);
const gfLog = new Array(256).fill(0);

{
    let value = 1;
    for (let i = 0; i < 255; i += 1) {
        gfExp[i] = value;
        gfLog[value] = i;
        value <<= 1;
        if (value & 0x100) {
            value ^= 0x11d;
        }
    }

    for (let i = 255; i < 512; i += 1) {
        gfExp[i] = gfExp[i - 255];
    }
}

function gfMultiply(left, right) {
    if (left === 0 || right === 0) {
        return 0;
    }

    return gfExp[gfLog[left] + gfLog[right]];
}

function buildGeneratorPolynomial(degree) {
    let polynomial = [1];

    for (let i = 0; i < degree; i += 1) {
        const next = new Array(polynomial.length + 1).fill(0);
        for (let j = 0; j < polynomial.length; j += 1) {
            next[j] ^= polynomial[j];
            next[j + 1] ^= gfMultiply(polynomial[j], gfExp[i]);
        }
        polynomial = next;
    }

    return polynomial;
}

function appendBits(target, value, length) {
    for (let bitIndex = length - 1; bitIndex >= 0; bitIndex -= 1) {
        target.push((value >>> bitIndex) & 1);
    }
}

function buildQrCodewords(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    if (bytes.length > 78) {
        throw new Error("QR payload too long for the embedded generator.");
    }

    const bits = [];
    appendBits(bits, 0b0100, 4);
    appendBits(bits, bytes.length, 8);
    bytes.forEach((byte) => appendBits(bits, byte, 8));

    const capacityBits = QR_DATA_CODEWORDS * 8;
    const terminatorLength = Math.min(4, capacityBits - bits.length);
    appendBits(bits, 0, terminatorLength);

    while (bits.length % 8 !== 0) {
        bits.push(0);
    }

    const dataCodewords = [];
    for (let i = 0; i < bits.length; i += 8) {
        let value = 0;
        for (let bit = 0; bit < 8; bit += 1) {
            value = (value << 1) | bits[i + bit];
        }
        dataCodewords.push(value);
    }

    const padBytes = [0xec, 0x11];
    while (dataCodewords.length < QR_DATA_CODEWORDS) {
        dataCodewords.push(padBytes[dataCodewords.length % 2]);
    }

    const generator = buildGeneratorPolynomial(QR_ECC_CODEWORDS);
    const message = dataCodewords.concat(new Array(QR_ECC_CODEWORDS).fill(0));

    for (let i = 0; i < QR_DATA_CODEWORDS; i += 1) {
        const coefficient = message[i];
        if (coefficient === 0) {
            continue;
        }

        for (let j = 0; j < generator.length; j += 1) {
            message[i + j] ^= gfMultiply(generator[j], coefficient);
        }
    }

    return dataCodewords.concat(message.slice(-QR_ECC_CODEWORDS));
}

function createMatrix(size) {
    return Array.from({ length: size }, () => Array(size).fill(false));
}

function createReservedMap(size) {
    return Array.from({ length: size }, () => Array(size).fill(false));
}

function setModule(matrix, reserved, x, y, value, markReserved = true) {
    if (x < 0 || y < 0 || y >= matrix.length || x >= matrix.length) {
        return;
    }

    matrix[y][x] = value;
    if (markReserved) {
        reserved[y][x] = true;
    }
}

function addFinderPattern(matrix, reserved, left, top) {
    for (let dy = -1; dy <= 7; dy += 1) {
        for (let dx = -1; dx <= 7; dx += 1) {
            const x = left + dx;
            const y = top + dy;
            const isBorder = dx === -1 || dx === 7 || dy === -1 || dy === 7;
            const isOuter = dx === 0 || dx === 6 || dy === 0 || dy === 6;
            const isInner = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
            const isDark = !isBorder && (isOuter || isInner);
            setModule(matrix, reserved, x, y, isDark, true);
        }
    }
}

function addAlignmentPattern(matrix, reserved, centerX, centerY) {
    for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
            const distance = Math.max(Math.abs(dx), Math.abs(dy));
            const value = distance !== 1;
            setModule(matrix, reserved, centerX + dx, centerY + dy, value, true);
        }
    }
}

function reserveFormatAreas(matrix, reserved) {
    const size = matrix.length;

    for (let i = 0; i <= 8; i += 1) {
        if (i !== 6) {
            reserved[8][i] = true;
            reserved[i][8] = true;
        }
    }

    for (let i = 0; i < 8; i += 1) {
        reserved[8][size - 1 - i] = true;
        reserved[size - 1 - i][8] = true;
    }
}

function addFunctionPatterns(matrix, reserved) {
    const size = matrix.length;

    addFinderPattern(matrix, reserved, 0, 0);
    addFinderPattern(matrix, reserved, size - 7, 0);
    addFinderPattern(matrix, reserved, 0, size - 7);

    for (let i = 8; i < size - 8; i += 1) {
        const value = i % 2 === 0;
        setModule(matrix, reserved, i, 6, value, true);
        setModule(matrix, reserved, 6, i, value, true);
    }

    addAlignmentPattern(matrix, reserved, 26, 26);
    setModule(matrix, reserved, 8, size - 8, true, true);
    reserveFormatAreas(matrix, reserved);
}

function maskBit(mask, x, y) {
    if (mask === 0) {
        return (x + y) % 2 === 0;
    }

    return false;
}

function addData(matrix, reserved, codewords) {
    const bits = [];
    codewords.forEach((codeword) => appendBits(bits, codeword, 8));

    let bitIndex = 0;
    let upwards = true;

    for (let right = matrix.length - 1; right >= 1; right -= 2) {
        if (right === 6) {
            right -= 1;
        }

        for (let step = 0; step < matrix.length; step += 1) {
            const y = upwards ? matrix.length - 1 - step : step;

            for (let offset = 0; offset < 2; offset += 1) {
                const x = right - offset;
                if (reserved[y][x]) {
                    continue;
                }

                const bit = bitIndex < bits.length ? bits[bitIndex] === 1 : false;
                const masked = bitIndex < bits.length ? bit !== maskBit(0, x, y) : false;
                matrix[y][x] = masked;
                bitIndex += 1;
            }
        }

        upwards = !upwards;
    }
}

function addFormatInformation(matrix, reserved) {
    const size = matrix.length;
    const bits = QR_FORMAT_BITS_MASK_0_L;

    const getBit = (index) => ((bits >>> index) & 1) !== 0;

    for (let i = 0; i <= 5; i += 1) {
        setModule(matrix, reserved, 8, i, getBit(i), true);
    }
    setModule(matrix, reserved, 8, 7, getBit(6), true);
    setModule(matrix, reserved, 8, 8, getBit(7), true);
    setModule(matrix, reserved, 7, 8, getBit(8), true);
    for (let i = 9; i < 15; i += 1) {
        setModule(matrix, reserved, 14 - i, 8, getBit(i), true);
    }

    for (let i = 0; i < 8; i += 1) {
        setModule(matrix, reserved, size - 1 - i, 8, getBit(i), true);
    }
    for (let i = 8; i < 15; i += 1) {
        setModule(matrix, reserved, 8, size - 15 + i, getBit(i), true);
    }
}

function buildQrMatrix(text) {
    const matrix = createMatrix(QR_SIZE);
    const reserved = createReservedMap(QR_SIZE);
    const codewords = buildQrCodewords(text);

    addFunctionPatterns(matrix, reserved);
    addData(matrix, reserved, codewords);
    addFormatInformation(matrix, reserved);

    return matrix;
}

export function createQrCodeDataUrl(text, pixelSize = 220) {
    const matrix = buildQrMatrix(text);
    const quietZone = 4;
    const moduleCount = matrix.length + quietZone * 2;
    const scale = Math.max(1, Math.floor(pixelSize / moduleCount));
    const canvasSize = moduleCount * scale;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = canvasSize;
    canvas.height = canvasSize;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#000000";

    for (let y = 0; y < matrix.length; y += 1) {
        for (let x = 0; x < matrix.length; x += 1) {
            if (!matrix[y][x]) {
                continue;
            }

            context.fillRect(
                (x + quietZone) * scale,
                (y + quietZone) * scale,
                scale,
                scale
            );
        }
    }

    return canvas.toDataURL("image/png");
}
