import fs from "fs";
import path from "path";
import moment from "moment-timezone";
import { ConsoleCommand } from "./ConsoleCommand";
import { QueueJobsRegisty } from "../Queue/QueueJobsRegisty";
import { storageDir } from "../Functions/FileFunctions";
import { StringFunctions } from "../Functions/StringFunctions";
import { Config } from "../Config";
import { DBConnection } from "../Database/DBConnection";
import { DateFunctions } from "../Functions/DateFunctions";

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

        try {
            this.log("Queue started");
            await this.run();
        } catch (e) {
            this.error(`Queue run failed: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
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

    checkWorkerAutomation() {
        if (!this.workerConfig || !this.workerConfig.automation || !Array.isArray(this.workerConfig.automation)) {
            return null;
        }

        const out: any = [];
        const days = DateFunctions.getDays();
        const now = moment().tz(this.workerConfig.timezone ? this.workerConfig.timezone : "Europe/Berlin");
        let automationIndex = -1;
        for (let automation of this.workerConfig.automation) {
            automationIndex++;
            if (!automation.jobclass || !this.jobTypes[automation.jobclass]) {
                this.log(`Invalid job class '${automation.jobclass}' in worker automation.`);
                this.error(`Invalid job class '${automation.jobclass}' in worker automation.`);
                continue;
            }

            if (!automation.executions || !Array.isArray(automation.executions) || automation.executions.length === 0) {
                continue;
            }

            let executionIndex = -1;
            for (let execution of automation.executions) {
                executionIndex++;
                if (!Array.isArray(execution)) {
                    this.log(`Invalid execution format for job '${automation.jobclass}' in worker automation.`);
                    this.error(`Invalid execution format for job '${automation.jobclass}' in worker automation.`);
                    continue;
                }

                const [type, value, options] = execution;
                if (type !== "every_x_mins" && type !== "daily" && type !== "every_hour" && !days.includes(type)) {
                    this.log(`Invalid execution type '${type}' for job '${automation.jobclass}' in worker automation.`);
                    this.error(`Invalid execution type '${type}' for job '${automation.jobclass}' in worker automation.`);
                    continue;
                }

                if (type === "every_x_mins" && (!value || isNaN(parseInt(value)) || parseInt(value) <= 0)) {
                    this.log(`Invalid value '${value}' for 'every_x_mins' execution type in worker automation.`);
                    this.error(`Invalid value '${value}' for 'every_x_mins' execution type in worker automation.`);
                    continue;
                }

                if (type === "daily" && !moment(value, "HH:mm", true).isValid()) {
                    this.log(`Invalid time format '${value}' for 'daily' execution type in worker automation.`);
                    this.error(`Invalid time format '${value}' for 'daily' execution type in worker automation.`);
                    continue;
                }

                if (days.includes(type) && !moment(value, "HH:mm", true).isValid()) {
                    this.log(`Invalid time format '${value}' for '${type}' execution type in worker automation.`);
                    this.error(`Invalid time format '${value}' for '${type}' execution type in worker automation.`);
                    continue;
                }

                const useType = days.includes(type) ? "day_in_week" : type;
                const executionKey = type + "-" + (value !== undefined && value !== null ? value : "0");
                const intervalKey = `${automation.jobclass}_${executionKey}${
                    options && options.identifier ? "_" + options.identifier : ""
                }_${now.format("YYYY-MM-DD_HH:mm")}`;
                switch (useType) {
                    case "every_hour":
                        if (parseInt(now.format("mm")) === parseInt(value && !isNaN(parseInt(value)) ? value : "0")) {
                            out.push({
                                ...automation,
                                _execution: {
                                    key: intervalKey,
                                    type: type,
                                    value: parseInt(value),
                                    identifier: options && options.identifier ? options.identifier : null,
                                    payload:
                                        automation.payload || (options && options.payload)
                                            ? {
                                                  ...(automation.payload ? automation.payload : {}),
                                                  ...(options.payload ? options.payload : {}),
                                              }
                                            : null,
                                },
                            });
                        }
                        break;
                    case "every_x_mins":
                        const intervalMinutes = parseInt(value);
                        const diffMins = now.diff(
                            moment()
                                .tz(this.workerConfig.timezone ? this.workerConfig.timezone : "Europe/Berlin")
                                .startOf("day"),
                            "minutes"
                        );

                        if (diffMins % intervalMinutes === 0) {
                            out.push({
                                ...automation,
                                _execution: {
                                    key: intervalKey,
                                    type: type,
                                    value: value,
                                    identifier: options && options.identifier ? options.identifier : null,
                                    payload:
                                        automation.payload || (options && options.payload)
                                            ? {
                                                  ...(automation.payload ? automation.payload : {}),
                                                  ...(options.payload ? options.payload : {}),
                                              }
                                            : null,
                                },
                            });
                        }
                        break;
                    case "daily":
                        if (now.format("HH:mm") === value) {
                            out.push({
                                ...automation,
                                _execution: {
                                    key: intervalKey,
                                    type: type,
                                    value: value,
                                    identifier: options && options.identifier ? options.identifier : null,
                                    payload:
                                        automation.payload || (options && options.payload)
                                            ? {
                                                  ...(automation.payload ? automation.payload : {}),
                                                  ...(options.payload ? options.payload : {}),
                                              }
                                            : null,
                                },
                            });
                        }
                        break;
                    case "day_in_week":
                        if (
                            (now.format("dddd").toLowerCase() === type || now.format("dddd").toLowerCase() + "s" === type) &&
                            now.format("HH:mm") === value
                        ) {
                            out.push({
                                ...automation,
                                _execution: {
                                    key: intervalKey,
                                    type: type,
                                    value: value,
                                    identifier: options && options.identifier ? options.identifier : null,
                                    payload:
                                        automation.payload || (options && options.payload)
                                            ? {
                                                  ...(automation.payload ? automation.payload : {}),
                                                  ...(options.payload ? options.payload : {}),
                                              }
                                            : null,
                                },
                            });
                        }
                        break;
                }
            }
        }
        return out;
    }

    async runAutomation() {
        if (!this.workerConfig || !this.workerConfig.automation || !Array.isArray(this.workerConfig.automation)) {
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

                const checkAutomation = this.checkWorkerAutomation();
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
            console.error(e);
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
            const job = await connection.client
                .db(null)
                .collection("queue_jobs")
                .findOneAndUpdate(
                    {
                        status: "pending",
                        jobclass:
                            this.workerConfig.jobclasses && this.workerConfig.jobclasses.length > 0
                                ? { $in: this.workerConfig.jobclasses }
                                : { $ne: null },
                        worker: { $in: [null, this.workerKey] },
                        $or: [
                            {
                                started_at: null,
                            },
                            {
                                started_at: { $lte: now.toDate() },
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
                this.log(`Finished Job #${job.number} - ${job.jobclass} - ${(job.executions[0].duration_ms / 1000).toFixed(2)}s`);
            } catch (e) {
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
