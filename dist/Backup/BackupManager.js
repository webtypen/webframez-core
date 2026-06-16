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
const os_1 = __importDefault(require("os"));
const crypto_1 = __importDefault(require("crypto"));
const extract_zip_1 = __importDefault(require("extract-zip"));
const Config_1 = require("../Config");
const DBConnection_1 = require("../Database/DBConnection");
const BackupOutputDrivers_1 = require("./BackupOutputDrivers");
const BackupPathUtils_1 = require("./Utils/BackupPathUtils");
const GlobMatcher_1 = require("./Utils/GlobMatcher");
const ZipWriter_1 = require("./Utils/ZipWriter");
const AutomationSchedule_1 = require("../Queue/AutomationSchedule");
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
function safeReadJson(filepath) {
    try {
        return JSON.parse(fs_1.default.readFileSync(filepath, "utf-8"));
    }
    catch (e) {
        return null;
    }
}
function sha256File(filepath) {
    const hash = crypto_1.default.createHash("sha256");
    hash.update(fs_1.default.readFileSync(filepath));
    return hash.digest("hex");
}
function restorePointCreatedAt(point) {
    return point.createdAt instanceof Date ? point.createdAt : new Date(point.createdAt);
}
function normalizeManifest(input, entry) {
    var _a, _b, _c, _d, _e, _f, _g;
    if (!input) {
        return null;
    }
    const manifest = input.backupManifest || input;
    const backupKey = manifest.backupKey || input.key || (entry === null || entry === void 0 ? void 0 : entry.backupKey);
    const backupId = manifest.backupId || input.id || (entry === null || entry === void 0 ? void 0 : entry.backupId);
    if (!backupKey || !backupId) {
        return null;
    }
    return Object.assign(Object.assign({}, manifest), { backupKey: backupKey, backupId: backupId, kind: manifest.kind || input.kind || "normal", chainId: manifest.chainId || input.chainId, parentBackupId: manifest.parentBackupId || input.parentBackupId, createdAt: manifest.createdAt || input.startedAt || ((_b = (_a = entry === null || entry === void 0 ? void 0 : entry.createdAt) === null || _a === void 0 ? void 0 : _a.toISOString) === null || _b === void 0 ? void 0 : _b.call(_a)) || new Date().toISOString(), artifact: manifest.artifact || ((_c = input.artifact) === null || _c === void 0 ? void 0 : _c.filename) || input.artifact || (entry === null || entry === void 0 ? void 0 : entry.filename), artifactType: manifest.artifactType || ((_d = input.artifact) === null || _d === void 0 ? void 0 : _d.type) || "zip", files: {
            upserted: ((_e = manifest.files) === null || _e === void 0 ? void 0 : _e.upserted) || [],
            deleted: ((_f = manifest.files) === null || _f === void 0 ? void 0 : _f.deleted) || [],
            fileIndex: ((_g = manifest.files) === null || _g === void 0 ? void 0 : _g.fileIndex) || {},
        } });
}
function assertInside(targetRoot, relative) {
    const target = path_1.default.resolve(targetRoot, relative);
    const root = path_1.default.resolve(targetRoot);
    if (target !== root && !target.startsWith(root + path_1.default.sep)) {
        throw new Error(`Refusing to restore unsafe path '${relative}'.`);
    }
    return target;
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
            const stats = fs_1.default.statSync(filepath);
            files.push({
                source: filepath,
                relative: relative,
                target: (0, BackupPathUtils_1.normalizeBackupPath)(path_1.default.join(toBase, relative)),
                size: stats.size,
                mtimeMs: stats.mtimeMs,
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
    buildFileIndex(files, checksum) {
        const index = {};
        for (const file of files) {
            index[file.target] = Object.assign({ path: file.target, size: file.size, mtimeMs: Math.round(file.mtimeMs) }, (checksum ? { checksum: sha256File(file.source) } : {}));
        }
        return index;
    }
    fileIndexChanged(current, previous, checksum) {
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
    incrementalEnabled(backupType) {
        var _a;
        return ((_a = backupType.incremental) === null || _a === void 0 ? void 0 : _a.enabled) === true;
    }
    assertIncrementalSupported(key, backupType) {
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
    chooseOutputForRead(backupType, channels) {
        const outputs = this.resolveOutputs(backupType, channels);
        if (outputs.length < 1) {
            return null;
        }
        return outputs[0];
    }
    listRestorePointsForOutput(key, output) {
        return __awaiter(this, void 0, void 0, function* () {
            const driver = BackupOutputDrivers_1.BackupOutputDrivers.get(output.driver);
            if (!driver.listArtifacts || !driver.readManifest) {
                return [];
            }
            const entries = yield driver.listArtifacts(output, {
                backupKey: key,
                backupId: (0, BackupPathUtils_1.backupTimestampId)(),
                log: () => null,
            });
            const points = [];
            for (const entry of entries) {
                const rawManifest = yield driver.readManifest(output, entry, {
                    backupKey: key,
                    backupId: (0, BackupPathUtils_1.backupTimestampId)(),
                    log: () => null,
                });
                const manifest = normalizeManifest(rawManifest, entry);
                if (!manifest || manifest.backupKey !== key) {
                    continue;
                }
                points.push(Object.assign(Object.assign({}, entry), { backupKey: manifest.backupKey, backupId: manifest.backupId, kind: manifest.kind || "normal", chainId: manifest.chainId, parentBackupId: manifest.parentBackupId, createdAt: new Date(manifest.createdAt || entry.createdAt), manifest: manifest }));
            }
            return points.sort((a, b) => restorePointCreatedAt(b).getTime() - restorePointCreatedAt(a).getTime());
        });
    }
    listRestorePoints(key, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const backupType = this.resolveType(key);
            const output = this.chooseOutputForRead(backupType, options === null || options === void 0 ? void 0 : options.channels);
            if (!output) {
                throw new Error(`Backup type '${key}' has no matching output channels.`);
            }
            return this.listRestorePointsForOutput(key, output);
        });
    }
    isFullIncrementalRun(backupType, previousPoint, options) {
        var _a;
        if (options === null || options === void 0 ? void 0 : options.full) {
            return true;
        }
        if (!previousPoint) {
            return true;
        }
        return (0, AutomationSchedule_1.matchesAutomationExecutions)((_a = backupType.incremental) === null || _a === void 0 ? void 0 : _a.fullExecutions, options === null || options === void 0 ? void 0 : options.scheduledAt);
    }
    buildBackupManifest(key, id, createdAt, artifactFilename, backupType, fileEntries, options) {
        var _a, _b, _c;
        return __awaiter(this, void 0, void 0, function* () {
            const currentIndex = this.buildFileIndex(fileEntries, ((_a = backupType.incremental) === null || _a === void 0 ? void 0 : _a.checksum) === true);
            const currentByTarget = new Map(fileEntries.map((entry) => [entry.target, entry]));
            if (!this.incrementalEnabled(backupType)) {
                return {
                    manifest: {
                        backupKey: key,
                        backupId: id,
                        kind: "normal",
                        createdAt: createdAt.toISOString(),
                        artifact: artifactFilename,
                        artifactType: backupType.zip ? "zip" : "directory",
                        files: {
                            upserted: fileEntries.map((entry) => (Object.assign(Object.assign({}, currentIndex[entry.target]), { source: entry.source }))),
                            deleted: [],
                            fileIndex: currentIndex,
                        },
                    },
                    filesToCopy: fileEntries,
                    previousPoint: null,
                };
            }
            const stateOutput = this.chooseOutputForRead(backupType, options === null || options === void 0 ? void 0 : options.channels);
            const restorePoints = stateOutput ? yield this.listRestorePointsForOutput(key, stateOutput) : [];
            const previousPoint = restorePoints.find((point) => point.kind === "full" || point.kind === "incremental") || null;
            const full = this.isFullIncrementalRun(backupType, previousPoint, options);
            const previousIndex = ((_c = (_b = previousPoint === null || previousPoint === void 0 ? void 0 : previousPoint.manifest) === null || _b === void 0 ? void 0 : _b.files) === null || _c === void 0 ? void 0 : _c.fileIndex) || {};
            const upserted = Object.values(currentIndex)
                .filter((entry) => { var _a; return full || this.fileIndexChanged(entry, previousIndex[entry.path], ((_a = backupType.incremental) === null || _a === void 0 ? void 0 : _a.checksum) === true); })
                .map((entry) => { var _a; return (Object.assign(Object.assign({}, entry), { source: (_a = currentByTarget.get(entry.path)) === null || _a === void 0 ? void 0 : _a.source })); });
            const deleted = full
                ? []
                : Object.keys(previousIndex)
                    .filter((entryPath) => !currentIndex[entryPath])
                    .sort();
            const upsertedPaths = new Set(upserted.map((entry) => entry.path));
            const filesToCopy = full ? fileEntries : fileEntries.filter((entry) => upsertedPaths.has(entry.target));
            const chainId = full ? id : (previousPoint === null || previousPoint === void 0 ? void 0 : previousPoint.chainId) || (previousPoint === null || previousPoint === void 0 ? void 0 : previousPoint.backupId) || id;
            return {
                manifest: {
                    backupKey: key,
                    backupId: id,
                    kind: full ? "full" : "incremental",
                    chainId: chainId,
                    parentBackupId: full ? undefined : previousPoint === null || previousPoint === void 0 ? void 0 : previousPoint.backupId,
                    createdAt: createdAt.toISOString(),
                    artifact: artifactFilename,
                    artifactType: "zip",
                    files: {
                        upserted: upserted,
                        deleted: deleted,
                        fileIndex: currentIndex,
                    },
                },
                filesToCopy: filesToCopy,
                previousPoint: previousPoint,
            };
        });
    }
    writeContentManifest(contentDir, manifest) {
        const manifestPath = path_1.default.join(contentDir, ".webframez-backup", "manifest.json");
        fs_1.default.mkdirSync(path_1.default.dirname(manifestPath), { recursive: true });
        fs_1.default.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4), "utf-8");
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
                log: context.log,
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
    statusLogPath(backupType) {
        const config = backupType.statusLog;
        if (!config) {
            return null;
        }
        if (typeof config === "string") {
            return (0, BackupPathUtils_1.resolveProjectPath)(config);
        }
        if (config.enabled === false) {
            return null;
        }
        return (0, BackupPathUtils_1.resolveProjectPath)(config.path);
    }
    runStatus(result, error) {
        if (error) {
            return "failed";
        }
        if (result.outputs.find((output) => output.status === "failed")) {
            return "failed";
        }
        if (result.outputs.length > 0 && result.outputs.every((output) => output.status === "skipped")) {
            return "skipped";
        }
        return "success";
    }
    statusLogOutputs(result) {
        return result.outputs.map((output) => ({
            driver: output.driver,
            status: output.status,
            path: output.path,
            payload: output.payload,
            error: output.error,
        }));
    }
    writeStatusLog(backupType, result, options, error) {
        if (result.dryRun) {
            return;
        }
        const filepath = this.statusLogPath(backupType);
        if (!filepath) {
            return;
        }
        try {
            const previous = fs_1.default.existsSync(filepath) ? safeReadJson(filepath) || {} : {};
            const status = this.runStatus(result, error);
            const runAt = result.endedAt || new Date().toISOString();
            const outputs = this.statusLogOutputs(result);
            const lastRun = {
                run_at: runAt,
                run_status: status,
                run_outputs: outputs,
            };
            if (error) {
                lastRun.run_error = error instanceof Error ? error.message : String(error);
            }
            const statusLog = {
                last_run_at: runAt,
                last_run_status: status,
                last_run_outputs: outputs,
                last_success_run: previous.last_success_run || null,
            };
            if (error) {
                statusLog.last_run_error = lastRun.run_error;
            }
            if (status === "success") {
                statusLog.last_success_run = lastRun;
            }
            fs_1.default.mkdirSync(path_1.default.dirname(filepath), { recursive: true });
            fs_1.default.writeFileSync(filepath, JSON.stringify(statusLog, null, 4), "utf-8");
        }
        catch (e) {
            this.log(options, "Failed to write backup status log", {
                path: filepath,
                error: e instanceof Error ? e.message : String(e),
            });
        }
    }
    run(key, options) {
        var _a, _b, _c;
        return __awaiter(this, void 0, void 0, function* () {
            const backupType = this.resolveType(key);
            this.ensureActive(key, backupType);
            this.assertIncrementalSupported(key, backupType);
            this.log(options, `Starting backup '${key}'`);
            const now = new Date();
            const id = (0, BackupPathUtils_1.backupTimestampId)(now);
            const filename = (0, BackupPathUtils_1.formatBackupFilename)(backupType.filename, { key, date: now, id });
            const artifactFilename = backupType.zip ? `${filename}.zip` : filename;
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
            try {
                this.log(options, "Collecting file sources");
                const fileEntries = normalizeArray(backupType.files).flatMap((source) => this.collectFilesFromSource(source, options));
                const fileSize = fileEntries.reduce((sum, entry) => sum + entry.size, 0);
                this.log(options, `Collected ${fileEntries.length} file(s)`, { size: fileSize });
                const incremental = yield this.buildBackupManifest(key, id, now, artifactFilename, backupType, fileEntries, options);
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
                    this.log(options, `Copying ${incremental.filesToCopy.length} file(s) into backup work directory`);
                    this.copyFiles(incremental.filesToCopy, contentDir, options);
                    this.writeContentManifest(contentDir, incremental.manifest);
                    this.log(options, "File copy finished");
                    for (const source of normalizeArray(backupType.databases)) {
                        this.log(options, `Backing up database '${source.connection || "default"}'`);
                        result.databases.push(yield this.backupDatabase(source, contentDir, {
                            backupKey: key,
                            backupId: id,
                            log: (message, payload) => this.log(options, message, payload),
                        }));
                        this.log(options, `Database '${source.connection || "default"}' backup finished`);
                    }
                    result.artifact = this.buildArtifact(key, backupType, workRunDir, contentDir, now, id, options);
                    result.artifact.manifest = incremental.manifest;
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
                    this.writeStatusLog(backupType, result, options);
                    this.log(options, `Backup '${key}' finished`);
                    return result;
                }
                finally {
                    if (backupType.cleanupWorkDir) {
                        this.log(options, "Cleaning backup work directory");
                        fs_1.default.rmSync(workRunDir, { recursive: true, force: true });
                    }
                }
            }
            catch (e) {
                result.endedAt = new Date().toISOString();
                this.writeStatusLog(backupType, result, options, e);
                throw e;
            }
        });
    }
    downloadRestoreArtifact(output, point, targetPath, key) {
        return __awaiter(this, void 0, void 0, function* () {
            const driver = BackupOutputDrivers_1.BackupOutputDrivers.get(output.driver);
            if (!driver.downloadArtifact) {
                throw new Error(`Backup output driver '${output.driver}' does not support restore downloads.`);
            }
            return driver.downloadArtifact(output, point, targetPath, {
                backupKey: key,
                backupId: point.backupId,
                log: () => null,
            });
        });
    }
    restoreChain(points, target) {
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
    extractArtifact(artifactPath, targetDir) {
        return __awaiter(this, void 0, void 0, function* () {
            yield (0, extract_zip_1.default)(artifactPath, { dir: path_1.default.resolve(targetDir) });
            fs_1.default.rmSync(path_1.default.join(targetDir, ".webframez-backup"), { recursive: true, force: true });
        });
    }
    restore(key, targetDir, options) {
        var _a, _b, _c, _d;
        return __awaiter(this, void 0, void 0, function* () {
            const backupType = this.resolveType(key);
            const output = this.chooseOutputForRead(backupType, options === null || options === void 0 ? void 0 : options.channels);
            if (!output) {
                throw new Error(`Backup type '${key}' has no matching output channels.`);
            }
            const driver = BackupOutputDrivers_1.BackupOutputDrivers.get(output.driver);
            if (!driver.listArtifacts || !driver.readManifest || !driver.downloadArtifact) {
                throw new Error(`Backup output driver '${output.driver}' does not support restore.`);
            }
            const restorePoints = yield this.listRestorePointsForOutput(key, output);
            if (!(options === null || options === void 0 ? void 0 : options.backupId)) {
                return {
                    backupKey: key,
                    driver: output.driver,
                    dryRun: options === null || options === void 0 ? void 0 : options.dryRun,
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
            const targetPath = path_1.default.resolve(targetDir);
            if (fs_1.default.existsSync(targetPath) && fs_1.default.readdirSync(targetPath).length > 0) {
                throw new Error(`Restore target directory must be new or empty: ${targetPath}`);
            }
            const chain = this.restoreChain(restorePoints, targetPoint);
            const result = {
                backupKey: key,
                backupId: targetPoint.backupId,
                targetDir: targetPath,
                driver: output.driver,
                dryRun: options === null || options === void 0 ? void 0 : options.dryRun,
                chain: chain,
                restored: [],
                deleted: [],
            };
            if (options === null || options === void 0 ? void 0 : options.dryRun) {
                return result;
            }
            fs_1.default.mkdirSync(targetPath, { recursive: true });
            const tempDir = fs_1.default.mkdtempSync(path_1.default.join(os_1.default.tmpdir(), "webframez-backup-restore-"));
            try {
                for (const point of chain) {
                    const artifactPath = path_1.default.join(tempDir, point.filename);
                    yield this.downloadRestoreArtifact(output, point, artifactPath, key);
                    yield this.extractArtifact(artifactPath, targetPath);
                    (_a = result.restored) === null || _a === void 0 ? void 0 : _a.push({
                        artifact: point.filename,
                        backupId: point.backupId,
                        kind: point.kind,
                    });
                    for (const deletedPath of ((_c = (_b = point.manifest) === null || _b === void 0 ? void 0 : _b.files) === null || _c === void 0 ? void 0 : _c.deleted) || []) {
                        const deleteTarget = assertInside(targetPath, (0, BackupPathUtils_1.normalizeBackupPath)(deletedPath));
                        fs_1.default.rmSync(deleteTarget, { recursive: true, force: true });
                        (_d = result.deleted) === null || _d === void 0 ? void 0 : _d.push((0, BackupPathUtils_1.normalizeBackupPath)(deletedPath));
                    }
                }
            }
            finally {
                fs_1.default.rmSync(tempDir, { recursive: true, force: true });
            }
            return result;
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
