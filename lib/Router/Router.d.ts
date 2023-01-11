/// <reference types="node" />
import { IncomingMessage, ServerResponse } from "http";
type RouteObject = {
    path: string;
    component: any;
    options: {
        [key: string]: any;
    };
    params: object;
};
declare class RouterFacade {
    /**
     * Basename
     */
    basename: string | null;
    /**
     * Kernel-Class
     */
    kernel: any | null;
    /**
     * Mode
     */
    mode: any | null;
    /**
     * GET Route Store
     */
    routesGET: {
        [key: string]: {
            path: string;
            component: any;
            options: object;
            params?: object;
        };
    };
    /**
     * POST Route Store
     */
    routesPOST: {
        [key: string]: {
            path: string;
            component: any;
            options: object;
            params?: object;
        };
    };
    /**
     * PUT Route Store
     */
    routesPUT: {
        [key: string]: {
            path: string;
            component: any;
            options: object;
            params?: object;
        };
    };
    /**
     * DELETE Route Store
     */
    routesDELETE: {
        [key: string]: {
            path: string;
            component: any;
            options: object;
            params?: object;
        };
    };
    /**
     * Load the application-routes
     *
     */
    init(options?: any): void;
    /**
     * Register a route
     *
     * @param type
     * @param path
     * @param component
     * @param options
     */
    register(type: string, path: string, component: any, options: object): void;
    /**
     * Loads the matching route based on the request-url
     *
     * @param req
     * @returns
     */
    dissolve(req: IncomingMessage | any | null): RouteObject | null;
    /**
     * Dissolves the matching route based on the request-url and an object of routes
     *
     * @param routes
     * @param url
     * @returns
     */
    dissolveRoute(routes: any, url: string): any;
    /**
     * Sends the default 404-Page
     *
     * @param res
     */
    sendError(res: ServerResponse, code: number, message?: string): void;
    /**
     * Processes a request
     *
     * @param req
     * @param res
     */
    handleRequest(req: null | IncomingMessage, res: null | ServerResponse, options?: any): Promise<void | {
        statusCode: number;
        body: string;
    }>;
    requestConsoleLog(req: IncomingMessage, httpCode: number): void;
}
export declare const Router: RouterFacade;
export {};
