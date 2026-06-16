import { ConsoleCommand } from "./ConsoleCommand";
export declare class BackupRestorePointsCommand extends ConsoleCommand {
    static signature: string;
    static description: string;
    handle(): Promise<void>;
}
