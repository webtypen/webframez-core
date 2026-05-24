import { Request } from "../Router/Request";
import { Response } from "../Router/Response";
import { ApiScopeClass, ApiScopeMiddlewareAbort } from "./ApiTypes";
export declare class ApiScopesGroup {
    key: string;
    apiScopes: Array<ApiScopeClass> | (() => Array<ApiScopeClass>);
    middleware(_req: Request, _res: Response, _abort: ApiScopeMiddlewareAbort): Promise<{
        [key: string]: any;
    }>;
}
