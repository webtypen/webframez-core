"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createZipFileFromDirectory = exports.createZipFile = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const zlib_1 = __importDefault(require("zlib"));
const child_process_1 = require("child_process");
const BackupPathUtils_1 = require("./BackupPathUtils");
const crcTable = (() => {
    const table = [];
    for (let index = 0; index < 256; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) {
            value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        }
        table[index] = value >>> 0;
    }
    return table;
})();
function crc32(buffer) {
    let crc = 0xffffffff;
    for (let index = 0; index < buffer.length; index += 1) {
        crc = crcTable[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function getDosTime(date) {
    const seconds = Math.floor(date.getSeconds() / 2);
    return (date.getHours() << 11) | (date.getMinutes() << 5) | seconds;
}
function getDosDate(date) {
    const year = Math.max(date.getFullYear(), 1980) - 1980;
    return (year << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
}
function localHeader(entry) {
    const name = Buffer.from(entry.name, "utf8");
    const header = Buffer.alloc(30 + name.length);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(entry.dosTime, 10);
    header.writeUInt16LE(entry.dosDate, 12);
    header.writeUInt32LE(entry.crc, 14);
    header.writeUInt32LE(entry.compressedSize, 18);
    header.writeUInt32LE(entry.uncompressedSize, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);
    name.copy(header, 30);
    return header;
}
function centralDirectoryHeader(entry) {
    const name = Buffer.from(entry.name, "utf8");
    const header = Buffer.alloc(46 + name.length);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(8, 10);
    header.writeUInt16LE(entry.dosTime, 12);
    header.writeUInt16LE(entry.dosDate, 14);
    header.writeUInt32LE(entry.crc, 16);
    header.writeUInt32LE(entry.compressedSize, 20);
    header.writeUInt32LE(entry.uncompressedSize, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(0, 38);
    header.writeUInt32LE(entry.localHeaderOffset, 42);
    name.copy(header, 46);
    return header;
}
function endOfCentralDirectory(entryCount, centralSize, centralOffset) {
    const header = Buffer.alloc(22);
    header.writeUInt32LE(0x06054b50, 0);
    header.writeUInt16LE(0, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(entryCount, 8);
    header.writeUInt16LE(entryCount, 10);
    header.writeUInt32LE(centralSize, 12);
    header.writeUInt32LE(centralOffset, 16);
    header.writeUInt16LE(0, 20);
    return header;
}
function createZipFile(zipPath, files) {
    fs_1.default.mkdirSync(path_1.default.dirname(zipPath), { recursive: true });
    const entries = [];
    const chunks = [];
    let offset = 0;
    for (const file of files) {
        const data = fs_1.default.readFileSync(file.source);
        const compressedData = zlib_1.default.deflateRawSync(data);
        const now = new Date();
        const entry = {
            name: (0, BackupPathUtils_1.normalizeBackupPath)(file.name),
            crc: crc32(data),
            compressedSize: compressedData.length,
            uncompressedSize: data.length,
            localHeaderOffset: offset,
            compressedData: compressedData,
            dosTime: getDosTime(now),
            dosDate: getDosDate(now),
        };
        const header = localHeader(entry);
        chunks.push(header, compressedData);
        offset += header.length + compressedData.length;
        entries.push(entry);
    }
    const centralOffset = offset;
    const centralChunks = entries.map((entry) => centralDirectoryHeader(entry));
    const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    chunks.push(...centralChunks, endOfCentralDirectory(entries.length, centralSize, centralOffset));
    fs_1.default.writeFileSync(zipPath, Buffer.concat(chunks));
    return zipPath;
}
exports.createZipFile = createZipFile;
function collectZipFiles(sourceDir) {
    const files = [];
    const walk = (dir) => {
        for (const entry of fs_1.default.readdirSync(dir)) {
            const filepath = path_1.default.join(dir, entry);
            const stats = fs_1.default.statSync(filepath);
            if (stats.isDirectory()) {
                walk(filepath);
            }
            else if (stats.isFile()) {
                files.push({
                    source: filepath,
                    name: (0, BackupPathUtils_1.normalizeBackupPath)(path_1.default.relative(sourceDir, filepath)),
                });
            }
        }
    };
    walk(sourceDir);
    return files;
}
function compressionArg(level) {
    if (level === undefined || level === null || Number.isNaN(level)) {
        return "-6";
    }
    const normalized = Math.max(0, Math.min(9, Math.round(level)));
    return `-${normalized}`;
}
function createZipFileFromDirectory(zipPath, sourceDir, options) {
    var _a;
    fs_1.default.mkdirSync(path_1.default.dirname(zipPath), { recursive: true });
    if ((options === null || options === void 0 ? void 0 : options.driver) !== "node") {
        const args = ["-q", compressionArg(options === null || options === void 0 ? void 0 : options.compressionLevel), "-r", zipPath, "."];
        const result = (0, child_process_1.spawnSync)("zip", args, {
            cwd: sourceDir,
            encoding: "utf-8",
        });
        if (result.status === 0 && fs_1.default.existsSync(zipPath)) {
            return { path: zipPath, driver: "system" };
        }
        if ((options === null || options === void 0 ? void 0 : options.driver) === "system") {
            const detail = result.stderr || result.stdout || ((_a = result.error) === null || _a === void 0 ? void 0 : _a.message) || "unknown error";
            throw new Error(`System zip failed: ${detail}`);
        }
    }
    createZipFile(zipPath, collectZipFiles(sourceDir));
    return { path: zipPath, driver: "node" };
}
exports.createZipFileFromDirectory = createZipFileFromDirectory;
