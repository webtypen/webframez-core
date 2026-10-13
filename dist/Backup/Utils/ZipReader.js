"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractBackupZip = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const stream_1 = require("stream");
const promises_1 = require("stream/promises");
const yauzl_1 = require("yauzl");
function ensureDirectory(directory) {
    const parent = path_1.default.dirname(directory);
    if (parent !== directory) {
        ensureDirectory(parent);
    }
    try {
        fs_1.default.mkdirSync(directory, { mode: 0o700 });
    }
    catch (error) {
        if (error.code !== "EEXIST") {
            throw error;
        }
    }
    const info = fs_1.default.lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new Error(`Restore directory must not be a symlink or special file: ${directory}`);
    }
}
function entryTarget(root, entry) {
    const name = entry.fileName;
    const parts = name.replace(/\/$/, "").split("/");
    if (!name || name.includes("\\") || /[\x00-\x1f\x7f:]/.test(name) || parts.some((part) => !part || part === "." || part === "..")) {
        throw new Error(`Unsafe ZIP entry path: ${JSON.stringify(name)}`);
    }
    const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
    const type = mode & 0o170000;
    if (type !== 0 && type !== 0o100000 && type !== 0o040000) {
        throw new Error(`ZIP symlinks and special files are forbidden: ${name}`);
    }
    const directory = name.endsWith("/") || type === 0o040000;
    if (directory && entry.uncompressedSize !== 0) {
        throw new Error(`ZIP directory contains file data: ${name}`);
    }
    const target = path_1.default.resolve(root, ...parts);
    if (!target.startsWith(root + path_1.default.sep)) {
        throw new Error(`ZIP entry escapes restore directory: ${name}`);
    }
    return { target, directory, mode: mode & 0o777 };
}
function extractEntry(zip, entry, target, mode) {
    return __awaiter(this, void 0, void 0, function* () {
        ensureDirectory(path_1.default.dirname(target));
        try {
            const existing = fs_1.default.lstatSync(target);
            if (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1) {
                throw new Error(`Restore destination is not a private regular file: ${target}`);
            }
        }
        catch (error) {
            if (error.code !== "ENOENT") {
                throw error;
            }
        }
        // Do not truncate until the opened inode is verified. O_NOFOLLOW rejects
        // destination symlinks; nlink prevents modifying files shared outside restore.
        const output = yield fs_1.default.promises.open(target, fs_1.default.constants.O_WRONLY | fs_1.default.constants.O_CREAT | fs_1.default.constants.O_NOFOLLOW | fs_1.default.constants.O_NONBLOCK, 0o600);
        try {
            const info = yield output.stat();
            if (!info.isFile() || info.nlink !== 1) {
                throw new Error(`Restore destination is not a private regular file: ${target}`);
            }
            yield output.truncate(0);
            yield new Promise((resolve, reject) => {
                zip.openReadStream(entry, (error, input) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    // Attach all stream error handlers synchronously, before an
                    // inflater can report a corrupt entry on the next tick (Node 22).
                    const sink = new stream_1.Writable({
                        write(chunk, _encoding, callback) {
                            output.writeFile(chunk).then(() => callback(), callback);
                        },
                    });
                    (0, promises_1.pipeline)(input, sink).then(resolve, reject);
                });
            });
            yield output.chmod(mode || 0o600);
        }
        finally {
            yield output.close();
        }
    });
}
/** Extract regular backup files only, sequentially, into an owner-controlled directory. */
function extractBackupZip(archive, destination) {
    return __awaiter(this, void 0, void 0, function* () {
        const root = path_1.default.resolve(destination);
        ensureDirectory(root);
        const zip = yield new Promise((resolve, reject) => {
            (0, yauzl_1.open)(archive, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, file) => error ? reject(error) : resolve(file));
        });
        yield new Promise((resolve, reject) => {
            const seen = new Set();
            let finished = false;
            const fail = (error) => {
                if (!finished) {
                    finished = true;
                    zip.close();
                    reject(error);
                }
            };
            zip.on("error", fail);
            zip.on("end", () => { finished = true; resolve(); });
            zip.on("entry", (entry) => {
                void (() => __awaiter(this, void 0, void 0, function* () {
                    const { target, directory, mode } = entryTarget(root, entry);
                    if (seen.has(target)) {
                        throw new Error(`Duplicate ZIP entry: ${entry.fileName}`);
                    }
                    seen.add(target);
                    if (directory) {
                        ensureDirectory(target);
                    }
                    else {
                        yield extractEntry(zip, entry, target, mode);
                    }
                    if (!finished) {
                        zip.readEntry();
                    }
                }))().catch(fail);
            });
            zip.readEntry();
        });
    });
}
exports.extractBackupZip = extractBackupZip;
