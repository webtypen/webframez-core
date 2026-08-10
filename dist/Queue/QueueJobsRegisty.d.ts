declare class QueueJobsRegistyFacade {
    private jobs;
    private registeredByKey;
    private registeredByReference;
    getJobs(): any[];
    getJobOrFail(name: string): any;
    private getJobKey;
    private addJob;
    registerJob(data: any): this;
}
export declare const QueueJobsRegisty: QueueJobsRegistyFacade;
export {};
