import { Request } from "../Router/Request";
import { Response } from "../Router/Response";
import { ApiScopeClass, ApiScopeMiddlewareAbort } from "./ApiTypes";

export class ApiScopesGroup {
    key: string = "unique_api_scopes_group_key";

    apiScopes: Array<ApiScopeClass> | (() => Array<ApiScopeClass>) = [];

    async middleware(_req: Request, _res: Response, _abort: ApiScopeMiddlewareAbort): Promise<{ [key: string]: any }> {
        return {};
    }
}
