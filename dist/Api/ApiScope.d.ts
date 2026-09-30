import { Request } from "../Router/Request";
import { Response } from "../Router/Response";
import { ApiFunctionClass, ApiScopeMiddlewareAbort } from "./ApiTypes";
export declare class ApiScope {
    key: string;
    apiBasePath: string | null;
    mcpEndpoint: string | null;
    /** Kernel middleware for HTTP routes, including automatic OPTIONS responses. */
    routeMiddleware: string[];
    functions: Array<ApiFunctionClass> | (() => Array<ApiFunctionClass>);
    middleware(_req: Request, _res: Response, _abort: ApiScopeMiddlewareAbort): Promise<{
        [key: string]: any;
    }>;
    groupMiddleware(_req: Request, _res: Response, _abort: ApiScopeMiddlewareAbort): Promise<{
        [key: string]: any;
    }>;
}
