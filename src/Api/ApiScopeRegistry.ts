import { Route } from "../Router/Route";
import { Request } from "../Router/Request";
import { Response } from "../Router/Response";
import { ApiFunctionClass, ApiFunctionRequestMethod, ApiScopeClass } from "./ApiTypes";
import {
    getApiErrorMessage,
    getApiFunctionClasses,
    instantiateApiFunction,
    instantiateApiScope,
    joinApiPath,
    runApiScopeMiddleware,
    toApiFunctionHttpResult,
    validateApiFunctionParams,
} from "./ApiFunctionUtils";

type ApiScopeRuntimeContext = {
    kernel?: any;
    modulesLoader?: any;
};

function getModuleInstances(modulesLoader: any) {
    if (!modulesLoader) {
        return [];
    }

    if (typeof modulesLoader.getLoadedModuleInstances === "function") {
        return modulesLoader.getLoadedModuleInstances();
    }

    if (typeof modulesLoader.getLoadedModules === "function") {
        const modules = modulesLoader.getLoadedModules();
        return Object.keys(modules || {}).map((key) => modules[key]);
    }

    return [];
}

class ApiScopeRegistryFacade {
    private context: ApiScopeRuntimeContext = {};

    configure(context?: ApiScopeRuntimeContext) {
        this.context = {
            ...(this.context || {}),
            ...(context || {}),
        };
        return this;
    }

    collect(context?: ApiScopeRuntimeContext): ApiScopeClass[] {
        const runtimeContext = {
            ...(this.context || {}),
            ...(context || {}),
        };

        const scopes: ApiScopeClass[] = [];
        const kernelScopes = runtimeContext.kernel && Array.isArray(runtimeContext.kernel.apiScopes) ? runtimeContext.kernel.apiScopes : [];
        scopes.push(...kernelScopes);

        for (const mod of getModuleInstances(runtimeContext.modulesLoader)) {
            const moduleScopes = Array.isArray(mod && mod.apiScopes)
                ? mod.apiScopes
                : Array.isArray(mod && mod.constructor && mod.constructor.apiScopes)
                ? mod.constructor.apiScopes
                : [];
            scopes.push(...moduleScopes);
        }

        return scopes.filter((scopeClass) => typeof scopeClass === "function");
    }

    register(context?: ApiScopeRuntimeContext) {
        this.configure(context);
        const scopes = this.collect(context);
        this.assertUniqueApiPaths(scopes);

        for (const ScopeClass of scopes) {
            this.registerHttpRoutes(ScopeClass);
        }

        return this;
    }

    private registerHttpRoutes(ScopeClass: ApiScopeClass) {
        const scope = instantiateApiScope(ScopeClass);
        if (!scope.apiBasePath) {
            return;
        }

        for (const FunctionClass of getApiFunctionClasses(scope)) {
            const func = instantiateApiFunction(FunctionClass);
            if (func.requestMethod === null) {
                continue;
            }

            const path = joinApiPath(scope.apiBasePath, func.key);
            const handler = async (req: Request, res: Response) => {
                return await this.handleHttpFunction(ScopeClass, FunctionClass, req, res);
            };

            this.registerRouteMethod(func.requestMethod, path, handler);
        }
    }

    private registerRouteMethod(method: ApiFunctionRequestMethod, path: string, handler: any) {
        if (!method) {
            return;
        }

        const methodName = method.toLowerCase();
        const routeMethod = (Route as any)[methodName];
        if (!routeMethod || typeof routeMethod !== "function") {
            throw new Error(`ApiFunction request method "${method}" is not supported by Route`);
        }

        routeMethod.bind(Route)(path, handler);
    }

    private async handleHttpFunction(
        ScopeClass: ApiScopeClass,
        FunctionClass: ApiFunctionClass,
        req: Request,
        res: Response
    ) {
        const scope = instantiateApiScope(ScopeClass);
        const func = instantiateApiFunction(FunctionClass);

        try {
            const context = await runApiScopeMiddleware(scope, req, res);
            const paramsSource = (func.requestMethod || req.method).toUpperCase() === "GET" ? req.query : req.body;
            const params = validateApiFunctionParams(func.params || {}, paramsSource || {});
            const result = await func.handle({ context, params, request: req, response: res });
            return toApiFunctionHttpResult(res, result);
        } catch (error: any) {
            const statusCode = error && error.statusCode && !isNaN(parseInt(error.statusCode)) ? parseInt(error.statusCode) : 500;
            return res.status(statusCode).send({
                status: "error",
                message: getApiErrorMessage(error),
            });
        }
    }

    private assertUniqueApiPaths(scopes: ApiScopeClass[]) {
        const seen: { [key: string]: boolean } = {};
        for (const ScopeClass of scopes) {
            const scope = instantiateApiScope(ScopeClass);
            if (!scope.apiBasePath) {
                continue;
            }

            for (const FunctionClass of getApiFunctionClasses(scope)) {
                const func = instantiateApiFunction(FunctionClass);
                if (func.requestMethod === null) {
                    continue;
                }

                const method = func.requestMethod || "GET";
                const path = joinApiPath(scope.apiBasePath, func.key);
                const lookupKey = `${method}:${path}`;
                if (seen[lookupKey]) {
                    throw new Error(`Duplicate ApiFunction route "${lookupKey}"`);
                }
                seen[lookupKey] = true;
            }
        }
    }
}

export const ApiScopeRegistry = new ApiScopeRegistryFacade();
