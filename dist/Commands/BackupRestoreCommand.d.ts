import { ConsoleCommand } from "./ConsoleCommand";
export declare class BackupRestoreCommand extends ConsoleCommand {
    static signature: string;
    static description: string;
    handle(): Promise<void>;
}
