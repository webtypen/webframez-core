"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueExecutionContext = void 0;
const async_hooks_1 = require("async_hooks");
/** Server-owned attribution that follows queued work. Never populate from request payloads.
 * Consumers must reauthorize persisted identities before performing protected effects. */
class QueueExecutionContext {
    static capture() {
        const value = this.storage.getStore();
        return value ? JSON.parse(JSON.stringify(value)) : undefined;
    }
    static run(context, callback) {
        return this.storage.run(context ? JSON.parse(JSON.stringify(context)) : {}, callback);
    }
}
exports.QueueExecutionContext = QueueExecutionContext;
QueueExecutionContext.storage = new async_hooks_1.AsyncLocalStorage();
