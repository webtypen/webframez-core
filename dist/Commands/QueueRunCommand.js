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
exports.QueueRunCommand = void 0;
const fs_1 = __importDefault(require("fs"));
const moment_1 = __importDefault(require("moment"));
const ConsoleCommand_1 = require("./ConsoleCommand");
const QueueJobsRegisty_1 = require("../Queue/QueueJobsRegisty");
const FileFunctions_1 = require("../Functions/FileFunctions");
const QueueJob_1 = require("../Queue/QueueJob");
const StringFunctions_1 = require("../Functions/StringFunctions");
class QueueRunCommand extends ConsoleCommand_1.ConsoleCommand {
    constructor() {
        super(...arguments);
        // State
        this.workerKey = "main";
        this.startTime = null;
        this.currentJob = null;
        this.jobTypes = {};
        // Statistics
        this.jobsExecuted = 0;
        this.jobsSucceeded = 0;
        this.jobsFailed = 0;
        this.lastJob = null;
    }
    log(message) {
        this.writeln(`[${(0, moment_1.default)().format("YYYY-MM-DD HH:mm:ss")}] ${message}`);
    }
    handle() {
        return __awaiter(this, void 0, void 0, function* () {
            this.startTime = (0, moment_1.default)();
            if (!this.canStart()) {
                return;
            }
            this.log("Queue started");
            yield this.run();
        });
    }
    canStart() {
        // Register Job-Types
        for (let entry of QueueJobsRegisty_1.QueueJobsRegisty.getJobs()) {
            this.jobTypes[entry.name] = entry;
        }
        const file = (0, FileFunctions_1.storageDir)("queue", `worker_${this.workerKey}.json`);
        if (!fs_1.default.existsSync(file)) {
            return true;
        }
        const json = JSON.parse(fs_1.default.readFileSync(file, "utf-8"));
        if (!json || !json.updated_at) {
            return true;
        }
        if (json.last_job) {
            this.lastJob = json.last_job;
        }
        const diff = (0, moment_1.default)().diff((0, moment_1.default)(json.updated_at), "seconds");
        if (diff && diff >= 30) {
            return true;
        }
        return true;
        this.writeln(`Worker '${this.workerKey}' is already running in Process${json.pid ? " " + json.pid : ""} (last update ${diff <= 180 ? diff + " seconds ago" : (diff / 60).toFixed(0) + " minutes ago"})`);
        return false;
    }
    updateLock() {
        if (!fs_1.default.existsSync((0, FileFunctions_1.storageDir)("queue"))) {
            fs_1.default.mkdirSync((0, FileFunctions_1.storageDir)("queue"), { recursive: true });
        }
        fs_1.default.writeFileSync((0, FileFunctions_1.storageDir)("queue", `worker_${this.workerKey}.json`), JSON.stringify({
            key: this.workerKey,
            pid: process.pid,
            started_at: this.startTime.format("YYYY-MM-DD HH:mm:ss"),
            updated_at: (0, moment_1.default)().format("YYYY-MM-DD HH:mm:ss"),
            current_job: this.currentJob
                ? {
                    _id: this.currentJob._id,
                    started_at: this.currentJob.started_at,
                }
                : null,
            last_job: this.lastJob,
        }));
    }
    random(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    wait(ms) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve) => {
                setTimeout(() => resolve(true), ms);
            });
        });
    }
    waitRun() {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
                this.updateLock();
                yield this.wait(5000);
                resolve(true);
            }));
        });
    }
    run() {
        return __awaiter(this, void 0, void 0, function* () {
            while (true) {
                this.updateLock();
                const now = (0, moment_1.default)();
                const check = yield QueueJob_1.QueueJob.aggregate([
                    {
                        $match: {
                            status: "pending",
                            jobclass: { $ne: null },
                            $or: [
                                {
                                    start_at: null,
                                },
                                {
                                    start_at: { $lte: now.toDate() },
                                },
                            ],
                        },
                    },
                    {
                        $limit: 1,
                    },
                ]);
                if (!check || !check[0] || !check[0]._id) {
                    this.currentJob = null;
                    yield this.waitRun();
                    continue;
                }
                yield this.wait(this.random(200, 600));
                const job = yield QueueJob_1.QueueJob.where("_id", "=", check[0]._id).first();
                if (!job || job.status !== "pending") {
                    this.currentJob = null;
                    yield this.waitRun();
                    continue;
                }
                this.log(`Start Job #${job.number} - ${job.jobclass}`);
                const startedAt = new Date();
                const executionKey = (0, moment_1.default)().format("YYYYMMDDHHmmss") + StringFunctions_1.StringFunctions.random(24);
                job.status = "running";
                job.started_at = startedAt;
                job.ended_at = null;
                job.executions = [
                    { key: executionKey, worker: this.workerKey, status: "running", started_at: startedAt },
                    ...(job.executions && job.executions.length > 0 ? job.executions : []),
                ];
                yield job.save();
                this.currentJob = {
                    _id: job._id.toString(),
                    execution_key: executionKey,
                    started_at: startedAt,
                    job_executions_count: job.executions.length,
                };
                let jobInstance = null;
                const jobType = this.jobTypes && this.jobTypes[job.jobclass] ? this.jobTypes[job.jobclass] : null;
                try {
                    if (!jobType) {
                        throw new Error(`QueueError: Invalid job-type ${job.jobclass}`);
                    }
                    jobInstance = new jobType();
                    const result = yield jobInstance.handle(job);
                    const endedAt = new Date();
                    job.status = "finished";
                    job.ended_at = endedAt;
                    job.executions[0].status = "finished";
                    job.executions[0].ended_at = endedAt;
                    job.executions[0].log = jobInstance.getLog();
                    job.executions[0].duration_ms = (0, moment_1.default)().diff((0, moment_1.default)(startedAt), "milliseconds");
                    if (result && typeof result === "object" && result.__execute_again) {
                        job.status = "pending";
                        job.start_at = result.__execute_again;
                    }
                    yield job.save();
                    this.jobsSucceeded++;
                    this.log(`Finished Job #${job.number} - ${job.jobclass} - ${(job.executions[0].duration_ms / 1000).toFixed(2)}s`);
                }
                catch (e) {
                    const errorMessage = e instanceof Error ? e.stack || e.message : String(e);
                    const endedAt = new Date();
                    job.status = "failed";
                    job.ended_at = endedAt;
                    job.executions[0].status = "failed";
                    job.executions[0].ended_at = endedAt;
                    job.executions[0].error = errorMessage;
                    job.executions[0].duration_ms = (0, moment_1.default)().diff((0, moment_1.default)(startedAt), "milliseconds");
                    if (jobInstance) {
                        job.executions[0].log = jobInstance.getLog();
                    }
                    yield job.save();
                    this.jobsFailed++;
                    this.log(`Failed Job #${job.number} - ${job.jobclass} - ${(job.executions[0].duration_ms / 1000).toFixed(2)}s`);
                }
                this.jobsExecuted++;
                this.currentJob = null;
                yield this.waitRun();
            }
        });
    }
}
exports.QueueRunCommand = QueueRunCommand;
// Command
QueueRunCommand.signature = "queue:run";
QueueRunCommand.description = "Run a queue worker";
