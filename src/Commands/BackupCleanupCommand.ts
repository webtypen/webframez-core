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

export class BackupCleanupCommand extends ConsoleCommand {
    static signature = "backup:cleanup";
    static description = "Removes old backup artifacts according to retention rules";

    async handle() {
        const key = this.getArguments()[0];
        if (!key) {
            this.error("You must specify a backup key.");
            return;
        }

        const dryRun = this.getOption("dry-run") === true;
        const results = await new BackupManager().cleanup(key, {
            dryRun: dryRun,
            channels: parseChannels(this.getOption("channel")),
        });

        if (dryRun) {
            this.info(`Dry cleanup for backup '${key}' finished.`);
        } else {
            this.success(`Cleanup for backup '${key}' finished.`);
        }

        for (const result of results) {
            this.writeln(`  [color=blue]${result.driver}[/color]: ${result.deleted.length} delete candidate(s)`);
            for (const entry of result.deleted) {
                this.writeln(`    ${entry.filename} [color=grey]${entry.reason}[/color]`);
            }
        }
    }
}
