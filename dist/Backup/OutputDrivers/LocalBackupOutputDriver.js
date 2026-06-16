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
exports.LocalBackupOutputDriver = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const BackupPathUtils_1 = require("../Utils/BackupPathUtils");
function safeReadJson(filepath) {
    try {
        return JSON.parse(fs_1.default.readFileSync(filepath, "utf-8"));
    }
    catch (e) {
        return null;
    }
}
function retentionValue(config) {
    if (!config) {
        return {};
    }
    return {
        keepLast: config.keepLast && config.keepLast > 0 ? config.keepLast : undefined,
        maxAgeDays: config.maxAgeDays && config.maxAgeDays > 0 ? config.maxAgeDays : undefined,
        runAfterBackup: config.runAfterBackup === true,
    };
}
function backupDateFolder(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) {
        return new Date().toISOString().slice(0, 10);
    }
    return date.toISOString().slice(0, 10);
}
class LocalBackupOutputDriver {
    outputPath(output) {
        return (0, BackupPathUtils_1.resolveProjectPath)(output.path || "storage/backups");
    }
    targetDir(output, artifact) {
        var _a;
        const base = this.outputPath(output);
        if (!output.groupByDate) {
            return base;
        }
        return path_1.default.join(base, backupDateFolder((_a = artifact === null || artifact === void 0 ? void 0 : artifact.manifest) === null || _a === void 0 ? void 0 : _a.createdAt));
    }
    listDirs(output) {
        const base = this.outputPath(output);
        if (!fs_1.default.existsSync(base)) {
            return [];
        }
        if (!output.groupByDate) {
            return [base];
        }
        const dirs = [base];
        for (const entry of fs_1.default.readdirSync(base)) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(entry)) {
                continue;
            }
            const filepath = path_1.default.join(base, entry);
            if (fs_1.default.statSync(filepath).isDirectory()) {
                dirs.push(filepath);
            }
        }
        return dirs;
    }
    write(artifact, output, context) {
        return __awaiter(this, void 0, void 0, function* () {
            const targetDir = this.targetDir(output, artifact);
            fs_1.default.mkdirSync(targetDir, { recursive: true });
            const targetPath = path_1.default.join(targetDir, artifact.filename);
            if (artifact.type === "directory") {
                fs_1.default.rmSync(targetPath, { recursive: true, force: true });
                fs_1.default.cpSync(artifact.path, targetPath, { recursive: true });
            }
            else {
                fs_1.default.copyFileSync(artifact.path, targetPath);
            }
            const stats = fs_1.default.statSync(targetPath);
            const manifest = Object.assign(Object.assign({ backupKey: context.backupKey, backupId: context.backupId }, (artifact.manifest || {})), { artifact: artifact.filename, artifactType: artifact.type, createdAt: new Date().toISOString(), driver: "local", path: (0, BackupPathUtils_1.normalizeBackupPath)(path_1.default.relative(process.cwd(), targetPath)), size: stats.size });
            const manifestPath = path_1.default.join(targetDir, `${artifact.filename}.manifest.json`);
            fs_1.default.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4), "utf-8");
            return {
                driver: "local",
                status: "success",
                path: targetPath,
                payload: {
                    manifestPath: manifestPath,
                    groupDate: output.groupByDate ? path_1.default.basename(targetDir) : undefined,
                    size: stats.size,
                },
            };
        });
    }
    listArtifacts(output, context) {
        var _a;
        const entries = [];
        for (const targetDir of this.listDirs(output)) {
            const filenames = fs_1.default.readdirSync(targetDir);
            for (const filename of filenames) {
                if (!filename.endsWith(".manifest.json")) {
                    continue;
                }
                const manifestPath = path_1.default.join(targetDir, filename);
                const manifest = safeReadJson(manifestPath);
                const backupKey = manifest.backupKey || manifest.key;
                const artifact = typeof manifest.artifact === "string" ? manifest.artifact : (_a = manifest.artifact) === null || _a === void 0 ? void 0 : _a.filename;
                if (!manifest || backupKey !== context.backupKey || !artifact) {
                    continue;
                }
                const artifactPath = path_1.default.join(targetDir, artifact);
                if (!fs_1.default.existsSync(artifactPath)) {
                    continue;
                }
                const stats = fs_1.default.statSync(artifactPath);
                entries.push({
                    path: artifactPath,
                    filename: path_1.default.basename(artifactPath),
                    createdAt: manifest.createdAt ? new Date(manifest.createdAt) : stats.mtime,
                    size: stats.size,
                    reason: "",
                    manifestPath: manifestPath,
                    payload: {
                        manifest: manifest,
                        groupDate: /^\d{4}-\d{2}-\d{2}$/.test(path_1.default.basename(targetDir)) ? path_1.default.basename(targetDir) : undefined,
                    },
                });
            }
        }
        return entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    list(output, context) {
        return this.listArtifacts(output, context);
    }
    readManifest(output, entry) {
        var _a;
        if ((_a = entry.payload) === null || _a === void 0 ? void 0 : _a.manifest) {
            return entry.payload.manifest;
        }
        if (entry.manifestPath) {
            return safeReadJson(entry.manifestPath);
        }
        return null;
    }
    downloadArtifact(output, entry, targetPath) {
        fs_1.default.mkdirSync(path_1.default.dirname(targetPath), { recursive: true });
        fs_1.default.copyFileSync(entry.path, targetPath);
        return targetPath;
    }
    protectIncrementalChains(entries, deleted, kept) {
        const keptChainIds = new Set(kept
            .map((entry) => this.readManifest({ driver: "local" }, entry))
            .map((manifest) => manifest === null || manifest === void 0 ? void 0 : manifest.chainId)
            .filter((chainId) => !!chainId));
        if (keptChainIds.size < 1) {
            return { deleted, kept };
        }
        const nextDeleted = [];
        const nextKept = [...kept];
        const keptPaths = new Set(nextKept.map((entry) => entry.path));
        for (const entry of deleted) {
            const manifest = this.readManifest({ driver: "local" }, entry);
            if ((manifest === null || manifest === void 0 ? void 0 : manifest.chainId) && keptChainIds.has(manifest.chainId)) {
                if (!keptPaths.has(entry.path)) {
                    nextKept.push(entry);
                    keptPaths.add(entry.path);
                }
            }
            else {
                nextDeleted.push(entry);
            }
        }
        return { deleted: nextDeleted, kept: nextKept.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) };
    }
    cleanup(output, context, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const retention = retentionValue(context.retention);
            if (!retention.keepLast && !retention.maxAgeDays) {
                return {
                    driver: "local",
                    status: "skipped",
                    deleted: [],
                    kept: this.list(output, context),
                    dryRun: options === null || options === void 0 ? void 0 : options.dryRun,
                    message: "No retention rules configured.",
                };
            }
            const now = new Date();
            const entries = this.list(output, context);
            const keepLastProtected = new Set(retention.keepLast ? entries.slice(0, retention.keepLast).map((entry) => entry.path) : []);
            let deleted = [];
            let kept = [];
            for (let index = 0; index < entries.length; index += 1) {
                const entry = entries[index];
                const reasons = [];
                if (retention.keepLast && index >= retention.keepLast) {
                    reasons.push(`older than keepLast=${retention.keepLast}`);
                }
                if (retention.maxAgeDays) {
                    const ageMs = now.getTime() - entry.createdAt.getTime();
                    if (ageMs > retention.maxAgeDays * 24 * 60 * 60 * 1000) {
                        reasons.push(`older than maxAgeDays=${retention.maxAgeDays}`);
                    }
                }
                if (reasons.length > 0 && !keepLastProtected.has(entry.path)) {
                    entry.reason = reasons.join(", ");
                    deleted.push(entry);
                }
                else {
                    kept.push(entry);
                }
            }
            const protectedEntries = this.protectIncrementalChains(entries, deleted, kept);
            deleted = protectedEntries.deleted;
            kept = protectedEntries.kept;
            if (!(options === null || options === void 0 ? void 0 : options.dryRun)) {
                for (const entry of deleted) {
                    fs_1.default.rmSync(entry.path, { recursive: true, force: true });
                    if (entry.manifestPath) {
                        fs_1.default.rmSync(entry.manifestPath, { force: true });
                    }
                }
            }
            return {
                driver: "local",
                status: "success",
                deleted: deleted,
                kept: kept,
                dryRun: options === null || options === void 0 ? void 0 : options.dryRun,
            };
        });
    }
}
exports.LocalBackupOutputDriver = LocalBackupOutputDriver;
