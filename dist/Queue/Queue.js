"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Queue = void 0;
const ErrorHandler_1 = require("../ErrorHandling/ErrorHandler");
const crypto_1 = __importDefault(require("crypto"));
const DBConnection_1 = require("../Database/DBConnection");
const QueueJobsRegisty_1 = require("./QueueJobsRegisty");
const QueueRetryLimitError_1 = require("./QueueRetryLimitError");
const QueueRetryPolicy_1 = require("./QueueRetryPolicy");
/** Embedded worker for applications whose database must stay in one process (e.g. DuckDB).
 * Uses the same queue_jobs records and BaseQueueJob handlers as console workers. */
class Queue {
    static collection() {
        return __awaiter(this, void 0, void 0, function* () { return (yield DBConnection_1.DBConnection.getDocumentStore()).collection("queue_jobs"); });
    }
    static enqueue(jobclass, props = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            QueueJobsRegisty_1.QueueJobsRegisty.getJobOrFail(jobclass);
            const jobs = yield this.collection(), id = props._id || crypto_1.default.randomUUID();
            yield jobs.updateOne({ _id: id }, { $setOnInsert: Object.assign(Object.assign({}, props), { _id: id, jobclass, status: "pending", created_at: new Date(), not_before: null, worker: null }) }, { upsert: true });
            return jobs.findOne({ _id: id });
        });
    }
    static start(jobclasses, intervalMs = 1000) {
        if (this.timer)
            return;
        const tick = () => { if (!this.running)
            this.running = this.runOnce(jobclasses).catch(error => ErrorHandler_1.ErrorHandler.report(error, { scope: "job", source: "queue.embedded.poll", job: { worker: this.worker } })).finally(() => { this.running = undefined; }); };
        this.timer = setInterval(tick, intervalMs);
        this.timer.unref();
        tick();
    }
    static stop() {
        return __awaiter(this, void 0, void 0, function* () { if (this.timer)
            clearInterval(this.timer); this.timer = undefined; for (const controller of this.controllers)
            controller.abort(); yield this.running; });
    }
    /** Independent bounded worker pool. Draining stops claims and lets active jobs finish. */
    static createWorker(jobclasses, options = {}) {
        var _a, _b;
        const concurrency = (_a = options.concurrency) !== null && _a !== void 0 ? _a : 1;
        const intervalMs = (_b = options.intervalMs) !== null && _b !== void 0 ? _b : 1000;
        if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32 || !Number.isFinite(intervalMs) || intervalMs < 10) {
            throw new Error("Invalid queue worker concurrency or polling interval.");
        }
        const controller = new AbortController();
        const active = new Set();
        let stopped = false;
        const tick = () => {
            if (stopped)
                return;
            while (active.size < concurrency) {
                const work = this.runOnce(jobclasses, controller.signal)
                    .catch(error => ErrorHandler_1.ErrorHandler.report(error, { scope: "job", source: "queue.embedded.poll" }))
                    .then(() => undefined)
                    .finally(() => { active.delete(work); });
                active.add(work);
            }
        };
        const timer = setInterval(tick, intervalMs);
        timer.unref();
        tick();
        return {
            stop: ({ drain = false } = {}) => __awaiter(this, void 0, void 0, function* () {
                stopped = true;
                clearInterval(timer);
                if (!drain)
                    controller.abort();
                yield Promise.all([...active]);
            }),
        };
    }
    static runOnce(jobclasses, signal) {
        return __awaiter(this, void 0, void 0, function* () {
            if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                return;
            const jobs = yield this.collection(), now = new Date();
            yield jobs.updateMany({ status: "running", embedded_queue: true, lease_until: { $lt: now } }, { $set: { status: "pending", worker: null, recovered: true } });
            const token = crypto_1.default.randomUUID();
            const claimed = yield jobs.findOneAndUpdate({ status: "pending", jobclass: { $in: jobclasses }, $or: [{ not_before: null }, { not_before: { $lte: now } }] }, { $set: { status: "running", worker: this.worker, embedded_queue: true, lease_token: token, lease_until: new Date(Date.now() + 60000), started_at: now } }, { sort: { priority: -1, created_at: 1 }, returnDocument: "after" });
            const job = claimed;
            if (!job)
                return;
            return ErrorHandler_1.ErrorHandler.withContext({ scope: "job", operationId: token, source: "queue.embedded", job: { id: String(job._id), number: job.number, jobclass: job.jobclass, worker: this.worker, attempt: QueueRetryPolicy_1.QueueRetryPolicy.attempts(job) + 1 } }, () => __awaiter(this, void 0, void 0, function* () {
                var _a;
                const filter = { _id: job._id, lease_token: token, status: "running" };
                const controller = new AbortController();
                this.controllers.add(controller);
                const abort = () => controller.abort();
                signal === null || signal === void 0 ? void 0 : signal.addEventListener("abort", abort, { once: true });
                if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                    controller.abort();
                const heartbeat = setInterval(() => { void jobs.updateOne(filter, { $set: { lease_until: new Date(Date.now() + 60000) } }).then((result) => { if (!result.matchedCount)
                    controller.abort(); }).catch(() => controller.abort()); }, 15000);
                heartbeat.unref();
                const previousAttempts = QueueRetryPolicy_1.QueueRetryPolicy.attempts(job);
                const previousFailures = QueueRetryPolicy_1.QueueRetryPolicy.failures(job);
                job.first_started_at = QueueRetryPolicy_1.QueueRetryPolicy.startedAt(job, now);
                job.attempts_made = previousAttempts + 1;
                let policy = null;
                let handler = null;
                try {
                    // Persist the attempt before calling user code, including across lease recovery.
                    const reserved = yield jobs.updateOne(filter, { $set: {
                            first_started_at: job.first_started_at,
                            attempts_made: job.attempts_made,
                            failed_attempts: previousFailures,
                        } });
                    if (!reserved.matchedCount)
                        return;
                    const Handler = QueueJobsRegisty_1.QueueJobsRegisty.getJobOrFail(job.jobclass);
                    handler = new Handler();
                    policy = QueueRetryPolicy_1.QueueRetryPolicy.resolve(job.jobclass, Handler, yield ((_a = handler.retryPolicy) === null || _a === void 0 ? void 0 : _a.call(handler, job)));
                    if (job.retry_exhaustion_attempts)
                        throw new QueueRetryLimitError_1.QueueRetryLimitError("Retry exhaustion finalization pending.");
                    QueueRetryPolicy_1.QueueRetryPolicy.assertCanRun(policy, job, previousAttempts, now);
                    const result = yield ErrorHandler_1.ErrorHandler.withContext({ scope: "job", operationId: token, source: "queue.embedded", job: { id: String(job._id), number: job.number, jobclass: job.jobclass, worker: this.worker, attempt: job.attempts_made } }, () => handler.handle(Object.assign(Object.assign({}, job), { signal: controller.signal })));
                    const endedAt = new Date();
                    const retryAt = (result === null || result === void 0 ? void 0 : result.__execute_again)
                        ? QueueRetryPolicy_1.QueueRetryPolicy.rescheduleAt(policy, job, job.attempts_made, result.__execute_again, endedAt)
                        : null;
                    yield jobs.updateOne(filter, { $set: {
                            status: retryAt ? "pending" : "finished",
                            not_before: retryAt,
                            ended_at: retryAt ? null : endedAt,
                            worker: null,
                            error: null,
                        } });
                }
                catch (error) {
                    const endedAt = new Date();
                    const failures = previousFailures + 1;
                    let retryAt = policy
                        ? QueueRetryPolicy_1.QueueRetryPolicy.retryAt(policy, job, job.attempts_made, failures, error, endedAt)
                        : null;
                    let recovered = false;
                    let finalizationFailed = false;
                    const exhausted = policy && (error instanceof QueueRetryLimitError_1.QueueRetryLimitError
                        || policy.retryOn !== "never" && (error === null || error === void 0 ? void 0 : error.retryable) !== false && (policy.retryOn === "all" || (error === null || error === void 0 ? void 0 : error.retryable) === true) && !retryAt);
                    if (exhausted && (handler === null || handler === void 0 ? void 0 : handler.onRetryExhausted) && (job.retry_exhaustion_attempts || 0) < policy.maxFinalizationAttempts) {
                        job.retry_exhaustion_attempts = (job.retry_exhaustion_attempts || 0) + 1;
                        try {
                            recovered = (yield handler.onRetryExhausted(job, error)) === "finished";
                        }
                        catch (finalizationError) {
                            yield ErrorHandler_1.ErrorHandler.report(finalizationError, { scope: "job", source: "queue.embedded.finalization", job: { id: String(job._id), jobclass: job.jobclass, worker: this.worker } });
                            finalizationFailed = true;
                            if ((finalizationError === null || finalizationError === void 0 ? void 0 : finalizationError.retryable) !== false && job.retry_exhaustion_attempts < policy.maxFinalizationAttempts) {
                                retryAt = new Date(endedAt.getTime() + policy.delaySeconds * 1000);
                            }
                        }
                    }
                    yield ErrorHandler_1.ErrorHandler.withContext({ operationId: token }, () => ErrorHandler_1.ErrorHandler.report(error, { scope: "job", source: "queue.embedded", job: { id: String(job._id), number: job.number, jobclass: job.jobclass, worker: this.worker, attempt: job.attempts_made, status: recovered ? "finished" : retryAt ? "pending" : "failed", retryAt: (retryAt === null || retryAt === void 0 ? void 0 : retryAt.toISOString()) || null } }));
                    // Handler owns log redaction. Do not persist raw exception output or credentials here.
                    yield jobs.updateOne(filter, { $set: {
                            status: recovered ? "finished" : retryAt ? "pending" : "failed",
                            not_before: retryAt,
                            ended_at: retryAt ? null : endedAt,
                            failed_attempts: failures,
                            worker: null,
                            retry_exhaustion_attempts: job.retry_exhaustion_attempts || 0,
                            retry_exhaustion_error: finalizationFailed ? "Queue exhaustion finalization failed. See the domain status for details." : null,
                            error: recovered ? null : retryAt ? "Queue job will be retried." : "Queue job failed or reached its retry limit. See the domain status for details.",
                        } });
                }
                finally {
                    clearInterval(heartbeat);
                    this.controllers.delete(controller);
                    signal === null || signal === void 0 ? void 0 : signal.removeEventListener("abort", abort);
                }
            }));
        });
    }
}
exports.Queue = Queue;
Queue.controllers = new Set();
Queue.worker = "embedded-" + crypto_1.default.randomUUID();
