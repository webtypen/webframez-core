import type { Request } from "../Router/Request";
import type { Response } from "../Router/Response";
import { AuthScope, AuthScopeOptions, AuthOperation, AuthRouteOptions } from "./ModelAuth";
export type AuthConfig = {
    /** Disable automatic main creation; explicitly configured scopes remain available. */
    main?: boolean;
    defaults?: Partial<AuthScopeOptions>;
    scopes?: Record<string, AuthScopeOptions>;
};
/** Application-wide registry of named browser-authentication scopes. */
export declare class AuthFacade {
    private readonly scopes;
    private initialized;
    init(): void;
    scope(key?: string): AuthScope;
    registerScope(key: string, config: Partial<AuthScopeOptions>): AuthScope;
}
export declare const Auth: AuthFacade;
export declare function authRoute(operation: AuthOperation, options: AuthRouteOptions): (req: Request, res: Response) => Promise<Response>;
