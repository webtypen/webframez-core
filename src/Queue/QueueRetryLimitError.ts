export class QueueRetryLimitError extends Error {
    readonly retryable = false;

    constructor(message: string) {
        super(message);
        this.name = "QueueRetryLimitError";
    }
}
