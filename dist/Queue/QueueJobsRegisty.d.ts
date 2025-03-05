declare class QueueJobsRegistyFacade {
    private jobs;
    getJobs(): any[];
    registerJob(data: any): this;
}
export declare const QueueJobsRegisty: QueueJobsRegistyFacade;
export {};
