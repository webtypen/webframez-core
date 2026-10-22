export interface QueueRetryOptions {
    /** Total handler executions, including executeAgain() and error retries. */
    maxAttempts: number;
    /** Additional executions after errors; polling does not consume this allowance. */
    maxErrorRetries: number;
    /** Bounded retries of onRetryExhausted; never re-executes the handler. */
    maxFinalizationAttempts: number;
    /** Maximum age since the first execution. */
    maxAgeSeconds: number;
    retryOn: "retryable" | "all" | "never";
    delaySeconds: number;
    backoffMultiplier: number;
    maxDelaySeconds: number;
    /** Delay before attempts in each stage; the first stage includes the initial execution. */
    stages?: {
        attempts: number;
        delaySeconds: number;
    }[];
    /** Optional domain deadline, also bounded by maxAgeSeconds. */
    deadlineAt?: Date;
}
export declare class QueueRetryPolicy {
    static resolve(jobclass: string, jobType?: {
        retry?: Partial<QueueRetryOptions>;
    }, runtime?: Partial<QueueRetryOptions>): QueueRetryOptions;
    static attempts(job: any): number;
    static failures(job: any): number;
    private static counter;
    static startedAt(job: any, now: Date): Date;
    static deadline(policy: QueueRetryOptions, job: any, now: Date): number;
    static stageDelay(policy: QueueRetryOptions, nextAttempt: number): number | undefined;
    static assertCanRun(policy: QueueRetryOptions, job: any, attempts: number, now: Date): void;
    static rescheduleAt(policy: QueueRetryOptions, job: any, attempts: number, requested: any, now: Date): Date;
    static retryAt(policy: QueueRetryOptions, job: any, attempts: number, failures: number, error: any, now: Date): Date | null;
}
