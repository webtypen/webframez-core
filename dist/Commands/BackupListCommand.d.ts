import { ConsoleCommand } from "./ConsoleCommand";
export declare class BackupListCommand extends ConsoleCommand {
    static signature: string;
    static description: string;
    handle(): Promise<void>;
}
