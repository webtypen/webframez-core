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
    log(options, message, payload) {
        if ((options === null || options === void 0 ? void 0 : options.silent) || !(options === null || options === void 0 ? void 0 : options.log)) {
            return;
        }
        options.log(message, payload);
    }
    logInterval(options) {
        return (options === null || options === void 0 ? void 0 : options.logInterval) && options.logInterval > 0 ? options.logInterval : 1000;
    }
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
        return Object.assign(Object.assign(Object.assign({}, defaults), backupType), { workDir: backupType.workDir || defaults.workDir || "storage/backups/.work", outputDir: outputDir, filename: backupType.filename || defaults.filename || "{key}_{date}_{time}", zip: backupType.zip !== undefined ? backupType.zip : defaults.zip !== undefined ? defaults.zip : true, zipDriver: backupType.zipDriver || defaults.zipDriver || "auto", zipCompressionLevel: backupType.zipCompressionLevel !== undefined ? backupType.zipCompressionLevel : defaults.zipCompressionLevel, cleanupWorkDir: backupType.cleanupWorkDir !== undefined
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
    collectFilesFromSource(source, options) {
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
        const interval = this.logInterval(options);
        let visited = 0;
        let included = 0;
        const addFile = (filepath) => {
            visited += 1;
            const relative = (0, BackupPathUtils_1.normalizeBackupPath)(path_1.default.relative(sourceBase, filepath));
            if (!(0, GlobMatcher_1.matchesBackupGlobs)(relative, source.include, source.exclude)) {
                if (visited % interval === 0) {
                    this.log(options, `Scanned ${visited} file(s), included ${included}`);
                }
                return;
            }
            included += 1;
            files.push({
                source: filepath,
                relative: relative,
                target: (0, BackupPathUtils_1.normalizeBackupPath)(path_1.default.join(toBase, relative)),
                size: fs_1.default.statSync(filepath).size,
            });
            if (visited % interval === 0) {
                this.log(options, `Scanned ${visited} file(s), included ${included}`);
            }
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
    copyFiles(files, contentDir, options) {
        const interval = this.logInterval(options);
        for (let index = 0; index < files.length; index += 1) {
            const file = files[index];
            const targetPath = path_1.default.join(contentDir, file.target);
            fs_1.default.mkdirSync(path_1.default.dirname(targetPath), { recursive: true });
            fs_1.default.copyFileSync(file.source, targetPath);
            const count = index + 1;
            if (count % interval === 0 || count === files.length) {
                this.log(options, `Copied ${count}/${files.length} file(s)`);
            }
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
    buildArtifact(key, backupType, workRunDir, contentDir, date, id, options) {
        const filename = (0, BackupPathUtils_1.formatBackupFilename)(backupType.filename, { key, date, id });
        if (backupType.zip) {
            const zipPath = path_1.default.join(workRunDir, `${filename}.zip`);
            this.log(options, `Creating ZIP artifact '${path_1.default.basename(zipPath)}'`, {
                driver: backupType.zipDriver,
                compressionLevel: backupType.zipCompressionLevel,
            });
            const zipResult = (0, ZipWriter_1.createZipFileFromDirectory)(zipPath, contentDir, {
                driver: backupType.zipDriver,
                compressionLevel: backupType.zipCompressionLevel,
            });
            this.log(options, `ZIP artifact created using ${zipResult.driver} zip`, {
                path: zipPath,
            });
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
        var _a, _b, _c;
        return __awaiter(this, void 0, void 0, function* () {
            const backupType = this.resolveType(key);
            this.ensureActive(key, backupType);
            this.log(options, `Starting backup '${key}'`);
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
            this.log(options, "Collecting file sources");
            const fileEntries = normalizeArray(backupType.files).flatMap((source) => this.collectFilesFromSource(source, options));
            const fileSize = fileEntries.reduce((sum, entry) => sum + entry.size, 0);
            this.log(options, `Collected ${fileEntries.length} file(s)`, { size: fileSize });
            result.files = fileEntries.map((entry) => ({
                from: entry.source,
                to: entry.target,
                size: entry.size,
            }));
            if (options === null || options === void 0 ? void 0 : options.dryRun) {
                this.log(options, "Dry run enabled; skipping artifact and output writes");
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
                this.log(options, `Copying ${fileEntries.length} file(s) into backup work directory`);
                this.copyFiles(fileEntries, contentDir, options);
                this.log(options, "File copy finished");
                for (const source of normalizeArray(backupType.databases)) {
                    this.log(options, `Backing up database '${source.connection || "default"}'`);
                    result.databases.push(yield this.backupDatabase(source, contentDir, { backupKey: key, backupId: id }));
                    this.log(options, `Database '${source.connection || "default"}' backup finished`);
                }
                result.artifact = this.buildArtifact(key, backupType, workRunDir, contentDir, now, id, options);
                const manifestPath = path_1.default.join(workRunDir, `${result.artifact.filename}.run-manifest.json`);
                result.manifestPath = manifestPath;
                for (const output of outputs) {
                    const retention = mergeRetention((_a = this.getConfig().defaults) === null || _a === void 0 ? void 0 : _a.retention, backupType.retention, output.retention);
                    const driver = BackupOutputDrivers_1.BackupOutputDrivers.get(output.driver);
                    this.log(options, `Writing artifact to '${output.driver}' output`, {
                        path: output.path,
                        folderPath: output.folderPath,
                    });
                    const outputResult = yield driver.write(result.artifact, output, {
                        backupKey: key,
                        backupId: id,
                        retention: retention,
                        log: (message, payload) => this.log(options, message, payload),
                    });
                    result.outputs.push(outputResult);
                    this.log(options, `Output '${output.driver}' finished with status '${outputResult.status}'`, {
                        path: outputResult.path,
                        error: outputResult.error,
                    });
                    if (outputResult.status === "success" && (retention === null || retention === void 0 ? void 0 : retention.runAfterBackup)) {
                        this.log(options, `Running cleanup for '${output.driver}' output`);
                        result.cleanup.push(yield driver.cleanup(output, {
                            backupKey: key,
                            backupId: id,
                            retention: retention,
                            log: (message, payload) => this.log(options, message, payload),
                        }, { dryRun: false }));
                        this.log(options, `Cleanup for '${output.driver}' output finished`, {
                            deleted: ((_b = result.cleanup[result.cleanup.length - 1]) === null || _b === void 0 ? void 0 : _b.deleted.length) || 0,
                        });
                    }
                }
                result.endedAt = new Date().toISOString();
                const outputManifestPath = (_c = result.outputs.find((output) => output.payload && output.payload.manifestPath)) === null || _c === void 0 ? void 0 : _c.payload.manifestPath;
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
                this.log(options, `Backup '${key}' finished`);
                return result;
            }
            finally {
                if (backupType.cleanupWorkDir) {
                    this.log(options, "Cleaning backup work directory");
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
                    log: () => null,
                }, options));
            }
            return results;
        });
    }
}
exports.BackupManager = BackupManager;
