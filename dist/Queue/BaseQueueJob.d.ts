import { QueueJob } from "./QueueJob";
export declare class BaseQueueJob {
    attempts: number;
    currentLog: string;
    handle(job: any): Promise<any>;
    static create(props?: any): Promise<QueueJob>;
    log(...args: any): this;
    getLog(): string | null;
    wait(ms: number): Promise<unknown>;
    executeAgain(value?: number, unit?: "year" | "years" | "y" | "month" | "months" | "M" | "week" | "weeks" | "w" | "day" | "days" | "d" | "hour" | "hours" | "h" | "minute" | "minutes" | "m" | "second" | "seconds" | "s"): {
        __execute_again: Date;
    };
}
