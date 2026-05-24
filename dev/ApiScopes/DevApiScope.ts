import { ApiFunction, ApiFunctionResponse, ApiScope, ApiScopesGroup, Request, Response } from "../../src";
import { ApiFunctionRequest } from "../../src/Api/ApiTypes";

class DevGetFunction extends ApiFunction {
    key = "dev-get";
    description = "Returns validated GET params and middleware context.";
    requestMethod = "GET" as const;
    params = {
        name: { type: "string", required: true },
        count: { type: "integer", default: 1 },
    };

    async handle(apiRequest: ApiFunctionRequest) {
        return new ApiFunctionResponse({
            params: apiRequest.params,
            context: apiRequest.context,
        });
    }
}

class DevPostFunction extends ApiFunction {
    key = "dev-post";
    description = "Returns validated POST body params and middleware context.";
    requestMethod = "POST" as const;
    params = {
        enabled: { type: "boolean", required: true },
        mode: { type: "option", options: [{ value: "all" }, { value: "pending" }], default: "all" },
    };

    async handle(apiRequest: ApiFunctionRequest) {
        return {
            params: apiRequest.params,
            context: apiRequest.context,
        };
    }
}

class DevMcpOnlyFunction extends ApiFunction {
    key = "dev-mcp-only";
    description = "Available as MCP tool but not as normal HTTP route.";
    requestMethod = null;
    params = {
        text: { type: "string", required: true },
    };

    async handle(apiRequest: ApiFunctionRequest) {
        return {
            text: apiRequest.params.text,
            context: apiRequest.context,
        };
    }
}

class DevThrowFunction extends ApiFunction {
    key = "dev-throw";
    description = "Throws an exception to test 500 responses.";
    requestMethod = "POST" as const;
    params = {};

    async handle(_apiRequest: ApiFunctionRequest): Promise<{ [key: string]: any }> {
        throw new Error("Dev function failed");
    }
}

export class DevApiScope extends ApiScope {
    key = "dev-api-scope";
    apiBasePath = "/api/dev";
    mcpEndpoint = "/mcp/dev";
    functions = [DevGetFunction, DevPostFunction, DevMcpOnlyFunction, DevThrowFunction];

    async middleware(req: Request, _res: Response, abort: (message?: any, status?: number) => never) {
        if (req.query && req.query.abort) {
            return abort("Dev scope aborted", parseInt(req.query.abort, 10) || 403);
        }

        if (req.query && req.query.throwMiddleware) {
            throw new Error("Dev middleware failed");
        }

        return {
            scope: this.key,
            fromMiddleware: true,
        };
    }
}

class DevGroupedGetFunction extends ApiFunction {
    key = "dev-grouped-get";
    description = "Returns grouped middleware context.";
    requestMethod = "GET" as const;
    params = {};

    async handle(apiRequest: ApiFunctionRequest) {
        return {
            context: apiRequest.context,
        };
    }
}

class DevGroupedApiScope extends ApiScope {
    key = "dev-grouped-api-scope";
    apiBasePath = "/api/dev-grouped";
    functions = [DevGroupedGetFunction];

    async middleware(_req: Request, _res: Response, _abort: (message?: any, status?: number) => never) {
        return {
            source: "scope",
            fromScopeMiddleware: true,
        };
    }

    async groupMiddleware(_req: Request, _res: Response, _abort: (message?: any, status?: number) => never) {
        return {
            source: "scope-group",
            fromScopeGroupMiddleware: true,
        };
    }
}

export class DevApiScopesGroup extends ApiScopesGroup {
    key = "dev-api-scopes-group";
    apiScopes = [DevGroupedApiScope];

    async middleware(_req: Request, _res: Response, _abort: (message?: any, status?: number) => never) {
        return {
            source: "group",
            fromGroupMiddleware: true,
        };
    }
}
