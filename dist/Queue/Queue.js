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
const crypto_1 = __importDefault(require("crypto"));
const DBConnection_1 = require("../Database/DBConnection");
const QueueJobsRegisty_1 = require("./QueueJobsRegisty");
/** Embedded worker for applications whose database must stay in one process (e.g. DuckDB).
 * Uses the same queue_jobs records and BaseQueueJob handlers as console workers. */
class Queue {
    static collection() {
        return __awaiter(this, void 0, void 0, function* () { return (yield DBConnection_1.DBConnection.getConnection()).client.db(null).collection("queue_jobs"); });
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
            this.running = this.runOnce(jobclasses).catch(() => { }).finally(() => { this.running = undefined; }); };
        this.timer = setInterval(tick, intervalMs);
        this.timer.unref();
        tick();
    }
    static stop() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () { if (this.timer)
            clearInterval(this.timer); this.timer = undefined; (_a = this.abort) === null || _a === void 0 ? void 0 : _a.abort(); yield this.running; });
    }
    static runOnce(jobclasses) {
        return __awaiter(this, void 0, void 0, function* () {
            const jobs = yield this.collection(), now = new Date();
            yield jobs.updateMany({ status: "running", embedded_queue: true, lease_until: { $lt: now } }, { $set: { status: "pending", worker: null, recovered: true } });
            const token = crypto_1.default.randomUUID();
            const claimed = yield jobs.findOneAndUpdate({ status: "pending", jobclass: { $in: jobclasses }, $or: [{ not_before: null }, { not_before: { $lte: now } }] }, { $set: { status: "running", worker: this.worker, embedded_queue: true, lease_token: token, lease_until: new Date(Date.now() + 60000), started_at: now } }, { sort: { priority: -1, created_at: 1 }, returnDocument: "after" });
            const job = (claimed === null || claimed === void 0 ? void 0 : claimed._id) ? claimed : claimed === null || claimed === void 0 ? void 0 : claimed.value;
            if (!job)
                return;
            const filter = { _id: job._id, lease_token: token, status: "running" };
            const controller = new AbortController();
            this.abort = controller;
            const heartbeat = setInterval(() => { void jobs.updateOne(filter, { $set: { lease_until: new Date(Date.now() + 60000) } }).then((result) => { if (!result.matchedCount)
                controller.abort(); }).catch(() => controller.abort()); }, 15000);
            heartbeat.unref();
            try {
                const Handler = QueueJobsRegisty_1.QueueJobsRegisty.getJobOrFail(job.jobclass), handler = new Handler();
                const result = yield handler.handle(Object.assign(Object.assign({}, job), { signal: controller.signal }));
                yield jobs.updateOne(filter, { $set: (result === null || result === void 0 ? void 0 : result.__execute_again) ? { status: "pending", not_before: result.__execute_again, worker: null } : { status: "finished", ended_at: new Date(), worker: null } });
            }
            catch (error) {
                // Handler owns log redaction. Do not persist raw exception output or credentials here.
                yield jobs.updateOne(filter, { $set: { status: "failed", ended_at: new Date(), worker: null, error: "Queue job failed. See the domain status for details." } });
            }
            finally {
                clearInterval(heartbeat);
                if (this.abort === controller)
                    this.abort = undefined;
            }
        });
    }
}
exports.Queue = Queue;
Queue.worker = "embedded-" + crypto_1.default.randomUUID();
