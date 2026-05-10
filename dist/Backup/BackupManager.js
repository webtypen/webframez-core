"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackupManager = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const Config_1 = require("../Config");
const DBConnection_1 = require("../Database/DBConnection");
const BackupOutputDrivers_1 = require("./BackupOutputDrivers");
const BackupPathUtils_1 = require("./Utils/BackupPathUtils");
const GlobMatcher_1 = require("./Utils/GlobMatcher");
const ZipWriter_1 = require("./Utils/ZipWriter");
function statSize(filepath) {
    const stats = fs_1.default.statSync(filepath);
    if (!stats.isDirectory()) {
        return stats.size;
    }
    let size = 0;
    for (const entry of fs_1.default.readdirSync(filepath)) {
        size += statSize(path_1.default.join(filepath, entry));
    }
    return size;
}
function mergeRetention(defaults, typeRetention, outputRetention) {
    const merged = Object.assign(Object.assign(Object.assign({}, (defaults || {})), (typeRetention || {})), (outputRetention || {}));
    return Object.keys(merged).length > 0 ? merged : undefined;
}
function normalizeArray(value) {
    return value && Array.isArray(value) ? value : [];
}
class BackupManager {
    getConfig() {
        const config = Config_1.Config.get("backup");
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
    resolveType(key) {
        const config = this.getConfig();
        const backupType = config.types && config.types[key] ? config.types[key] : null;
        if (!backupType) {
            throw new Error(`Backup type '${key}' is not defined.`);
        }
        const defaults = config.defaults || {};
        const outputDir = backupType.outputDir || defaults.outputDir || "storage/backups";
        return Object.assign(Object.assign(Object.assign({}, defaults), backupType), { workDir: backupType.workDir || defaults.workDir || "storage/backups/.work", outputDir: outputDir, filename: backupType.filename || defaults.filename || "{key}_{date}_{time}", zip: backupType.zip !== undefined ? backupType.zip : defaults.zip !== undefined ? defaults.zip : true, cleanupWorkDir: backupType.cleanupWorkDir !== undefined
                ? backupType.cleanupWorkDir
                : defaults.cleanupWorkDir !== undefined
                    ? defaults.cleanupWorkDir
                    : true, retention: mergeRetention(defaults.retention, backupType.retention), outputs: backupType.outputs && backupType.outputs.length > 0
                ? backupType.outputs
                : [
                    {
                        driver: "local",
                        path: outputDir,
                    },
                ] });
    }
    getAutomationEntries(workerKey) {
        const config = this.getConfig();
        const out = [];
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
    ensureActive(key, backupType) {
        if (backupType.is_active === false) {
            throw new Error(`Backup type '${key}' is disabled.`);
        }
    }
    resolveOutputs(backupType, channels) {
        if (!channels || channels.length < 1) {
            return backupType.outputs;
        }
        return backupType.outputs.filter((output) => {
            const key = output.key || output.name || output.driver;
            return channels.includes(key) || channels.includes(output.driver);
        });
    }
    collectFilesFromSource(source) {
        const sourcePath = (0, BackupPathUtils_1.resolveProjectPath)(source.from);
        if (!fs_1.default.existsSync(sourcePath)) {
            if (source.optional) {
                return [];
            }
            throw new Error(`Backup file source does not exist: ${source.from}`);
        }
        const sourceStats = fs_1.default.statSync(sourcePath);
        const files = [];
        const sourceBase = sourceStats.isDirectory() ? sourcePath : path_1.default.dirname(sourcePath);
        const toBase = (0, BackupPathUtils_1.normalizeBackupPath)(source.to !== undefined ? source.to : sourceStats.isDirectory() ? path_1.default.basename(source.from) : "");
        const addFile = (filepath) => {
            const relative = (0, BackupPathUtils_1.normalizeBackupPath)(path_1.default.relative(sourceBase, filepath));
            if (!(0, GlobMatcher_1.matchesBackupGlobs)(relative, source.include, source.exclude)) {
                return;
            }
            files.push({
                source: filepath,
                relative: relative,
                target: (0, BackupPathUtils_1.normalizeBackupPath)(path_1.default.join(toBase, relative)),
                size: fs_1.default.statSync(filepath).size,
            });
        };
        const walk = (dir) => {
            for (const entry of fs_1.default.readdirSync(dir)) {
                const filepath = path_1.default.join(dir, entry);
                const stats = fs_1.default.statSync(filepath);
                if (stats.isDirectory()) {
                    walk(filepath);
                }
                else if (stats.isFile()) {
                    addFile(filepath);
                }
            }
        };
        if (sourceStats.isDirectory()) {
            walk(sourcePath);
        }
        else if (sourceStats.isFile()) {
            addFile(sourcePath);
        }
        return files;
    }
    copyFiles(files, contentDir) {
        for (const file of files) {
            const targetPath = path_1.default.join(contentDir, file.target);
            fs_1.default.mkdirSync(path_1.default.dirname(targetPath), { recursive: true });
            fs_1.default.copyFileSync(file.source, targetPath);
        }
    }
    backupDatabase(source, contentDir, context) {
        return __awaiter(this, void 0, void 0, function* () {
            const to = (0, BackupPathUtils_1.normalizeBackupPath)(source.to || `database/${source.connection || "default"}`);
            const targetDir = path_1.default.join(contentDir, to);
            fs_1.default.mkdirSync(targetDir, { recursive: true });
            const connection = yield DBConnection_1.DBConnection.getConnection(source.connection);
            if (!connection || !connection.driver || typeof connection.driver.backup !== "function") {
                throw new Error(`Database driver for connection '${source.connection || "default"}' does not implement backup(...).`);
            }
            const payload = yield connection.driver.backup(connection.client, {
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
        });
    }
    buildArtifact(key, backupType, workRunDir, contentDir, date, id) {
        const filename = (0, BackupPathUtils_1.formatBackupFilename)(backupType.filename, { key, date, id });
        if (backupType.zip) {
            const zipPath = path_1.default.join(workRunDir, `${filename}.zip`);
            const files = [];
            const walk = (dir) => {
                for (const entry of fs_1.default.readdirSync(dir)) {
                    const filepath = path_1.default.join(dir, entry);
                    const stats = fs_1.default.statSync(filepath);
                    if (stats.isDirectory()) {
                        walk(filepath);
                    }
                    else if (stats.isFile()) {
                        files.push({
                            source: filepath,
                            name: (0, BackupPathUtils_1.normalizeBackupPath)(path_1.default.relative(contentDir, filepath)),
                        });
                    }
                }
            };
            walk(contentDir);
            (0, ZipWriter_1.createZipFile)(zipPath, files);
            return {
                path: zipPath,
                filename: path_1.default.basename(zipPath),
                size: fs_1.default.statSync(zipPath).size,
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
    run(key, options) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const backupType = this.resolveType(key);
            this.ensureActive(key, backupType);
            const now = new Date();
            const id = (0, BackupPathUtils_1.backupTimestampId)(now);
            const workRoot = (0, BackupPathUtils_1.resolveProjectPath)(backupType.workDir);
            const workRunDir = path_1.default.join(workRoot, `${key}_${id}`);
            const contentDir = path_1.default.join(workRunDir, "content");
            const outputs = this.resolveOutputs(backupType, options === null || options === void 0 ? void 0 : options.channels);
            if (outputs.length < 1) {
                throw new Error(`Backup type '${key}' has no matching output channels.`);
            }
            const result = {
                key: key,
                id: id,
                startedAt: now.toISOString(),
                endedAt: now.toISOString(),
                dryRun: (options === null || options === void 0 ? void 0 : options.dryRun) === true,
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
            if (options === null || options === void 0 ? void 0 : options.dryRun) {
                result.outputs = outputs.map((output) => ({
                    driver: output.driver,
                    status: "skipped",
                    path: output.path,
                    payload: { dryRun: true },
                }));
                result.databases = normalizeArray(backupType.databases).map((source) => ({
                    connection: source.connection,
                    to: (0, BackupPathUtils_1.normalizeBackupPath)(source.to || `database/${source.connection || "default"}`),
                }));
                result.endedAt = new Date().toISOString();
                return result;
            }
            fs_1.default.rmSync(workRunDir, { recursive: true, force: true });
            fs_1.default.mkdirSync(contentDir, { recursive: true });
            try {
                this.copyFiles(fileEntries, contentDir);
                for (const source of normalizeArray(backupType.databases)) {
                    result.databases.push(yield this.backupDatabase(source, contentDir, { backupKey: key, backupId: id }));
                }
                result.artifact = this.buildArtifact(key, backupType, workRunDir, contentDir, now, id);
                const manifestPath = path_1.default.join(workRunDir, `${result.artifact.filename}.run-manifest.json`);
                result.manifestPath = manifestPath;
                for (const output of outputs) {
                    const retention = mergeRetention((_a = this.getConfig().defaults) === null || _a === void 0 ? void 0 : _a.retention, backupType.retention, output.retention);
                    const driver = BackupOutputDrivers_1.BackupOutputDrivers.get(output.driver);
                    const outputResult = yield driver.write(result.artifact, output, {
                        backupKey: key,
                        backupId: id,
                        retention: retention,
                    });
                    result.outputs.push(outputResult);
                    if (outputResult.status === "success" && (retention === null || retention === void 0 ? void 0 : retention.runAfterBackup)) {
                        result.cleanup.push(yield driver.cleanup(output, { backupKey: key, backupId: id, retention: retention }, { dryRun: false }));
                    }
                }
                result.endedAt = new Date().toISOString();
                const outputManifestPath = (_b = result.outputs.find((output) => output.payload && output.payload.manifestPath)) === null || _b === void 0 ? void 0 : _b.payload.manifestPath;
                if (outputManifestPath) {
                    result.manifestPath = outputManifestPath;
                }
                const manifestJson = JSON.stringify(result, null, 4);
                fs_1.default.writeFileSync(manifestPath, manifestJson, "utf-8");
                for (const output of result.outputs) {
                    if (output.payload && output.payload.manifestPath) {
                        fs_1.default.writeFileSync(output.payload.manifestPath, manifestJson, "utf-8");
                    }
                }
                return result;
            }
            finally {
                if (backupType.cleanupWorkDir) {
                    fs_1.default.rmSync(workRunDir, { recursive: true, force: true });
                }
            }
        });
    }
    cleanup(key, options) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const backupType = this.resolveType(key);
            const outputs = this.resolveOutputs(backupType, options === null || options === void 0 ? void 0 : options.channels);
            if (outputs.length < 1) {
                throw new Error(`Backup type '${key}' has no matching output channels.`);
            }
            const results = [];
            for (const output of outputs) {
                const retention = mergeRetention((_a = this.getConfig().defaults) === null || _a === void 0 ? void 0 : _a.retention, backupType.retention, output.retention);
                const driver = BackupOutputDrivers_1.BackupOutputDrivers.get(output.driver);
                results.push(yield driver.cleanup(output, {
                    backupKey: key,
                    backupId: (0, BackupPathUtils_1.backupTimestampId)(),
                    retention: retention,
                }, options));
            }
            return results;
        });
    }
}
exports.BackupManager = BackupManager;
