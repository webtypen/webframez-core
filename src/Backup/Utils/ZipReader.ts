import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { open, Entry, ZipFile } from "yauzl";

function ensureDirectory(directory: string): void {
    const parent = path.dirname(directory);
    if (parent !== directory) {
        ensureDirectory(parent);
    }

    try {
        fs.mkdirSync(directory, { mode: 0o700 });
    } catch (error: any) {
        if (error.code !== "EEXIST") {
            throw error;
        }
    }

    const info = fs.lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new Error(`Restore directory must not be a symlink or special file: ${directory}`);
    }
}

function entryTarget(root: string, entry: Entry) {
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

    const target = path.resolve(root, ...parts);
    if (!target.startsWith(root + path.sep)) {
        throw new Error(`ZIP entry escapes restore directory: ${name}`);
    }

    return { target, directory, mode: mode & 0o777 };
}

async function extractEntry(zip: ZipFile, entry: Entry, target: string, mode: number) {
    ensureDirectory(path.dirname(target));
    try {
        const existing = fs.lstatSync(target);
        if (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1) {
            throw new Error(`Restore destination is not a private regular file: ${target}`);
        }
    } catch (error: any) {
        if (error.code !== "ENOENT") {
            throw error;
        }
    }

    // Do not truncate until the opened inode is verified. O_NOFOLLOW rejects
    // destination symlinks; nlink prevents modifying files shared outside restore.
    const output = await fs.promises.open(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK, 0o600);
    try {
        const info = await output.stat();
        if (!info.isFile() || info.nlink !== 1) {
            throw new Error(`Restore destination is not a private regular file: ${target}`);
        }

        const input = await new Promise<Readable>((resolve, reject) => {
            zip.openReadStream(entry, (error, stream) => error ? reject(error) : resolve(stream!));
        });
        await output.truncate(0);
        for await (const chunk of input) {
            await output.writeFile(chunk);
        }
        await output.chmod(mode || 0o600);
    } finally {
        await output.close();
    }
}

/** Extract regular backup files only, sequentially, into an owner-controlled directory. */
export async function extractBackupZip(archive: string, destination: string): Promise<void> {
    const root = path.resolve(destination);
    ensureDirectory(root);
    const zip = await new Promise<ZipFile>((resolve, reject) => {
        open(archive, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, file) => error ? reject(error) : resolve(file!));
    });

    await new Promise<void>((resolve, reject) => {
        const seen = new Set<string>();
        let finished = false;
        const fail = (error: Error) => {
            if (!finished) {
                finished = true;
                zip.close();
                reject(error);
            }
        };

        zip.on("error", fail);
        zip.on("end", () => { finished = true; resolve(); });
        zip.on("entry", (entry: Entry) => {
            void (async () => {
                const { target, directory, mode } = entryTarget(root, entry);
                if (seen.has(target)) {
                    throw new Error(`Duplicate ZIP entry: ${entry.fileName}`);
                }
                seen.add(target);

                if (directory) {
                    ensureDirectory(target);
                } else {
                    await extractEntry(zip, entry, target, mode);
                }

                if (!finished) {
                    zip.readEntry();
                }
            })().catch(fail);
        });
        zip.readEntry();
    });
}
