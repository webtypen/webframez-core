import fs from "fs";
import path from "path";
import moment from "moment-timezone";
import { ConsoleCommand } from "./ConsoleCommand";
import { QueueJobsRegisty } from "../Queue/QueueJobsRegisty";
import { storageDir } from "../Functions/FileFunctions";
import { StringFunctions } from "../Functions/StringFunctions";
import { Config } from "../Config";
import { DBConnection } from "../Database/DBConnection";
import { ErrorHandler } from "../ErrorHandling/ErrorHandler";
import { BackupManager } from "../Backup/BackupManager";
import { WebframezHooks } from "../Hooks/WebframezHooks";
import { getDueAutomationExecutions } from "../Queue/AutomationSchedule";

export class QueueWorkerCommand extends ConsoleCommand {
    // Command
    static signature = "queue:worker";
    static description = "Runs a specific queue worker";

    // State
    workerKey: string | null = null;
    workerConfig: any = null;
    startTime: any = null;
    currentJob: any = null;
    jobTypes: any = {};
    autorestart = false;
    workerOperationId: string | null = null;
    workerHadError = false;
    lastAutomationCheckAt: any = null;

    // Statistics
    jobsExecuted = 0;
    jobsSucceeded = 0;
    jobsFailed = 0;
    lastJob: any = null;

    log(message: string) {
        this.writeln(
            `[${this.workerKey} | ${moment()
                .tz(this.workerConfig.timezone ? this.workerConfig.timezone : "Europe/Berlin")
                .format("YY-MM-DD HH:mm:ss")}] ${message}`
        );
    }

    private formatAutomationCommand(automation: any) {
        if (automation.jobclass === "BackupRunJob" && automation.payload && automation.payload.backupKey) {
            return `backup:run ${automation.payload.backupKey}`;
        }

        return automation.jobclass || "unknown";
    }

    private formatAutomationExecution(execution: any) {
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

    private logRegisteredAutomation() {
        const automations = this.getWorkerAutomation();
        if (!automations || automations.length < 1) {
            this.log("Registered automations: none");
            return;
        }

        this.log("Registered automations:");
        for (const automation of automations) {
            const command = this.formatAutomationCommand(automation);
            const executions =
                automation.executions && Array.isArray(automation.executions) && automation.executions.length > 0
                    ? automation.executions.map((execution: any) => this.formatAutomationExecution(execution)).join(", ")
                    : "no executions";
            this.log(`- ${command}: ${executions}`);
        }
    }

    async handle() {
        const workerKey = this.getOption("worker");
        if (!workerKey || typeof workerKey !== "string" || workerKey.trim() === "") {
            this.error("You must specify a worker key using --worker=<worker_key>");
            return;
        }

        this.workerConfig = Config.get("queue.workers." + workerKey);
        if (!this.workerConfig) {
            this.error(`Worker '${workerKey}' is not defined in the queue configuration.`);
            return;
        }

        if (!this.workerConfig.is_active) {
            this.error(`Worker '${workerKey}' is disabled in the queue configuration.`);
            return;
        }

        this.workerKey = workerKey;
        this.startTime = moment().tz(this.workerConfig.timezone ? this.workerConfig.timezone : "Europe/Berlin");
        if (!this.init()) {
            return;
        }

        this.workerOperationId = WebframezHooks.createOperationId("worker");
        await WebframezHooks.emit("queue.worker.start", {
            operationId: this.workerOperationId,
            name: workerKey,
            attributes: {
                "webframez.queue.worker": workerKey,
            },
        });

        try {
            this.log("Queue started");
            this.logRegisteredAutomation();
            await this.run();
        } catch (e) {
            this.workerHadError = true;
            if (this.workerOperationId) {
                await WebframezHooks.emit("queue.worker.error", {
                    operationId: this.workerOperationId,
                    name: workerKey,
                    status: "error",
                    error: e,
                    attributes: {
                        "webframez.queue.worker": workerKey,
                    },
                });
            }
            await ErrorHandler.report(e, {
                scope: "command",
                source: "queue.worker.run",
                command: {
                    signature: (this.constructor as any).signature,
                    className: this.constructor.name,
                    args: this.args,
                },
                metadata: {
                    worker: this.workerKey,
                },
            });
            this.error(`Queue run failed: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            if (!this.workerHadError && this.workerOperationId) {
                await WebframezHooks.emit("queue.worker.end", {
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
    }

    init() {
        // Register Job-Types
        for (let entry of QueueJobsRegisty.getJobs()) {
            this.jobTypes[entry.name] = entry;
        }

        if (!this.canStart()) {
            return false;
        }

        if (!fs.existsSync(storageDir("queue"))) {
            fs.mkdirSync(storageDir("queue"), { recursive: true });
        }

        const filePath = storageDir("queue", `worker_${this.workerKey}.json`);
        let lastLogFile: any = null;
        if (fs.existsSync(filePath)) {
            try {
                const json = JSON.parse(fs.readFileSync(filePath, "utf-8"));
                if (json && typeof json === "object") {
                    lastLogFile = json;
                }
            } catch (e) {
                console.error(e);
            }
        }

        fs.writeFileSync(
            filePath,
            JSON.stringify({
                worker: this.workerKey,
                config: this.workerConfig,
                pid: process.pid,
                started_at: new Date(),
                status: "waiting",
                ...(lastLogFile && lastLogFile.log_file ? { log_file: lastLogFile.log_file } : {}),
                ...(lastLogFile && lastLogFile.autorestart ? { autorestart: true } : {}),
            }),
            "utf-8"
        );

        if (lastLogFile && lastLogFile.autorestart) {
            this.autorestart = true;
        }
        return true;
    }

    canStart() {
        const filePath = storageDir("queue", `worker_${this.workerKey}.json`);
        if (!fs.existsSync(filePath)) {
            return true;
        }

        let file: any = null;
        try {
            file = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        } catch (e) {
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
            } catch (e) {
                return false;
            }
        })();

        if (isRunning) {
            this.error(`Worker '${this.workerKey}' is already running (PID: ${file.pid} | Current-PID: ${process.pid}).`);
            return false;
        }
        return true;
    }

    random(min: number, max: number) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    async wait(ms: number) {
        return new Promise((resolve) => {
            setTimeout(() => resolve(true), ms);
        });
    }

    async waitRun() {
        return new Promise(async (resolve) => {
            this.updateWorkerStatus({
                status: "waiting",
                status_at: new Date().toISOString(),
                current_job: null,
            });

            await this.wait(1000);
            resolve(true);
        });
    }

    async cancelRun(jobId: any) {
        return new Promise(async (resolve) => {
            const connection = await DBConnection.getConnection();
            await connection.client
                .db(null)
                .collection("queue_jobs")
                .updateOne(
                    {
                        _id: jobId,
                    },
                    {
                        $set: { status: "canceled" },
                    }
                );

            await this.waitRun();
            resolve(true);
        });
    }

    updateWorkerStatus(values: { [key: string]: boolean | string | number | null }) {
        const filePath = storageDir("queue", `worker_${this.workerKey}.json`);
        if (!fs.existsSync(filePath)) return;

        const json = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        for (const key in values) {
            json[key] = values[key];
        }
        fs.writeFileSync(filePath, JSON.stringify(json), "utf-8");
    }

    getWorkerAutomation() {
        const out: any[] = [];
        if (this.workerConfig && this.workerConfig.automation && Array.isArray(this.workerConfig.automation)) {
            out.push(...this.workerConfig.automation);
        }

        if (Config.get("backup")) {
            try {
                out.push(...new BackupManager().getAutomationEntries(this.workerKey || undefined));
            } catch (e) {
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
        if (Config.get("backup") && !jobclasses.includes("BackupRunJob")) {
            jobclasses.push("BackupRunJob");
        }
        return jobclasses;
    }

    private getWorkerTimezone() {
        return this.workerConfig.timezone ? this.workerConfig.timezone : "Europe/Berlin";
    }

    private getAutomationExecutionPayload(automation: any, options: any) {
        return automation.payload || (options && options.payload)
            ? {
                  ...(automation.payload ? automation.payload : {}),
                  ...(options && options.payload ? options.payload : {}),
              }
            : null;
    }

    private createAutomationEntry(
        automation: any,
        type: any,
        value: any,
        options: any,
        executionIdentifier: string | null,
        executionKey: string,
        dueAt: any
    ) {
        return {
            ...automation,
            _execution: {
                key: `${automation.jobclass}_${executionKey}${executionIdentifier ? "_" + executionIdentifier : ""}_${dueAt.format(
                    "YYYY-MM-DD_HH:mm"
                )}`,
                type: type,
                value: value,
                identifier: executionIdentifier,
                scheduled_at: dueAt.toDate(),
                payload: this.getAutomationExecutionPayload(automation, options),
            },
        };
    }

    checkWorkerAutomation(since?: any, until?: any) {
        const workerAutomation = this.getWorkerAutomation();
        if (!workerAutomation || workerAutomation.length < 1) {
            return null;
        }

        const out: any = [];
        const timezone = this.getWorkerTimezone();
        const now = until ? until.clone().tz(timezone) : moment().tz(timezone);
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

            for (const execution of getDueAutomationExecutions(
                automation.executions,
                checkedSince,
                now,
                timezone,
                automation.identifier || null
            )) {
                out.push(
                    this.createAutomationEntry(
                        automation,
                        execution.type,
                        execution.value,
                        execution.options,
                        execution.identifier,
                        execution.executionKey,
                        execution.dueAt
                    )
                );
            }
        }
        return out;
    }

    async runAutomation() {
        if (this.getWorkerAutomation().length < 1) {
            return;
        }

        try {
            let automationChecking = true;
            const connection = await DBConnection.getConnection();
            while (automationChecking) {
                if (this.checkStop()) {
                    automationChecking = false;
                    break;
                }

                const now = moment().tz(this.getWorkerTimezone());
                const checkedSince = this.lastAutomationCheckAt
                    ? this.lastAutomationCheckAt.clone()
                    : now.clone().startOf("minute").subtract(1, "millisecond");
                this.lastAutomationCheckAt = now.clone();
                const checkAutomation = this.checkWorkerAutomation(checkedSince, now);
                if (!checkAutomation || checkAutomation.length < 1) {
                    await this.wait(5000);
                    continue;
                }

                for (let automation of checkAutomation) {
                    if (!automation || !automation.jobclass || !automation._execution || !automation._execution.key) {
                        continue;
                    }

                    const existingJob = await connection.client.db(null).collection("queue_jobs").findOne({
                        is_automated: true,
                        automation_key: automation._execution.key,
                    });
                    if (existingJob) {
                        continue;
                    }

                    // Create the automation job
                    const now = moment().tz(this.workerConfig.timezone ? this.workerConfig.timezone : "Europe/Berlin");
                    const newJob = {
                        jobclass: automation.jobclass,
                        number: await this.getNextJobNumber(connection),
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
                    await connection.client.db(null).collection("queue_jobs").insertOne(newJob);
                }

                await this.wait(5000);
            }
        } catch (e) {
            await ErrorHandler.report(e, {
                scope: "command",
                source: "queue.worker.automation",
                command: {
                    signature: (this.constructor as any).signature,
                    className: this.constructor.name,
                    args: this.args,
                },
                metadata: {
                    worker: this.workerKey,
                },
            });
        }
    }

    async getNextJobNumber(connection: any): Promise<number> {
        const lastJob = await connection.client
            .db(null)
            .collection("queue_jobs")
            .findOne({}, { sort: { number: -1 } });

        return lastJob ? (lastJob.number || 0) + 1 : 1;
    }

    checkStop() {
        if (!this.workerKey) return false;

        const stopFilePath = path.join(storageDir(), "queue", this.workerKey + ".stop");
        if (fs.existsSync(stopFilePath)) {
            if (this.autorestart) {
                fs.writeFileSync(
                    path.join(storageDir(), "queue", this.workerKey + ".stop-autorestart"),
                    JSON.stringify({ date: new Date() })
                );
            }
            return true;
        }
        return false;
    }

    async run() {
        const connection = await DBConnection.getConnection();

        this.runAutomation();
        while (true) {
            const now = moment().tz(this.workerConfig.timezone ? this.workerConfig.timezone : "Europe/Berlin");

            if (this.checkStop()) {
                this.log(`Worker ${this.workerKey} received stop signal.`);
                break;
            }

            const executionKey =
                moment()
                    .tz(this.workerConfig.timezone ? this.workerConfig.timezone : "Europe/Berlin")
                    .format("YYYYMMDDHHmmss") + StringFunctions.random(24);
            const workerJobclasses = this.getWorkerJobclasses();
            const jobUpdate = await connection.client
                .db(null)
                .collection("queue_jobs")
                .findOneAndUpdate(
                    {
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
                    },
                    {
                        $set: {
                            status: "running",
                            started_at: now.toDate(),
                            worker: this.workerKey,
                        },
                    },
                    {
                        sort: { priority: -1, created_at: 1 },
                        returnDocument: "after",
                    }
                );

            const job =
                jobUpdate && jobUpdate.jobclass && jobUpdate._id
                    ? jobUpdate
                    : jobUpdate.value && jobUpdate.ok && jobUpdate.value._id && jobUpdate.value.jobclass
                    ? jobUpdate.value
                    : null;

            if (!job || !job.jobclass || !job._id) {
                this.currentJob = null;

                if (job && job._id) {
                    await this.cancelRun(job._id);
                } else {
                    await this.waitRun();
                }
                continue;
            }

            this.log(
                `Start Job #${job.number} - ${job.jobclass}` +
                    (job.automation_execution
                        ? ` (${job.automation_execution.type}: ${job.automation_execution.value}${
                              job.automation_execution.identifier ? " - " + job.automation_execution.identifier : ""
                          })`
                        : "")
            );
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

            await connection.client
                .db(null)
                .collection("queue_jobs")
                .updateOne(
                    { _id: job._id },
                    {
                        $set: {
                            started_at: startedAt,
                            ended_at: null,
                            executions: job.executions,
                        },
                    }
                );

            this.currentJob = {
                _id: job._id.toString(),
                execution_key: executionKey,
                started_at: startedAt,
                job_executions_count: job.executions.length,
            };

            let jobInstance: any = null;
            const jobType: any = this.jobTypes && this.jobTypes[job.jobclass] ? this.jobTypes[job.jobclass] : null;
            const jobOperationId = WebframezHooks.createOperationId("job");
            await WebframezHooks.emit("queue.job.start", {
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
                const result: any = await jobInstance.handle(job);

                const endedAt = new Date();
                job.status = "finished";
                job.ended_at = endedAt;
                job.executions[0].status = "finished";
                job.executions[0].ended_at = endedAt;
                job.executions[0].log = jobInstance.getLog();
                job.executions[0].duration_ms = moment().diff(moment(startedAt), "milliseconds");

                const updateData: any = {};
                if (result && typeof result === "object" && result.__execute_again) {
                    job.status = "pending";
                    job.started_at = result.__execute_again;
                    updateData.started_at = result.__execute_again;
                }

                await connection.client
                    .db(null)
                    .collection("queue_jobs")
                    .updateOne(
                        { _id: job._id },
                        {
                            $set: {
                                status: job.status,
                                ended_at: job.ended_at,
                                executions: [...job.executions],
                            },
                        }
                    );

                this.jobsSucceeded++;
                await WebframezHooks.emit("queue.job.end", {
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
            } catch (e) {
                await WebframezHooks.emit("queue.job.error", {
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
                await ErrorHandler.report(e, {
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
                job.executions[0].duration_ms = moment().diff(moment(startedAt), "milliseconds");

                if (jobInstance) {
                    job.executions[0].log = jobInstance.getLog();
                }

                await connection.client
                    .db(null)
                    .collection("queue_jobs")
                    .updateOne(
                        { _id: job._id },
                        {
                            $set: {
                                status: job.status,
                                ended_at: job.ended_at,
                                executions: [...job.executions],
                            },
                        }
                    );
                this.jobsFailed++;
                this.log(`Failed Job #${job.number} - ${job.jobclass} - ${(job.executions[0].duration_ms / 1000).toFixed(2)}s`);
            }

            this.jobsExecuted++;
            this.currentJob = null;

            this.updateWorkerStatus({
                status: "waiting",
                last_job: job._id.toString(),
            });
            await this.waitRun();
        }
    }
}
