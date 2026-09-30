import { Request } from "../Router/Request";
import { Response } from "../Router/Response";
import { ApiFunctionClass, ApiScopeMiddlewareAbort } from "./ApiTypes";

export class ApiScope {
    key: string = "unique_scope_key";
    apiBasePath: string | null = "/api";
    mcpEndpoint: string | null = null;

    /** Kernel middleware for HTTP routes, including automatic OPTIONS responses. */
    routeMiddleware: string[] = [];

    functions: Array<ApiFunctionClass> | (() => Array<ApiFunctionClass>) = [];

    async middleware(_req: Request, _res: Response, _abort: ApiScopeMiddlewareAbort): Promise<{ [key: string]: any }> {
        return {};
    }

    async groupMiddleware(_req: Request, _res: Response, _abort: ApiScopeMiddlewareAbort): Promise<{ [key: string]: any }> {
        return {};
    }
}
