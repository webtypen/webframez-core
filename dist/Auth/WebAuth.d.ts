import type { Request } from "../Router/Request";
import type { Response } from "../Router/Response";
import { SessionAuth, AuthSession } from "./SessionAuth";
export declare class WebAuthError extends Error {
    readonly status: 401 | 403;
    constructor(status: 401 | 403, message: string);
}
export type WebAuthOptions = {
    origin: string;
    /** Only permits http://localhost / loopback; never disables Secure for a remote host. */
    allowInsecureLocalhost?: boolean;
    cookiePrefix?: string;
};
/** Host-only cookies: no Domain override. Separate origins must use SSO, not shared cookies. */
export declare class AuthCookies {
    readonly origin: string;
    readonly prefix: string;
    private readonly secure;
    constructor(options: WebAuthOptions);
    read(req: Request, name: string): string;
    write(res: Response, name: string, value: string, seconds: number, httpOnly?: boolean): void;
    /** Check the configured origin, never Host or forwarded headers supplied by the request. */
    assertOrigin(req: Request): void;
}
/** Browser adapter. Unsafe requests require both same-origin evidence and a session-bound CSRF token. */
export declare class WebAuth {
    readonly sessions: SessionAuth;
    readonly cookies: AuthCookies;
    constructor(sessions: SessionAuth, options: WebAuthOptions);
    private csrf;
    private post;
    /** GET /auth/csrf, fetched from this origin. Also protects login before a user session exists. */
    bootstrap(req: Request, res: Response): string;
    private writePair;
    /** Credential verification is supplied by the app, after CSRF checks. Never accepts a user ID from the browser. */
    login(req: Request, res: Response, verifyCredentials: () => Promise<string | null>): Promise<AuthSession>;
    /** Trusted-server entry point after a validated SSO callback (not a public login endpoint). */
    establishSession(subject: string, res: Response, parent?: AuthSession["parent"]): Promise<AuthSession>;
    authenticate(req: Request): Promise<AuthSession | null>;
    refresh(req: Request, res: Response): Promise<AuthSession>;
    protected logoutSession(req: Request): Promise<AuthSession>;
    protected finishLogout(session: AuthSession, res: Response): Promise<void>;
    logout(req: Request, res: Response): Promise<void>;
}
