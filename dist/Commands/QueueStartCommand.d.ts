import { ConsoleCommand } from "./ConsoleCommand";
export declare class QueueStartCommand extends ConsoleCommand {
    static signature: string;
    static description: string;
    handle(): Promise<void>;
}
