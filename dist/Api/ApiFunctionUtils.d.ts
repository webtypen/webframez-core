/// <reference types="node" />
import { IncomingMessage } from "http";
import { Request } from "../Router/Request";
import { Response } from "../Router/Response";
import { ApiFunction } from "./ApiFunction";
import { ApiScope } from "./ApiScope";
import { ApiScopesGroup } from "./ApiScopesGroup";
import { ApiFunctionClass, ApiFunctionParamDefinition, ApiFunctionParamsDefinition, ApiScopeClass, ApiScopeRegistrationClass, ApiScopesGroupClass } from "./ApiTypes";
export type ApiScopeRegistrationEntry = {
    scopeClass: ApiScopeClass;
    groupClass?: ApiScopesGroupClass;
};
export declare class ApiFunctionRuntimeError extends Error {
    statusCode: number;
    constructor(message: string, statusCode?: number);
}
export declare function normalizeApiPath(value: string): string;
export declare function joinApiPath(...parts: Array<string | null | undefined>): string;
export declare function getApiErrorMessage(error: any): any;
export declare function isPlainApiObject(value: any): boolean;
export declare function normalizeApiFunctionProvider(provider: any): ApiFunctionClass[];
export declare function getApiFunctionClasses(scope: ApiScope): ApiFunctionClass[];
export declare function normalizeApiScopesGroupProvider(provider: any): ApiScopeClass[];
export declare function isApiScopesGroupInstance(value: any): value is ApiScopesGroup;
export declare function instantiateApiScopesGroup(GroupClass: ApiScopesGroupClass): ApiScopesGroup;
export declare function collectApiScopeRegistrations(registrations: ApiScopeRegistrationClass[]): ApiScopeRegistrationEntry[];
export declare function runApiScopeMiddleware(scope: ApiScope, req: Request, res: Response): Promise<{
    [key: string]: any;
}>;
export declare function runApiScopesGroupMiddleware(group: ApiScopesGroup, req: Request, res: Response): Promise<{
    [key: string]: any;
}>;
export declare function runApiScopeGroupMiddleware(scope: ApiScope, req: Request, res: Response): Promise<{
    [key: string]: any;
}>;
export declare function runApiScopeRegistrationMiddleware(registration: ApiScopeRegistrationEntry, req: Request, res: Response): Promise<{
    [x: string]: any;
}>;
export declare function validateApiFunctionParams(definitions: ApiFunctionParamsDefinition, source: {
    [key: string]: any;
}): {
    [key: string]: any;
};
export declare function coerceApiFunctionParam(key: string, value: any, definition: ApiFunctionParamDefinition): any;
export declare function apiFunctionParamsToJsonSchema(definitions: ApiFunctionParamsDefinition): {
    type: string;
    properties: {
        [key: string]: any;
    };
    required: string[];
    additionalProperties: boolean;
};
export declare function apiFunctionParamToJsonSchema(definition: ApiFunctionParamDefinition): {
    type: string;
    pattern?: undefined;
    items?: undefined;
    additionalProperties?: undefined;
    properties?: undefined;
    "x-webframez-type"?: undefined;
    enum?: undefined;
} | {
    type: string;
    pattern: string;
    items?: undefined;
    additionalProperties?: undefined;
    properties?: undefined;
    "x-webframez-type"?: undefined;
    enum?: undefined;
} | {
    type: string;
    items: {};
    pattern?: undefined;
    additionalProperties?: undefined;
    properties?: undefined;
    "x-webframez-type"?: undefined;
    enum?: undefined;
} | {
    type: string;
    additionalProperties: boolean;
    properties: {
        download_url: {
            type: string;
        };
        file_id: {
            type: string;
        };
        mime_type: {
            type: string;
        };
        file_name: {
            type: string;
        };
        url: {
            type: string;
        };
        download_link: {
            type: string;
        };
        file_url: {
            type: string;
        };
        content_base64: {
            type: string;
        };
        data_url: {
            type: string;
        };
        id: {
            type: string;
        };
        filename: {
            type: string;
        };
        name: {
            type: string;
        };
        mime: {
            type: string;
        };
    };
    "x-webframez-type": string;
    pattern?: undefined;
    items?: undefined;
    enum?: undefined;
} | {
    enum: any[];
    type?: undefined;
    pattern?: undefined;
    items?: undefined;
    additionalProperties?: undefined;
    properties?: undefined;
    "x-webframez-type"?: undefined;
};
export declare function toApiFunctionHttpResult(res: Response, result: any): Response;
export declare function toApiFunctionPayload(result: any): any;
export declare function createApiFrameworkRequest(req: IncomingMessage): Request;
export declare function assertUniqueApiFunctionKeys(scope: ApiScope, functions: ApiFunctionClass[]): void;
export declare function instantiateApiScope(ScopeClass: ApiScopeClass): ApiScope;
export declare function instantiateApiFunction(FunctionClass: ApiFunctionClass): ApiFunction;
