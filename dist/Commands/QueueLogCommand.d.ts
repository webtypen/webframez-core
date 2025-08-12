import { ConsoleCommand } from "./ConsoleCommand";
export declare class QueueLogCommand extends ConsoleCommand {
    static signature: string;
    static description: string;
    handle(): Promise<void>;
}
