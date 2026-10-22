export type WebframezErrorScope = "controller" | "command" | "job" | "boot" | "process";
export type WebframezErrorContext = {
    scope: WebframezErrorScope;
    applicationType?: "WebApplication" | "ConsoleApplication" | "LambdaApplication";
    operationId?: string;
    expected?: boolean;
    severity?: "error" | "fatal";
    api?: {
        scope?: string;
        function?: string;
    };
    source?: string;
    metadata?: {
        [key: string]: any;
    };
    command?: {
        signature?: string;
        className?: string;
        args?: {
            arguments: string[];
            options: {
                [key: string]: boolean | string;
            };
        };
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
    process: {
        instanceId: string;
        pid: number;
        startedAt: Date;
        nodeVersion: string;
        coreVersion: string;
    };
    timestamp: Date;
    error: Error;
    originalError: any;
};
export type WebframezGlobalErrorHandler = (event: WebframezErrorEvent) => void | Promise<void>;
declare class ErrorHandlerFacade {
    private handlers;
    private observers;
    private context;
    private process;
    getProcessInfo(): {
        instanceId: `${string}-${string}-${string}-${string}-${string}`;
        pid: number;
        startedAt: Date;
        nodeVersion: string;
        coreVersion: any;
    };
    onReport(listener: WebframezGlobalErrorHandler): () => void;
    getContext(): Partial<WebframezErrorContext>;
    withContext<T>(context: Partial<WebframezErrorContext>, callback: () => T): T;
    isExpected(error: any): boolean;
    httpStatus(error: any): number;
    publicMessage(error: any, status?: number): string;
    private normalizeToError;
    setHandler(handler: WebframezGlobalErrorHandler | null | undefined): this;
    setHandlers(handlers: WebframezGlobalErrorHandler[] | null | undefined): this;
    addHandler(handler: WebframezGlobalErrorHandler | null | undefined): this;
    clearHandlers(): this;
    report(error: any, context?: Partial<WebframezErrorContext>): Promise<void>;
}
export declare const ErrorHandler: ErrorHandlerFacade;
export {};
