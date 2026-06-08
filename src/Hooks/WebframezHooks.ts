export type WebframezHookOperation =
    | "http.request"
    | "route.handler"
    | "console.command"
    | "queue.job"
    | "queue.worker"
    | "app.boot"
    | "lambda.invoke";

export type WebframezHookPhase = "start" | "end" | "error";
export type WebframezHookEventName = `${WebframezHookOperation}.${WebframezHookPhase}`;
export type WebframezHookAttributeValue = string | number | boolean | null;
export type WebframezHookAttributes = { [key: string]: WebframezHookAttributeValue | undefined };

export type WebframezOperationContext = {
    operationId: string;
    parentOperationId?: string | null;
    operation: WebframezHookOperation;
    phase: WebframezHookPhase;
    name?: string;
    status?: "ok" | "error";
    timestamp: Date;
    attributes?: WebframezHookAttributes;
    error?: unknown;
    request?: unknown;
    response?: unknown;
};

export type WebframezLifecycleEvent<TEventName extends WebframezHookEventName = WebframezHookEventName> = {
    type: TEventName;
    context: WebframezOperationContext;
};

export type WebframezHookHandler<TEventName extends WebframezHookEventName = WebframezHookEventName> = (
    event: WebframezLifecycleEvent<TEventName>
) => void | Promise<void>;

export type WebframezHookPayloadMap = {
    [TEventName in WebframezHookEventName]: WebframezLifecycleEvent<TEventName>;
};

type HandlerStore = {
    [key: string]: Set<WebframezHookHandler<any>> | undefined;
};

let operationCounter = 0;

function parseEventName(eventName: WebframezHookEventName): {
    operation: WebframezHookOperation;
    phase: WebframezHookPhase;
} {
    const lastDotIndex = eventName.lastIndexOf(".");
    return {
        operation: eventName.substring(0, lastDotIndex) as WebframezHookOperation,
        phase: eventName.substring(lastDotIndex + 1) as WebframezHookPhase,
    };
}

function normalizeErrorType(error: unknown) {
    if (!error) {
        return null;
    }

    if (error instanceof Error && error.name) {
        return error.name;
    }

    return typeof error;
}

class WebframezHooksFacade {
    private handlers: HandlerStore = {};

    createOperationId(prefix = "op") {
        operationCounter++;
        return `${prefix}-${Date.now().toString(36)}-${operationCounter.toString(36)}`;
    }

    on<TEventName extends WebframezHookEventName>(
        eventName: TEventName,
        handler: WebframezHookHandler<TEventName>
    ) {
        if (!this.handlers[eventName]) {
            this.handlers[eventName] = new Set();
        }

        this.handlers[eventName]?.add(handler as WebframezHookHandler<any>);
        return () => this.off(eventName, handler);
    }

    off<TEventName extends WebframezHookEventName>(
        eventName: TEventName,
        handler: WebframezHookHandler<TEventName>
    ) {
        this.handlers[eventName]?.delete(handler as WebframezHookHandler<any>);
        return this;
    }

    clear(eventName?: WebframezHookEventName) {
        if (eventName) {
            delete this.handlers[eventName];
            return this;
        }

        this.handlers = {};
        return this;
    }

    async emit<TEventName extends WebframezHookEventName>(
        eventName: TEventName,
        context: Omit<Partial<WebframezOperationContext>, "operation" | "phase"> & {
            operationId: string;
        }
    ) {
        const parsed = parseEventName(eventName);
        const attributes: WebframezHookAttributes = {
            ...(context.attributes || {}),
        };

        if (context.error && attributes["error.type"] === undefined) {
            attributes["error.type"] = normalizeErrorType(context.error);
        }

        const event: WebframezLifecycleEvent<TEventName> = {
            type: eventName,
            context: {
                ...context,
                operation: parsed.operation,
                phase: parsed.phase,
                timestamp: context.timestamp || new Date(),
                attributes,
            },
        };

        const handlers = this.handlers[eventName];
        if (!handlers || handlers.size < 1) {
            return;
        }

        for (const handler of Array.from(handlers)) {
            try {
                await handler(event);
            } catch (handlerError) {
                console.error("[webframez:hooks] Handler failed:", handlerError);
            }
        }
    }
}

export const WebframezHooks = new WebframezHooksFacade();
