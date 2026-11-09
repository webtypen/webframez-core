/// <reference types="node" />
import type { Server } from "http";
import type { ModulesLoader } from "../Modules/ModulesLoader";
export type WebServerExtensionContext = {
    server: Server;
    basename: string | null;
    kernel: any;
    modulesLoader: ModulesLoader;
};
/** Optional transports attach before listen; close must release their connections. */
export interface WebServerExtension {
    attach(context: WebServerExtensionContext): void;
    close(): void | Promise<void>;
}
