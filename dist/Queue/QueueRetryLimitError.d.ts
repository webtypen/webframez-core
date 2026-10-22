export declare class QueueRetryLimitError extends Error {
    readonly retryable = false;
    constructor(message: string);
}
