import fs from "fs";
import path from "path";
import zlib from "zlib";
import { spawnSync } from "child_process";
import { normalizeBackupPath } from "./BackupPathUtils";

type ZipEntry = {
    name: string;
    crc: number;
    compressedSize: number;
    uncompressedSize: number;
    localHeaderOffset: number;
    compressedData: Buffer;
    dosTime: number;
    dosDate: number;
};

const crcTable = (() => {
    const table: number[] = [];
    for (let index = 0; index < 256; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) {
            value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        }
        table[index] = value >>> 0;
    }
    return table;
})();

function crc32(buffer: Buffer) {
    let crc = 0xffffffff;
    for (let index = 0; index < buffer.length; index += 1) {
        crc = crcTable[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function getDosTime(date: Date) {
    const seconds = Math.floor(date.getSeconds() / 2);
    return (date.getHours() << 11) | (date.getMinutes() << 5) | seconds;
}

function getDosDate(date: Date) {
    const year = Math.max(date.getFullYear(), 1980) - 1980;
    return (year << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
}

function localHeader(entry: ZipEntry) {
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

function centralDirectoryHeader(entry: ZipEntry) {
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

function endOfCentralDirectory(entryCount: number, centralSize: number, centralOffset: number) {
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

export function createZipFile(zipPath: string, files: Array<{ source: string; name: string }>) {
    fs.mkdirSync(path.dirname(zipPath), { recursive: true });

    const entries: ZipEntry[] = [];
    const chunks: Buffer[] = [];
    let offset = 0;

    for (const file of files) {
        const data = fs.readFileSync(file.source);
        const compressedData = zlib.deflateRawSync(data);
        const now = new Date();
        const entry: ZipEntry = {
            name: normalizeBackupPath(file.name),
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

    fs.writeFileSync(zipPath, Buffer.concat(chunks));
    return zipPath;
}

function collectZipFiles(sourceDir: string) {
    const files: Array<{ source: string; name: string }> = [];
    const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir)) {
            const filepath = path.join(dir, entry);
            const stats = fs.statSync(filepath);
            if (stats.isDirectory()) {
                walk(filepath);
            } else if (stats.isFile()) {
                files.push({
                    source: filepath,
                    name: normalizeBackupPath(path.relative(sourceDir, filepath)),
                });
            }
        }
    };
    walk(sourceDir);
    return files;
}

function compressionArg(level?: number) {
    if (level === undefined || level === null || Number.isNaN(level)) {
        return "-6";
    }

    const normalized = Math.max(0, Math.min(9, Math.round(level)));
    return `-${normalized}`;
}

export function createZipFileFromDirectory(
    zipPath: string,
    sourceDir: string,
    options?: { driver?: "auto" | "system" | "node"; compressionLevel?: number },
) {
    fs.mkdirSync(path.dirname(zipPath), { recursive: true });

    if (options?.driver !== "node") {
        const args = ["-q", compressionArg(options?.compressionLevel), "-r", zipPath, "."];
        const result = spawnSync("zip", args, {
            cwd: sourceDir,
            encoding: "utf-8",
        });

        if (result.status === 0 && fs.existsSync(zipPath)) {
            return { path: zipPath, driver: "system" as const };
        }

        if (options?.driver === "system") {
            const detail = result.stderr || result.stdout || result.error?.message || "unknown error";
            throw new Error(`System zip failed: ${detail}`);
        }
    }

    createZipFile(zipPath, collectZipFiles(sourceDir));
    return { path: zipPath, driver: "node" as const };
}
