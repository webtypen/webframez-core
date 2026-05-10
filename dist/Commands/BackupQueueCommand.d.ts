import { ConsoleCommand } from "./ConsoleCommand";
export declare class BackupQueueCommand extends ConsoleCommand {
    static signature: string;
    static description: string;
    handle(): Promise<void>;
}
