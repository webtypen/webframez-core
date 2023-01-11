/// <reference types="node" />
import http from "http";
export declare class WebApplication {
    private server;
    /**
     * Init the routes and start the http-server
     */
    boot(options?: any): http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>;
}
