/// <reference types="node" />
import { IncomingMessage, ServerResponse } from "http";
import { Response } from "./Response";
import { Request } from "./Request";
type RouteObject = {
    path: string;
    component?: any;
    controller?: any;
    method_name?: string;
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
     */
    init(options?: any): void;
    /**
     * Dissolves 'MyController@myFunction'
     *
     * @param str
     */
    dissolveStringComponent(str: string, path: string): {
        controller: any;
        method_name: string;
    };
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
    dissolve(req: Request): RouteObject | null;
    /**
     * Extrahiert die Parameterwerte aus einer URL basierend auf einem Routenpfad.
     * @param {string} path - Der Routenpfad.
     * @param {Array} match - Das Match-Array des regulären Ausdrucks.
     * @returns {Object} - Ein Objekt mit den extrahierten Parametern.
     */
    extractParams(path: string, match: any): any;
    /**
     * Dissolves the matching route based on the request-url and an object of routes
     *
     * @param routes
     * @param url
     * @returns
     */
    dissolveRoute(routes: any, url: string, request?: Request): any;
    /**
     * Processes a request
     *
     * @param req
     * @param res
     */
    handleRequest(req: null | IncomingMessage, res: null | ServerResponse, options?: any): Promise<{
        statusCode: number;
        body: any;
        headers: {
            [key: string]: any;
        };
    } | undefined>;
    handleMiddleware(route: RouteObject, request: Request, response: Response): Promise<void>;
    mapRequest(req: null | IncomingMessage, options?: any): Promise<Request>;
    parseRequestBody(req: IncomingMessage): Promise<unknown>;
    handleReturn(request: Request, response: Response, body: any): {
        statusCode: number;
        body: any;
        headers: {
            [key: string]: any;
        };
    } | undefined;
    handleError(request: Request, response: Response, statusCode: number, error: Error | string): {
        statusCode: number;
        body: any;
        headers: {
            [key: string]: any;
        };
    } | undefined;
}
export declare const Router: RouterFacade;
export {};
