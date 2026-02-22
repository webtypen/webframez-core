class QueueJobsRegistyFacade {
    private jobs: any[] = [];
    private registeredByKey: { [key: string]: boolean } = {};
    private registeredByReference: Set<any> = new Set();

    getJobs() {
        return this.jobs;
    }

    private getJobKey(job: any) {
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

    private addJob(job: any) {
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

    registerJob(data: any) {
        if (Array.isArray(data)) {
            for (let el of data) {
                this.addJob(el);
            }
        } else {
            this.addJob(data);
        }
        return this;
    }
}

export const QueueJobsRegisty = new QueueJobsRegistyFacade();
