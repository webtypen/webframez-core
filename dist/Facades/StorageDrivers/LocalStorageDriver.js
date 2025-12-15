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
exports.LocalStorageDriver = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const mime_types_1 = __importDefault(require("mime-types"));
const busboy_1 = __importDefault(require("busboy"));
const FileFunctions_1 = require("../../Functions/FileFunctions");
class LocalStorageDriver {
    constructor(conf) {
        this.config = conf;
        this.basepath = conf.basepath && conf.basepath.trim() !== "" ? conf.basepath : (0, FileFunctions_1.storageDir)();
    }
    path(...args) {
        return path_1.default.join(this.basepath, ...args);
    }
    put(filepath, contents, payload) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const p = this.path(filepath);
            // @ts-ignore
            fs_1.default.writeFileSync(p, contents);
            if (this.config.fileHandlers) {
                const keys = Object.keys(this.config.fileHandlers);
                const mime = yield this.mime(p);
                if (mime) {
                    const configKey = keys.find((key) => {
                        if (key.includes("*")) {
                            const regex = new RegExp("^" + key.replace("*", ".+") + "$");
                            return regex.test(mime);
                        }
                        return key === mime;
                    });
                    if (configKey && ((_a = this.config.fileHandlers[configKey]) === null || _a === void 0 ? void 0 : _a.handlers)) {
                        for (let handler of this.config.fileHandlers[configKey].handlers) {
                            yield handler(p, contents, payload);
                        }
                    }
                }
            }
            return {
                status: "success",
                filepath: filepath,
                payload: payload,
            };
        });
    }
    copy(filepath, target) {
        return __awaiter(this, void 0, void 0, function* () {
            fs_1.default.cpSync(this.path(filepath), target);
            return {
                status: "success",
                filepath: target,
                origin_path: filepath,
                payload: {},
            };
        });
    }
    move(filepath, target) {
        return __awaiter(this, void 0, void 0, function* () {
            fs_1.default.renameSync(this.path(filepath), target);
            return {
                status: "success",
                filepath: target,
                old_filepath: filepath,
                payload: {},
            };
        });
    }
    delete(filepath, options) {
        return __awaiter(this, void 0, void 0, function* () {
            if (Array.isArray(filepath)) {
                for (let el of filepath) {
                    if (options === null || options === void 0 ? void 0 : options.recursive) {
                        fs_1.default.rmSync(this.path(el), { recursive: true, force: options.force ? true : false });
                    }
                    else {
                        fs_1.default.rmSync(this.path(el), { recursive: true, force: (options === null || options === void 0 ? void 0 : options.force) ? true : false });
                    }
                }
            }
            else {
                fs_1.default.rmSync(this.path(filepath), { recursive: (options === null || options === void 0 ? void 0 : options.recursive) ? true : false, force: (options === null || options === void 0 ? void 0 : options.force) ? true : false });
            }
            return {
                status: "success",
                filepath: filepath,
                payload: {},
            };
        });
    }
    mkdir(dirpath, options) {
        return __awaiter(this, void 0, void 0, function* () {
            fs_1.default.mkdirSync(this.path(dirpath));
            return {
                status: "success",
                dirpath: dirpath,
                payload: {},
            };
        });
    }
    exists(filepath) {
        return __awaiter(this, void 0, void 0, function* () {
            return fs_1.default.existsSync(this.path(filepath));
        });
    }
    isDir(dirpath) {
        return __awaiter(this, void 0, void 0, function* () {
            const stats = fs_1.default.lstatSync(this.path(dirpath));
            return stats.isDirectory();
        });
    }
    isFile(filepath) {
        return __awaiter(this, void 0, void 0, function* () {
            const stats = fs_1.default.lstatSync(this.path(filepath));
            return stats.isFile();
        });
    }
    extension(filepath) {
        return __awaiter(this, void 0, void 0, function* () {
            const temp = filepath.indexOf(".") > 0 ? filepath.substring(filepath.lastIndexOf(".") + 1) : null;
            return temp && temp.trim() !== "" ? temp.trim() : null;
        });
    }
    mime(filepath) {
        return __awaiter(this, void 0, void 0, function* () {
            const temp = mime_types_1.default.lookup(this.path(filepath));
            return temp ? temp : null;
        });
    }
    readDir(dirpath, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const entries = fs_1.default.readdirSync(this.path(dirpath));
            return entries && entries.length > 0 ? entries : [];
        });
    }
    upload(req, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const busboy = (0, busboy_1.default)({ headers: req.headers });
            const dir = path_1.default.join((0, FileFunctions_1.storageDir)(), options.storagePath);
            if (!fs_1.default.existsSync(dir)) {
                fs_1.default.mkdirSync(dir, { recursive: true });
            }
            let hasSuccess = false;
            const promises = [
                new Promise((resolve) => {
                    if (!req.message) {
                        throw Error("Missing IncomingMessage ...");
                    }
                    let fileOptions = null;
                    let filepath = null;
                    busboy.on("file", (fieldname, file, options) => __awaiter(this, void 0, void 0, function* () {
                        if (fileOptions === null && options) {
                            fileOptions = options;
                        }
                        filepath = path_1.default.join(dir, options.storageFilename);
                        const writeStream = fs_1.default.createWriteStream(filepath);
                        file.pipe(writeStream);
                    }));
                    busboy.on("error", (error, error2) => {
                        console.error("Busboy error:", error);
                        resolve(false);
                    });
                    busboy.on("finish", () => __awaiter(this, void 0, void 0, function* () {
                        if (this.config.fileHandlers) {
                            const keys = Object.keys(this.config.fileHandlers);
                            const mime = yield this.mime(filepath);
                            if (mime) {
                                const configKey = keys.find((key) => {
                                    if (key.includes("*")) {
                                        const regex = new RegExp("^" + key.replace("*", ".+") + "$");
                                        return regex.test(mime);
                                    }
                                    return key === mime;
                                });
                                if (configKey && this.config.fileHandlers[configKey]) {
                                    for (let handler of this.config.fileHandlers[configKey]) {
                                        yield handler(filepath, fs_1.default.readFileSync(filepath), options.payload);
                                    }
                                }
                            }
                        }
                        hasSuccess = true;
                        resolve(true);
                    }));
                    req.message.pipe(busboy);
                }),
            ];
            yield Promise.all(promises);
            return hasSuccess;
        });
    }
}
exports.LocalStorageDriver = LocalStorageDriver;
