/// <reference types="node" />
import { IncomingMessage } from "http";
import { Request } from "../Router/Request";
import { Response } from "../Router/Response";
import { ApiFunction, ApiFunctionResponse } from "./ApiFunction";
import { ApiScope } from "./ApiScope";
import { ApiScopesGroup } from "./ApiScopesGroup";
import {
    ApiFunctionClass,
    ApiFunctionParamDefinition,
    ApiFunctionParamsDefinition,
    ApiScopeClass,
    ApiScopeRegistrationClass,
    ApiScopesGroupClass,
} from "./ApiTypes";

export type ApiScopeRegistrationEntry = {
    scopeClass: ApiScopeClass;
    groupClass?: ApiScopesGroupClass;
};

export class ApiFunctionRuntimeError extends Error {
    statusCode: number;

    constructor(message: string, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
    }
}

export function normalizeApiPath(value: string) {
    const trimmed = value && value.trim() !== "" ? value.trim() : "/";
    const withSlash = trimmed.startsWith("/") ? trimmed : "/" + trimmed;
    const collapsed = withSlash.replace(/\/+/g, "/");
    return collapsed.length > 1 ? collapsed.replace(/\/+$/, "") : collapsed;
}

export function joinApiPath(...parts: Array<string | null | undefined>) {
    const cleaned = parts
        .filter((part): part is string => typeof part === "string" && part.trim() !== "")
        .map((part) => part.trim().replace(/^\/+|\/+$/g, ""))
        .filter((part) => part !== "");

    return normalizeApiPath("/" + cleaned.join("/"));
}

export function getApiErrorMessage(error: any) {
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

export function isPlainApiObject(value: any) {
    return !!value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Buffer);
}

export function normalizeApiFunctionProvider(provider: any): ApiFunctionClass[] {
    if (typeof provider === "function") {
        const resolved = provider();
        if (resolved && typeof resolved.then === "function") {
            throw new Error("Async ApiScope.functions providers are not supported during web boot");
        }
        return Array.isArray(resolved) ? resolved : [];
    }

    return Array.isArray(provider) ? provider : [];
}

export function getApiFunctionClasses(scope: ApiScope) {
    const functions = normalizeApiFunctionProvider(scope.functions);
    assertUniqueApiFunctionKeys(scope, functions);
    return functions;
}

function createApiScopeMiddlewareAbort() {
    const abort = (message?: any, status = 403): never => {
        throw new ApiFunctionRuntimeError(getApiErrorMessage(message || "Request aborted"), status);
    };

    return abort;
}

export function normalizeApiScopesGroupProvider(provider: any): ApiScopeClass[] {
    if (typeof provider === "function") {
        const resolved = provider();
        if (resolved && typeof resolved.then === "function") {
            throw new Error("Async ApiScopesGroup.apiScopes providers are not supported during web boot");
        }
        return Array.isArray(resolved) ? resolved : [];
    }

    return Array.isArray(provider) ? provider : [];
}

export function isApiScopesGroupInstance(value: any): value is ApiScopesGroup {
    return value instanceof ApiScopesGroup;
}

export function instantiateApiScopesGroup(GroupClass: ApiScopesGroupClass) {
    return new GroupClass() as ApiScopesGroup;
}

export function collectApiScopeRegistrations(registrations: ApiScopeRegistrationClass[]): ApiScopeRegistrationEntry[] {
    const entries: ApiScopeRegistrationEntry[] = [];

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
                        groupClass: RegistrationClass as ApiScopesGroupClass,
                    });
                }
            }
            continue;
        }

        entries.push({
            scopeClass: RegistrationClass as ApiScopeClass,
        });
    }

    return entries;
}

export async function runApiScopeMiddleware(scope: ApiScope, req: Request, res: Response) {
    const abort = createApiScopeMiddlewareAbort();
    const result = await scope.middleware(req, res, abort);
    return isPlainApiObject(result) ? result : {};
}

export async function runApiScopesGroupMiddleware(group: ApiScopesGroup, req: Request, res: Response) {
    const abort = createApiScopeMiddlewareAbort();
    const result = await group.middleware(req, res, abort);
    return isPlainApiObject(result) ? result : {};
}

export async function runApiScopeGroupMiddleware(scope: ApiScope, req: Request, res: Response) {
    const abort = createApiScopeMiddlewareAbort();
    const result = await scope.groupMiddleware(req, res, abort);
    return isPlainApiObject(result) ? result : {};
}

export async function runApiScopeRegistrationMiddleware(
    registration: ApiScopeRegistrationEntry,
    req: Request,
    res: Response
) {
    const groupContext = registration.groupClass
        ? await runApiScopesGroupMiddleware(instantiateApiScopesGroup(registration.groupClass), req, res)
        : {};
    const scope = instantiateApiScope(registration.scopeClass);
    const scopeContext = await runApiScopeMiddleware(scope, req, res);
    const groupScopeContext = registration.groupClass ? await runApiScopeGroupMiddleware(scope, req, res) : {};

    return {
        ...groupContext,
        ...scopeContext,
        ...groupScopeContext,
    };
}

export function validateApiFunctionParams(definitions: ApiFunctionParamsDefinition, source: { [key: string]: any }) {
    const params: { [key: string]: any } = {};
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

export function coerceApiFunctionParam(key: string, value: any, definition: ApiFunctionParamDefinition) {
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
            } catch (_error) {}
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
            } catch (_error) {}
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

export function apiFunctionParamsToJsonSchema(definitions: ApiFunctionParamsDefinition) {
    const properties: { [key: string]: any } = {};
    const required: string[] = [];
    for (const key of Object.keys(definitions || {})) {
        const definition = definitions[key] || {};
        const schema: any = apiFunctionParamToJsonSchema(definition);
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

export function apiFunctionParamToJsonSchema(definition: ApiFunctionParamDefinition) {
    const type = (definition.type || "string").toLowerCase();
    if (type === "number" || type === "float") return { type: "number" };
    if (type === "integer" || type === "int") return { type: "integer" };
    if (type === "boolean" || type === "bool") return { type: "boolean" };
    if (type === "objectid") return { type: "string", pattern: "^[a-fA-F0-9]{24}$" };
    if (type === "array") return { type: "array", items: {} };
    if (type === "object") return { type: "object" };
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
            "x-openai-file-arg-rewrite": true,
        };
    }

    if (type === "option" && Array.isArray(definition.options) && definition.options.length > 0) {
        return { enum: definition.options.map((option) => option.value) };
    }

    return { type: "string" };
}

export function toApiFunctionHttpResult(res: Response, result: any) {
    if (result instanceof ApiFunctionResponse) {
        res.status(result.status);
        return res.send(result.getData());
    }

    return res.send(result);
}

export function toApiFunctionPayload(result: any) {
    return result instanceof ApiFunctionResponse ? result.getData() : result;
}

export function createApiFrameworkRequest(req: IncomingMessage) {
    const parsedUrl = new URL(req.url || "/", "http://webframez.local");
    const request = new Request();
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

export function assertUniqueApiFunctionKeys(scope: ApiScope, functions: ApiFunctionClass[]) {
    const seen: { [key: string]: boolean } = {};
    for (const FunctionClass of functions) {
        const func = new FunctionClass() as ApiFunction;
        if (!func.key || func.key.trim() === "") {
            throw new Error(`ApiFunction in scope "${scope.key}" is missing a key`);
        }
        if (seen[func.key]) {
            throw new Error(`Duplicate ApiFunction key "${func.key}" in scope "${scope.key}"`);
        }
        seen[func.key] = true;
    }
}

export function instantiateApiScope(ScopeClass: ApiScopeClass) {
    return new ScopeClass() as ApiScope;
}

export function instantiateApiFunction(FunctionClass: ApiFunctionClass) {
    return new FunctionClass() as ApiFunction;
}
