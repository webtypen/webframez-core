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

class HttpKernelHandlerRegistryFacade {
    private handlers: Map<string, HttpKernelHandler> = new Map();

    register(name: string, handler: HttpKernelHandler) {
        if (!name || name.trim() === "") {
            throw new Error("HttpKernelHandlerRegistry.register requires a non-empty name");
        }

        if (!handler || typeof handler !== "function") {
            throw new Error("HttpKernelHandlerRegistry.register requires a handler function");
        }

        this.handlers.set(name, handler);
        return () => this.unregister(name);
    }

    unregister(name: string) {
        this.handlers.delete(name);
        return this;
    }

    clear() {
        this.handlers.clear();
        return this;
    }

    async handle(context: HttpKernelHandlerContext) {
        for (const handler of Array.from(this.handlers.values())) {
            if (await handler(context)) {
                return true;
            }
        }

        return false;
    }
}

export const HttpKernelHandlerRegistry = new HttpKernelHandlerRegistryFacade();
