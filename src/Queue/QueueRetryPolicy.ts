import { Config } from "../Config";
import { QueueRetryLimitError } from "./QueueRetryLimitError";

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
    stages?: { attempts: number; delaySeconds: number }[];
    /** Optional domain deadline, also bounded by maxAgeSeconds. */
    deadlineAt?: Date;

}

export class QueueRetryPolicy {
    static resolve(jobclass: string, jobType?: { retry?: Partial<QueueRetryOptions> }, runtime?: Partial<QueueRetryOptions>): QueueRetryOptions {
        const policy: QueueRetryOptions = {
            maxAttempts: 100,
            maxErrorRetries: 3,
            maxFinalizationAttempts: 3,
            maxAgeSeconds: 86400,
            retryOn: "retryable",
            delaySeconds: 30,
            backoffMultiplier: 2,
            maxDelaySeconds: 300,
            ...Config.get("queue.retry"),
            ...jobType?.retry,
            ...Config.get("queue.jobs")?.[jobclass]?.retry,
            ...runtime,
        };

        for (const key of ["maxAttempts", "maxErrorRetries", "maxFinalizationAttempts", "maxAgeSeconds", "delaySeconds", "maxDelaySeconds"] as const) {
            const value = policy[key];
            if (!Number.isSafeInteger(value) || value < (key === "maxErrorRetries" ? 0 : 1)) {
                throw new QueueRetryLimitError(`Invalid queue retry option '${key}' for '${jobclass}'. Expected a finite ${key === "maxErrorRetries" ? "non-negative" : "positive"} integer.`);
            }
        }
        if (!Number.isFinite(policy.backoffMultiplier) || policy.backoffMultiplier < 1) {
            throw new QueueRetryLimitError(`Invalid queue retry backoffMultiplier for '${jobclass}'.`);
        }
        if (!["retryable", "all", "never"].includes(policy.retryOn)) {
            throw new QueueRetryLimitError(`Invalid queue retryOn for '${jobclass}'.`);
        }
        if (policy.maxDelaySeconds < policy.delaySeconds) {
            throw new QueueRetryLimitError(`Queue maxDelaySeconds must be at least delaySeconds for '${jobclass}'.`);
        }
        if (policy.stages !== undefined) {
            if (!Array.isArray(policy.stages) || policy.stages.length === 0 || policy.stages.some((stage) =>
                !stage || !Number.isSafeInteger(stage.attempts) || stage.attempts < 1
                || !Number.isSafeInteger(stage.delaySeconds) || stage.delaySeconds < 0)) {
                throw new QueueRetryLimitError(`Invalid queue retry stages for '${jobclass}'.`);
            }
            const total = policy.stages.reduce((sum, stage) => sum + stage.attempts, 0);
            if (!Number.isSafeInteger(total)) throw new QueueRetryLimitError("Queue retry stages exceed the safe attempt limit.");
            policy.maxAttempts = Math.min(policy.maxAttempts, total);
        }
        if (policy.deadlineAt !== undefined && (!(policy.deadlineAt instanceof Date) || !Number.isFinite(policy.deadlineAt.getTime()))) {
            throw new QueueRetryLimitError("Invalid queue retry deadlineAt.");
        }
        return policy;
    }

    static attempts(job: any): number {
        return Math.max(this.counter(job.attempts_made), Array.isArray(job.executions) ? job.executions.length : 0);
    }

    static failures(job: any): number {
        return Math.max(this.counter(job.failed_attempts), Array.isArray(job.executions)
            ? job.executions.filter((execution: any) => execution.status === "failed").length : 0);
    }

    private static counter(value: any): number {
        return Number.isSafeInteger(value) && value >= 0 ? value : 0;
    }

    static startedAt(job: any, now: Date): Date {
        const candidates = [job.first_started_at, ...(job.executions || []).map((execution: any) => execution.started_at)]
            .filter((value) => value != null)
            .map((value) => new Date(value).getTime())
            .filter(Number.isFinite);
        return new Date(candidates.reduce((earliest, time) => Math.min(earliest, time), now.getTime()));
    }

    static deadline(policy: QueueRetryOptions, job: any, now: Date): number {
        return Math.min(this.startedAt(job, now).getTime() + policy.maxAgeSeconds * 1000, policy.deadlineAt?.getTime() ?? Infinity);
    }

    static stageDelay(policy: QueueRetryOptions, nextAttempt: number): number | undefined {
        let until = 0;
        for (const stage of policy.stages || []) {
            until += stage.attempts;
            if (nextAttempt <= until) return stage.delaySeconds;
        }
        return undefined;
    }

    static assertCanRun(policy: QueueRetryOptions, job: any, attempts: number, now: Date) {
        if (attempts >= policy.maxAttempts) {
            throw new QueueRetryLimitError(`Queue job reached maxAttempts (${policy.maxAttempts}).`);
        }
        if (now.getTime() >= this.deadline(policy, job, now)) {
            throw new QueueRetryLimitError(`Queue job reached maxAgeSeconds (${policy.maxAgeSeconds}).`);
        }
    }

    static rescheduleAt(policy: QueueRetryOptions, job: any, attempts: number, requested: any, now: Date): Date {
        this.assertCanRun(policy, job, attempts, now);
        const timestamp = new Date(requested).getTime();
        if (!Number.isFinite(timestamp)) throw new QueueRetryLimitError("Invalid queue executeAgain date.");
        const delay = this.stageDelay(policy, attempts + 1);
        const next = Math.max(now.getTime() + (delay === undefined ? 1000 : delay * 1000), timestamp);
        // Wake at the deadline to finalize exhaustion, even if the requested delay is longer.
        return new Date(Math.min(next, this.deadline(policy, job, now)));
    }

    static retryAt(policy: QueueRetryOptions, job: any, attempts: number, failures: number, error: any, now: Date): Date | null {
        if (error?.retryable === false || policy.retryOn === "never"
            || (policy.retryOn === "retryable" && error?.retryable !== true)
            || failures > policy.maxErrorRetries) return null;

        const seconds = this.stageDelay(policy, attempts + 1)
            ?? Math.min(policy.maxDelaySeconds, policy.delaySeconds * policy.backoffMultiplier ** (failures - 1));
        try {
            return this.rescheduleAt(policy, job, attempts, new Date(now.getTime() + seconds * 1000), now);
        } catch (error) {
            if (error instanceof QueueRetryLimitError) return null;
            throw error;
        }
    }
}
