/** Server-owned attribution that follows queued work. Never populate from request payloads.
 * Consumers must reauthorize persisted identities before performing protected effects. */
export declare class QueueExecutionContext {
    private static storage;
    static capture(): Record<string, unknown> | undefined;
    static run<T>(context: Record<string, unknown> | undefined, callback: () => T): T;
}
