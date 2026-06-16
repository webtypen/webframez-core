import { BackupManager } from "../Backup/BackupManager";
import { ConsoleCommand } from "./ConsoleCommand";

function parseChannels(value: string | boolean | null) {
    if (!value || typeof value !== "string") {
        return undefined;
    }

    return value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry !== "");
}

export class BackupRestoreCommand extends ConsoleCommand {
    static signature = "backup:restore";
    static description = "Restores a configured backup into a new or empty directory";

    async handle() {
        const key = this.getArguments()[0];
        const targetDir = this.getArguments()[1];
        if (!key) {
            this.error("You must specify a backup key.");
            return;
        }

        const backupId = this.getOption("backup-id");
        const result = await new BackupManager().restore(key, targetDir, {
            backupId: typeof backupId === "string" ? backupId.trim() : undefined,
            channels: parseChannels(this.getOption("channel")),
            dryRun: this.getOption("dry-run") === true,
        });

        if (!backupId) {
            this.info(`Restore points for backup '${key}':`);
            for (const point of result.restorePoints || []) {
                this.writeln(
                    `  [color=blue]${point.backupId}[/color] ${point.kind} ${point.filename} [color=grey]${point.createdAt.toISOString()}[/color]`,
                );
            }
            return;
        }

        if (result.dryRun) {
            this.info(`Dry restore for backup '${key}' finished.`);
        } else {
            this.success(`Restore for backup '${key}' finished.`);
        }

        this.writeln(`  Target: ${result.targetDir}`);
        this.writeln(`  Chain: ${(result.chain || []).map((point) => `${point.backupId}:${point.kind}`).join(", ")}`);
        this.writeln(`  Restored artifacts: ${result.restored?.length || 0}`);
        this.writeln(`  Deleted files: ${result.deleted?.length || 0}`);
    }
}
