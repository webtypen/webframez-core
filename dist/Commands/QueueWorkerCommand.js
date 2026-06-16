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
exports.QueueWorkerCommand = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const moment_timezone_1 = __importDefault(require("moment-timezone"));
const ConsoleCommand_1 = require("./ConsoleCommand");
const QueueJobsRegisty_1 = require("../Queue/QueueJobsRegisty");
const FileFunctions_1 = require("../Functions/FileFunctions");
const StringFunctions_1 = require("../Functions/StringFunctions");
const Config_1 = require("../Config");
const DBConnection_1 = require("../Database/DBConnection");
const ErrorHandler_1 = require("../ErrorHandling/ErrorHandler");
const BackupManager_1 = require("../Backup/BackupManager");
const WebframezHooks_1 = require("../Hooks/WebframezHooks");
const AutomationSchedule_1 = require("../Queue/AutomationSchedule");
class QueueWorkerCommand extends ConsoleCommand_1.ConsoleCommand {
    constructor() {
        super(...arguments);
        // State
        this.workerKey = null;
        this.workerConfig = null;
        this.startTime = null;
        this.currentJob = null;
        this.jobTypes = {};
        this.autorestart = false;
        this.workerOperationId = null;
        this.workerHadError = false;
        this.lastAutomationCheckAt = null;
        // Statistics
        this.jobsExecuted = 0;
        this.jobsSucceeded = 0;
        this.jobsFailed = 0;
        this.lastJob = null;
    }
    log(message) {
        this.writeln(`[${this.workerKey} | ${(0, moment_timezone_1.default)()
            .tz(this.workerConfig.timezone ? this.workerConfig.timezone : "Europe/Berlin")
            .format("YY-MM-DD HH:mm:ss")}] ${message}`);
    }
    formatAutomationCommand(automation) {
        if (automation.jobclass === "BackupRunJob" && automation.payload && automation.payload.backupKey) {
            return `backup:run ${automation.payload.backupKey}`;
        }
        return automation.jobclass || "unknown";
    }
    formatAutomationExecution(execution) {
        if (!Array.isArray(execution)) {
            return "invalid execution";
        }
        const [type, value, rawOptions, rawExtraOptions] = execution;
        const options = type === "monthly" && typeof rawOptions === "string" ? rawExtraOptions : rawOptions;
        const suffix = options && options.identifier ? ` (${options.identifier})` : "";
        if (type === "daily") {
            return `daily at ${value}${suffix}`;
        }
        if (type === "every_hour") {
            return `every hour at minute ${value !== undefined && value !== null ? value : 0}${suffix}`;
        }
        if (type === "every_x_mins") {
            return `every ${value} minute(s)${suffix}`;
        }
        if (type === "monthly") {
            return `monthly on day ${value} at ${rawOptions}${suffix}`;
        }
        if (value !== undefined && value !== null) {
            return `${type} at ${value}${suffix}`;
        }
        return `${type}${suffix}`;
    }
    logRegisteredAutomation() {
        const automations = this.getWorkerAutomation();
        if (!automations || automations.length < 1) {
            this.log("Registered automations: none");
            return;
        }
        this.log("Registered automations:");
        for (const automation of automations) {
            const command = this.formatAutomationCommand(automation);
            const executions = automation.executions && Array.isArray(automation.executions) && automation.executions.length > 0
                ? automation.executions.map((execution) => this.formatAutomationExecution(execution)).join(", ")
                : "no executions";
            this.log(`- ${command}: ${executions}`);
        }
    }
    handle() {
        return __awaiter(this, void 0, void 0, function* () {
            const workerKey = this.getOption("worker");
            if (!workerKey || typeof workerKey !== "string" || workerKey.trim() === "") {
                this.error("You must specify a worker key using --worker=<worker_key>");
                return;
            }
            this.workerConfig = Config_1.Config.get("queue.workers." + workerKey);
            if (!this.workerConfig) {
                this.error(`Worker '${workerKey}' is not defined in the queue configuration.`);
                return;
            }
            if (!this.workerConfig.is_active) {
                this.error(`Worker '${workerKey}' is disabled in the queue configuration.`);
                return;
            }
            this.workerKey = workerKey;
            this.startTime = (0, moment_timezone_1.default)().tz(this.workerConfig.timezone ? this.workerConfig.timezone : "Europe/Berlin");
            if (!this.init()) {
                return;
            }
            this.workerOperationId = WebframezHooks_1.WebframezHooks.createOperationId("worker");
            yield WebframezHooks_1.WebframezHooks.emit("queue.worker.start", {
                operationId: this.workerOperationId,
                name: workerKey,
                attributes: {
                    "webframez.queue.worker": workerKey,
                },
            });
            try {
                this.log("Queue started");
                this.logRegisteredAutomation();
                yield this.run();
            }
            catch (e) {
                this.workerHadError = true;
                if (this.workerOperationId) {
                    yield WebframezHooks_1.WebframezHooks.emit("queue.worker.error", {
                        operationId: this.workerOperationId,
                        name: workerKey,
                        status: "error",
                        error: e,
                        attributes: {
                            "webframez.queue.worker": workerKey,
                        },
                    });
                }
                yield ErrorHandler_1.ErrorHandler.report(e, {
                    scope: "command",
                    source: "queue.worker.run",
                    command: {
                        signature: this.constructor.signature,
                        className: this.constructor.name,
                        args: this.args,
                    },
                    metadata: {
                        worker: this.workerKey,
                    },
                });
                this.error(`Queue run failed: ${e instanceof Error ? e.message : String(e)}`);
            }
            finally {
                if (!this.workerHadError && this.workerOperationId) {
                    yield WebframezHooks_1.WebframezHooks.emit("queue.worker.end", {
                        operationId: this.workerOperationId,
                        name: workerKey,
                        status: "ok",
                        attributes: {
                            "webframez.queue.worker": workerKey,
                        },
                    });
                }
                this.log("Queue stopped");
                this.updateWorkerStatus({
                    status: "stopped",
                    ended_at: new Date().toISOString(),
                });
            }
        });
    }
    init() {
        // Register Job-Types
        for (let entry of QueueJobsRegisty_1.QueueJobsRegisty.getJobs()) {
            this.jobTypes[entry.name] = entry;
        }
        if (!this.canStart()) {
            return false;
        }
        if (!fs_1.default.existsSync((0, FileFunctions_1.storageDir)("queue"))) {
            fs_1.default.mkdirSync((0, FileFunctions_1.storageDir)("queue"), { recursive: true });
        }
        const filePath = (0, FileFunctions_1.storageDir)("queue", `worker_${this.workerKey}.json`);
        let lastLogFile = null;
        if (fs_1.default.existsSync(filePath)) {
            try {
                const json = JSON.parse(fs_1.default.readFileSync(filePath, "utf-8"));
                if (json && typeof json === "object") {
                    lastLogFile = json;
                }
            }
            catch (e) {
                console.error(e);
            }
        }
        fs_1.default.writeFileSync(filePath, JSON.stringify(Object.assign(Object.assign({ worker: this.workerKey, config: this.workerConfig, pid: process.pid, started_at: new Date(), status: "waiting" }, (lastLogFile && lastLogFile.log_file ? { log_file: lastLogFile.log_file } : {})), (lastLogFile && lastLogFile.autorestart ? { autorestart: true } : {}))), "utf-8");
        if (lastLogFile && lastLogFile.autorestart) {
            this.autorestart = true;
        }
        return true;
    }
    canStart() {
        const filePath = (0, FileFunctions_1.storageDir)("queue", `worker_${this.workerKey}.json`);
        if (!fs_1.default.existsSync(filePath)) {
            return true;
        }
        let file = null;
        try {
            file = JSON.parse(fs_1.default.readFileSync(filePath, "utf-8"));
        }
        catch (e) {
            return true;
        }
        if (!file || !file.pid || parseInt(file.pid) < 1 || parseInt(file.pid) === process.pid) {
            return true;
        }
        const isRunning = (() => {
            try {
                // Signal 0 does not kill the process, just checks if it exists
                process.kill(parseInt(file.pid), 0);
                return true;
            }
            catch (e) {
                return false;
            }
        })();
        if (isRunning) {
            this.error(`Worker '${this.workerKey}' is already running (PID: ${file.pid} | Current-PID: ${process.pid}).`);
            return false;
        }
        return true;
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
                this.updateWorkerStatus({
                    status: "waiting",
                    status_at: new Date().toISOString(),
                    current_job: null,
                });
                yield this.wait(1000);
                resolve(true);
            }));
        });
    }
    cancelRun(jobId) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
                const connection = yield DBConnection_1.DBConnection.getConnection();
                yield connection.client
                    .db(null)
                    .collection("queue_jobs")
                    .updateOne({
                    _id: jobId,
                }, {
                    $set: { status: "canceled" },
                });
                yield this.waitRun();
                resolve(true);
            }));
        });
    }
    updateWorkerStatus(values) {
        const filePath = (0, FileFunctions_1.storageDir)("queue", `worker_${this.workerKey}.json`);
        if (!fs_1.default.existsSync(filePath))
            return;
        const json = JSON.parse(fs_1.default.readFileSync(filePath, "utf-8"));
        for (const key in values) {
            json[key] = values[key];
        }
        fs_1.default.writeFileSync(filePath, JSON.stringify(json), "utf-8");
    }
    getWorkerAutomation() {
        const out = [];
        if (this.workerConfig && this.workerConfig.automation && Array.isArray(this.workerConfig.automation)) {
            out.push(...this.workerConfig.automation);
        }
        if (Config_1.Config.get("backup")) {
            try {
                out.push(...new BackupManager_1.BackupManager().getAutomationEntries(this.workerKey || undefined));
            }
            catch (e) {
                this.log(`Backup automation config failed: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        return out;
    }
    getWorkerJobclasses() {
        if (!this.workerConfig || !this.workerConfig.jobclasses || this.workerConfig.jobclasses.length < 1) {
            return null;
        }
        const jobclasses = [...this.workerConfig.jobclasses];
        if (Config_1.Config.get("backup") && !jobclasses.includes("BackupRunJob")) {
            jobclasses.push("BackupRunJob");
        }
        return jobclasses;
    }
    getWorkerTimezone() {
        return this.workerConfig.timezone ? this.workerConfig.timezone : "Europe/Berlin";
    }
    getAutomationExecutionPayload(automation, options) {
        return automation.payload || (options && options.payload)
            ? Object.assign(Object.assign({}, (automation.payload ? automation.payload : {})), (options && options.payload ? options.payload : {})) : null;
    }
    createAutomationEntry(automation, type, value, options, executionIdentifier, executionKey, dueAt) {
        return Object.assign(Object.assign({}, automation), { _execution: {
                key: `${automation.jobclass}_${executionKey}${executionIdentifier ? "_" + executionIdentifier : ""}_${dueAt.format("YYYY-MM-DD_HH:mm")}`,
                type: type,
                value: value,
                identifier: executionIdentifier,
                scheduled_at: dueAt.toDate(),
                payload: this.getAutomationExecutionPayload(automation, options),
            } });
    }
    checkWorkerAutomation(since, until) {
        const workerAutomation = this.getWorkerAutomation();
        if (!workerAutomation || workerAutomation.length < 1) {
            return null;
        }
        const out = [];
        const timezone = this.getWorkerTimezone();
        const now = until ? until.clone().tz(timezone) : (0, moment_timezone_1.default)().tz(timezone);
        const checkedSince = since ? since.clone().tz(timezone) : now.clone().startOf("minute").subtract(1, "millisecond");
        let automationIndex = -1;
        for (let automation of workerAutomation) {
            automationIndex++;
            if (!automation.jobclass || !this.jobTypes[automation.jobclass]) {
                this.log(`Invalid job class '${automation.jobclass}' in worker automation.`);
                this.error(`Invalid job class '${automation.jobclass}' in worker automation.`);
                continue;
            }
            if (!automation.executions || !Array.isArray(automation.executions) || automation.executions.length === 0) {
                continue;
            }
            for (const execution of (0, AutomationSchedule_1.getDueAutomationExecutions)(automation.executions, checkedSince, now, timezone, automation.identifier || null)) {
                out.push(this.createAutomationEntry(automation, execution.type, execution.value, execution.options, execution.identifier, execution.executionKey, execution.dueAt));
            }
        }
        return out;
    }
    runAutomation() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.getWorkerAutomation().length < 1) {
                return;
            }
            try {
                let automationChecking = true;
                const connection = yield DBConnection_1.DBConnection.getConnection();
                while (automationChecking) {
                    if (this.checkStop()) {
                        automationChecking = false;
                        break;
                    }
                    const now = (0, moment_timezone_1.default)().tz(this.getWorkerTimezone());
                    const checkedSince = this.lastAutomationCheckAt
                        ? this.lastAutomationCheckAt.clone()
                        : now.clone().startOf("minute").subtract(1, "millisecond");
                    this.lastAutomationCheckAt = now.clone();
                    const checkAutomation = this.checkWorkerAutomation(checkedSince, now);
                    if (!checkAutomation || checkAutomation.length < 1) {
                        yield this.wait(5000);
                        continue;
                    }
                    for (let automation of checkAutomation) {
                        if (!automation || !automation.jobclass || !automation._execution || !automation._execution.key) {
                            continue;
                        }
                        const existingJob = yield connection.client.db(null).collection("queue_jobs").findOne({
                            is_automated: true,
                            automation_key: automation._execution.key,
                        });
                        if (existingJob) {
                            continue;
                        }
                        // Create the automation job
                        const now = (0, moment_timezone_1.default)().tz(this.workerConfig.timezone ? this.workerConfig.timezone : "Europe/Berlin");
                        const newJob = {
                            jobclass: automation.jobclass,
                            number: yield this.getNextJobNumber(connection),
                            is_automated: true,
                            automation_key: automation._execution.key,
                            automation_execution: automation._execution,
                            payload: automation._execution.payload || null,
                            status: "pending",
                            priority: automation.priority || 0,
                            data: automation.data || {},
                            created_at: now.toDate(),
                            started_at: null,
                            ended_at: null,
                            executions: [],
                            worker: this.workerKey,
                        };
                        yield connection.client.db(null).collection("queue_jobs").insertOne(newJob);
                    }
                    yield this.wait(5000);
                }
            }
            catch (e) {
                yield ErrorHandler_1.ErrorHandler.report(e, {
                    scope: "command",
                    source: "queue.worker.automation",
                    command: {
                        signature: this.constructor.signature,
                        className: this.constructor.name,
                        args: this.args,
                    },
                    metadata: {
                        worker: this.workerKey,
                    },
                });
            }
        });
    }
    getNextJobNumber(connection) {
        return __awaiter(this, void 0, void 0, function* () {
            const lastJob = yield connection.client
                .db(null)
                .collection("queue_jobs")
                .findOne({}, { sort: { number: -1 } });
            return lastJob ? (lastJob.number || 0) + 1 : 1;
        });
    }
    checkStop() {
        if (!this.workerKey)
            return false;
        const stopFilePath = path_1.default.join((0, FileFunctions_1.storageDir)(), "queue", this.workerKey + ".stop");
        if (fs_1.default.existsSync(stopFilePath)) {
            if (this.autorestart) {
                fs_1.default.writeFileSync(path_1.default.join((0, FileFunctions_1.storageDir)(), "queue", this.workerKey + ".stop-autorestart"), JSON.stringify({ date: new Date() }));
            }
            return true;
        }
        return false;
    }
    run() {
        return __awaiter(this, void 0, void 0, function* () {
            const connection = yield DBConnection_1.DBConnection.getConnection();
            this.runAutomation();
            while (true) {
                const now = (0, moment_timezone_1.default)().tz(this.workerConfig.timezone ? this.workerConfig.timezone : "Europe/Berlin");
                if (this.checkStop()) {
                    this.log(`Worker ${this.workerKey} received stop signal.`);
                    break;
                }
                const executionKey = (0, moment_timezone_1.default)()
                    .tz(this.workerConfig.timezone ? this.workerConfig.timezone : "Europe/Berlin")
                    .format("YYYYMMDDHHmmss") + StringFunctions_1.StringFunctions.random(24);
                const workerJobclasses = this.getWorkerJobclasses();
                const jobUpdate = yield connection.client
                    .db(null)
                    .collection("queue_jobs")
                    .findOneAndUpdate({
                    status: "pending",
                    jobclass: workerJobclasses && workerJobclasses.length > 0 ? { $in: workerJobclasses } : { $ne: null },
                    worker: { $in: [null, this.workerKey] },
                    $or: [
                        {
                            not_before: null,
                        },
                        {
                            not_before: { $lte: now.toDate() },
                        },
                    ],
                }, {
                    $set: {
                        status: "running",
                        started_at: now.toDate(),
                        worker: this.workerKey,
                    },
                }, {
                    sort: { priority: -1, created_at: 1 },
                    returnDocument: "after",
                });
                const job = jobUpdate && jobUpdate.jobclass && jobUpdate._id
                    ? jobUpdate
                    : jobUpdate.value && jobUpdate.ok && jobUpdate.value._id && jobUpdate.value.jobclass
                        ? jobUpdate.value
                        : null;
                if (!job || !job.jobclass || !job._id) {
                    this.currentJob = null;
                    if (job && job._id) {
                        yield this.cancelRun(job._id);
                    }
                    else {
                        yield this.waitRun();
                    }
                    continue;
                }
                this.log(`Start Job #${job.number} - ${job.jobclass}` +
                    (job.automation_execution
                        ? ` (${job.automation_execution.type}: ${job.automation_execution.value}${job.automation_execution.identifier ? " - " + job.automation_execution.identifier : ""})`
                        : ""));
                const startedAt = new Date();
                this.updateWorkerStatus({
                    status: "running",
                    status_at: new Date().toISOString(),
                    current_job: job._id.toString(),
                    current_job_number: job.number,
                });
                job.executions = [
                    { key: executionKey, worker: this.workerKey, status: "running", started_at: startedAt },
                    ...(job.executions && job.executions.length > 0 ? job.executions : []),
                ];
                yield connection.client
                    .db(null)
                    .collection("queue_jobs")
                    .updateOne({ _id: job._id }, {
                    $set: {
                        started_at: startedAt,
                        ended_at: null,
                        executions: job.executions,
                    },
                });
                this.currentJob = {
                    _id: job._id.toString(),
                    execution_key: executionKey,
                    started_at: startedAt,
                    job_executions_count: job.executions.length,
                };
                let jobInstance = null;
                const jobType = this.jobTypes && this.jobTypes[job.jobclass] ? this.jobTypes[job.jobclass] : null;
                const jobOperationId = WebframezHooks_1.WebframezHooks.createOperationId("job");
                yield WebframezHooks_1.WebframezHooks.emit("queue.job.start", {
                    operationId: jobOperationId,
                    parentOperationId: this.workerOperationId,
                    name: job.jobclass,
                    attributes: {
                        "webframez.queue.job": job.jobclass,
                        "webframez.queue.worker": this.workerKey,
                    },
                });
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
                    job.executions[0].duration_ms = (0, moment_timezone_1.default)().diff((0, moment_timezone_1.default)(startedAt), "milliseconds");
                    const updateData = {};
                    if (result && typeof result === "object" && result.__execute_again) {
                        job.status = "pending";
                        job.started_at = result.__execute_again;
                        updateData.started_at = result.__execute_again;
                    }
                    yield connection.client
                        .db(null)
                        .collection("queue_jobs")
                        .updateOne({ _id: job._id }, {
                        $set: {
                            status: job.status,
                            ended_at: job.ended_at,
                            executions: [...job.executions],
                        },
                    });
                    this.jobsSucceeded++;
                    yield WebframezHooks_1.WebframezHooks.emit("queue.job.end", {
                        operationId: jobOperationId,
                        parentOperationId: this.workerOperationId,
                        name: job.jobclass,
                        status: "ok",
                        attributes: {
                            "webframez.queue.job": job.jobclass,
                            "webframez.queue.worker": this.workerKey,
                            "webframez.queue.job.status": job.status,
                        },
                    });
                    this.log(`Finished Job #${job.number} - ${job.jobclass} - ${(job.executions[0].duration_ms / 1000).toFixed(2)}s`);
                }
                catch (e) {
                    yield WebframezHooks_1.WebframezHooks.emit("queue.job.error", {
                        operationId: jobOperationId,
                        parentOperationId: this.workerOperationId,
                        name: job.jobclass,
                        status: "error",
                        error: e,
                        attributes: {
                            "webframez.queue.job": job.jobclass,
                            "webframez.queue.worker": this.workerKey,
                        },
                    });
                    yield ErrorHandler_1.ErrorHandler.report(e, {
                        scope: "job",
                        source: "queue.worker.job.handle",
                        job: {
                            id: job && job._id ? job._id.toString() : undefined,
                            number: job && job.number ? job.number : undefined,
                            jobclass: job && job.jobclass ? job.jobclass : undefined,
                            worker: this.workerKey,
                        },
                        metadata: {
                            executionKey: executionKey,
                        },
                    });
                    const errorMessage = e instanceof Error ? e.stack || e.message : String(e);
                    const endedAt = new Date();
                    job.status = "failed";
                    job.ended_at = endedAt;
                    job.executions[0].status = "failed";
                    job.executions[0].ended_at = endedAt;
                    job.executions[0].error = errorMessage;
                    job.executions[0].duration_ms = (0, moment_timezone_1.default)().diff((0, moment_timezone_1.default)(startedAt), "milliseconds");
                    if (jobInstance) {
                        job.executions[0].log = jobInstance.getLog();
                    }
                    yield connection.client
                        .db(null)
                        .collection("queue_jobs")
                        .updateOne({ _id: job._id }, {
                        $set: {
                            status: job.status,
                            ended_at: job.ended_at,
                            executions: [...job.executions],
                        },
                    });
                    this.jobsFailed++;
                    this.log(`Failed Job #${job.number} - ${job.jobclass} - ${(job.executions[0].duration_ms / 1000).toFixed(2)}s`);
                }
                this.jobsExecuted++;
                this.currentJob = null;
                this.updateWorkerStatus({
                    status: "waiting",
                    last_job: job._id.toString(),
                });
                yield this.waitRun();
            }
        });
    }
}
exports.QueueWorkerCommand = QueueWorkerCommand;
// Command
QueueWorkerCommand.signature = "queue:worker";
QueueWorkerCommand.description = "Runs a specific queue worker";
