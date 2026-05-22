type RouteRegistrationOptions = {
    [key: string]: any;
};
type RouteExtensionFactory = (route: RouteFacade) => (...args: any[]) => any;
export declare class RouteFacade {
    tempGroupPrefix: string | null;
    tempGroupMiddleware: string[] | null;
    tempGroupDomains: string[] | null;
    private normalizeStringArray;
    private registerWithGroupContext;
    /**
     * Register a custom route-method on the Route facade.
     * Allows optional packages to add framework-specific route helpers.
     */
    extend(name: string, factory: RouteExtensionFactory): this;
    /**
     * Register a GET-Method
     *
     * @param path
     * @param component
     * @param options
     */
    get(path: string, component: any, options?: RouteRegistrationOptions): void;
    /**
     * Register a POST-Method
     *
     * @param path
     * @param component
     * @param options
     */
    post(path: string, component: any, options?: RouteRegistrationOptions): void;
    /**
     * Register a PUT-Method
     *
     * @param path
     * @param component
     * @param options
     */
    put(path: string, component: any, options?: RouteRegistrationOptions): void;
    /**
     * Register a PATCH-Method
     *
     * @param path
     * @param component
     * @param options
     */
    patch(path: string, component: any, options?: RouteRegistrationOptions): void;
    /**
     * Register a DELETE-Method
     *
     * @param path
     * @param component
     * @param options
     */
    delete(path: string, component: any, options?: RouteRegistrationOptions): void;
    group(config: {
        [key: string]: any;
    }, children: any): void;
}
export declare const Route: RouteFacade;
export {};
