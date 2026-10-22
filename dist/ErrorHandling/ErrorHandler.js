"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorHandler = void 0;
const async_hooks_1 = require("async_hooks");
const crypto_1 = require("crypto");
class ErrorHandlerFacade {
    constructor() {
        this.handlers = [];
        this.observers = new Set();
        this.context = new async_hooks_1.AsyncLocalStorage();
        this.process = { instanceId: (0, crypto_1.randomUUID)(), pid: process.pid, startedAt: new Date(Date.now() - process.uptime() * 1000), nodeVersion: process.version, coreVersion: require("../../package.json").version };
    }
    getProcessInfo() { return Object.assign({}, this.process); }
    onReport(listener) {
        this.observers.add(listener);
        return () => { this.observers.delete(listener); };
    }
    getContext() {
        var _a;
        return ((_a = this.context.getStore()) === null || _a === void 0 ? void 0 : _a.context) || {};
    }
    withContext(context, callback) {
        const parent = this.context.getStore();
        const merged = Object.assign(Object.assign({}, parent === null || parent === void 0 ? void 0 : parent.context), context);
        const seen = context.operationId && context.operationId !== (parent === null || parent === void 0 ? void 0 : parent.context.operationId) ? new WeakSet() : (parent === null || parent === void 0 ? void 0 : parent.seen) || new WeakSet();
        return this.context.run({ context: merged, seen }, callback);
    }
    isExpected(error) {
        var _a;
        const status = Number((_a = error === null || error === void 0 ? void 0 : error.statusCode) !== null && _a !== void 0 ? _a : error === null || error === void 0 ? void 0 : error.status);
        return (error === null || error === void 0 ? void 0 : error.expected) === true || (status >= 400 && status < 500);
    }
    httpStatus(error) {
        var _a;
        const status = Number((_a = error === null || error === void 0 ? void 0 : error.statusCode) !== null && _a !== void 0 ? _a : error === null || error === void 0 ? void 0 : error.status);
        return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
    }
    publicMessage(error, status = this.httpStatus(error)) {
        return status < 500 ? this.normalizeToError(error).message : "Internal Server Error";
    }
    normalizeToError(error) {
        if (error instanceof Error) {
            return error;
        }
        if (typeof error === "string") {
            return new Error(error);
        }
        try {
            return new Error(JSON.stringify(error));
        }
        catch (e) {
            return new Error(String(error));
        }
    }
    setHandler(handler) {
        this.handlers = [];
        if (handler && typeof handler === "function") {
            this.handlers.push(handler);
        }
        return this;
    }
    setHandlers(handlers) {
        this.handlers = [];
        if (handlers && Array.isArray(handlers) && handlers.length > 0) {
            for (const handler of handlers) {
                if (handler && typeof handler === "function") {
                    this.handlers.push(handler);
                }
            }
        }
        return this;
    }
    addHandler(handler) {
        if (handler && typeof handler === "function") {
            this.handlers.push(handler);
        }
        return this;
    }
    clearHandlers() {
        this.handlers = [];
        return this;
    }
    report(error, context = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            const state = this.context.getStore();
            if (error && typeof error === "object" && state) {
                if (state.seen.has(error))
                    return;
                state.seen.add(error);
            }
            const normalizedError = this.normalizeToError(error);
            const event = Object.assign(Object.assign(Object.assign({ scope: "process", severity: "error", expected: this.isExpected(error) }, state === null || state === void 0 ? void 0 : state.context), { eventId: (0, crypto_1.randomUUID)(), process: this.process, timestamp: new Date(), error: normalizedError, originalError: error }), context);
            // Invoke observers before the first await, including fatal-process observers.
            const pending = Array.from(this.observers, observer => {
                try {
                    return Promise.resolve(observer(event)).catch(() => console.error("[webframez:error-handler] Observer failed."));
                }
                catch (_a) {
                    console.error("[webframez:error-handler] Observer failed.");
                    return Promise.resolve();
                }
            });
            yield Promise.all(pending);
            if (!this.handlers || this.handlers.length < 1) {
                console.error(normalizedError);
                return;
            }
            for (const handler of this.handlers) {
                try {
                    yield handler(event);
                }
                catch (handlerError) {
                    const handlerErrorMessage = this.normalizeToError(handlerError);
                    console.error("[webframez:error-handler] Handler failed:", handlerErrorMessage);
                }
            }
        });
    }
}
exports.ErrorHandler = new ErrorHandlerFacade();
