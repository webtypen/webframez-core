import { ApiScopeClass } from "./ApiTypes";
type ApiScopeRuntimeContext = {
    kernel?: any;
    modulesLoader?: any;
};
declare class ApiScopeRegistryFacade {
    private context;
    configure(context?: ApiScopeRuntimeContext): this;
    collect(context?: ApiScopeRuntimeContext): ApiScopeClass[];
    register(context?: ApiScopeRuntimeContext): this;
    private registerHttpRoutes;
    private registerRouteMethod;
    private handleHttpFunction;
    private assertUniqueApiPaths;
}
export declare const ApiScopeRegistry: ApiScopeRegistryFacade;
export {};
