import fs from "fs";
import moment from "moment";
import { ConsoleCommand } from "./ConsoleCommand";
import { QueueJobsRegisty } from "../Queue/QueueJobsRegisty";
import { storageDir } from "../Functions/FileFunctions";
import { QueueJob } from "../Queue/QueueJob";
import { StringFunctions } from "../Functions/StringFunctions";

export class QueueRunCommand extends ConsoleCommand {
    // Command
    static signature = "queue:run";
    static description = "Run a queue worker";

    // State
    workerKey = "main";
    startTime: any = null;
    currentJob: any = null;
    jobTypes: any = {};

    // Statistics
    jobsExecuted = 0;
    jobsSucceeded = 0;
    jobsFailed = 0;
    lastJob: any = null;

    log(message: string) {
        this.writeln(`[${moment().format("YYYY-MM-DD HH:mm:ss")}] ${message}`);
    }

    async handle() {
        this.startTime = moment();
        if (!this.canStart()) {
            return;
        }

        this.log("Queue started");
        await this.run();
    }

    canStart() {
        // Register Job-Types
        for (let entry of QueueJobsRegisty.getJobs()) {
            this.jobTypes[entry.name] = entry;
        }

        const file = storageDir("queue", `worker_${this.workerKey}.json`);
        if (!fs.existsSync(file)) {
            return true;
        }

        const json = JSON.parse(fs.readFileSync(file, "utf-8"));
        if (!json || !json.updated_at) {
            return true;
        }

        if (json.last_job) {
            this.lastJob = json.last_job;
        }

        const diff = moment().diff(moment(json.updated_at), "seconds");
        if (diff && diff >= 30) {
            return true;
        }

        return true;
        this.writeln(
            `Worker '${this.workerKey}' is already running in Process${json.pid ? " " + json.pid : ""} (last update ${
                diff <= 180 ? diff + " seconds ago" : (diff / 60).toFixed(0) + " minutes ago"
            })`
        );
        return false;
    }

    updateLock() {
        if (!fs.existsSync(storageDir("queue"))) {
            fs.mkdirSync(storageDir("queue"), { recursive: true });
        }

        fs.writeFileSync(
            storageDir("queue", `worker_${this.workerKey}.json`),
            JSON.stringify({
                key: this.workerKey,
                pid: process.pid,
                started_at: this.startTime.format("YYYY-MM-DD HH:mm:ss"),
                updated_at: moment().format("YYYY-MM-DD HH:mm:ss"),
                current_job: this.currentJob
                    ? {
                          _id: this.currentJob._id,
                          started_at: this.currentJob.started_at,
                      }
                    : null,
                last_job: this.lastJob,
            })
        );
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
            this.updateLock();
            await this.wait(5000);
            resolve(true);
        });
    }

    async run() {
        while (true) {
            this.updateLock();

            const now = moment();
            const check = await QueueJob.aggregate([
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
                await this.waitRun();
                continue;
            }

            await this.wait(this.random(200, 600));
            const job = await QueueJob.where("_id", "=", check[0]._id).first();
            if (!job || job.status !== "pending") {
                this.currentJob = null;
                await this.waitRun();
                continue;
            }

            this.log(`Start Job #${job.number} - ${job.jobclass}`);
            const startedAt = new Date();
            const executionKey = moment().format("YYYYMMDDHHmmss") + StringFunctions.random(24);
            job.status = "running";
            job.started_at = startedAt;
            job.ended_at = null;
            job.executions = [
                { key: executionKey, worker: this.workerKey, status: "running", started_at: startedAt },
                ...(job.executions && job.executions.length > 0 ? job.executions : []),
            ];
            await job.save();

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

                if (result && typeof result === "object" && result.__execute_again) {
                    job.status = "pending";
                    job.start_at = result.__execute_again;
                }
                await job.save();
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
                await job.save();
                this.jobsFailed++;
                this.log(`Failed Job #${job.number} - ${job.jobclass} - ${(job.executions[0].duration_ms / 1000).toFixed(2)}s`);
            }

            this.jobsExecuted++;
            this.currentJob = null;
            await this.waitRun();
        }
    }
}
