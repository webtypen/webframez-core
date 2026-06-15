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
exports.instantiateApiFunction = exports.instantiateApiScope = exports.assertUniqueApiFunctionKeys = exports.createApiFrameworkRequest = exports.toApiFunctionPayload = exports.toApiFunctionHttpResult = exports.apiFunctionParamToJsonSchema = exports.apiFunctionParamsToJsonSchema = exports.coerceApiFunctionParam = exports.validateApiFunctionParams = exports.runApiScopeRegistrationMiddleware = exports.runApiScopeGroupMiddleware = exports.runApiScopesGroupMiddleware = exports.runApiScopeMiddleware = exports.collectApiScopeRegistrations = exports.instantiateApiScopesGroup = exports.isApiScopesGroupInstance = exports.normalizeApiScopesGroupProvider = exports.getApiFunctionClasses = exports.normalizeApiFunctionProvider = exports.isPlainApiObject = exports.getApiErrorMessage = exports.joinApiPath = exports.normalizeApiPath = exports.ApiFunctionRuntimeError = void 0;
const Request_1 = require("../Router/Request");
const ApiFunction_1 = require("./ApiFunction");
const ApiScopesGroup_1 = require("./ApiScopesGroup");
class ApiFunctionRuntimeError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
    }
}
exports.ApiFunctionRuntimeError = ApiFunctionRuntimeError;
function normalizeApiPath(value) {
    const trimmed = value && value.trim() !== "" ? value.trim() : "/";
    const withSlash = trimmed.startsWith("/") ? trimmed : "/" + trimmed;
    const collapsed = withSlash.replace(/\/+/g, "/");
    return collapsed.length > 1 ? collapsed.replace(/\/+$/, "") : collapsed;
}
exports.normalizeApiPath = normalizeApiPath;
function joinApiPath(...parts) {
    const cleaned = parts
        .filter((part) => typeof part === "string" && part.trim() !== "")
        .map((part) => part.trim().replace(/^\/+|\/+$/g, ""))
        .filter((part) => part !== "");
    return normalizeApiPath("/" + cleaned.join("/"));
}
exports.joinApiPath = joinApiPath;
function getApiErrorMessage(error) {
    if (error && typeof error === "string" && error.trim() !== "") {
        return error.trim();
    }
    if (error && error.message && typeof error.message === "string" && error.message.trim() !== "") {
        return error.message.trim();
    }
    if (error && error.toString && error.toString().trim() !== "") {
        return error.toString().trim();
    }
    return "Internal Server Error";
}
exports.getApiErrorMessage = getApiErrorMessage;
function isPlainApiObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Buffer);
}
exports.isPlainApiObject = isPlainApiObject;
function normalizeApiFunctionProvider(provider) {
    if (typeof provider === "function") {
        const resolved = provider();
        if (resolved && typeof resolved.then === "function") {
            throw new Error("Async ApiScope.functions providers are not supported during web boot");
        }
        return Array.isArray(resolved) ? resolved : [];
    }
    return Array.isArray(provider) ? provider : [];
}
exports.normalizeApiFunctionProvider = normalizeApiFunctionProvider;
function getApiFunctionClasses(scope) {
    const functions = normalizeApiFunctionProvider(scope.functions);
    assertUniqueApiFunctionKeys(scope, functions);
    return functions;
}
exports.getApiFunctionClasses = getApiFunctionClasses;
function createApiScopeMiddlewareAbort() {
    const abort = (message, status = 403) => {
        throw new ApiFunctionRuntimeError(getApiErrorMessage(message || "Request aborted"), status);
    };
    return abort;
}
function normalizeApiScopesGroupProvider(provider) {
    if (typeof provider === "function") {
        const resolved = provider();
        if (resolved && typeof resolved.then === "function") {
            throw new Error("Async ApiScopesGroup.apiScopes providers are not supported during web boot");
        }
        return Array.isArray(resolved) ? resolved : [];
    }
    return Array.isArray(provider) ? provider : [];
}
exports.normalizeApiScopesGroupProvider = normalizeApiScopesGroupProvider;
function isApiScopesGroupInstance(value) {
    return value instanceof ApiScopesGroup_1.ApiScopesGroup;
}
exports.isApiScopesGroupInstance = isApiScopesGroupInstance;
function instantiateApiScopesGroup(GroupClass) {
    return new GroupClass();
}
exports.instantiateApiScopesGroup = instantiateApiScopesGroup;
function collectApiScopeRegistrations(registrations) {
    const entries = [];
    for (const RegistrationClass of registrations || []) {
        if (typeof RegistrationClass !== "function") {
            continue;
        }
        const registration = new RegistrationClass();
        if (isApiScopesGroupInstance(registration)) {
            for (const ScopeClass of normalizeApiScopesGroupProvider(registration.apiScopes)) {
                if (typeof ScopeClass === "function") {
                    entries.push({
                        scopeClass: ScopeClass,
                        groupClass: RegistrationClass,
                    });
                }
            }
            continue;
        }
        entries.push({
            scopeClass: RegistrationClass,
        });
    }
    return entries;
}
exports.collectApiScopeRegistrations = collectApiScopeRegistrations;
function runApiScopeMiddleware(scope, req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const abort = createApiScopeMiddlewareAbort();
        const result = yield scope.middleware(req, res, abort);
        return isPlainApiObject(result) ? result : {};
    });
}
exports.runApiScopeMiddleware = runApiScopeMiddleware;
function runApiScopesGroupMiddleware(group, req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const abort = createApiScopeMiddlewareAbort();
        const result = yield group.middleware(req, res, abort);
        return isPlainApiObject(result) ? result : {};
    });
}
exports.runApiScopesGroupMiddleware = runApiScopesGroupMiddleware;
function runApiScopeGroupMiddleware(scope, req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const abort = createApiScopeMiddlewareAbort();
        const result = yield scope.groupMiddleware(req, res, abort);
        return isPlainApiObject(result) ? result : {};
    });
}
exports.runApiScopeGroupMiddleware = runApiScopeGroupMiddleware;
function runApiScopeRegistrationMiddleware(registration, req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const groupContext = registration.groupClass
            ? yield runApiScopesGroupMiddleware(instantiateApiScopesGroup(registration.groupClass), req, res)
            : {};
        const scope = instantiateApiScope(registration.scopeClass);
        const scopeContext = yield runApiScopeMiddleware(scope, req, res);
        const groupScopeContext = registration.groupClass ? yield runApiScopeGroupMiddleware(scope, req, res) : {};
        return Object.assign(Object.assign(Object.assign({}, groupContext), scopeContext), groupScopeContext);
    });
}
exports.runApiScopeRegistrationMiddleware = runApiScopeRegistrationMiddleware;
function validateApiFunctionParams(definitions, source) {
    const params = {};
    const input = isPlainApiObject(source) ? source : {};
    for (const key of Object.keys(definitions || {})) {
        const definition = definitions[key] || {};
        const hasValue = input[key] !== undefined && input[key] !== null && input[key] !== "";
        const value = hasValue ? input[key] : definition.default;
        if ((value === undefined || value === null || value === "") && definition.required) {
            throw new ApiFunctionRuntimeError(`Missing required parameter "${key}"`, 400);
        }
        if (value === undefined || value === null || value === "") {
            params[key] = value;
            continue;
        }
        params[key] = coerceApiFunctionParam(key, value, definition);
    }
    return params;
}
exports.validateApiFunctionParams = validateApiFunctionParams;
function coerceApiFunctionParam(key, value, definition) {
    const type = (definition.type || "string").toLowerCase();
    if (type === "string") {
        return typeof value === "string" ? value : value.toString();
    }
    if (type === "number" || type === "float") {
        const parsed = typeof value === "number" ? value : parseFloat(value);
        if (isNaN(parsed)) {
            throw new ApiFunctionRuntimeError(`Parameter "${key}" must be a number`, 400);
        }
        return parsed;
    }
    if (type === "integer" || type === "int") {
        const parsed = typeof value === "number" ? value : parseInt(value, 10);
        if (isNaN(parsed)) {
            throw new ApiFunctionRuntimeError(`Parameter "${key}" must be an integer`, 400);
        }
        return parsed;
    }
    if (type === "boolean" || type === "bool") {
        if (typeof value === "boolean") {
            return value;
        }
        const normalized = value.toString().toLowerCase();
        if (["true", "1", "yes", "on"].includes(normalized)) {
            return true;
        }
        if (["false", "0", "no", "off"].includes(normalized)) {
            return false;
        }
        throw new ApiFunctionRuntimeError(`Parameter "${key}" must be a boolean`, 400);
    }
    if (type === "objectid") {
        const stringValue = value.toString();
        if (!/^[a-fA-F0-9]{24}$/.test(stringValue)) {
            throw new ApiFunctionRuntimeError(`Parameter "${key}" must be a valid ObjectId`, 400);
        }
        return stringValue;
    }
    if (type === "option") {
        const allowedValues = Array.isArray(definition.options) ? definition.options.map((option) => option.value) : [];
        if (allowedValues.length > 0 && !allowedValues.includes(value)) {
            throw new ApiFunctionRuntimeError(`Parameter "${key}" must be one of: ${allowedValues.join(", ")}`, 400);
        }
        return value;
    }
    if (type === "array") {
        if (Array.isArray(value)) {
            return value;
        }
        if (typeof value === "string") {
            try {
                const parsed = JSON.parse(value);
                if (Array.isArray(parsed)) {
                    return parsed;
                }
            }
            catch (_error) { }
        }
        throw new ApiFunctionRuntimeError(`Parameter "${key}" must be an array`, 400);
    }
    if (type === "object") {
        if (isPlainApiObject(value)) {
            return value;
        }
        if (typeof value === "string") {
            try {
                const parsed = JSON.parse(value);
                if (isPlainApiObject(parsed)) {
                    return parsed;
                }
            }
            catch (_error) { }
        }
        throw new ApiFunctionRuntimeError(`Parameter "${key}" must be an object`, 400);
    }
    if (type === "file") {
        if (typeof value === "string" || isPlainApiObject(value)) {
            return value;
        }
        throw new ApiFunctionRuntimeError(`Parameter "${key}" must be a file path/string or a file reference object`, 400);
    }
    return value;
}
exports.coerceApiFunctionParam = coerceApiFunctionParam;
function apiFunctionParamsToJsonSchema(definitions) {
    const properties = {};
    const required = [];
    for (const key of Object.keys(definitions || {})) {
        const definition = definitions[key] || {};
        const schema = apiFunctionParamToJsonSchema(definition);
        if (definition.description) {
            schema.description = definition.description;
        }
        if (definition.default !== undefined) {
            schema.default = definition.default;
        }
        if (definition.required && definition.default === undefined) {
            required.push(key);
        }
        properties[key] = schema;
    }
    return {
        type: "object",
        properties,
        required,
        additionalProperties: false,
    };
}
exports.apiFunctionParamsToJsonSchema = apiFunctionParamsToJsonSchema;
function apiFunctionParamToJsonSchema(definition) {
    const type = (definition.type || "string").toLowerCase();
    if (type === "number" || type === "float")
        return { type: "number" };
    if (type === "integer" || type === "int")
        return { type: "integer" };
    if (type === "boolean" || type === "bool")
        return { type: "boolean" };
    if (type === "objectid")
        return { type: "string", pattern: "^[a-fA-F0-9]{24}$" };
    if (type === "array")
        return { type: "array", items: {} };
    if (type === "object")
        return { type: "object" };
    if (type === "file") {
        return {
            anyOf: [
                {
                    type: "string",
                    description: "Local ChatGPT runtime file path, downloadable URL, Data-URL, or Base64 content.",
                },
                {
                    type: "object",
                    additionalProperties: true,
                    properties: {
                        url: { type: "string" },
                        download_url: { type: "string" },
                        download_link: { type: "string" },
                        file_url: { type: "string" },
                        content_base64: { type: "string" },
                        data_url: { type: "string" },
                        id: { type: "string" },
                        filename: { type: "string" },
                        name: { type: "string" },
                        mime: { type: "string" },
                        mime_type: { type: "string" },
                    },
                },
            ],
            "x-webframez-type": "file",
            "x-openai-file-parameter": true,
        };
    }
    if (type === "option" && Array.isArray(definition.options) && definition.options.length > 0) {
        return { enum: definition.options.map((option) => option.value) };
    }
    return { type: "string" };
}
exports.apiFunctionParamToJsonSchema = apiFunctionParamToJsonSchema;
function toApiFunctionHttpResult(res, result) {
    if (result instanceof ApiFunction_1.ApiFunctionResponse) {
        res.status(result.status);
        return res.send(result.getData());
    }
    return res.send(result);
}
exports.toApiFunctionHttpResult = toApiFunctionHttpResult;
function toApiFunctionPayload(result) {
    return result instanceof ApiFunction_1.ApiFunctionResponse ? result.getData() : result;
}
exports.toApiFunctionPayload = toApiFunctionPayload;
function createApiFrameworkRequest(req) {
    const parsedUrl = new URL(req.url || "/", "http://webframez.local");
    const request = new Request_1.Request();
    request.message = req;
    request.headers = req.headers;
    request.rawHeaders = req.rawHeaders;
    request.url = req.url || "";
    request.method = req.method || "";
    request.socket = req.socket;
    request.query = Object.fromEntries(parsedUrl.searchParams.entries());
    request.queryRaw = parsedUrl.search ? parsedUrl.search.substring(1) : "";
    request.pathname = parsedUrl.pathname;
    request.body = {};
    request.bodyPlain = "";
    return request;
}
exports.createApiFrameworkRequest = createApiFrameworkRequest;
function assertUniqueApiFunctionKeys(scope, functions) {
    const seen = {};
    for (const FunctionClass of functions) {
        const func = new FunctionClass();
        if (!func.key || func.key.trim() === "") {
            throw new Error(`ApiFunction in scope "${scope.key}" is missing a key`);
        }
        if (seen[func.key]) {
            throw new Error(`Duplicate ApiFunction key "${func.key}" in scope "${scope.key}"`);
        }
        seen[func.key] = true;
    }
}
exports.assertUniqueApiFunctionKeys = assertUniqueApiFunctionKeys;
function instantiateApiScope(ScopeClass) {
    return new ScopeClass();
}
exports.instantiateApiScope = instantiateApiScope;
function instantiateApiFunction(FunctionClass) {
    return new FunctionClass();
}
exports.instantiateApiFunction = instantiateApiFunction;
