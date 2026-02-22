export type WebframezErrorScope = "controller" | "command" | "job";

export type WebframezErrorContext = {
    scope: WebframezErrorScope;
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
    };
};

export type WebframezErrorEvent = WebframezErrorContext & {
    timestamp: Date;
    error: Error;
    originalError: any;
};

export type WebframezGlobalErrorHandler = (event: WebframezErrorEvent) => void | Promise<void>;

class ErrorHandlerFacade {
    private handlers: WebframezGlobalErrorHandler[] = [];

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

    async report(error: any, context: WebframezErrorContext) {
        const normalizedError = this.normalizeToError(error);
        const event: WebframezErrorEvent = {
            timestamp: new Date(),
            error: normalizedError,
            originalError: error,
            ...context,
        };

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
