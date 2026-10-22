import { QueueJob } from "./QueueJob";
import type { QueueRetryOptions } from "./QueueRetryPolicy";
export declare class BaseQueueJob {
    static retry?: Partial<QueueRetryOptions>;
    /** @deprecated Previously unused. Configure static retry or queue.jobs instead. */
    attempts: number;
    currentLog: string;
    handle(job: any): Promise<any>;
    retryPolicy(job: any): Promise<Partial<QueueRetryOptions> | undefined>;
    /** Called once on terminal budget exhaustion. Return "finished" if reconciliation resolved the job. */
    onRetryExhausted(job: any, error: Error): Promise<"finished" | void>;
    static create(props?: any): Promise<QueueJob>;
    log(...args: any): this;
    getLog(): string | null;
    wait(ms: number): Promise<unknown>;
    executeAgain(value?: number, unit?: "year" | "years" | "y" | "month" | "months" | "M" | "week" | "weeks" | "w" | "day" | "days" | "d" | "hour" | "hours" | "h" | "minute" | "minutes" | "m" | "second" | "seconds" | "s"): {
        __execute_again: Date;
    };
}
