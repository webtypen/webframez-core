import { BaseQueueJob } from "../../Queue/BaseQueueJob";
import { BackupManager } from "../BackupManager";

export class BackupRunJob extends BaseQueueJob {
    async handle(job: any) {
        const backupKey = job && job.payload ? job.payload.backupKey : null;
        if (!backupKey || typeof backupKey !== "string") {
            throw new Error("BackupRunJob requires payload.backupKey.");
        }

        this.log(`Starting backup '${backupKey}'`);
        const result = await new BackupManager().run(backupKey, {
            channels: job.payload.channels,
        });
        this.log(`Backup '${backupKey}' finished`, {
            id: result.id,
            outputs: result.outputs,
            cleanup: result.cleanup,
        });
    }
}
