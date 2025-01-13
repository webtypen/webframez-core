import fs from "fs";
import path from "path";
import mime from "mime-types";
import { BaseStorageDriver, StorageDeleteOptions, StorageMkdirOptions, StorageReadDirOptions } from "./BaseStorageDriver";
import { storageDir } from "../../Functions/FileFunctions";

export class LocalStorageDriver implements BaseStorageDriver {
    config: any;
    basepath: string;

    constructor(conf: any) {
        this.config = conf;
        this.basepath = conf.basepath && conf.basepath.trim() !== "" ? conf.basepath : storageDir();
    }

    path(...args: string[]) {
        return path.join(this.basepath, ...args);
    }

    async put(filepath: string, contents: string | Buffer) {
        fs.writeFileSync(this.path(filepath), contents);

        return {
            status: "success",
            filepath: filepath,
            payload: {},
        };
    }

    async copy(filepath: string, target: string) {
        fs.cpSync(this.path(filepath), target);

        return {
            status: "success",
            filepath: target,
            origin_path: filepath,
            payload: {},
        };
    }

    async move(filepath: string, target: string) {
        fs.renameSync(this.path(filepath), target);

        return {
            status: "success",
            filepath: target,
            old_filepath: filepath,
            payload: {},
        };
    }

    async delete(filepath: string | string[], options?: StorageDeleteOptions) {
        if (Array.isArray(filepath)) {
            for (let el of filepath) {
                if (options?.recursive) {
                    fs.rmSync(this.path(el), { recursive: true, force: options.force ? true : false });
                } else {
                    fs.rmSync(this.path(el), { recursive: true, force: options?.force ? true : false });
                }
            }
        } else {
            fs.rmSync(this.path(filepath), { recursive: options?.recursive ? true : false, force: options?.force ? true : false });
        }

        return {
            status: "success",
            filepath: filepath,
            payload: {},
        };
    }

    async mkdir(dirpath: string, options?: StorageMkdirOptions) {
        fs.mkdirSync(this.path(dirpath));

        return {
            status: "success",
            dirpath: dirpath,
            payload: {},
        };
    }

    async exists(filepath: string) {
        return fs.existsSync(this.path(filepath));
    }

    async isDir(dirpath: string) {
        const stats = fs.lstatSync(this.path(dirpath));
        return stats.isDirectory();
    }

    async isFile(filepath: string) {
        const stats = fs.lstatSync(this.path(filepath));
        return stats.isFile();
    }

    async extension(filepath: string) {
        const temp = filepath.indexOf(".") > 0 ? filepath.substring(filepath.lastIndexOf(".") + 1) : null;
        return temp && temp.trim() !== "" ? temp.trim() : null;
    }

    async mime(filepath: string) {
        const temp = mime.lookup(this.path(filepath));
        return temp ? temp : null;
    }

    async readDir(dirpath: string, options?: StorageReadDirOptions) {
        const entries = fs.readdirSync(this.path(dirpath));
        return entries && entries.length > 0 ? entries : [];
    }
}
