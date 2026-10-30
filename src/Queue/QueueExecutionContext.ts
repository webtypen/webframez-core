import { AsyncLocalStorage } from "async_hooks";

/** Server-owned attribution that follows queued work. Never populate from request payloads.
 * Consumers must reauthorize persisted identities before performing protected effects. */
export class QueueExecutionContext {
    private static storage = new AsyncLocalStorage<Record<string, unknown>>();

    static capture(): Record<string, unknown> | undefined {
        const value = this.storage.getStore();
        return value ? JSON.parse(JSON.stringify(value)) : undefined;
    }

    static run<T>(context: Record<string, unknown> | undefined, callback: () => T): T {
        return this.storage.run(context ? JSON.parse(JSON.stringify(context)) : {}, callback);
    }
}
