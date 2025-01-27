class QueueJobsRegistyFacade {
    private jobs: any[] = [];

    getJobs() {
        return this.jobs;
    }

    registerJob(data: any) {
        if (Array.isArray(data)) {
            for (let el of data) {
                this.jobs.push(el);
            }
        } else {
            this.jobs.push(data);
        }
        return this;
    }
}

export const QueueJobsRegisty = new QueueJobsRegistyFacade();
