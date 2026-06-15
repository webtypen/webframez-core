import fs from "fs";
import path from "path";
import { Config } from "../Config";
import { DBConnection } from "../Database/DBConnection";
import {
    BackupArtifact,
    BackupCleanupOptions,
    BackupCleanupResult,
    BackupConfig,
    BackupDatabaseSourceConfig,
    BackupFileSourceConfig,
    BackupOutputConfig,
    BackupOutputResult,
    BackupRetentionConfig,
    BackupRunOptions,
    BackupRunResult,
    BackupTypeConfig,
} from "./BackupTypes";
import { BackupOutputDrivers } from "./BackupOutputDrivers";
import { backupTimestampId, formatBackupFilename, normalizeBackupPath, resolveProjectPath } from "./Utils/BackupPathUtils";
import { matchesBackupGlobs } from "./Utils/GlobMatcher";
import { createZipFileFromDirectory } from "./Utils/ZipWriter";

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
        const files: Array<{ source: string; relative: string; target: string; size: number }> = [];
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
            files.push({
                source: filepath,
                relative: relative,
                target: normalizeBackupPath(path.join(toBase, relative)),
                size: fs.statSync(filepath).size,
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

    private async backupDatabase(
        source: BackupDatabaseSourceConfig,
        contentDir: string,
        context: { backupKey: string; backupId: string },
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
        this.log(options, `Starting backup '${key}'`);

        const now = new Date();
        const id = backupTimestampId(now);
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
        result.files = fileEntries.map((entry) => ({
            from: entry.source,
            to: entry.target,
            size: entry.size,
        }));

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
            this.log(options, `Copying ${fileEntries.length} file(s) into backup work directory`);
            this.copyFiles(fileEntries, contentDir, options);
            this.log(options, "File copy finished");

            for (const source of normalizeArray(backupType.databases)) {
                this.log(options, `Backing up database '${source.connection || "default"}'`);
                result.databases.push(await this.backupDatabase(source, contentDir, { backupKey: key, backupId: id }));
                this.log(options, `Database '${source.connection || "default"}' backup finished`);
            }

            result.artifact = this.buildArtifact(key, backupType, workRunDir, contentDir, now, id, options);
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
