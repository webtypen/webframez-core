import { Request } from "../Router/Request";
import { Response } from "../Router/Response";

export type ApiFunctionRequestMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | null;

export type ApiFunctionResponseType = "response" | "confirm" | "ask";

export type ApiScopeFunctionContext = { [key: string]: any };

export type ApiFunctionParamOption = {
    value: any;
    label?: string;
};

export type ApiFunctionParamDefinition = {
    type?: string;
    required?: boolean;
    default?: any;
    options?: ApiFunctionParamOption[];
    description?: string;
    label?: string;
};

export type ApiFunctionParamsDefinition = {
    [key: string]: ApiFunctionParamDefinition;
};

export type ApiFunctionClass = new (...args: any[]) => any;
export type ApiScopeClass = new (...args: any[]) => any;

export type ApiScopeMiddlewareAbort = (message?: any, status?: number) => never;

export type ApiFunctionRequest = {
    context: ApiScopeFunctionContext;
    params: { [key: string]: any };
    request?: Request;
    response?: Response;
};
