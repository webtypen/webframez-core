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

export class BackupRestorePointsCommand extends ConsoleCommand {
    static signature = "backup:restore-points";
    static description = "Lists restorable backup points";

    async handle() {
        const key = this.getArguments()[0];
        if (!key) {
            this.error("You must specify a backup key.");
            return;
        }

        const points = await new BackupManager().listRestorePoints(key, {
            channels: parseChannels(this.getOption("channel")),
        });

        this.info(`Restore points for backup '${key}':`);
        if (points.length < 1) {
            this.writeln("  [color=grey]No restore points found.[/color]");
            return;
        }

        for (const point of points) {
            this.writeln(
                `  [color=blue]${point.backupId}[/color] ${point.kind} ${point.filename} [color=grey]${point.createdAt.toISOString()}[/color]`,
            );
        }
    }
}
