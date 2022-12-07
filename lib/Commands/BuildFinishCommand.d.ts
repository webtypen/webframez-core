import { ConsoleCommand } from "./ConsoleCommand";
export declare class BuildFinishCommand extends ConsoleCommand {
    static signature: string;
    static description: string;
    handle(): Promise<void>;
}
