import { ConsoleCommand } from "./ConsoleCommand";
export declare class QueueStopCommand extends ConsoleCommand {
    static signature: string;
    static description: string;
    handle(): Promise<void>;
    isRunning(pid: number): boolean;
    stopWorker(workerKey: string, pid: number): Promise<void>;
}
