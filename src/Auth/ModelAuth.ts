import { compare, hash } from "bcryptjs";
import { appPath } from "../routing";
import { Config } from "../Config";
import { Model } from "../Database/Model";
import { Request } from "../Router/Request";
import type { Response } from "../Router/Response";
import { Auth } from "./Auth";
import { PasswordReset, PasswordResetOptions } from "./PasswordReset";
import { authHeader } from "./AuthSecurity";
import { SessionAuth, AuthSession, SessionAuthOptions } from "./SessionAuth";
import { WebAuth, WebAuthError, WebAuthOptions } from "./WebAuth";

export type AuthContext<TUser extends Model = Model> = { user: TUser; session: AuthSession };

export type AuthSnapshot<TUser = Record<string, unknown>> = { user: TUser; session: AuthSession };

export type AuthErrorCode = "missing_login" | "invalid_login" | "inactive_user" | "invalid_origin" | "invalid_csrf" | "unauthorized" | "server_error" | "login_blocked" | "logout_blocked";

export class AuthLoginError extends WebAuthError {
    constructor(public readonly code: AuthErrorCode, status: 401 | 403, message: string) {
        super(status, message);
    }
}

export type ModelAuthOptions = Partial<WebAuthOptions> & {
    model: typeof Model;
    key?: string;
    /** Takes precedence over session.audience; defaults to the configured origin. */
    audience?: string;
    locale?: "en" | "de";
    /** Record browser metadata and update activity at most once per minute. */
    trackActivity?: boolean;
    passwordReset?: PasswordResetOptions | false;
    fields?: { identifier?: string; password?: string; active?: string | false; primaryKey?: string };
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

class AuthHookError extends AuthLoginError {
    constructor(code: "login_blocked" | "logout_blocked", error: unknown) {
        super(code, error instanceof WebAuthError ? error.status : 403,
            error instanceof Error ? error.message : typeof error === "string" ? error : "Authentication action was blocked.");
    }
}

export type AuthOperation = "csrf" | "login" | "logout" | "refresh";

export type AuthRouteOptions = Partial<ModelAuthOptions> & {
    auth?: string;
    loginPath?: string;
    loginResponse?: (req: Request, session: AuthSession) => object | Promise<object>;
    middleware?: string[];
    domains?: string[];
};

const defaultMessages: Record<"en" | "de", Record<AuthErrorCode, string>> = {
    en: {
        missing_login: "Please provide your login and password.",
        invalid_login: "Invalid login or password.",
        inactive_user: "This account is inactive.",
        invalid_origin: "The login address does not match the configured website URL.",
        invalid_csrf: "Please reload the page and try logging in again.",
        unauthorized: "Please log in.",
        server_error: "Authentication could not be processed.",
        login_blocked: "Login was blocked.",
        logout_blocked: "Logout was blocked.",
    },
    de: {
        missing_login: "Bitte gib E-Mail-Adresse und Passwort an.",
        invalid_login: "Es wurde kein Benutzer mit dieser E-Mail-/Passwort-Kombination gefunden.",
        inactive_user: "Bitte aktiviere deinen Account über die E-Mail, die wir dir geschickt haben.",
        invalid_origin: "Die Login-Adresse stimmt nicht mit der konfigurierten Website-URL überein.",
        invalid_csrf: "Der Login konnte gerade nicht verarbeitet werden. Bitte lade die Seite neu.",
        unauthorized: "Bitte melde dich an.",
        server_error: "Die Anmeldung konnte gerade nicht verarbeitet werden.",
        login_blocked: "Die Anmeldung wurde abgelehnt.",
        logout_blocked: "Die Abmeldung wurde abgelehnt.",
    },
};

// Verify a dummy password hash for unknown accounts as well.
let dummyHash: Promise<string> | undefined;

/** Model-backed browser authentication with secure default routes and revocable sessions. */
export class AuthScope extends WebAuth {
    readonly key: string;
    readonly passwordReset: PasswordReset | null;
    private readonly model: typeof Model;
    private authPaths = { basePath: "/api/auth", loginPath: "/api/auth/login" };
    private readonly sessionUsers: WeakMap<AuthSession, Model>;
    private readonly fields: { identifier: string; password: string; active: string | false; primaryKey: string };

    constructor(private readonly modelOptions: ModelAuthOptions) {
        if (modelOptions.csrfDisabled) throw new Error("Browser auth routes require CSRF protection.");
        if (!modelOptions.model) throw new Error("Route.auth requires a Model class.");
        const origin = new URL(modelOptions.origin || Config.get("auth.origin") || Config.get("website.baseUrl") || Config.get("application.website.baseUrl") || process.env.WEBSITE_URL || process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3035}`).origin;
        const key = modelOptions.key ?? "main";
        if (!/^[A-Za-z0-9_-]+$/.test(key)) throw new Error("Invalid auth scope key.");
        const model = modelOptions.model;
        const fields = { identifier: "email", password: "password", active: "is_active" as string | false,
            primaryKey: new model().__primaryKey || "_id", ...modelOptions.fields };
        const allowed = async (user: Model | null) => Boolean(user && (fields.active === false || (user as any)[fields.active] !== false)
            && (!modelOptions.isUserAllowed || await modelOptions.isUserAllowed(user)));
        const sessionUsers = new WeakMap<AuthSession, Model>();
        const sessions = new SessionAuth({ accessTokenSeconds: 15 * 60, sessionSeconds: 30 * 86400, idleTimeoutSeconds: 7 * 86400,
            ...modelOptions.session, issuer: origin, scope: key,
            audience: modelOptions.audience ?? modelOptions.session?.audience ?? origin,
            connection: modelOptions.session?.connection || new model().__connection,
            isSessionAllowed: async session => {
                const id = fields.primaryKey === "_id" ? await model.objectId(session.subject, { noExceptions: true }) : session.subject;
                const user = id !== null && id !== undefined ? await model.where(fields.primaryKey, "=", id).first() : null;
                if (!await allowed(user)) return false;
                sessionUsers.set(session, user!);
                return true;
            } });
        super(sessions, { ...modelOptions, origin,
            cookiePrefix: modelOptions.cookiePrefix ?? (key === "main" ? undefined : `${origin.startsWith("https:") ? "__Host-wf_" : "wf_dev_"}${key}_`),
            allowInsecureLocalhost: modelOptions.allowInsecureLocalhost ?? true });
        this.key = key;
        this.sessionUsers = sessionUsers;
        this.model = model;
        this.fields = fields;
        this.passwordReset = modelOptions.passwordReset === false ? null : new PasswordReset(model, key, fields,
            modelOptions.passwordReset || {}, async user => allowed(user), async (user, mode) => {
                const subject = String((user as any)[fields.primaryKey]);
                await this.sessions.revokeAll(subject);
                if (mode === "all") await Auth.revokeUserSessions(model, subject);
            }, modelOptions.session?.database);
    }

    configureRoutes(basePath: string, loginPath?: string): void {
        this.authPaths = { basePath, loginPath: loginPath || `${basePath}/login` };
    }

    get browserConfiguration() {
        return { basePath: appPath(this.authPaths.basePath), loginPaths: [appPath(this.authPaths.loginPath)], cookieName: this.cookies.prefix + "csrf" };
    }

    get configuration(): ModelAuthOptions {
        return this.modelOptions;
    }

    private message(code: AuthErrorCode): string {
        return this.modelOptions.messages?.[code] ?? defaultMessages[this.modelOptions.locale || "en"][code];
    }

    /** Use this when creating users; existing bcrypt hashes are supported without migration. */
    static hashPassword(password: string): Promise<string> {
        return hash(password, 12);
    }

    async verifyCredentials(req: Request): Promise<string> {
        const identifier = req.body?.[this.fields.identifier], password = req.body?.password;
        if (typeof identifier !== "string" || !identifier.trim() || identifier.length > 320
            || typeof password !== "string" || !password || password.length > 1024) {
            throw new AuthLoginError("missing_login", 401, this.message("missing_login"));
        }
        const user = await this.model.where(this.fields.identifier, "=", identifier.trim().toLowerCase()).first();
        const stored = user?.[this.fields.password];
        const verify = this.modelOptions.verifyPassword || compare;
        const valid = await verify(password, typeof stored === "string" ? stored : await (dummyHash ||= hash("webframez-invalid-account", 12)));
        if (!user || typeof stored !== "string" || !valid) throw new AuthLoginError("invalid_login", 401, this.message("invalid_login"));
        if ((this.fields.active !== false && user[this.fields.active] === false)
            || (this.modelOptions.isUserAllowed && !await this.modelOptions.isUserAllowed(user))) {
            throw new AuthLoginError("inactive_user", 403, this.message("inactive_user"));
        }
        const id = user[this.fields.primaryKey];
        if (id === null || id === undefined || id === "") throw new Error("Auth user has no primary key.");
        return String(id);
    }

    async login(req: Request, res: Response, verifyCredentials: () => Promise<string | null> = () => this.verifyCredentials(req)): Promise<AuthSession> {
        let user: Model | null = null;
        const session = await super.login(req, res, async () => {
            const subject = await verifyCredentials();
            if (subject && (this.modelOptions.beforeLogin || this.modelOptions.afterLogin)) {
                const id = this.fields.primaryKey === "_id" ? await this.model.objectId(subject, { noExceptions: true }) : subject;
                user = id == null ? null : await this.model.where(this.fields.primaryKey, "=", id).first();
                if (!user) throw new AuthLoginError("invalid_login", 401, this.message("invalid_login"));
                if (this.modelOptions.beforeLogin) {
                    try { await this.modelOptions.beforeLogin(req, user, this); }
                    catch (error) { throw new AuthHookError("login_blocked", error); }
                }
            }
            return subject;
        });
        if (this.modelOptions.trackActivity !== false) await this.sessions.recordLogin(session, authHeader(req, "user-agent"));
        if (this.modelOptions.onLogin) await this.modelOptions.onLogin(session, req);
        if (this.modelOptions.afterLogin) await this.modelOptions.afterLogin(req, user!, this);
        return session;
    }

    async logout(req: Request, res: Response): Promise<void> {
        const session = await this.logoutSession(req);
        const user = this.sessionUsers.get(session);
        if (!user) throw new AuthLoginError("unauthorized", 401, this.message("unauthorized"));
        if (this.modelOptions.beforeLogout) {
            try { await this.modelOptions.beforeLogout(req, user, this); }
            catch (error) { throw new AuthHookError("logout_blocked", error); }
        }
        await this.finishLogout(session, res);
        if (this.modelOptions.afterLogout) await this.modelOptions.afterLogout(req, user, this);
    }

    /** Resolve a fresh validated session and its model; never trusts a client-supplied req.auth. */
    async resolve<TUser extends Model = Model>(req: Request, res?: Response): Promise<AuthContext<TUser> | null> {
        res?.header("Cache-Control", "no-store");
        Object.defineProperty(req, "auth", { value: null, writable: true, configurable: true, enumerable: false });
        const session = await super.authenticate(req) || (res ? await super.resume(req, res) : null);
        if (!session) return null;
        const user = this.sessionUsers.get(session);
        if (!user) return null;
        if (this.modelOptions.trackActivity !== false) await this.sessions.touch(session);
        const auth = { user, session };
        if (this.modelOptions.onAuthenticate) await this.modelOptions.onAuthenticate(auth, req);
        req.auth = auth;
        return auth as AuthContext<TUser>;
    }

    async resolveCookies<TUser extends Model = Model>(cookies: Record<string, string | undefined>): Promise<AuthContext<TUser> | null> {
        const req = Object.assign(new Request(), { method: "GET", headers: { cookie: `${this.cookies.prefix}access=${encodeURIComponent(cookies[`${this.cookies.prefix}access`] || "")}` } });
        return this.resolve<TUser>(req);
    }

    /** Only explicit public fields are sent to browsers; Model instances remain on the server. */
    snapshot(auth: AuthContext | null | undefined): AuthSnapshot | null {
        if (!auth) return null;
        const fields = this.modelOptions.publicUserFields || [this.fields.primaryKey, "email", "name", "firstname", "lastname", "roles"];
        const user: Record<string, unknown> = {};
        for (const field of fields) {
            if (field.startsWith("__") || field === this.fields.password || auth.user.__hidden?.includes(field)
                || field.startsWith("auth_reset_") || ["constructor", "prototype"].includes(field)) continue;
            const value = (auth.user as any)[field];
            if (value !== undefined) user[field] = value;
        }
        return JSON.parse(JSON.stringify({ user, session: auth.session }));
    }

    /** Optional auth for public routes, or required auth for protected controllers. */
    middleware(options: { required?: boolean } = {}) {
        return async (next: Function, reject: Function, req: Request, res: Response) => {
            try {
                const auth = await this.resolve(req, res);
                res.header("Cache-Control", "no-store");
                if (!auth && options.required) {
                    res.status(401).send({ status: "error", code: "unauthorized" });
                    res.end();
                    return reject("Unauthorized");
                }
                return next(true);
            } catch (error) {
                if (!(error instanceof WebAuthError)) throw error;
                res.status(error.status).send({ status: "error", code: "invalid_csrf" });
                res.end();
                return reject(error.message);
            }
        };
    }

    async handle(operation: AuthOperation, req: Request, res: Response, loginResponse?: AuthRouteOptions["loginResponse"]) {
        res.header("Cache-Control", "no-store");
        try {
            if (operation === "csrf") return res.send({ csrf: this.bootstrap(req, res) });
            if (operation === "logout") { await this.logout(req, res); return res.send({ status: "success" }); }
            if (operation === "refresh") { await this.refresh(req, res); return res.send({ status: "success" }); }
            const session = await this.login(req, res);
            return res.send({ ...(loginResponse ? await loginResponse(req, session) : {}), status: "success" });
        } catch (error) {
            const code: AuthErrorCode = error instanceof AuthLoginError ? error.code : error instanceof WebAuthError
                ? error.message === "Invalid request origin." ? "invalid_origin" : error.status === 401 ? "unauthorized" : "invalid_csrf" : "server_error";
            if (!(error instanceof WebAuthError)) console.error(error);
            return res.status(error instanceof WebAuthError ? error.status : 500).send({ status: "error", code,
                message: error instanceof AuthHookError ? this.modelOptions.messages?.[code] ?? error.message : this.message(code) });
        }
    }
}

/** Compatibility name for existing integrations. Prefer Auth.scope(). */
export { AuthScope as ModelAuth };

export type AuthScopeOptions = ModelAuthOptions;
