import { ConsoleCommand } from "./ConsoleCommand";
export declare class QueueRunCommand extends ConsoleCommand {
    static signature: string;
    static description: string;
    workerKey: string;
    startTime: any;
    currentJob: any;
    jobTypes: any;
    jobsExecuted: number;
    jobsSucceeded: number;
    jobsFailed: number;
    lastJob: any;
    log(message: string): void;
    handle(): Promise<void>;
    canStart(): boolean;
    updateLock(): void;
    random(min: number, max: number): number;
    wait(ms: number): Promise<unknown>;
    waitRun(): Promise<unknown>;
    run(): Promise<void>;
}
