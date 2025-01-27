import moment from "moment";
import { QueueJob } from "./QueueJob";

export class BaseQueueJob {
    attempts: number = 3;
    currentLog = "";

    async handle(job: any): Promise<any> {}

    static async create(props?: any) {
        const last = await QueueJob.where("number", "=", { $gte: 0 }).orderBy("number", "DESC").first();

        const job = new QueueJob();
        job.number = last && last.number ? last.number + 1 : 1;
        job.jobclass = this.name;
        job.status = "pending";
        job.created_at = new Date();
        if (props) {
            for (let key in props) {
                job[key] = props[key];
            }
        }
        await job.save();
        return job;
    }

    log(...args: any) {
        let temp = "";
        if (args) {
            for (let entry of args) {
                if (typeof entry === "object") {
                    try {
                        const str = JSON.stringify(entry);
                        if (str.length > 150 || temp.length > 150) {
                            temp += (temp && temp.trim() !== "" ? " " : "") + JSON.stringify(entry, null, 4);
                        } else {
                            temp += (temp && temp.trim() !== "" ? " " : "") + str;
                        }
                    } catch (e) {
                        temp += (temp && temp.trim() !== "" ? " " : "") + "[object Object]";
                    }
                } else {
                    temp += (temp && temp.trim() !== "" ? " " : "") + entry.toString();
                }
            }
        }
        this.currentLog += temp + "\n";
        return this;
    }

    getLog() {
        return this.currentLog && this.currentLog.trim() !== "" ? this.currentLog : null;
    }

    executeAgain(
        value: number = 30,
        unit:
            | "year"
            | "years"
            | "y"
            | "month"
            | "months"
            | "M"
            | "week"
            | "weeks"
            | "w"
            | "day"
            | "days"
            | "d"
            | "hour"
            | "hours"
            | "h"
            | "minute"
            | "minutes"
            | "m"
            | "second"
            | "seconds"
            | "s" = "seconds"
    ) {
        return { __execute_again: moment().add(value, unit).toDate() };
    }
}
