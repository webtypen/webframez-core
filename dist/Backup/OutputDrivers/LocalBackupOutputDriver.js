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
class LocalBackupOutputDriver {
    outputPath(output) {
        return (0, BackupPathUtils_1.resolveProjectPath)(output.path || "storage/backups");
    }
    write(artifact, output, context) {
        return __awaiter(this, void 0, void 0, function* () {
            const targetDir = this.outputPath(output);
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
            const manifest = {
                backupKey: context.backupKey,
                backupId: context.backupId,
                artifact: artifact.filename,
                artifactType: artifact.type,
                createdAt: new Date().toISOString(),
                driver: "local",
                path: (0, BackupPathUtils_1.normalizeBackupPath)(path_1.default.relative(process.cwd(), targetPath)),
                size: stats.size,
            };
            const manifestPath = path_1.default.join(targetDir, `${artifact.filename}.manifest.json`);
            fs_1.default.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4), "utf-8");
            return {
                driver: "local",
                status: "success",
                path: targetPath,
                payload: {
                    manifestPath: manifestPath,
                    size: stats.size,
                },
            };
        });
    }
    list(output, context) {
        const targetDir = this.outputPath(output);
        if (!fs_1.default.existsSync(targetDir)) {
            return [];
        }
        const entries = [];
        const filenames = fs_1.default.readdirSync(targetDir);
        for (const filename of filenames) {
            if (!filename.endsWith(".manifest.json")) {
                continue;
            }
            const manifestPath = path_1.default.join(targetDir, filename);
            const manifest = safeReadJson(manifestPath);
            if (!manifest || manifest.backupKey !== context.backupKey || !manifest.artifact) {
                continue;
            }
            const artifactPath = path_1.default.join(targetDir, manifest.artifact);
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
            });
        }
        return entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
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
            const deleted = [];
            const kept = [];
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
                    if (!(options === null || options === void 0 ? void 0 : options.dryRun)) {
                        fs_1.default.rmSync(entry.path, { recursive: true, force: true });
                        if (entry.manifestPath) {
                            fs_1.default.rmSync(entry.manifestPath, { force: true });
                        }
                    }
                }
                else {
                    kept.push(entry);
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
