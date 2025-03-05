"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueJobsRegisty = void 0;
class QueueJobsRegistyFacade {
    constructor() {
        this.jobs = [];
    }
    getJobs() {
        return this.jobs;
    }
    registerJob(data) {
        if (Array.isArray(data)) {
            for (let el of data) {
                this.jobs.push(el);
            }
        }
        else {
            this.jobs.push(data);
        }
        return this;
    }
}
exports.QueueJobsRegisty = new QueueJobsRegistyFacade();
