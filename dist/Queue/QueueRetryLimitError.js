"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueRetryLimitError = void 0;
class QueueRetryLimitError extends Error {
    constructor(message) {
        super(message);
        this.retryable = false;
        this.name = "QueueRetryLimitError";
    }
}
exports.QueueRetryLimitError = QueueRetryLimitError;
