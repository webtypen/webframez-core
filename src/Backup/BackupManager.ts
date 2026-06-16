import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import extractZip from "extract-zip";
import { Config } from "../Config";
import { DBConnection } from "../Database/DBConnection";
import {
    BackupArtifact,
    BackupCleanupOptions,
    BackupCleanupResult,
    BackupConfig,
    BackupDatabaseSourceConfig,
    BackupFileIndexEntry,
    BackupFileSourceConfig,
    BackupOutputConfig,
    BackupOutputResult,
    BackupRetentionConfig,
    BackupRestorePoint,
    BackupRestoreResult,
    BackupRunOptions,
    BackupRunManifest,
    BackupRunResult,
    BackupTypeConfig,
} from "./BackupTypes";
import { BackupOutputDrivers } from "./BackupOutputDrivers";
import { backupTimestampId, formatBackupFilename, normalizeBackupPath, resolveProjectPath } from "./Utils/BackupPathUtils";
import { matchesBackupGlobs } from "./Utils/GlobMatcher";
import { createZipFileFromDirectory } from "./Utils/ZipWriter";
import { matchesAutomationExecutions } from "../Queue/AutomationSchedule";

type ResolvedBackupTypeConfig = BackupTypeConfig & {
    workDir: string;
    outputDir: string;
    filename: string;
    zip: boolean;
    zipDriver: "auto" | "system" | "node";
    zipCompressionLevel?: number;
    cleanupWorkDir: boolean;
    retention?: BackupRetentionConfig;
    outputs: BackupOutputConfig[];
};

function statSize(filepath: string) {
    const stats = fs.statSync(filepath);
    if (!stats.isDirectory()) {
        return stats.size;
    }

    let size = 0;
    for (const entry of fs.readdirSync(filepath)) {
        size += statSize(path.join(filepath, entry));
    }
    return size;
}

function mergeRetention(
    defaults?: BackupRetentionConfig,
    typeRetention?: BackupRetentionConfig,
    outputRetention?: BackupRetentionConfig,
): BackupRetentionConfig | undefined {
    const merged = {
        ...(defaults || {}),
        ...(typeRetention || {}),
        ...(outputRetention || {}),
    };
    return Object.keys(merged).length > 0 ? merged : undefined;
}

function normalizeArray<T>(value: T[] | undefined) {
    return value && Array.isArray(value) ? value : [];
}

function safeReadJson(filepath: string) {
    try {
        return JSON.parse(fs.readFileSync(filepath, "utf-8"));
    } catch (e) {
        return null;
    }
}

function sha256File(filepath: string) {
    const hash = crypto.createHash("sha256");
    hash.update(fs.readFileSync(filepath));
    return hash.digest("hex");
}

function restorePointCreatedAt(point: BackupRestorePoint) {
    return point.createdAt instanceof Date ? point.createdAt : new Date(point.createdAt);
}

function normalizeManifest(input: any, entry?: any): BackupRunManifest | any | null {
    if (!input) {
        return null;
    }

    const manifest = input.backupManifest || input;
    const backupKey = manifest.backupKey || input.key || entry?.backupKey;
    const backupId = manifest.backupId || input.id || entry?.backupId;
    if (!backupKey || !backupId) {
        return null;
    }

    return {
        ...manifest,
        backupKey: backupKey,
        backupId: backupId,
        kind: manifest.kind || input.kind || "normal",
        chainId: manifest.chainId || input.chainId,
        parentBackupId: manifest.parentBackupId || input.parentBackupId,
        createdAt: manifest.createdAt || input.startedAt || entry?.createdAt?.toISOString?.() || new Date().toISOString(),
        artifact: manifest.artifact || input.artifact?.filename || input.artifact || entry?.filename,
        artifactType: manifest.artifactType || input.artifact?.type || "zip",
        files: {
            upserted: manifest.files?.upserted || [],
            deleted: manifest.files?.deleted || [],
            fileIndex: manifest.files?.fileIndex || {},
        },
    };
}

function assertInside(targetRoot: string, relative: string) {
    const target = path.resolve(targetRoot, relative);
    const root = path.resolve(targetRoot);
    if (target !== root && !target.startsWith(root + path.sep)) {
        throw new Error(`Refusing to restore unsafe path '${relative}'.`);
    }
    return target;
}

export class BackupManager {
    private log(options: BackupRunOptions | undefined, message: string, payload?: any) {
        if (options?.silent || !options?.log) {
            return;
        }
        options.log(message, payload);
    }

    private logInterval(options: BackupRunOptions | undefined) {
        return options?.logInterval && options.logInterval > 0 ? options.logInterval : 1000;
    }

    getConfig(): BackupConfig {
        const config = Config.get("backup");
        if (!config || typeof config !== "object") {
            throw new Error("Missing backup configuration at config.backup.");
        }
        return config;
    }

    listTypes() {
        const config = this.getConfig();
        return Object.keys(config.types || {}).map((key) => ({
            key: key,
            config: this.resolveType(key),
        }));
    }

    resolveType(key: string): ResolvedBackupTypeConfig {
        const config = this.getConfig();
        const backupType = config.types && config.types[key] ? config.types[key] : null;
        if (!backupType) {
            throw new Error(`Backup type '${key}' is not defined.`);
        }

        const defaults = config.defaults || {};
        const outputDir = backupType.outputDir || defaults.outputDir || "storage/backups";
        return {
            ...defaults,
            ...backupType,
            workDir: backupType.workDir || defaults.workDir || "storage/backups/.work",
            outputDir: outputDir,
            filename: backupType.filename || defaults.filename || "{key}_{date}_{time}",
            zip: backupType.zip !== undefined ? backupType.zip : defaults.zip !== undefined ? defaults.zip : true,
            zipDriver: backupType.zipDriver || defaults.zipDriver || "auto",
            zipCompressionLevel:
                backupType.zipCompressionLevel !== undefined ? backupType.zipCompressionLevel : defaults.zipCompressionLevel,
            cleanupWorkDir:
                backupType.cleanupWorkDir !== undefined
                    ? backupType.cleanupWorkDir
                    : defaults.cleanupWorkDir !== undefined
                    ? defaults.cleanupWorkDir
                    : true,
            retention: mergeRetention(defaults.retention, backupType.retention),
            outputs:
                backupType.outputs && backupType.outputs.length > 0
                    ? backupType.outputs
                    : [
                          {
                              driver: "local",
                              path: outputDir,
                          },
                      ],
        };
    }

    getAutomationEntries(workerKey?: string) {
        const config = this.getConfig();
        const out: any[] = [];

        for (const key of Object.keys(config.types || {})) {
            const backupType = this.resolveType(key);
            if (!backupType.automation || !backupType.automation.executions || backupType.is_active === false) {
                continue;
            }

            if (workerKey && backupType.automation.worker && backupType.automation.worker !== workerKey) {
                continue;
            }

            if (workerKey && !backupType.automation.worker) {
                continue;
            }

            out.push({
                jobclass: "BackupRunJob",
                identifier: key,
                executions: backupType.automation.executions,
                priority: backupType.automation.priority || 0,
                data: backupType.automation.data || {},
                payload: {
                    backupKey: key,
                },
            });
        }

        return out;
    }

    private ensureActive(key: string, backupType: ResolvedBackupTypeConfig) {
        if (backupType.is_active === false) {
            throw new Error(`Backup type '${key}' is disabled.`);
        }
    }

    private resolveOutputs(backupType: ResolvedBackupTypeConfig, channels?: string[]) {
        if (!channels || channels.length < 1) {
            return backupType.outputs;
        }

        return backupType.outputs.filter((output) => {
            const key = output.key || output.name || output.driver;
            return channels.includes(key) || channels.includes(output.driver);
        });
    }

    private collectFilesFromSource(source: BackupFileSourceConfig, options?: BackupRunOptions) {
        const sourcePath = resolveProjectPath(source.from);
        if (!fs.existsSync(sourcePath)) {
            if (source.optional) {
                return [];
            }
            throw new Error(`Backup file source does not exist: ${source.from}`);
        }

        const sourceStats = fs.statSync(sourcePath);
        const files: Array<{ source: string; relative: string; target: string; size: number; mtimeMs: number }> = [];
        const sourceBase = sourceStats.isDirectory() ? sourcePath : path.dirname(sourcePath);
        const toBase = normalizeBackupPath(
            source.to !== undefined ? source.to : sourceStats.isDirectory() ? path.basename(source.from) : "",
        );
        const interval = this.logInterval(options);
        let visited = 0;
        let included = 0;

        const addFile = (filepath: string) => {
            visited += 1;
            const relative = normalizeBackupPath(path.relative(sourceBase, filepath));
            if (!matchesBackupGlobs(relative, source.include, source.exclude)) {
                if (visited % interval === 0) {
                    this.log(options, `Scanned ${visited} file(s), included ${included}`);
                }
                return;
            }

            included += 1;
            const stats = fs.statSync(filepath);
            files.push({
                source: filepath,
                relative: relative,
                target: normalizeBackupPath(path.join(toBase, relative)),
                size: stats.size,
                mtimeMs: stats.mtimeMs,
            });
            if (visited % interval === 0) {
                this.log(options, `Scanned ${visited} file(s), included ${included}`);
            }
        };

        const walk = (dir: string) => {
            for (const entry of fs.readdirSync(dir)) {
                const filepath = path.join(dir, entry);
                const stats = fs.statSync(filepath);
                if (stats.isDirectory()) {
                    walk(filepath);
                } else if (stats.isFile()) {
                    addFile(filepath);
                }
            }
        };

        if (sourceStats.isDirectory()) {
            walk(sourcePath);
        } else if (sourceStats.isFile()) {
            addFile(sourcePath);
        }

        return files;
    }

    private copyFiles(files: Array<{ source: string; target: string; size: number }>, contentDir: string, options?: BackupRunOptions) {
        const interval = this.logInterval(options);
        for (let index = 0; index < files.length; index += 1) {
            const file = files[index];
            const targetPath = path.join(contentDir, file.target);
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            fs.copyFileSync(file.source, targetPath);
            const count = index + 1;
            if (count % interval === 0 || count === files.length) {
                this.log(options, `Copied ${count}/${files.length} file(s)`);
            }
        }
    }

    private buildFileIndex(
        files: Array<{ source: string; target: string; size: number; mtimeMs: number }>,
        checksum?: boolean,
    ) {
        const index: { [path: string]: BackupFileIndexEntry } = {};
        for (const file of files) {
            index[file.target] = {
                path: file.target,
                size: file.size,
                mtimeMs: Math.round(file.mtimeMs),
                ...(checksum ? { checksum: sha256File(file.source) } : {}),
            };
        }
        return index;
    }

    private fileIndexChanged(current: BackupFileIndexEntry, previous?: BackupFileIndexEntry, checksum?: boolean) {
        if (!previous) {
            return true;
        }
        if (current.size !== previous.size) {
            return true;
        }
        if (checksum) {
            return current.checksum !== previous.checksum;
        }
        return Math.round(current.mtimeMs || 0) !== Math.round(previous.mtimeMs || 0);
    }

    private incrementalEnabled(backupType: ResolvedBackupTypeConfig) {
        return backupType.incremental?.enabled === true;
    }

    private assertIncrementalSupported(key: string, backupType: ResolvedBackupTypeConfig) {
        if (!this.incrementalEnabled(backupType)) {
            return;
        }
        if (!backupType.zip) {
            throw new Error(`Incremental backup '${key}' requires zip=true.`);
        }
        if (normalizeArray(backupType.databases).length > 0) {
            throw new Error(`Incremental backup '${key}' supports file-only backup types in v1.`);
        }
    }

    private chooseOutputForRead(backupType: ResolvedBackupTypeConfig, channels?: string[]) {
        const outputs = this.resolveOutputs(backupType, channels);
        if (outputs.length < 1) {
            return null;
        }
        return outputs[0];
    }

    private async listRestorePointsForOutput(key: string, output: BackupOutputConfig) {
        const driver = BackupOutputDrivers.get(output.driver);
        if (!driver.listArtifacts || !driver.readManifest) {
            return [];
        }

        const entries = await driver.listArtifacts(output, {
            backupKey: key,
            backupId: backupTimestampId(),
            log: () => null,
        });
        const points: BackupRestorePoint[] = [];
        for (const entry of entries) {
            const rawManifest = await driver.readManifest(output, entry, {
                backupKey: key,
                backupId: backupTimestampId(),
                log: () => null,
            });
            const manifest = normalizeManifest(rawManifest, entry);
            if (!manifest || manifest.backupKey !== key) {
                continue;
            }
            points.push({
                ...entry,
                backupKey: manifest.backupKey,
                backupId: manifest.backupId,
                kind: manifest.kind || "normal",
                chainId: manifest.chainId,
                parentBackupId: manifest.parentBackupId,
                createdAt: new Date(manifest.createdAt || entry.createdAt),
                manifest: manifest,
            });
        }
        return points.sort((a, b) => restorePointCreatedAt(b).getTime() - restorePointCreatedAt(a).getTime());
    }

    async listRestorePoints(key: string, options?: { channels?: string[] }): Promise<BackupRestorePoint[]> {
        const backupType = this.resolveType(key);
        const output = this.chooseOutputForRead(backupType, options?.channels);
        if (!output) {
            throw new Error(`Backup type '${key}' has no matching output channels.`);
        }
        return this.listRestorePointsForOutput(key, output);
    }

    private isFullIncrementalRun(
        backupType: ResolvedBackupTypeConfig,
        previousPoint: BackupRestorePoint | null,
        options?: BackupRunOptions,
    ) {
        if (options?.full) {
            return true;
        }
        if (!previousPoint) {
            return true;
        }
        return matchesAutomationExecutions(backupType.incremental?.fullExecutions, options?.scheduledAt);
    }

    private async buildBackupManifest(
        key: string,
        id: string,
        createdAt: Date,
        artifactFilename: string,
        backupType: ResolvedBackupTypeConfig,
        fileEntries: Array<{ source: string; target: string; size: number; mtimeMs: number }>,
        options?: BackupRunOptions,
    ) {
        const currentIndex = this.buildFileIndex(fileEntries, backupType.incremental?.checksum === true);
        const currentByTarget = new Map(fileEntries.map((entry) => [entry.target, entry]));
        if (!this.incrementalEnabled(backupType)) {
            return {
                manifest: {
                    backupKey: key,
                    backupId: id,
                    kind: "normal" as const,
                    createdAt: createdAt.toISOString(),
                    artifact: artifactFilename,
                    artifactType: backupType.zip ? ("zip" as const) : ("directory" as const),
                    files: {
                        upserted: fileEntries.map((entry) => ({ ...currentIndex[entry.target], source: entry.source })),
                        deleted: [],
                        fileIndex: currentIndex,
                    },
                },
                filesToCopy: fileEntries,
                previousPoint: null as BackupRestorePoint | null,
            };
        }

        const stateOutput = this.chooseOutputForRead(backupType, options?.channels);
        const restorePoints = stateOutput ? await this.listRestorePointsForOutput(key, stateOutput) : [];
        const previousPoint = restorePoints.find((point) => point.kind === "full" || point.kind === "incremental") || null;
        const full = this.isFullIncrementalRun(backupType, previousPoint, options);
        const previousIndex = previousPoint?.manifest?.files?.fileIndex || {};
        const upserted = Object.values(currentIndex)
            .filter((entry) => full || this.fileIndexChanged(entry, previousIndex[entry.path], backupType.incremental?.checksum === true))
            .map((entry) => ({ ...entry, source: currentByTarget.get(entry.path)?.source }));
        const deleted = full
            ? []
            : Object.keys(previousIndex)
                  .filter((entryPath) => !currentIndex[entryPath])
                  .sort();
        const upsertedPaths = new Set(upserted.map((entry) => entry.path));
        const filesToCopy = full ? fileEntries : fileEntries.filter((entry) => upsertedPaths.has(entry.target));
        const chainId = full ? id : previousPoint?.chainId || previousPoint?.backupId || id;

        return {
            manifest: {
                backupKey: key,
                backupId: id,
                kind: full ? ("full" as const) : ("incremental" as const),
                chainId: chainId,
                parentBackupId: full ? undefined : previousPoint?.backupId,
                createdAt: createdAt.toISOString(),
                artifact: artifactFilename,
                artifactType: "zip" as const,
                files: {
                    upserted: upserted,
                    deleted: deleted,
                    fileIndex: currentIndex,
                },
            },
            filesToCopy: filesToCopy,
            previousPoint: previousPoint,
        };
    }

    private writeContentManifest(contentDir: string, manifest: BackupRunManifest) {
        const manifestPath = path.join(contentDir, ".webframez-backup", "manifest.json");
        fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4), "utf-8");
    }

    private async backupDatabase(
        source: BackupDatabaseSourceConfig,
        contentDir: string,
        context: { backupKey: string; backupId: string; log?: (message: string, payload?: any) => void },
    ) {
        const to = normalizeBackupPath(source.to || `database/${source.connection || "default"}`);
        const targetDir = path.join(contentDir, to);
        fs.mkdirSync(targetDir, { recursive: true });

        const connection = await DBConnection.getConnection(source.connection);
        if (!connection || !connection.driver || typeof connection.driver.backup !== "function") {
            throw new Error(
                `Database driver for connection '${source.connection || "default"}' does not implement backup(...).`,
            );
        }

        const payload = await connection.driver.backup(connection.client, {
            connection: source.connection,
            targetDir: targetDir,
            to: to,
            options: source.options || {},
            backupKey: context.backupKey,
            backupId: context.backupId,
            log: context.log,
        });

        return {
            connection: source.connection,
            to: to,
            payload: payload,
        };
    }

    private buildArtifact(
        key: string,
        backupType: ResolvedBackupTypeConfig,
        workRunDir: string,
        contentDir: string,
        date: Date,
        id: string,
        options?: BackupRunOptions,
    ): BackupArtifact {
        const filename = formatBackupFilename(backupType.filename, { key, date, id });
        if (backupType.zip) {
            const zipPath = path.join(workRunDir, `${filename}.zip`);
            this.log(options, `Creating ZIP artifact '${path.basename(zipPath)}'`, {
                driver: backupType.zipDriver,
                compressionLevel: backupType.zipCompressionLevel,
            });
            const zipResult = createZipFileFromDirectory(zipPath, contentDir, {
                driver: backupType.zipDriver,
                compressionLevel: backupType.zipCompressionLevel,
            });
            this.log(options, `ZIP artifact created using ${zipResult.driver} zip`, {
                path: zipPath,
            });
            return {
                path: zipPath,
                filename: path.basename(zipPath),
                size: fs.statSync(zipPath).size,
                type: "zip",
            };
        }

        return {
            path: contentDir,
            filename: filename,
            size: statSize(contentDir),
            type: "directory",
        };
    }

    async run(key: string, options?: BackupRunOptions): Promise<BackupRunResult> {
        const backupType = this.resolveType(key);
        this.ensureActive(key, backupType);
        this.assertIncrementalSupported(key, backupType);
        this.log(options, `Starting backup '${key}'`);

        const now = new Date();
        const id = backupTimestampId(now);
        const filename = formatBackupFilename(backupType.filename, { key, date: now, id });
        const artifactFilename = backupType.zip ? `${filename}.zip` : filename;
        const workRoot = resolveProjectPath(backupType.workDir);
        const workRunDir = path.join(workRoot, `${key}_${id}`);
        const contentDir = path.join(workRunDir, "content");
        const outputs = this.resolveOutputs(backupType, options?.channels);
        if (outputs.length < 1) {
            throw new Error(`Backup type '${key}' has no matching output channels.`);
        }

        const result: BackupRunResult = {
            key: key,
            id: id,
            startedAt: now.toISOString(),
            endedAt: now.toISOString(),
            dryRun: options?.dryRun === true,
            outputs: [],
            cleanup: [],
            files: [],
            databases: [],
        };

        this.log(options, "Collecting file sources");
        const fileEntries = normalizeArray(backupType.files).flatMap((source) => this.collectFilesFromSource(source, options));
        const fileSize = fileEntries.reduce((sum, entry) => sum + entry.size, 0);
        this.log(options, `Collected ${fileEntries.length} file(s)`, { size: fileSize });
        const incremental = await this.buildBackupManifest(key, id, now, artifactFilename, backupType, fileEntries, options);
        result.kind = incremental.manifest.kind;
        result.chainId = incremental.manifest.chainId;
        result.parentBackupId = incremental.manifest.parentBackupId;
        result.backupManifest = incremental.manifest;
        result.files = incremental.filesToCopy.map((entry) => ({
            from: entry.source,
            to: entry.target,
            size: entry.size,
        }));
        if (this.incrementalEnabled(backupType)) {
            this.log(options, `Prepared ${incremental.manifest.kind} backup`, {
                upserted: incremental.manifest.files.upserted.length,
                deleted: incremental.manifest.files.deleted.length,
                parentBackupId: incremental.manifest.parentBackupId,
            });
        }

        if (options?.dryRun) {
            this.log(options, "Dry run enabled; skipping artifact and output writes");
            result.outputs = outputs.map((output) => ({
                driver: output.driver,
                status: "skipped",
                path: output.path,
                payload: { dryRun: true },
            }));
            result.databases = normalizeArray(backupType.databases).map((source) => ({
                connection: source.connection,
                to: normalizeBackupPath(source.to || `database/${source.connection || "default"}`),
            }));
            result.endedAt = new Date().toISOString();
            return result;
        }

        fs.rmSync(workRunDir, { recursive: true, force: true });
        fs.mkdirSync(contentDir, { recursive: true });

        try {
            this.log(options, `Copying ${incremental.filesToCopy.length} file(s) into backup work directory`);
            this.copyFiles(incremental.filesToCopy, contentDir, options);
            this.writeContentManifest(contentDir, incremental.manifest);
            this.log(options, "File copy finished");

            for (const source of normalizeArray(backupType.databases)) {
                this.log(options, `Backing up database '${source.connection || "default"}'`);
                result.databases.push(
                    await this.backupDatabase(source, contentDir, {
                        backupKey: key,
                        backupId: id,
                        log: (message: string, payload?: any) => this.log(options, message, payload),
                    }),
                );
                this.log(options, `Database '${source.connection || "default"}' backup finished`);
            }

            result.artifact = this.buildArtifact(key, backupType, workRunDir, contentDir, now, id, options);
            result.artifact.manifest = incremental.manifest;
            const manifestPath = path.join(workRunDir, `${result.artifact.filename}.run-manifest.json`);
            result.manifestPath = manifestPath;

            for (const output of outputs) {
                const retention = mergeRetention(this.getConfig().defaults?.retention, backupType.retention, output.retention);
                const driver = BackupOutputDrivers.get(output.driver);
                this.log(options, `Writing artifact to '${output.driver}' output`, {
                    path: output.path,
                    folderPath: output.folderPath,
                });
                const outputResult: BackupOutputResult = await driver.write(result.artifact, output, {
                    backupKey: key,
                    backupId: id,
                    retention: retention,
                    log: (message: string, payload?: any) => this.log(options, message, payload),
                });
                result.outputs.push(outputResult);
                this.log(options, `Output '${output.driver}' finished with status '${outputResult.status}'`, {
                    path: outputResult.path,
                    error: outputResult.error,
                });

                if (outputResult.status === "success" && retention?.runAfterBackup) {
                    this.log(options, `Running cleanup for '${output.driver}' output`);
                    result.cleanup.push(
                        await driver.cleanup(
                            output,
                            {
                                backupKey: key,
                                backupId: id,
                                retention: retention,
                                log: (message: string, payload?: any) => this.log(options, message, payload),
                            },
                            { dryRun: false },
                        ),
                    );
                    this.log(options, `Cleanup for '${output.driver}' output finished`, {
                        deleted: result.cleanup[result.cleanup.length - 1]?.deleted.length || 0,
                    });
                }
            }

            result.endedAt = new Date().toISOString();
            const outputManifestPath = result.outputs.find((output) => output.payload && output.payload.manifestPath)?.payload
                .manifestPath;
            if (outputManifestPath) {
                result.manifestPath = outputManifestPath;
            }

            const manifestJson = JSON.stringify(result, null, 4);
            fs.writeFileSync(manifestPath, manifestJson, "utf-8");
            for (const output of result.outputs) {
                if (output.payload && output.payload.manifestPath) {
                    fs.writeFileSync(output.payload.manifestPath, manifestJson, "utf-8");
                }
            }
            this.log(options, `Backup '${key}' finished`);
            return result;
        } finally {
            if (backupType.cleanupWorkDir) {
                this.log(options, "Cleaning backup work directory");
                fs.rmSync(workRunDir, { recursive: true, force: true });
            }
        }
    }

    private async downloadRestoreArtifact(
        output: BackupOutputConfig,
        point: BackupRestorePoint,
        targetPath: string,
        key: string,
    ) {
        const driver = BackupOutputDrivers.get(output.driver);
        if (!driver.downloadArtifact) {
            throw new Error(`Backup output driver '${output.driver}' does not support restore downloads.`);
        }
        return driver.downloadArtifact(output, point, targetPath, {
            backupKey: key,
            backupId: point.backupId,
            log: () => null,
        });
    }

    private restoreChain(points: BackupRestorePoint[], target: BackupRestorePoint) {
        if (target.kind === "normal") {
            return [target];
        }

        const chainId = target.chainId || target.backupId;
        const targetCreatedAt = restorePointCreatedAt(target).getTime();
        const chain = points
            .filter((point) => (point.chainId || point.backupId) === chainId)
            .filter((point) => restorePointCreatedAt(point).getTime() <= targetCreatedAt)
            .sort((a, b) => restorePointCreatedAt(a).getTime() - restorePointCreatedAt(b).getTime());
        if (chain.length < 1 || chain[0].kind !== "full") {
            throw new Error(`Could not find base full backup for incremental backup '${target.backupId}'.`);
        }
        if (!chain.find((point) => point.backupId === target.backupId)) {
            throw new Error(`Could not build restore chain for backup '${target.backupId}'.`);
        }
        return chain;
    }

    private async extractArtifact(artifactPath: string, targetDir: string) {
        await extractZip(artifactPath, { dir: path.resolve(targetDir) });
        fs.rmSync(path.join(targetDir, ".webframez-backup"), { recursive: true, force: true });
    }

    async restore(
        key: string,
        targetDir: string | undefined,
        options?: { backupId?: string; channels?: string[]; dryRun?: boolean },
    ): Promise<BackupRestoreResult> {
        const backupType = this.resolveType(key);
        const output = this.chooseOutputForRead(backupType, options?.channels);
        if (!output) {
            throw new Error(`Backup type '${key}' has no matching output channels.`);
        }

        const driver = BackupOutputDrivers.get(output.driver);
        if (!driver.listArtifacts || !driver.readManifest || !driver.downloadArtifact) {
            throw new Error(`Backup output driver '${output.driver}' does not support restore.`);
        }

        const restorePoints = await this.listRestorePointsForOutput(key, output);
        if (!options?.backupId) {
            return {
                backupKey: key,
                driver: output.driver,
                dryRun: options?.dryRun,
                restorePoints: restorePoints,
            };
        }

        if (!targetDir || targetDir.trim() === "") {
            throw new Error("Restore target directory is required.");
        }

        const targetPoint = restorePoints.find((point) => point.backupId === options.backupId);
        if (!targetPoint) {
            throw new Error(`Backup '${options.backupId}' was not found for '${key}'.`);
        }

        const targetPath = path.resolve(targetDir);
        if (fs.existsSync(targetPath) && fs.readdirSync(targetPath).length > 0) {
            throw new Error(`Restore target directory must be new or empty: ${targetPath}`);
        }

        const chain = this.restoreChain(restorePoints, targetPoint);
        const result: BackupRestoreResult = {
            backupKey: key,
            backupId: targetPoint.backupId,
            targetDir: targetPath,
            driver: output.driver,
            dryRun: options?.dryRun,
            chain: chain,
            restored: [],
            deleted: [],
        };

        if (options?.dryRun) {
            return result;
        }

        fs.mkdirSync(targetPath, { recursive: true });
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "webframez-backup-restore-"));
        try {
            for (const point of chain) {
                const artifactPath = path.join(tempDir, point.filename);
                await this.downloadRestoreArtifact(output, point, artifactPath, key);
                await this.extractArtifact(artifactPath, targetPath);
                result.restored?.push({
                    artifact: point.filename,
                    backupId: point.backupId,
                    kind: point.kind,
                });

                for (const deletedPath of point.manifest?.files?.deleted || []) {
                    const deleteTarget = assertInside(targetPath, normalizeBackupPath(deletedPath));
                    fs.rmSync(deleteTarget, { recursive: true, force: true });
                    result.deleted?.push(normalizeBackupPath(deletedPath));
                }
            }
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }

        return result;
    }

    async cleanup(key: string, options?: BackupCleanupOptions): Promise<BackupCleanupResult[]> {
        const backupType = this.resolveType(key);
        const outputs = this.resolveOutputs(backupType, options?.channels);
        if (outputs.length < 1) {
            throw new Error(`Backup type '${key}' has no matching output channels.`);
        }

        const results: BackupCleanupResult[] = [];
        for (const output of outputs) {
            const retention = mergeRetention(this.getConfig().defaults?.retention, backupType.retention, output.retention);
            const driver = BackupOutputDrivers.get(output.driver);
            results.push(
                await driver.cleanup(output, {
                    backupKey: key,
                    backupId: backupTimestampId(),
                    retention: retention,
                    log: () => null,
                }, options),
            );
        }
        return results;
    }
}
