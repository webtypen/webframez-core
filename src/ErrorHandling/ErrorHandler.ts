import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";

export type WebframezErrorScope = "controller" | "command" | "job" | "boot" | "process";

export type WebframezErrorContext = {
    scope: WebframezErrorScope;
    applicationType?: "WebApplication" | "ConsoleApplication" | "LambdaApplication";
    operationId?: string;
    expected?: boolean;
    severity?: "error" | "fatal";
    api?: { scope?: string; function?: string };
    source?: string;
    metadata?: { [key: string]: any };
    command?: {
        signature?: string;
        className?: string;
        args?: { arguments: string[]; options: { [key: string]: boolean | string } };
    };
    controller?: {
        routePath?: string;
        method?: string;
        url?: string;
    };
    job?: {
        id?: string;
        number?: number;
        jobclass?: string;
        worker?: string | null;
        instance?: string;
        attempt?: number;
        status?: "pending" | "failed" | "finished";
        retryAt?: string | null;
    };
};

export type WebframezErrorEvent = WebframezErrorContext & {
    eventId: string;
    process: { instanceId: string; pid: number; startedAt: Date; nodeVersion: string; coreVersion: string };
    timestamp: Date;
    error: Error;
    originalError: any;
};

export type WebframezGlobalErrorHandler = (event: WebframezErrorEvent) => void | Promise<void>;

class ErrorHandlerFacade {
    private handlers: WebframezGlobalErrorHandler[] = [];
    private observers = new Set<WebframezGlobalErrorHandler>();
    private context = new AsyncLocalStorage<{ context: Partial<WebframezErrorContext>; seen: WeakSet<object> }>();
    private process = { instanceId: randomUUID(), pid: process.pid, startedAt: new Date(Date.now() - process.uptime() * 1000), nodeVersion: process.version, coreVersion: require("../../package.json").version };

    getProcessInfo() { return { ...this.process }; }

    onReport(listener: WebframezGlobalErrorHandler) {
        this.observers.add(listener);
        return () => { this.observers.delete(listener); };
    }

    getContext(): Partial<WebframezErrorContext> {
        return this.context.getStore()?.context || {};
    }

    withContext<T>(context: Partial<WebframezErrorContext>, callback: () => T): T {
        const parent = this.context.getStore();
        const merged = { ...parent?.context, ...context };
        const seen = context.operationId && context.operationId !== parent?.context.operationId ? new WeakSet<object>() : parent?.seen || new WeakSet<object>();
        return this.context.run({ context: merged, seen }, callback);
    }

    isExpected(error: any) {
        const status = Number(error?.statusCode ?? error?.status);
        return error?.expected === true || (status >= 400 && status < 500);
    }

    httpStatus(error: any) {
        const status = Number(error?.statusCode ?? error?.status);
        return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
    }

    publicMessage(error: any, status = this.httpStatus(error)) {
        return status < 500 ? this.normalizeToError(error).message : "Internal Server Error";
    }

    private normalizeToError(error: any) {
        if (error instanceof Error) {
            return error;
        }

        if (typeof error === "string") {
            return new Error(error);
        }

        try {
            return new Error(JSON.stringify(error));
        } catch (e) {
            return new Error(String(error));
        }
    }

    setHandler(handler: WebframezGlobalErrorHandler | null | undefined) {
        this.handlers = [];
        if (handler && typeof handler === "function") {
            this.handlers.push(handler);
        }
        return this;
    }

    setHandlers(handlers: WebframezGlobalErrorHandler[] | null | undefined) {
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

    addHandler(handler: WebframezGlobalErrorHandler | null | undefined) {
        if (handler && typeof handler === "function") {
            this.handlers.push(handler);
        }
        return this;
    }

    clearHandlers() {
        this.handlers = [];
        return this;
    }

    async report(error: any, context: Partial<WebframezErrorContext> = {}) {
        const state = this.context.getStore();
        if (error && typeof error === "object" && state) {
            if (state.seen.has(error)) return;
            state.seen.add(error);
        }
        const normalizedError = this.normalizeToError(error);
        const event: WebframezErrorEvent = {
            scope: "process",
            severity: "error",
            expected: this.isExpected(error),
            ...state?.context,
            eventId: randomUUID(),
            process: this.process,
            timestamp: new Date(),
            error: normalizedError,
            originalError: error,
            ...context,
        };

        // Invoke observers before the first await, including fatal-process observers.
        const pending = Array.from(this.observers, observer => {
            try { return Promise.resolve(observer(event)).catch(() => console.error("[webframez:error-handler] Observer failed.")); }
            catch { console.error("[webframez:error-handler] Observer failed."); return Promise.resolve(); }
        });
        await Promise.all(pending);

        if (!this.handlers || this.handlers.length < 1) {
            console.error(normalizedError);
            return;
        }

        for (const handler of this.handlers) {
            try {
                await handler(event);
            } catch (handlerError) {
                const handlerErrorMessage = this.normalizeToError(handlerError);
                console.error("[webframez:error-handler] Handler failed:", handlerErrorMessage);
            }
        }
    }
}

export const ErrorHandler = new ErrorHandlerFacade();
