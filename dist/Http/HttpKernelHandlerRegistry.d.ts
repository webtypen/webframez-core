/// <reference types="node" />
import { IncomingMessage, ServerResponse } from "http";
export type HttpKernelHandlerContext = {
    req: IncomingMessage;
    res: ServerResponse;
    kernel?: any;
    modulesLoader?: any;
    basename?: string | null;
    options?: any;
};
export type HttpKernelHandler = (context: HttpKernelHandlerContext) => boolean | Promise<boolean>;
declare class HttpKernelHandlerRegistryFacade {
    private handlers;
    register(name: string, handler: HttpKernelHandler): () => this;
    unregister(name: string): this;
    clear(): this;
    handle(context: HttpKernelHandlerContext): Promise<boolean>;
}
export declare const HttpKernelHandlerRegistry: HttpKernelHandlerRegistryFacade;
export {};
