import { ApiFunctionParamsDefinition, ApiFunctionRequest, ApiFunctionRequestMethod, ApiFunctionResponseType } from "./ApiTypes";
export declare class ApiFunctionResponse {
    data: {
        [key: string]: any;
    };
    status: number;
    responseType: ApiFunctionResponseType;
    getData(): {
        [key: string]: any;
    };
    constructor(data: {
        [key: string]: any;
    }, options?: {
        status?: number;
        responseType?: ApiFunctionResponseType;
    });
}
export declare class ApiFunction {
    key: string;
    description: string;
    requestMethod: ApiFunctionRequestMethod;
    mcpDisabled: boolean;
    params: ApiFunctionParamsDefinition;
    handle(apiRequest: ApiFunctionRequest): Promise<ApiFunctionResponse | {
        [key: string]: any;
    }>;
}
