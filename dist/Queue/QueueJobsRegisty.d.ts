declare class QueueJobsRegistyFacade {
    private jobs;
    private registeredByKey;
    private registeredByReference;
    getJobs(): any[];
    private getJobKey;
    private addJob;
    registerJob(data: any): this;
}
export declare const QueueJobsRegisty: QueueJobsRegistyFacade;
export {};
