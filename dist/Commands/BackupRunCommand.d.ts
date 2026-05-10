import { ConsoleCommand } from "./ConsoleCommand";
export declare class BackupRunCommand extends ConsoleCommand {
    static signature: string;
    static description: string;
    handle(): Promise<void>;
}
