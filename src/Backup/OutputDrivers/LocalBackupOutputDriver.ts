import fs from "fs";
import path from "path";
import {
    BackupArtifact,
    BackupCleanupEntry,
    BackupCleanupOptions,
    BackupCleanupResult,
    BackupOutputConfig,
    BackupOutputResult,
    BackupRetentionConfig,
} from "../BackupTypes";
import { normalizeBackupPath, resolveProjectPath } from "../Utils/BackupPathUtils";
import { BaseBackupOutputDriver, BackupOutputDriverContext } from "./BaseBackupOutputDriver";

type LocalBackupEntry = BackupCleanupEntry & {
    manifestPath?: string;
};

function safeReadJson(filepath: string) {
    try {
        return JSON.parse(fs.readFileSync(filepath, "utf-8"));
    } catch (e) {
        return null;
    }
}

function retentionValue(config: BackupRetentionConfig | undefined) {
    if (!config) {
        return {};
    }

    return {
        keepLast: config.keepLast && config.keepLast > 0 ? config.keepLast : undefined,
        maxAgeDays: config.maxAgeDays && config.maxAgeDays > 0 ? config.maxAgeDays : undefined,
        runAfterBackup: config.runAfterBackup === true,
    };
}

export class LocalBackupOutputDriver implements BaseBackupOutputDriver {
    private outputPath(output: BackupOutputConfig) {
        return resolveProjectPath(output.path || "storage/backups");
    }

    async write(
        artifact: BackupArtifact,
        output: BackupOutputConfig,
        context: BackupOutputDriverContext,
    ): Promise<BackupOutputResult> {
        const targetDir = this.outputPath(output);
        fs.mkdirSync(targetDir, { recursive: true });

        const targetPath = path.join(targetDir, artifact.filename);
        if (artifact.type === "directory") {
            fs.rmSync(targetPath, { recursive: true, force: true });
            fs.cpSync(artifact.path, targetPath, { recursive: true });
        } else {
            fs.copyFileSync(artifact.path, targetPath);
        }

        const stats = fs.statSync(targetPath);
        const manifest = {
            backupKey: context.backupKey,
            backupId: context.backupId,
            artifact: artifact.filename,
            artifactType: artifact.type,
            createdAt: new Date().toISOString(),
            driver: "local",
            path: normalizeBackupPath(path.relative(process.cwd(), targetPath)),
            size: stats.size,
        };
        const manifestPath = path.join(targetDir, `${artifact.filename}.manifest.json`);
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4), "utf-8");

        return {
            driver: "local",
            status: "success",
            path: targetPath,
            payload: {
                manifestPath: manifestPath,
                size: stats.size,
            },
        };
    }

    list(output: BackupOutputConfig, context: BackupOutputDriverContext): LocalBackupEntry[] {
        const targetDir = this.outputPath(output);
        if (!fs.existsSync(targetDir)) {
            return [];
        }

        const entries: LocalBackupEntry[] = [];
        const filenames = fs.readdirSync(targetDir);
        for (const filename of filenames) {
            if (!filename.endsWith(".manifest.json")) {
                continue;
            }

            const manifestPath = path.join(targetDir, filename);
            const manifest = safeReadJson(manifestPath);
            if (!manifest || manifest.backupKey !== context.backupKey || !manifest.artifact) {
                continue;
            }

            const artifactPath = path.join(targetDir, manifest.artifact);
            if (!fs.existsSync(artifactPath)) {
                continue;
            }

            const stats = fs.statSync(artifactPath);
            entries.push({
                path: artifactPath,
                filename: path.basename(artifactPath),
                createdAt: manifest.createdAt ? new Date(manifest.createdAt) : stats.mtime,
                size: stats.size,
                reason: "",
                manifestPath: manifestPath,
            });
        }

        return entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    async cleanup(
        output: BackupOutputConfig,
        context: BackupOutputDriverContext,
        options?: BackupCleanupOptions,
    ): Promise<BackupCleanupResult> {
        const retention = retentionValue(context.retention);
        if (!retention.keepLast && !retention.maxAgeDays) {
            return {
                driver: "local",
                status: "skipped",
                deleted: [],
                kept: this.list(output, context),
                dryRun: options?.dryRun,
                message: "No retention rules configured.",
            };
        }

        const now = new Date();
        const entries = this.list(output, context);
        const keepLastProtected = new Set(
            retention.keepLast ? entries.slice(0, retention.keepLast).map((entry) => entry.path) : [],
        );
        const deleted: LocalBackupEntry[] = [];
        const kept: LocalBackupEntry[] = [];

        for (let index = 0; index < entries.length; index += 1) {
            const entry = entries[index];
            const reasons: string[] = [];
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
                if (!options?.dryRun) {
                    fs.rmSync(entry.path, { recursive: true, force: true });
                    if (entry.manifestPath) {
                        fs.rmSync(entry.manifestPath, { force: true });
                    }
                }
            } else {
                kept.push(entry);
            }
        }

        return {
            driver: "local",
            status: "success",
            deleted: deleted,
            kept: kept,
            dryRun: options?.dryRun,
        };
    }
}
