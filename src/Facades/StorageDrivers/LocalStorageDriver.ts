import fs from "fs";
import path from "path";
import mime from "mime-types";
import Busboy from "busboy";
import { BaseStorageDriver, StorageDeleteOptions, StorageMkdirOptions, StorageReadDirOptions } from "./BaseStorageDriver";
import { storageDir } from "../../Functions/FileFunctions";
import { Request } from "../../Router/Request";

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

    async put(filepath: string, contents: string | Buffer, payload?: any) {
        const p = this.path(filepath);
        // @ts-ignore
        fs.writeFileSync(p, contents);

        if (this.config.fileHandlers) {
            const keys = Object.keys(this.config.fileHandlers);
            const mime = await this.mime(p);
            if (mime) {
                const configKey = keys.find((key) => {
                    if (key.includes("*")) {
                        const regex = new RegExp("^" + key.replace("*", ".+") + "$");
                        return regex.test(mime);
                    }
                    return key === mime;
                });

                if (configKey && this.config.fileHandlers[configKey]?.handlers) {
                    for (let handlerKey in this.config.fileHandlers[configKey].handlers) {
                        const handler = this.config.fileHandlers[configKey].handlers[handlerKey];
                        if (typeof handler === "function") {
                            await handler(p, contents, payload);
                        }
                    }
                }
            }
        }

        return {
            status: "success",
            filepath: filepath,
            payload: payload,
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

    async upload(req: Request, options: { storagePath: string; storageFilename: string; payload?: any }) {
        const busboy = Busboy({ headers: req.headers });
        const dir = path.join(storageDir(), options.storagePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        let hasSuccess = false;
        const promises = [
            new Promise((resolve) => {
                if (!req.message) {
                    throw Error("Missing IncomingMessage ...");
                }

                let fileOptions: any = null;
                let filepath: any = null;
                busboy.on("file", async (fieldname: any, file: any, options: any) => {
                    if (fileOptions === null && options) {
                        fileOptions = options;
                    }

                    filepath = path.join(dir, options.storageFilename);
                    const writeStream = fs.createWriteStream(filepath);
                    file.pipe(writeStream);
                });

                busboy.on("error", (error: any, error2: any) => {
                    console.error("Busboy error:", error);
                    resolve(false);
                });

                busboy.on("finish", async () => {
                    if (this.config.fileHandlers) {
                        const keys = Object.keys(this.config.fileHandlers);
                        const mime = await this.mime(filepath);
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
                                    await handler(filepath, fs.readFileSync(filepath), options.payload);
                                }
                            }
                        }
                    }

                    hasSuccess = true;
                    resolve(true);
                });

                req.message.pipe(busboy);
            }),
        ];
        await Promise.all(promises);

        return hasSuccess;
    }
}
