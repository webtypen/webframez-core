/** Embedded worker for applications whose database must stay in one process (e.g. DuckDB).
 * Uses the same queue_jobs records and BaseQueueJob handlers as console workers. */
export declare class Queue {
    private static timer;
    private static running;
    private static abort;
    private static worker;
    private static collection;
    static enqueue(jobclass: string, props?: Record<string, any>): Promise<any>;
    static start(jobclasses: string[], intervalMs?: number): void;
    static stop(): Promise<void>;
    static runOnce(jobclasses: string[]): Promise<void>;
}
