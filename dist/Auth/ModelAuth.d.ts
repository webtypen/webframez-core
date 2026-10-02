import { Model } from "../Database/Model";
import { Request } from "../Router/Request";
import type { Response } from "../Router/Response";
import { AuthSession, SessionAuthOptions } from "./SessionAuth";
import { WebAuth, WebAuthError, WebAuthOptions } from "./WebAuth";
export type AuthContext<TUser extends Model = Model> = {
    user: TUser;
    session: AuthSession;
};
export type AuthSnapshot<TUser = Record<string, unknown>> = {
    user: TUser;
    session: AuthSession;
};
export type AuthErrorCode = "missing_login" | "invalid_login" | "inactive_user" | "invalid_origin" | "invalid_csrf" | "unauthorized" | "server_error" | "login_blocked" | "logout_blocked";
export declare class AuthLoginError extends WebAuthError {
    readonly code: AuthErrorCode;
    constructor(code: AuthErrorCode, status: 401 | 403, message: string);
}
export type ModelAuthOptions = Partial<WebAuthOptions> & {
    model: typeof Model;
    key?: string;
    /** Takes precedence over session.audience; defaults to the configured origin. */
    audience?: string;
    locale?: "en" | "de";
    /** Record browser metadata and update activity at most once per minute. */
    trackActivity?: boolean;
    fields?: {
        identifier?: string;
        password?: string;
        active?: string | false;
        primaryKey?: string;
    };
    session?: Partial<Omit<SessionAuthOptions, "issuer" | "isSessionAllowed">>;
    csrfDisabled?: false;
    verifyPassword?: (password: string, storedHash: string) => boolean | Promise<boolean>;
    isUserAllowed?: (user: Model) => boolean | Promise<boolean>;
    beforeLogin?: AuthActionHook;
    afterLogin?: AuthActionHook;
    beforeLogout?: AuthActionHook;
    afterLogout?: AuthActionHook;
    onLogin?: (session: AuthSession, req: Request) => void | Promise<void>;
    publicUserFields?: readonly string[];
    onAuthenticate?: (auth: AuthContext, req: Request) => void | Promise<void>;
    messages?: Partial<Record<AuthErrorCode, string>>;
};
export type AuthActionHook = (req: Request, user: Model, scope: AuthScope) => void | Promise<void>;
export type AuthOperation = "csrf" | "login" | "logout" | "refresh";
export type AuthRouteOptions = Partial<ModelAuthOptions> & {
    auth?: string;
    loginPath?: string;
    loginResponse?: (req: Request, session: AuthSession) => object | Promise<object>;
    middleware?: string[];
    domains?: string[];
};
/** Model-backed browser authentication with secure default routes and revocable sessions. */
export declare class AuthScope extends WebAuth {
    private readonly modelOptions;
    readonly key: string;
    private readonly model;
    private readonly sessionUsers;
    private readonly fields;
    constructor(modelOptions: ModelAuthOptions);
    get configuration(): ModelAuthOptions;
    private message;
    /** Use this when creating users; existing bcrypt hashes are supported without migration. */
    static hashPassword(password: string): Promise<string>;
    verifyCredentials(req: Request): Promise<string>;
    login(req: Request, res: Response, verifyCredentials?: () => Promise<string | null>): Promise<AuthSession>;
    logout(req: Request, res: Response): Promise<void>;
    /** Resolve a fresh validated session and its model; never trusts a client-supplied req.auth. */
    resolve<TUser extends Model = Model>(req: Request): Promise<AuthContext<TUser> | null>;
    resolveCookies<TUser extends Model = Model>(cookies: Record<string, string | undefined>): Promise<AuthContext<TUser> | null>;
    /** Only explicit public fields are sent to browsers; Model instances remain on the server. */
    snapshot(auth: AuthContext | null | undefined): AuthSnapshot | null;
    /** Optional auth for public routes, or required auth for protected controllers. */
    middleware(options?: {
        required?: boolean;
    }): (next: Function, reject: Function, req: Request, res: Response) => Promise<any>;
    handle(operation: AuthOperation, req: Request, res: Response, loginResponse?: AuthRouteOptions["loginResponse"]): Promise<Response>;
}
/** Compatibility name for existing integrations. Prefer Auth.scope(). */
export { AuthScope as ModelAuth };
export type AuthScopeOptions = ModelAuthOptions;
