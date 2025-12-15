/// <reference types="node" />
import { BaseStorageDriver, StorageDeleteOptions, StorageMkdirOptions, StorageReadDirOptions } from "./BaseStorageDriver";
import { Request } from "../../Router/Request";
export declare class LocalStorageDriver implements BaseStorageDriver {
    config: any;
    basepath: string;
    constructor(conf: any);
    path(...args: string[]): string;
    put(filepath: string, contents: string | Buffer, payload?: any): Promise<{
        status: string;
        filepath: string;
        payload: any;
    }>;
    copy(filepath: string, target: string): Promise<{
        status: string;
        filepath: string;
        origin_path: string;
        payload: {};
    }>;
    move(filepath: string, target: string): Promise<{
        status: string;
        filepath: string;
        old_filepath: string;
        payload: {};
    }>;
    delete(filepath: string | string[], options?: StorageDeleteOptions): Promise<{
        status: string;
        filepath: string | string[];
        payload: {};
    }>;
    mkdir(dirpath: string, options?: StorageMkdirOptions): Promise<{
        status: string;
        dirpath: string;
        payload: {};
    }>;
    exists(filepath: string): Promise<boolean>;
    isDir(dirpath: string): Promise<boolean>;
    isFile(filepath: string): Promise<boolean>;
    extension(filepath: string): Promise<string | null>;
    mime(filepath: string): Promise<string | null>;
    readDir(dirpath: string, options?: StorageReadDirOptions): Promise<string[]>;
    upload(req: Request, options: {
        storagePath: string;
        storageFilename: string;
        payload?: any;
    }): Promise<boolean>;
}
