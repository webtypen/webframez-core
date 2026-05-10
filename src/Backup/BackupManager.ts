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
import { createZipFile } from "./Utils/ZipWriter";

type ResolvedBackupTypeConfig = BackupTypeConfig & {
    workDir: string;
    outputDir: string;
    filename: string;
    zip: boolean;
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

    private collectFilesFromSource(source: BackupFileSourceConfig) {
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

        const addFile = (filepath: string) => {
            const relative = normalizeBackupPath(path.relative(sourceBase, filepath));
            if (!matchesBackupGlobs(relative, source.include, source.exclude)) {
                return;
            }

            files.push({
                source: filepath,
                relative: relative,
                target: normalizeBackupPath(path.join(toBase, relative)),
                size: fs.statSync(filepath).size,
            });
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

    private copyFiles(files: Array<{ source: string; target: string; size: number }>, contentDir: string) {
        for (const file of files) {
            const targetPath = path.join(contentDir, file.target);
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            fs.copyFileSync(file.source, targetPath);
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
    ): BackupArtifact {
        const filename = formatBackupFilename(backupType.filename, { key, date, id });
        if (backupType.zip) {
            const zipPath = path.join(workRunDir, `${filename}.zip`);
            const files: Array<{ source: string; name: string }> = [];
            const walk = (dir: string) => {
                for (const entry of fs.readdirSync(dir)) {
                    const filepath = path.join(dir, entry);
                    const stats = fs.statSync(filepath);
                    if (stats.isDirectory()) {
                        walk(filepath);
                    } else if (stats.isFile()) {
                        files.push({
                            source: filepath,
                            name: normalizeBackupPath(path.relative(contentDir, filepath)),
                        });
                    }
                }
            };
            walk(contentDir);
            createZipFile(zipPath, files);
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

        const fileEntries = normalizeArray(backupType.files).flatMap((source) => this.collectFilesFromSource(source));
        result.files = fileEntries.map((entry) => ({
            from: entry.source,
            to: entry.target,
            size: entry.size,
        }));

        if (options?.dryRun) {
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
            this.copyFiles(fileEntries, contentDir);

            for (const source of normalizeArray(backupType.databases)) {
                result.databases.push(await this.backupDatabase(source, contentDir, { backupKey: key, backupId: id }));
            }

            result.artifact = this.buildArtifact(key, backupType, workRunDir, contentDir, now, id);
            const manifestPath = path.join(workRunDir, `${result.artifact.filename}.run-manifest.json`);
            result.manifestPath = manifestPath;

            for (const output of outputs) {
                const retention = mergeRetention(this.getConfig().defaults?.retention, backupType.retention, output.retention);
                const driver = BackupOutputDrivers.get(output.driver);
                const outputResult: BackupOutputResult = await driver.write(result.artifact, output, {
                    backupKey: key,
                    backupId: id,
                    retention: retention,
                });
                result.outputs.push(outputResult);

                if (outputResult.status === "success" && retention?.runAfterBackup) {
                    result.cleanup.push(
                        await driver.cleanup(output, { backupKey: key, backupId: id, retention: retention }, { dryRun: false }),
                    );
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
            return result;
        } finally {
            if (backupType.cleanupWorkDir) {
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
                }, options),
            );
        }
        return results;
    }
}
