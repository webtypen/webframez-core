"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiScopeRegistry = void 0;
const Route_1 = require("../Router/Route");
const ApiFunctionUtils_1 = require("./ApiFunctionUtils");
function getModuleInstances(modulesLoader) {
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
    constructor() {
        this.context = {};
    }
    configure(context) {
        this.context = Object.assign(Object.assign({}, (this.context || {})), (context || {}));
        return this;
    }
    collect(context) {
        const runtimeContext = Object.assign(Object.assign({}, (this.context || {})), (context || {}));
        const scopes = [];
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
        return (0, ApiFunctionUtils_1.collectApiScopeRegistrations)(scopes);
    }
    register(context) {
        this.configure(context);
        const scopes = this.collect(context);
        this.assertUniqueApiPaths(scopes);
        for (const registration of scopes) {
            this.registerHttpRoutes(registration);
        }
        return this;
    }
    registerHttpRoutes(registration) {
        const scope = (0, ApiFunctionUtils_1.instantiateApiScope)(registration.scopeClass);
        if (!scope.apiBasePath) {
            return;
        }
        for (const FunctionClass of (0, ApiFunctionUtils_1.getApiFunctionClasses)(scope)) {
            const func = (0, ApiFunctionUtils_1.instantiateApiFunction)(FunctionClass);
            if (func.requestMethod === null) {
                continue;
            }
            const path = (0, ApiFunctionUtils_1.joinApiPath)(scope.apiBasePath, func.key);
            const handler = (req, res) => __awaiter(this, void 0, void 0, function* () {
                return yield this.handleHttpFunction(registration, FunctionClass, req, res);
            });
            this.registerRouteMethod(func.requestMethod, path, handler);
        }
    }
    registerRouteMethod(method, path, handler) {
        if (!method) {
            return;
        }
        const methodName = method.toLowerCase();
        const routeMethod = Route_1.Route[methodName];
        if (!routeMethod || typeof routeMethod !== "function") {
            throw new Error(`ApiFunction request method "${method}" is not supported by Route`);
        }
        routeMethod.bind(Route_1.Route)(path, handler);
    }
    handleHttpFunction(registration, FunctionClass, req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            const func = (0, ApiFunctionUtils_1.instantiateApiFunction)(FunctionClass);
            try {
                const context = yield (0, ApiFunctionUtils_1.runApiScopeRegistrationMiddleware)(registration, req, res);
                const paramsSource = (func.requestMethod || req.method).toUpperCase() === "GET" ? req.query : req.body;
                const params = (0, ApiFunctionUtils_1.validateApiFunctionParams)(func.params || {}, paramsSource || {});
                const result = yield func.handle({ context, params, request: req, response: res });
                return (0, ApiFunctionUtils_1.toApiFunctionHttpResult)(res, result);
            }
            catch (error) {
                const statusCode = error && error.statusCode && !isNaN(parseInt(error.statusCode)) ? parseInt(error.statusCode) : 500;
                return res.status(statusCode).send({
                    status: "error",
                    message: (0, ApiFunctionUtils_1.getApiErrorMessage)(error),
                });
            }
        });
    }
    assertUniqueApiPaths(scopes) {
        const seen = {};
        for (const registration of scopes) {
            const scope = (0, ApiFunctionUtils_1.instantiateApiScope)(registration.scopeClass);
            if (!scope.apiBasePath) {
                continue;
            }
            for (const FunctionClass of (0, ApiFunctionUtils_1.getApiFunctionClasses)(scope)) {
                const func = (0, ApiFunctionUtils_1.instantiateApiFunction)(FunctionClass);
                if (func.requestMethod === null) {
                    continue;
                }
                const method = func.requestMethod || "GET";
                const path = (0, ApiFunctionUtils_1.joinApiPath)(scope.apiBasePath, func.key);
                const lookupKey = `${method}:${path}`;
                if (seen[lookupKey]) {
                    throw new Error(`Duplicate ApiFunction route "${lookupKey}"`);
                }
                seen[lookupKey] = true;
            }
        }
    }
}
exports.ApiScopeRegistry = new ApiScopeRegistryFacade();
