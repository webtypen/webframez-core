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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractBackupZip = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
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
    var _a, e_1, _b, _c;
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
            const input = yield new Promise((resolve, reject) => {
                zip.openReadStream(entry, (error, stream) => error ? reject(error) : resolve(stream));
            });
            yield output.truncate(0);
            try {
                for (var _d = true, input_1 = __asyncValues(input), input_1_1; input_1_1 = yield input_1.next(), _a = input_1_1.done, !_a;) {
                    _c = input_1_1.value;
                    _d = false;
                    try {
                        const chunk = _c;
                        yield output.writeFile(chunk);
                    }
                    finally {
                        _d = true;
                    }
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = input_1.return)) yield _b.call(input_1);
                }
                finally { if (e_1) throw e_1.error; }
            }
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
