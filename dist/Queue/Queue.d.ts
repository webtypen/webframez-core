/// <reference types="node" />
/** Embedded worker for applications whose database must stay in one process (e.g. DuckDB).
 * Uses the same queue_jobs records and BaseQueueJob handlers as console workers. */
export declare class Queue {
    private static timer;
    private static running;
    private static controllers;
    private static worker;
    private static collection;
    static enqueue(jobclass: string, props?: Record<string, any>): Promise<any>;
    static start(jobclasses: string[], intervalMs?: number): void;
    static stop(): Promise<void>;
    /** Independent bounded worker pool. Draining stops claims and lets active jobs finish. */
    static createWorker(jobclasses: string[], options?: {
        concurrency?: number;
        intervalMs?: number;
    }): {
        stop: ({ drain }?: {
            drain?: boolean | undefined;
        }) => Promise<void>;
    };
    static runOnce(jobclasses: string[], signal?: AbortSignal): Promise<void>;
}
