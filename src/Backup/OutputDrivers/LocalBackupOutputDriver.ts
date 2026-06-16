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
    payload?: any;
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

function backupDateFolder(value?: string | Date) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) {
        return new Date().toISOString().slice(0, 10);
    }
    return date.toISOString().slice(0, 10);
}

export class LocalBackupOutputDriver implements BaseBackupOutputDriver {
    private outputPath(output: BackupOutputConfig) {
        return resolveProjectPath(output.path || "storage/backups");
    }

    private targetDir(output: BackupOutputConfig, artifact?: BackupArtifact) {
        const base = this.outputPath(output);
        if (!output.groupByDate) {
            return base;
        }
        return path.join(base, backupDateFolder(artifact?.manifest?.createdAt));
    }

    private listDirs(output: BackupOutputConfig) {
        const base = this.outputPath(output);
        if (!fs.existsSync(base)) {
            return [];
        }
        if (!output.groupByDate) {
            return [base];
        }

        const dirs = [base];
        for (const entry of fs.readdirSync(base)) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(entry)) {
                continue;
            }
            const filepath = path.join(base, entry);
            if (fs.statSync(filepath).isDirectory()) {
                dirs.push(filepath);
            }
        }
        return dirs;
    }

    async write(
        artifact: BackupArtifact,
        output: BackupOutputConfig,
        context: BackupOutputDriverContext,
    ): Promise<BackupOutputResult> {
        const targetDir = this.targetDir(output, artifact);
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
            ...(artifact.manifest || {}),
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
                groupDate: output.groupByDate ? path.basename(targetDir) : undefined,
                size: stats.size,
            },
        };
    }

    listArtifacts(output: BackupOutputConfig, context: BackupOutputDriverContext): LocalBackupEntry[] {
        const entries: LocalBackupEntry[] = [];
        for (const targetDir of this.listDirs(output)) {
            const filenames = fs.readdirSync(targetDir);
            for (const filename of filenames) {
                if (!filename.endsWith(".manifest.json")) {
                    continue;
                }

                const manifestPath = path.join(targetDir, filename);
                const manifest = safeReadJson(manifestPath);
                const backupKey = manifest.backupKey || manifest.key;
                const artifact = typeof manifest.artifact === "string" ? manifest.artifact : manifest.artifact?.filename;
                if (!manifest || backupKey !== context.backupKey || !artifact) {
                    continue;
                }

                const artifactPath = path.join(targetDir, artifact);
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
                    payload: {
                        manifest: manifest,
                        groupDate: /^\d{4}-\d{2}-\d{2}$/.test(path.basename(targetDir)) ? path.basename(targetDir) : undefined,
                    },
                });
            }
        }

        return entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    list(output: BackupOutputConfig, context: BackupOutputDriverContext): LocalBackupEntry[] {
        return this.listArtifacts(output, context);
    }

    readManifest(output: BackupOutputConfig, entry: LocalBackupEntry) {
        if (entry.payload?.manifest) {
            return entry.payload.manifest;
        }
        if (entry.manifestPath) {
            return safeReadJson(entry.manifestPath);
        }
        return null;
    }

    downloadArtifact(output: BackupOutputConfig, entry: LocalBackupEntry, targetPath: string) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.copyFileSync(entry.path, targetPath);
        return targetPath;
    }

    private protectIncrementalChains(entries: LocalBackupEntry[], deleted: LocalBackupEntry[], kept: LocalBackupEntry[]) {
        const keptChainIds = new Set(
            kept
                .map((entry) => this.readManifest({ driver: "local" }, entry))
                .map((manifest) => manifest?.chainId)
                .filter((chainId) => !!chainId),
        );
        if (keptChainIds.size < 1) {
            return { deleted, kept };
        }

        const nextDeleted: LocalBackupEntry[] = [];
        const nextKept = [...kept];
        const keptPaths = new Set(nextKept.map((entry) => entry.path));
        for (const entry of deleted) {
            const manifest = this.readManifest({ driver: "local" }, entry);
            if (manifest?.chainId && keptChainIds.has(manifest.chainId)) {
                if (!keptPaths.has(entry.path)) {
                    nextKept.push(entry);
                    keptPaths.add(entry.path);
                }
            } else {
                nextDeleted.push(entry);
            }
        }
        return { deleted: nextDeleted, kept: nextKept.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) };
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
        let deleted: LocalBackupEntry[] = [];
        let kept: LocalBackupEntry[] = [];

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
            } else {
                kept.push(entry);
            }
        }

        const protectedEntries = this.protectIncrementalChains(entries, deleted, kept);
        deleted = protectedEntries.deleted;
        kept = protectedEntries.kept;

        if (!options?.dryRun) {
            for (const entry of deleted) {
                fs.rmSync(entry.path, { recursive: true, force: true });
                if (entry.manifestPath) {
                    fs.rmSync(entry.manifestPath, { force: true });
                }
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
