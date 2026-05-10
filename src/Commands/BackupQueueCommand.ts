import { BackupRunJob } from "../Backup/Jobs/BackupRunJob";
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

export class BackupQueueCommand extends ConsoleCommand {
    static signature = "backup:queue";
    static description = "Creates a queue job for a configured backup type";

    async handle() {
        const key = this.getArguments()[0];
        if (!key) {
            this.error("You must specify a backup key.");
            return;
        }

        const backupType = new BackupManager().resolveType(key);
        if (backupType.is_active === false) {
            this.error(`Backup type '${key}' is disabled.`);
            return;
        }

        const priority = this.getOption("priority");
        const worker = this.getOption("worker");
        const job = await BackupRunJob.create({
            payload: {
                backupKey: key,
                channels: parseChannels(this.getOption("channel")),
            },
            priority: priority && typeof priority === "string" ? parseInt(priority) || 0 : 0,
            worker: worker && typeof worker === "string" ? worker : null,
        });

        this.success(`Queued backup '${key}' as job #${job.number}.`);
    }
}
