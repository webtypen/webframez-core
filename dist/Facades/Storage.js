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
exports.StorageFile = exports.Storage = exports.StorageDriverRegisty = void 0;
const path_1 = __importDefault(require("path"));
const Config_1 = require("../Config");
const LocalStorageDriver_1 = require("./StorageDrivers/LocalStorageDriver");
const StringFunctions_1 = require("../Functions/StringFunctions");
class StorageDriverRegistyFacade {
    constructor() {
        this.drivers = {};
        this.drivers.local = LocalStorageDriver_1.LocalStorageDriver;
    }
}
exports.StorageDriverRegisty = new StorageDriverRegistyFacade();
class StorageFileInstance {
    constructor(filepath, driver) {
        this.driver = driver;
        this.filepath = filepath;
    }
    exists() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.driver.exists(this.filepath);
        });
    }
    isDir() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.driver.isDir(this.filepath);
        });
    }
    isFile() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.driver.isFile(this.filepath);
        });
    }
    delete(options) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.driver.delete(this.filepath, options);
        });
    }
    extension(options) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.driver.delete(this.filepath, options);
        });
    }
    mime() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.driver.mime(this.filepath);
        });
    }
}
class StorageDisk {
    constructor(key) {
        this.diskKey = key;
        this.config = Config_1.Config.get("storage.storages." + this.diskKey);
        if (!this.config.driver) {
            throw new Error(`[STORAGE ERROR] Missing driver for disk '${this.diskKey}'.`);
        }
        if (!exports.StorageDriverRegisty || !exports.StorageDriverRegisty.drivers || !exports.StorageDriverRegisty.drivers[this.config.driver]) {
            throw new Error(`[STORAGE ERROR] Invalid driver '${this.config.driver}' for disk '${this.diskKey}'.`);
        }
        this.driver = new exports.StorageDriverRegisty.drivers[this.config.driver](this.config);
    }
    generateUploadFilepath() {
        const date = new Date();
        return path_1.default.join(this.config.uploadsDir && this.config.uploadsDir.trim() !== "" ? this.config.uploadsDir : "uploads", date.getFullYear().toString(), date.getMonth().toString() + "-" + date.getDate().toString(), date.valueOf().toString() + "_" + StringFunctions_1.StringFunctions.random(24));
    }
    put(contents, filepath) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.driver)
                throw new Error(`[STORAGE ERROR] No driver configured for disk '${this.diskKey}'.`);
            return yield this.driver.put(filepath && filepath.trim() !== "" ? filepath : this.generateUploadFilepath(), contents);
        });
    }
    copy(filepath, target) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.driver)
                throw new Error(`[STORAGE ERROR] No driver configured for disk '${this.diskKey}'.`);
            return yield this.driver.copy(filepath, target);
        });
    }
    move(filepath, target) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.driver)
                throw new Error(`[STORAGE ERROR] No driver configured for disk '${this.diskKey}'.`);
            return yield this.driver.move(filepath, target);
        });
    }
    delete(filepath, options) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.driver)
                throw new Error(`[STORAGE ERROR] No driver configured for disk '${this.diskKey}'.`);
            return yield this.driver.delete(filepath, options);
        });
    }
    mkdir(filepath, options) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.driver)
                throw new Error(`[STORAGE ERROR] No driver configured for disk '${this.diskKey}'.`);
            return yield this.driver.mkdir(filepath, options);
        });
    }
    isDir(filepath) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.driver)
                throw new Error(`[STORAGE ERROR] No driver configured for disk '${this.diskKey}'.`);
            return yield this.driver.mkdir(filepath);
        });
    }
    isFile(filepath) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.driver)
                throw new Error(`[STORAGE ERROR] No driver configured for disk '${this.diskKey}'.`);
            return yield this.driver.mkdir(filepath);
        });
    }
    file(filepath) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.driver)
                throw new Error(`[STORAGE ERROR] No driver configured for disk '${this.diskKey}'.`);
            return new StorageFileInstance(filepath, this.driver);
        });
    }
    readDir(dirpath, options) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.driver)
                throw new Error(`[STORAGE ERROR] No driver configured for disk '${this.diskKey}'.`);
            return yield this.driver.readDir(dirpath, options);
        });
    }
}
class StorageFacade {
    constructor() {
        this.disks = {};
        this.drivers = {};
    }
    disk(diskKey) {
        const key = diskKey !== null && diskKey !== void 0 ? diskKey : Config_1.Config.get("storage.defaultStorage");
        if (this.disks[key]) {
            return this.disks[key];
        }
        this.disks[key] = new StorageDisk(key);
        return this.disks[key];
    }
    put(contents, filepath) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.disk().put(contents, filepath);
        });
    }
    copy(filepath, target) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.disk().copy(filepath, target);
        });
    }
    move(filepath, target) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.disk().move(filepath, target);
        });
    }
    delete(filepath, options) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.disk().delete(filepath, options);
        });
    }
    mkdir(filepath, options) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.disk().mkdir(filepath, options);
        });
    }
    isDir(filepath) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.disk().isDir(filepath);
        });
    }
    isFile(filepath) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.disk().isFile(filepath);
        });
    }
    file(filepath) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.disk().file(filepath);
        });
    }
    readDir(dirpath, options) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.disk().readDir(dirpath, options);
        });
    }
}
class StorageFileFacade {
    constructor(storage) {
        this.storage = storage;
    }
    exists(filepath, diskKey) {
        return __awaiter(this, void 0, void 0, function* () {
            return new StorageFileInstance(filepath, this.storage.disk(diskKey)).exists();
        });
    }
    isDir(filepath, diskKey) {
        return __awaiter(this, void 0, void 0, function* () {
            return new StorageFileInstance(filepath, this.storage.disk(diskKey)).isDir();
        });
    }
    isFile(filepath, diskKey) {
        return __awaiter(this, void 0, void 0, function* () {
            return new StorageFileInstance(filepath, this.storage.disk(diskKey)).isFile();
        });
    }
    delete(filepath, options, diskKey) {
        return __awaiter(this, void 0, void 0, function* () {
            return new StorageFileInstance(filepath, this.storage.disk(diskKey)).delete(options);
        });
    }
    extension(filepath, diskKey) {
        return __awaiter(this, void 0, void 0, function* () {
            return new StorageFileInstance(filepath, this.storage.disk(diskKey)).extension();
        });
    }
    mime(filepath, diskKey) {
        return __awaiter(this, void 0, void 0, function* () {
            return new StorageFileInstance(filepath, this.storage.disk(diskKey)).mime();
        });
    }
}
exports.Storage = new StorageFacade();
exports.StorageFile = new StorageFileFacade(exports.Storage);
