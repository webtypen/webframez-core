import { BaseQueueJob } from "../../Queue/BaseQueueJob";
export declare class BackupRunJob extends BaseQueueJob {
    handle(job: any): Promise<void>;
}
