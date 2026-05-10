import { ConsoleCommand } from "./ConsoleCommand";
export declare class BackupCleanupCommand extends ConsoleCommand {
    static signature: string;
    static description: string;
    handle(): Promise<void>;
}
