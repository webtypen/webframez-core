/// <reference types="node" />
import http from "http";
import { ModulesLoader } from "./Modules/ModulesLoader";
export declare class WebApplication {
    private server;
    modulesLoader: ModulesLoader | null;
    private serverExtensions;
    private closing;
    /** Close optional transports before waiting for the HTTP server to stop. */
    close(): Promise<void>;
    /**
     * Init the routes and start the http-server
     */
    boot(options?: any): http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>;
    private bootScoped;
}
