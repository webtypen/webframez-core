import { Route } from "../Router/Route";
import { Request } from "../Router/Request";
import { Response } from "../Router/Response";
import { ApiFunctionClass, ApiFunctionRequestMethod, ApiScopeRegistrationClass } from "./ApiTypes";
import {
    ApiScopeRegistrationEntry,
    collectApiScopeRegistrations,
    getApiErrorMessage,
    getApiFunctionClasses,
    instantiateApiFunction,
    instantiateApiScope,
    joinApiPath,
    runApiScopeRegistrationMiddleware,
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

    collect(context?: ApiScopeRuntimeContext): ApiScopeRegistrationEntry[] {
        const runtimeContext = {
            ...(this.context || {}),
            ...(context || {}),
        };

        const scopes: ApiScopeRegistrationClass[] = [];
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

        return collectApiScopeRegistrations(scopes);
    }

    register(context?: ApiScopeRuntimeContext) {
        this.configure(context);
        const scopes = this.collect(context);
        this.assertUniqueApiPaths(scopes);

        for (const registration of scopes) {
            this.registerHttpRoutes(registration);
        }

        return this;
    }

    private registerHttpRoutes(registration: ApiScopeRegistrationEntry) {
        const scope = instantiateApiScope(registration.scopeClass);
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
                return await this.handleHttpFunction(registration, FunctionClass, req, res);
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
        registration: ApiScopeRegistrationEntry,
        FunctionClass: ApiFunctionClass,
        req: Request,
        res: Response
    ) {
        const func = instantiateApiFunction(FunctionClass);

        try {
            const context = await runApiScopeRegistrationMiddleware(registration, req, res);
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

    private assertUniqueApiPaths(scopes: ApiScopeRegistrationEntry[]) {
        const seen: { [key: string]: boolean } = {};
        for (const registration of scopes) {
            const scope = instantiateApiScope(registration.scopeClass);
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
