import { ConsoleCommand } from "./ConsoleCommand";
export declare class QueueWorkerCommand extends ConsoleCommand {
    static signature: string;
    static description: string;
    workerKey: string | null;
    workerConfig: any;
    startTime: any;
    currentJob: any;
    jobTypes: any;
    autorestart: boolean;
    jobsExecuted: number;
    jobsSucceeded: number;
    jobsFailed: number;
    lastJob: any;
    log(message: string): void;
    handle(): Promise<void>;
    init(): boolean;
    canStart(): boolean;
    random(min: number, max: number): number;
    wait(ms: number): Promise<unknown>;
    waitRun(): Promise<unknown>;
    cancelRun(jobId: any): Promise<unknown>;
    updateWorkerStatus(values: {
        [key: string]: boolean | string | number | null;
    }): void;
    checkWorkerAutomation(): any;
    runAutomation(): Promise<void>;
    getNextJobNumber(connection: any): Promise<number>;
    checkStop(): boolean;
    run(): Promise<void>;
}
