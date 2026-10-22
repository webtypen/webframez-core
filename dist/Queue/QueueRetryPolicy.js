"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueRetryPolicy = void 0;
const Config_1 = require("../Config");
const QueueRetryLimitError_1 = require("./QueueRetryLimitError");
class QueueRetryPolicy {
    static resolve(jobclass, jobType, runtime) {
        var _a, _b;
        const policy = Object.assign(Object.assign(Object.assign(Object.assign({ maxAttempts: 100, maxErrorRetries: 3, maxFinalizationAttempts: 3, maxAgeSeconds: 86400, retryOn: "retryable", delaySeconds: 30, backoffMultiplier: 2, maxDelaySeconds: 300 }, Config_1.Config.get("queue.retry")), jobType === null || jobType === void 0 ? void 0 : jobType.retry), (_b = (_a = Config_1.Config.get("queue.jobs")) === null || _a === void 0 ? void 0 : _a[jobclass]) === null || _b === void 0 ? void 0 : _b.retry), runtime);
        for (const key of ["maxAttempts", "maxErrorRetries", "maxFinalizationAttempts", "maxAgeSeconds", "delaySeconds", "maxDelaySeconds"]) {
            const value = policy[key];
            if (!Number.isSafeInteger(value) || value < (key === "maxErrorRetries" ? 0 : 1)) {
                throw new QueueRetryLimitError_1.QueueRetryLimitError(`Invalid queue retry option '${key}' for '${jobclass}'. Expected a finite ${key === "maxErrorRetries" ? "non-negative" : "positive"} integer.`);
            }
        }
        if (!Number.isFinite(policy.backoffMultiplier) || policy.backoffMultiplier < 1) {
            throw new QueueRetryLimitError_1.QueueRetryLimitError(`Invalid queue retry backoffMultiplier for '${jobclass}'.`);
        }
        if (!["retryable", "all", "never"].includes(policy.retryOn)) {
            throw new QueueRetryLimitError_1.QueueRetryLimitError(`Invalid queue retryOn for '${jobclass}'.`);
        }
        if (policy.maxDelaySeconds < policy.delaySeconds) {
            throw new QueueRetryLimitError_1.QueueRetryLimitError(`Queue maxDelaySeconds must be at least delaySeconds for '${jobclass}'.`);
        }
        if (policy.stages !== undefined) {
            if (!Array.isArray(policy.stages) || policy.stages.length === 0 || policy.stages.some((stage) => !stage || !Number.isSafeInteger(stage.attempts) || stage.attempts < 1
                || !Number.isSafeInteger(stage.delaySeconds) || stage.delaySeconds < 0)) {
                throw new QueueRetryLimitError_1.QueueRetryLimitError(`Invalid queue retry stages for '${jobclass}'.`);
            }
            const total = policy.stages.reduce((sum, stage) => sum + stage.attempts, 0);
            if (!Number.isSafeInteger(total))
                throw new QueueRetryLimitError_1.QueueRetryLimitError("Queue retry stages exceed the safe attempt limit.");
            policy.maxAttempts = Math.min(policy.maxAttempts, total);
        }
        if (policy.deadlineAt !== undefined && (!(policy.deadlineAt instanceof Date) || !Number.isFinite(policy.deadlineAt.getTime()))) {
            throw new QueueRetryLimitError_1.QueueRetryLimitError("Invalid queue retry deadlineAt.");
        }
        return policy;
    }
    static attempts(job) {
        return Math.max(this.counter(job.attempts_made), Array.isArray(job.executions) ? job.executions.length : 0);
    }
    static failures(job) {
        return Math.max(this.counter(job.failed_attempts), Array.isArray(job.executions)
            ? job.executions.filter((execution) => execution.status === "failed").length : 0);
    }
    static counter(value) {
        return Number.isSafeInteger(value) && value >= 0 ? value : 0;
    }
    static startedAt(job, now) {
        const candidates = [job.first_started_at, ...(job.executions || []).map((execution) => execution.started_at)]
            .filter((value) => value != null)
            .map((value) => new Date(value).getTime())
            .filter(Number.isFinite);
        return new Date(candidates.reduce((earliest, time) => Math.min(earliest, time), now.getTime()));
    }
    static deadline(policy, job, now) {
        var _a, _b;
        return Math.min(this.startedAt(job, now).getTime() + policy.maxAgeSeconds * 1000, (_b = (_a = policy.deadlineAt) === null || _a === void 0 ? void 0 : _a.getTime()) !== null && _b !== void 0 ? _b : Infinity);
    }
    static stageDelay(policy, nextAttempt) {
        let until = 0;
        for (const stage of policy.stages || []) {
            until += stage.attempts;
            if (nextAttempt <= until)
                return stage.delaySeconds;
        }
        return undefined;
    }
    static assertCanRun(policy, job, attempts, now) {
        if (attempts >= policy.maxAttempts) {
            throw new QueueRetryLimitError_1.QueueRetryLimitError(`Queue job reached maxAttempts (${policy.maxAttempts}).`);
        }
        if (now.getTime() >= this.deadline(policy, job, now)) {
            throw new QueueRetryLimitError_1.QueueRetryLimitError(`Queue job reached maxAgeSeconds (${policy.maxAgeSeconds}).`);
        }
    }
    static rescheduleAt(policy, job, attempts, requested, now) {
        this.assertCanRun(policy, job, attempts, now);
        const timestamp = new Date(requested).getTime();
        if (!Number.isFinite(timestamp))
            throw new QueueRetryLimitError_1.QueueRetryLimitError("Invalid queue executeAgain date.");
        const delay = this.stageDelay(policy, attempts + 1);
        const next = Math.max(now.getTime() + (delay === undefined ? 1000 : delay * 1000), timestamp);
        // Wake at the deadline to finalize exhaustion, even if the requested delay is longer.
        return new Date(Math.min(next, this.deadline(policy, job, now)));
    }
    static retryAt(policy, job, attempts, failures, error, now) {
        var _a;
        if ((error === null || error === void 0 ? void 0 : error.retryable) === false || policy.retryOn === "never"
            || (policy.retryOn === "retryable" && (error === null || error === void 0 ? void 0 : error.retryable) !== true)
            || failures > policy.maxErrorRetries)
            return null;
        const seconds = (_a = this.stageDelay(policy, attempts + 1)) !== null && _a !== void 0 ? _a : Math.min(policy.maxDelaySeconds, policy.delaySeconds * Math.pow(policy.backoffMultiplier, (failures - 1)));
        try {
            return this.rescheduleAt(policy, job, attempts, new Date(now.getTime() + seconds * 1000), now);
        }
        catch (error) {
            if (error instanceof QueueRetryLimitError_1.QueueRetryLimitError)
                return null;
            throw error;
        }
    }
}
exports.QueueRetryPolicy = QueueRetryPolicy;
