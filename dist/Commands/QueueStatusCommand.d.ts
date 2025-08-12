import { ConsoleCommand } from "./ConsoleCommand";
export declare class QueueStatusCommand extends ConsoleCommand {
    static signature: string;
    static description: string;
    handle(): Promise<void>;
}
