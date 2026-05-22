/// <reference types="node" />
import { IncomingMessage } from "http";
import { Request } from "../Router/Request";
import { Response } from "../Router/Response";
import { ApiFunction } from "./ApiFunction";
import { ApiScope } from "./ApiScope";
import { ApiFunctionClass, ApiFunctionParamDefinition, ApiFunctionParamsDefinition, ApiScopeClass } from "./ApiTypes";
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
export declare function runApiScopeMiddleware(scope: ApiScope, req: Request, res: Response): Promise<{
    [key: string]: any;
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
    enum?: undefined;
} | {
    type: string;
    pattern: string;
    items?: undefined;
    enum?: undefined;
} | {
    type: string;
    items: {};
    pattern?: undefined;
    enum?: undefined;
} | {
    enum: any[];
    type?: undefined;
    pattern?: undefined;
    items?: undefined;
};
export declare function toApiFunctionHttpResult(res: Response, result: any): Response;
export declare function toApiFunctionPayload(result: any): any;
export declare function createApiFrameworkRequest(req: IncomingMessage): Request;
export declare function assertUniqueApiFunctionKeys(scope: ApiScope, functions: ApiFunctionClass[]): void;
export declare function instantiateApiScope(ScopeClass: ApiScopeClass): ApiScope;
export declare function instantiateApiFunction(FunctionClass: ApiFunctionClass): ApiFunction;
