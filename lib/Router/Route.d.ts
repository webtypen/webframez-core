export declare class RouteFacade {
    tempGroupPrefix: string | null;
    tempGroupMiddleware: string[] | null;
    /**
     * Register a GET-Method
     *
     * @param path
     * @param component
     * @param options
     */
    get(path: string, component: any, options?: {
        [key: string]: any;
    }): void;
    /**
     * Register a POST-Method
     *
     * @param path
     * @param component
     * @param options
     */
    post(path: string, component: any, options?: {
        [key: string]: any;
    }): void;
    /**
     * Register a PUT-Method
     *
     * @param path
     * @param component
     * @param options
     */
    put(path: string, component: any, options?: {
        [key: string]: any;
    }): void;
    /**
     * Register a DELETE-Method
     *
     * @param path
     * @param component
     * @param options
     */
    delete(path: string, component: any, options?: {
        [key: string]: any;
    }): void;
    group(config: {
        [key: string]: any;
    }, children: any): void;
}
export declare const Route: RouteFacade;
