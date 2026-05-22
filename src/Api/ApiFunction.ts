import {
    ApiFunctionParamsDefinition,
    ApiFunctionRequest,
    ApiFunctionRequestMethod,
    ApiFunctionResponseType,
} from "./ApiTypes";

export class ApiFunctionResponse {
    data: { [key: string]: any } = {};
    status: number = 200;
    responseType: ApiFunctionResponseType = "response";

    getData() {
        return this.data;
    }

    constructor(data: { [key: string]: any }, options?: { status?: number; responseType?: ApiFunctionResponseType }) {
        this.data = data;
        this.status = options?.status ?? 200;
        this.responseType = options?.responseType ?? "response";
    }
}

export class ApiFunction {
    key: string = "unnamed-function";
    description: string = "A unnamed example function";
    requestMethod: ApiFunctionRequestMethod = "POST";
    mcpDisabled = false;

    params: ApiFunctionParamsDefinition = {
        elementId: { type: "ObjectId", required: true },
        mode: { type: "option", options: [{ value: "all" }, { value: "pending" }], default: "all" },
    };

    async handle(apiRequest: ApiFunctionRequest): Promise<ApiFunctionResponse | { [key: string]: any }> {
        return new ApiFunctionResponse({ status: "Api is running ..." });
    }
}
