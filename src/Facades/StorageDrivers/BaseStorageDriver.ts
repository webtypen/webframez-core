export type StorageDeleteOptions = {
    recursive?: boolean;
    force?: boolean;
};

export type StorageMkdirOptions = {
    recursive?: boolean;
};

export type StorageReadDirOptions = {
    onyFiles?: boolean;
    onlyDirs?: boolean;
};

export interface BaseStorageDriver {
    put(filepath: string, contents: string | Buffer): Promise<{ status: string; filepath: string; payload?: any }>;
    copy(filepath: string, target: string): Promise<{ status: string; filepath: string; origin_path: string; payload?: any }>;
    move(filepath: string, target: string): Promise<{ status: string; filepath: string; old_filepath: string; payload?: any }>;
    delete(
        filepath: string | string[],
        options?: StorageDeleteOptions
    ): Promise<{ status: string; filepath: string | string[]; payload?: any }>;
    mkdir(dirpath: string, options?: StorageMkdirOptions): Promise<{ status: string; dirpath: string; payload?: any }>;
    exists(filepath: string): Promise<boolean>;
    isDir(dirpath: string): Promise<boolean>;
    isFile(filepath: string): Promise<boolean>;
    extension(filepath: string): Promise<string | null>;
    mime(filepath: string): Promise<string | null>;
    readDir(dirpath: string, options?: StorageReadDirOptions): Promise<any[]>;
}
