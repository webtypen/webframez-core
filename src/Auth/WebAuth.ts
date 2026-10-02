import type { Request } from "../Router/Request";
import type { Response } from "../Router/Response";
import { SessionAuth, AuthSession, SessionTokenPair } from "./SessionAuth";
import { authCookie, authHeader, authUrl, equalAuthToken, randomAuthToken } from "./AuthSecurity";

export class WebAuthError extends Error {
    constructor(public readonly status: 401 | 403, message: string) { super(message); this.name = "WebAuthError"; }
}

export type WebAuthOptions = {
    origin: string;
    /** Only permits http://localhost / loopback; never disables Secure for a remote host. */
    allowInsecureLocalhost?: boolean;
    cookiePrefix?: string;
};

/** Host-only cookies: no Domain override. Separate origins must use SSO, not shared cookies. */
export class AuthCookies {
    readonly origin: string;
    readonly prefix: string;
    private readonly secure: boolean;

    constructor(options: WebAuthOptions) {
        const url = authUrl(options.origin, options.allowInsecureLocalhost);
        if (url.pathname !== "/" || url.search) throw new Error("WebAuth origin must not contain a path or query.");
        this.origin = url.origin;
        this.secure = url.protocol === "https:";
        this.prefix = options.cookiePrefix || (this.secure ? "__Host-wf_" : "wf_dev_");
        if (!/^[A-Za-z0-9_-]+$/.test(this.prefix) || (this.secure && !this.prefix.startsWith("__Host-")) || (!this.secure && this.prefix.startsWith("__Host-"))) throw new Error("Invalid auth cookie prefix.");
    }

    read(req: Request, name: string) { return authCookie(req, this.prefix + name); }

    write(res: Response, name: string, value: string, seconds: number, httpOnly = true) {
        if (!/^[a-z_]+$/.test(name)) throw new Error("Invalid auth cookie name.");
        const cookie = `${this.prefix}${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${Math.max(0, Math.floor(seconds))}; SameSite=Lax${this.secure ? "; Secure" : ""}${httpOnly ? "; HttpOnly" : ""}`;
        const existingKey = Object.keys(res.headers).find(key => key.toLowerCase() === "set-cookie");
        const previous = res.res?.getHeader("Set-Cookie") ?? (existingKey ? res.headers[existingKey] : undefined);
        const cookies = [...(Array.isArray(previous) ? previous.map(String) : previous ? [String(previous)] : []), cookie];
        if (existingKey && existingKey !== "Set-Cookie") delete res.headers[existingKey];
        res.headers["Set-Cookie"] = cookies;
        res.res?.setHeader("Set-Cookie", cookies);
        res.header("Cache-Control", "no-store");
    }

    /** Check the configured origin, never Host or forwarded headers supplied by the request. */
    assertOrigin(req: Request) {
        const origin = authHeader(req, "origin"), site = authHeader(req, "sec-fetch-site");
        if (site === "cross-site" || site === "same-site" || (origin ? origin !== this.origin : site !== "same-origin")) {
            throw new WebAuthError(403, "Invalid request origin.");
        }
    }
}

/** Browser adapter. Unsafe requests require both same-origin evidence and a session-bound CSRF token. */
export class WebAuth {
    readonly cookies: AuthCookies;

    constructor(readonly sessions: SessionAuth, options: WebAuthOptions) { this.cookies = new AuthCookies(options); }

    private csrf(req: Request) {
        this.cookies.assertOrigin(req);
        const cookie = this.cookies.read(req, "csrf");
        const submitted = authHeader(req, "x-csrf-token") || (typeof req.body?._csrf === "string" ? req.body._csrf : "");
        if (!/^[A-Za-z0-9_-]{43}$/.test(cookie) || !equalAuthToken(cookie, submitted)) throw new WebAuthError(403, "Invalid CSRF token.");
        return cookie;
    }

    private post(req: Request) { if (req.method !== "POST") throw new WebAuthError(403, "This auth operation requires POST."); }

    /** GET /auth/csrf, fetched from this origin. Also protects login before a user session exists. */
    bootstrap(req: Request, res: Response): string {
        this.cookies.assertOrigin(req);
        const current = this.cookies.read(req, "csrf");
        const token = /^[A-Za-z0-9_-]{43}$/.test(current) ? current : randomAuthToken();
        if (token !== current) this.cookies.write(res, "csrf", token, 3600, false);
        res.header("Cache-Control", "no-store");
        return token;
    }

    private writePair(res: Response, pair: SessionTokenPair) {
        this.cookies.write(res, "access", pair.auth_token, (pair.auth_expires_at - Date.now()) / 1000);
        this.cookies.write(res, "refresh", pair.refresh_token, (pair.refresh_expires_at - Date.now()) / 1000);
    }

    /** GET/HEAD only. A current refresh secret and matching session-bound CSRF cookie are required. */
    async resume(req: Request, res: Response): Promise<AuthSession | null> {
        if (!["GET", "HEAD"].includes(req.method)) return null;
        const token = this.cookies.read(req, "refresh"), csrf = this.cookies.read(req, "csrf");
        if (!await this.sessions.verifyCsrf(token, csrf, "refresh")) return null;
        const pair = await this.sessions.renewAccess(token);
        if (!pair) return this.sessions.inspectRefresh(token);
        this.writePair(res, pair);
        const name = this.cookies.prefix + "access";
        const cookies = authHeader(req, "cookie").split(";").map(value => value.trim()).filter(value => value && !value.startsWith(`${name}=`));
        req.headers = { ...req.headers, cookie: [...cookies, `${name}=${encodeURIComponent(pair.auth_token)}`].join("; ") };
        return pair.session;
    }

    /** Credential verification is supplied by the app, after CSRF checks. Never accepts a user ID from the browser. */
    async login(req: Request, res: Response, verifyCredentials: () => Promise<string | null>): Promise<AuthSession> {
        this.post(req); this.csrf(req);
        const subject = await verifyCredentials();
        if (!subject) throw new WebAuthError(401, "Invalid credentials.");
        return this.establishSession(subject, res);
    }

    /** Trusted-server entry point after a validated SSO callback (not a public login endpoint). */
    async establishSession(subject: string, res: Response, parent: AuthSession["parent"] = null): Promise<AuthSession> {
        const created = await this.sessions.create(subject, parent);
        this.writePair(res, created);
        this.cookies.write(res, "csrf", created.csrf_token, (created.refresh_expires_at - Date.now()) / 1000, false);
        return created.session;
    }

    async authenticate(req: Request): Promise<AuthSession | null> {
        const token = this.cookies.read(req, "access");
        if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
            const csrf = this.csrf(req);
            if (!await this.sessions.verifyCsrf(token, csrf)) throw new WebAuthError(403, "Invalid session CSRF token.");
        }
        return this.sessions.authenticate(token);
    }

    async refresh(req: Request, res: Response): Promise<AuthSession> {
        this.post(req); const csrf = this.csrf(req), token = this.cookies.read(req, "refresh");
        if (!await this.sessions.verifyCsrf(token, csrf, "refresh")) throw new WebAuthError(403, "Invalid session CSRF token.");
        const pair = await this.sessions.refresh(token);
        if (!pair) throw new WebAuthError(401, "Session expired or refresh token reused.");
        this.writePair(res, pair);
        return pair.session;
    }

    protected async logoutSession(req: Request): Promise<AuthSession> {
        this.post(req); const csrf = this.csrf(req), token = this.cookies.read(req, "refresh");
        if (!await this.sessions.verifyCsrf(token, csrf, "refresh")) throw new WebAuthError(403, "Invalid session CSRF token.");
        const session = await this.sessions.inspect(token.split(".")[0]);
        if (!session) throw new WebAuthError(401, "Invalid session.");
        return session;
    }

    protected async finishLogout(session: AuthSession, res: Response): Promise<void> {
        await this.sessions.revoke(session.id);
        for (const key of ["access", "refresh", "csrf"]) this.cookies.write(res, key, "", 0, key !== "csrf");
    }

    async logout(req: Request, res: Response): Promise<void> {
        await this.finishLogout(await this.logoutSession(req), res);
    }
}
