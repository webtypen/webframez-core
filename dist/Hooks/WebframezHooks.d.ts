export type WebframezHookOperation = "http.request" | "route.handler" | "console.command" | "queue.job" | "queue.worker" | "app.boot" | "lambda.invoke";
export type WebframezHookPhase = "start" | "end" | "error";
export type WebframezHookEventName = `${WebframezHookOperation}.${WebframezHookPhase}`;
export type WebframezHookAttributeValue = string | number | boolean | null;
export type WebframezHookAttributes = {
    [key: string]: WebframezHookAttributeValue | undefined;
};
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
export type WebframezHookHandler<TEventName extends WebframezHookEventName = WebframezHookEventName> = (event: WebframezLifecycleEvent<TEventName>) => void | Promise<void>;
export type WebframezHookPayloadMap = {
    [TEventName in WebframezHookEventName]: WebframezLifecycleEvent<TEventName>;
};
declare class WebframezHooksFacade {
    private handlers;
    createOperationId(prefix?: string): string;
    on<TEventName extends WebframezHookEventName>(eventName: TEventName, handler: WebframezHookHandler<TEventName>): () => this;
    off<TEventName extends WebframezHookEventName>(eventName: TEventName, handler: WebframezHookHandler<TEventName>): this;
    clear(eventName?: WebframezHookEventName): this;
    emit<TEventName extends WebframezHookEventName>(eventName: TEventName, context: Omit<Partial<WebframezOperationContext>, "operation" | "phase"> & {
        operationId: string;
    }): Promise<void>;
}
export declare const WebframezHooks: WebframezHooksFacade;
export {};
