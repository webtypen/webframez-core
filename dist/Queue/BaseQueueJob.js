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
exports.BaseQueueJob = void 0;
const moment_1 = __importDefault(require("moment"));
const QueueJob_1 = require("./QueueJob");
class BaseQueueJob {
    constructor() {
        this.attempts = 3;
        this.currentLog = "";
    }
    handle(job) {
        return __awaiter(this, void 0, void 0, function* () { });
    }
    static create(props) {
        return __awaiter(this, void 0, void 0, function* () {
            const last = yield QueueJob_1.QueueJob.where("number", "=", { $gte: 0 }).orderBy("number", "DESC").first();
            const job = new QueueJob_1.QueueJob();
            job.number = last && last.number ? last.number + 1 : 1;
            job.jobclass = this.name;
            job.status = "pending";
            job.created_at = new Date();
            if (props) {
                for (let key in props) {
                    job[key] = props[key];
                }
            }
            yield job.save();
            return job;
        });
    }
    log(...args) {
        let temp = "";
        if (args) {
            for (let entry of args) {
                if (typeof entry === "object") {
                    try {
                        const str = JSON.stringify(entry);
                        if (str.length > 150 || temp.length > 150) {
                            temp += (temp && temp.trim() !== "" ? " " : "") + JSON.stringify(entry, null, 4);
                        }
                        else {
                            temp += (temp && temp.trim() !== "" ? " " : "") + str;
                        }
                    }
                    catch (e) {
                        temp += (temp && temp.trim() !== "" ? " " : "") + "[object Object]";
                    }
                }
                else {
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
    executeAgain(value = 30, unit = "seconds") {
        return { __execute_again: (0, moment_1.default)().add(value, unit).toDate() };
    }
}
exports.BaseQueueJob = BaseQueueJob;
