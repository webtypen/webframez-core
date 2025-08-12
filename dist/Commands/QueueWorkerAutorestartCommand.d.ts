import { ConsoleCommand } from "./ConsoleCommand";
export declare class QueueWorkerAutorestartCommand extends ConsoleCommand {
    static signature: string;
    static description: string;
    static hidden: boolean;
    private isRunning;
    private restartCount;
    private maxRestarts;
    handle(): Promise<void>;
    private startWorker;
    private shutdown;
}
