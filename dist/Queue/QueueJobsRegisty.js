"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueJobsRegisty = void 0;
class QueueJobsRegistyFacade {
    constructor() {
        this.jobs = [];
        this.registeredByKey = {};
        this.registeredByReference = new Set();
    }
    getJobs() {
        return this.jobs;
    }
    getJobKey(job) {
        if (!job) {
            return null;
        }
        if (typeof job === "function" && job.name && job.name.trim() !== "") {
            return "function:" + job.name.trim();
        }
        if (job.name && typeof job.name === "string" && job.name.trim() !== "") {
            return "name:" + job.name.trim();
        }
        return null;
    }
    addJob(job) {
        if (!job) {
            return;
        }
        const key = this.getJobKey(job);
        if (key) {
            if (this.registeredByKey[key]) {
                return;
            }
            this.registeredByKey[key] = true;
            this.jobs.push(job);
            return;
        }
        if (this.registeredByReference.has(job)) {
            return;
        }
        this.registeredByReference.add(job);
        this.jobs.push(job);
    }
    registerJob(data) {
        if (Array.isArray(data)) {
            for (let el of data) {
                this.addJob(el);
            }
        }
        else {
            this.addJob(data);
        }
        return this;
    }
}
exports.QueueJobsRegisty = new QueueJobsRegistyFacade();
