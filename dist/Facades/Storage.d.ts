/// <reference types="node" />
import { BaseStorageDriver, StorageDeleteOptions, StorageMkdirOptions, StorageReadDirOptions } from "./StorageDrivers/BaseStorageDriver";
declare class StorageDriverRegistyFacade {
    drivers: {
        [key: string]: any;
    };
    constructor();
}
export declare const StorageDriverRegisty: StorageDriverRegistyFacade;
declare class StorageFileInstance {
    driver: BaseStorageDriver;
    filepath: string;
    constructor(filepath: string, driver: any);
    exists(): Promise<boolean>;
    isDir(): Promise<boolean>;
    isFile(): Promise<boolean>;
    delete(options?: StorageDeleteOptions): Promise<{
        status: string;
        filepath: string | string[];
        payload?: any;
    }>;
    extension(options?: StorageDeleteOptions): Promise<{
        status: string;
        filepath: string | string[];
        payload?: any;
    }>;
    mime(): Promise<string | null>;
}
declare class StorageDisk {
    diskKey: string;
    config: any;
    driver: BaseStorageDriver;
    constructor(key: string);
    generateUploadFilepath(): string;
    put(contents: string | Buffer, filepath?: string): Promise<{
        status: string;
        filepath: string;
        payload?: any;
    }>;
    copy(filepath: string, target: string): Promise<{
        status: string;
        filepath: string;
        origin_path: string;
        payload?: any;
    }>;
    move(filepath: string, target: string): Promise<{
        status: string;
        filepath: string;
        old_filepath: string;
        payload?: any;
    }>;
    delete(filepath: string | string[], options?: StorageDeleteOptions): Promise<{
        status: string;
        filepath: string | string[];
        payload?: any;
    }>;
    mkdir(filepath: string, options?: StorageMkdirOptions): Promise<{
        status: string;
        dirpath: string;
        payload?: any;
    }>;
    isDir(filepath: string): Promise<{
        status: string;
        dirpath: string;
        payload?: any;
    }>;
    isFile(filepath: string): Promise<{
        status: string;
        dirpath: string;
        payload?: any;
    }>;
    file(filepath: string): Promise<StorageFileInstance>;
    readDir(dirpath: string, options: StorageReadDirOptions): Promise<any[]>;
}
declare class StorageFacade {
    disks: {
        [key: string]: StorageDisk;
    };
    drivers: {
        [key: string]: any;
    };
    disk(diskKey?: string): StorageDisk;
    put(contents: string | Buffer, filepath?: string): Promise<{
        status: string;
        filepath: string;
        payload?: any;
    }>;
    copy(filepath: string, target: string): Promise<{
        status: string;
        filepath: string;
        origin_path: string;
        payload?: any;
    }>;
    move(filepath: string, target: string): Promise<{
        status: string;
        filepath: string;
        old_filepath: string;
        payload?: any;
    }>;
    delete(filepath: string | string[], options: StorageDeleteOptions): Promise<{
        status: string;
        filepath: string | string[];
        payload?: any;
    }>;
    mkdir(filepath: string, options: StorageMkdirOptions): Promise<{
        status: string;
        dirpath: string;
        payload?: any;
    }>;
    isDir(filepath: string): Promise<{
        status: string;
        dirpath: string;
        payload?: any;
    }>;
    isFile(filepath: string): Promise<{
        status: string;
        dirpath: string;
        payload?: any;
    }>;
    file(filepath: string): Promise<StorageFileInstance>;
    readDir(dirpath: string, options: StorageReadDirOptions): Promise<any[]>;
}
declare class StorageFileFacade {
    storage: StorageFacade;
    constructor(storage: StorageFacade);
    exists(filepath: string, diskKey?: string): Promise<boolean>;
    isDir(filepath: string, diskKey?: string): Promise<boolean>;
    isFile(filepath: string, diskKey?: string): Promise<boolean>;
    delete(filepath: string, options?: StorageDeleteOptions, diskKey?: string): Promise<{
        status: string;
        filepath: string | string[];
        payload?: any;
    }>;
    extension(filepath: string, diskKey?: string): Promise<{
        status: string;
        filepath: string | string[];
        payload?: any;
    }>;
    mime(filepath: string, diskKey?: string): Promise<string | null>;
}
export declare const Storage: StorageFacade;
export declare const StorageFile: StorageFileFacade;
export {};
