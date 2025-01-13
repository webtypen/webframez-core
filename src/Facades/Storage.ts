import path from "path";
import { Config } from "../Config";
import { BaseStorageDriver, StorageDeleteOptions, StorageMkdirOptions, StorageReadDirOptions } from "./StorageDrivers/BaseStorageDriver";
import { LocalStorageDriver } from "./StorageDrivers/LocalStorageDriver";
import { StringFunctions } from "../Functions/StringFunctions";

class StorageDriverRegistyFacade {
    drivers: { [key: string]: any } = {};

    constructor() {
        this.drivers.local = LocalStorageDriver;
    }
}
export const StorageDriverRegisty = new StorageDriverRegistyFacade();

class StorageFileInstance {
    driver: BaseStorageDriver;
    filepath: string;

    constructor(filepath: string, driver: any) {
        this.driver = driver;
        this.filepath = filepath;
    }

    async exists() {
        return this.driver.exists(this.filepath);
    }

    async isDir() {
        return this.driver.isDir(this.filepath);
    }

    async isFile() {
        return this.driver.isFile(this.filepath);
    }

    async delete(options?: StorageDeleteOptions) {
        return this.driver.delete(this.filepath, options);
    }

    async extension(options?: StorageDeleteOptions) {
        return this.driver.delete(this.filepath, options);
    }

    async mime() {
        return this.driver.mime(this.filepath);
    }
}

class StorageDisk {
    diskKey: string;
    config: any;
    driver: BaseStorageDriver;

    constructor(key: string) {
        this.diskKey = key;
        this.config = Config.get("storage.storages." + this.diskKey);
        if (!this.config.driver) {
            throw new Error(`[STORAGE ERROR] Missing driver for disk '${this.diskKey}'.`);
        }

        if (!StorageDriverRegisty || !StorageDriverRegisty.drivers || !StorageDriverRegisty.drivers[this.config.driver]) {
            throw new Error(`[STORAGE ERROR] Invalid driver '${this.config.driver}' for disk '${this.diskKey}'.`);
        }
        this.driver = new StorageDriverRegisty.drivers[this.config.driver](this.config);
    }

    generateUploadFilepath() {
        const date = new Date();
        return path.join(
            this.config.uploadsDir && this.config.uploadsDir.trim() !== "" ? this.config.uploadsDir : "uploads",
            date.getFullYear().toString(),
            date.getMonth().toString() + "-" + date.getDate().toString(),
            date.valueOf().toString() + "_" + StringFunctions.random(24)
        );
    }

    async put(contents: string | Buffer, filepath?: string) {
        if (!this.driver) throw new Error(`[STORAGE ERROR] No driver configured for disk '${this.diskKey}'.`);
        return await this.driver.put(filepath && filepath.trim() !== "" ? filepath : this.generateUploadFilepath(), contents);
    }

    async copy(filepath: string, target: string) {
        if (!this.driver) throw new Error(`[STORAGE ERROR] No driver configured for disk '${this.diskKey}'.`);
        return await this.driver.copy(filepath, target);
    }

    async move(filepath: string, target: string) {
        if (!this.driver) throw new Error(`[STORAGE ERROR] No driver configured for disk '${this.diskKey}'.`);
        return await this.driver.move(filepath, target);
    }

    async delete(filepath: string | string[], options?: StorageDeleteOptions) {
        if (!this.driver) throw new Error(`[STORAGE ERROR] No driver configured for disk '${this.diskKey}'.`);
        return await this.driver.delete(filepath, options);
    }

    async mkdir(filepath: string, options?: StorageMkdirOptions) {
        if (!this.driver) throw new Error(`[STORAGE ERROR] No driver configured for disk '${this.diskKey}'.`);
        return await this.driver.mkdir(filepath, options);
    }

    async isDir(filepath: string) {
        if (!this.driver) throw new Error(`[STORAGE ERROR] No driver configured for disk '${this.diskKey}'.`);
        return await this.driver.mkdir(filepath);
    }

    async isFile(filepath: string) {
        if (!this.driver) throw new Error(`[STORAGE ERROR] No driver configured for disk '${this.diskKey}'.`);
        return await this.driver.mkdir(filepath);
    }

    async file(filepath: string) {
        if (!this.driver) throw new Error(`[STORAGE ERROR] No driver configured for disk '${this.diskKey}'.`);
        return new StorageFileInstance(filepath, this.driver);
    }

    async readDir(dirpath: string, options: StorageReadDirOptions) {
        if (!this.driver) throw new Error(`[STORAGE ERROR] No driver configured for disk '${this.diskKey}'.`);
        return await this.driver.readDir(dirpath, options);
    }
}

class StorageFacade {
    disks: { [key: string]: StorageDisk } = {};
    drivers: { [key: string]: any } = {};

    disk(diskKey?: string) {
        const key = diskKey ?? Config.get("storage.defaultStorage");
        if (this.disks[key]) {
            return this.disks[key];
        }

        this.disks[key] = new StorageDisk(key);
        return this.disks[key];
    }

    async put(contents: string | Buffer, filepath?: string) {
        return await this.disk().put(contents, filepath);
    }

    async copy(filepath: string, target: string) {
        return await this.disk().copy(filepath, target);
    }

    async move(filepath: string, target: string) {
        return await this.disk().move(filepath, target);
    }

    async delete(filepath: string | string[], options: StorageDeleteOptions) {
        return await this.disk().delete(filepath, options);
    }

    async mkdir(filepath: string, options: StorageMkdirOptions) {
        return await this.disk().mkdir(filepath, options);
    }

    async isDir(filepath: string) {
        return await this.disk().isDir(filepath);
    }

    async isFile(filepath: string) {
        return await this.disk().isFile(filepath);
    }

    async file(filepath: string) {
        return await this.disk().file(filepath);
    }

    async readDir(dirpath: string, options: StorageReadDirOptions) {
        return await this.disk().readDir(dirpath, options);
    }
}

class StorageFileFacade {
    storage: StorageFacade;

    constructor(storage: StorageFacade) {
        this.storage = storage;
    }

    async exists(filepath: string, diskKey?: string) {
        return new StorageFileInstance(filepath, this.storage.disk(diskKey)).exists();
    }

    async isDir(filepath: string, diskKey?: string) {
        return new StorageFileInstance(filepath, this.storage.disk(diskKey)).isDir();
    }

    async isFile(filepath: string, diskKey?: string) {
        return new StorageFileInstance(filepath, this.storage.disk(diskKey)).isFile();
    }

    async delete(filepath: string, options?: StorageDeleteOptions, diskKey?: string) {
        return new StorageFileInstance(filepath, this.storage.disk(diskKey)).delete(options);
    }

    async extension(filepath: string, diskKey?: string) {
        return new StorageFileInstance(filepath, this.storage.disk(diskKey)).extension();
    }

    async mime(filepath: string, diskKey?: string) {
        return new StorageFileInstance(filepath, this.storage.disk(diskKey)).mime();
    }
}

export const Storage = new StorageFacade();
export const StorageFile = new StorageFileFacade(Storage);
