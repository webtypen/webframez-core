/// <reference types="node" />
import http from "http";
import { ModulesLoader } from "./Modules/ModulesLoader";
export declare class WebApplication {
    private server;
    modulesLoader: ModulesLoader | null;
    /**
     * Init the routes and start the http-server
     */
    boot(options?: any): http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>;
}
