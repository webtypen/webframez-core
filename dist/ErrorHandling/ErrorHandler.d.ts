export type WebframezErrorScope = "controller" | "command" | "job";
export type WebframezErrorContext = {
    scope: WebframezErrorScope;
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
    };
};
export type WebframezErrorEvent = WebframezErrorContext & {
    timestamp: Date;
    error: Error;
    originalError: any;
};
export type WebframezGlobalErrorHandler = (event: WebframezErrorEvent) => void | Promise<void>;
declare class ErrorHandlerFacade {
    private handlers;
    private normalizeToError;
    setHandler(handler: WebframezGlobalErrorHandler | null | undefined): this;
    setHandlers(handlers: WebframezGlobalErrorHandler[] | null | undefined): this;
    addHandler(handler: WebframezGlobalErrorHandler | null | undefined): this;
    clearHandlers(): this;
    report(error: any, context: WebframezErrorContext): Promise<void>;
}
export declare const ErrorHandler: ErrorHandlerFacade;
export {};
