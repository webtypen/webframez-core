import { compare, hash } from "bcryptjs";
import { Config } from "../Config";
import { Model } from "../Database/Model";
import { Request } from "../Router/Request";
import type { Response } from "../Router/Response";
import { authHeader } from "./AuthSecurity";
import { SessionAuth, AuthSession, SessionAuthOptions } from "./SessionAuth";
import { WebAuth, WebAuthError, WebAuthOptions } from "./WebAuth";

export type AuthContext<TUser extends Model = Model> = { user: TUser; session: AuthSession };

export type AuthSnapshot<TUser = Record<string, unknown>> = { user: TUser; session: AuthSession };

export type AuthErrorCode = "missing_login" | "invalid_login" | "inactive_user" | "invalid_origin" | "invalid_csrf" | "unauthorized" | "server_error";

export class AuthLoginError extends WebAuthError {
    constructor(public readonly code: AuthErrorCode, status: 401 | 403, message: string) {
        super(status, message);
    }
}

export type ModelAuthOptions = Partial<WebAuthOptions> & {
    model: typeof Model;
    /** Takes precedence over session.audience; defaults to the configured origin. */
    audience?: string;
    locale?: "en" | "de";
    /** Record browser metadata and update activity at most once per minute. */
    trackActivity?: boolean;
    fields?: { identifier?: string; password?: string; active?: string | false; primaryKey?: string };
    session?: Partial<Omit<SessionAuthOptions, "issuer" | "isSessionAllowed">>;
    csrfDisabled?: false;
    verifyPassword?: (password: string, storedHash: string) => boolean | Promise<boolean>;
    isUserAllowed?: (user: Model) => boolean | Promise<boolean>;
    onLogin?: (session: AuthSession, req: Request) => void | Promise<void>;
    publicUserFields?: readonly string[];
    onAuthenticate?: (auth: AuthContext, req: Request) => void | Promise<void>;
    messages?: Partial<Record<AuthErrorCode, string>>;
};

export type AuthOperation = "csrf" | "login" | "logout" | "refresh";

export type AuthRouteOptions = Partial<ModelAuthOptions> & {
    auth?: ModelAuth | (() => ModelAuth);
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
    },
    de: {
        missing_login: "Bitte gib E-Mail-Adresse und Passwort an.",
        invalid_login: "Es wurde kein Benutzer mit dieser E-Mail-/Passwort-Kombination gefunden.",
        inactive_user: "Bitte aktiviere deinen Account über die E-Mail, die wir dir geschickt haben.",
        invalid_origin: "Die Login-Adresse stimmt nicht mit der konfigurierten Website-URL überein.",
        invalid_csrf: "Der Login konnte gerade nicht verarbeitet werden. Bitte lade die Seite neu.",
        unauthorized: "Bitte melde dich an.",
        server_error: "Die Anmeldung konnte gerade nicht verarbeitet werden.",
    },
};

// Verify a dummy password hash for unknown accounts as well.
let dummyHash: Promise<string> | undefined;

/** Model-backed browser authentication with secure default routes and revocable sessions. */
export class ModelAuth extends WebAuth {
    private readonly model: typeof Model;
    private readonly sessionUsers: WeakMap<AuthSession, Model>;
    private readonly fields: { identifier: string; password: string; active: string | false; primaryKey: string };

    constructor(private readonly modelOptions: ModelAuthOptions) {
        if (modelOptions.csrfDisabled) throw new Error("Browser auth routes require CSRF protection.");
        if (!modelOptions.model) throw new Error("Route.auth requires a Model class.");
        const origin = new URL(modelOptions.origin || Config.get("auth.origin") || Config.get("website.baseUrl") || Config.get("application.website.baseUrl") || process.env.WEBSITE_URL || process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3035}`).origin;
        const model = modelOptions.model;
        const fields = { identifier: "email", password: "password", active: "is_active" as string | false,
            primaryKey: new model().__primaryKey || "_id", ...modelOptions.fields };
        const allowed = async (user: Model | null) => Boolean(user && (fields.active === false || (user as any)[fields.active] !== false)
            && (!modelOptions.isUserAllowed || await modelOptions.isUserAllowed(user)));
        const sessionUsers = new WeakMap<AuthSession, Model>();
        const sessions = new SessionAuth({ accessTokenSeconds: 30 * 86400, sessionSeconds: 30 * 86400,
            ...modelOptions.session, issuer: origin,
            audience: modelOptions.audience ?? modelOptions.session?.audience ?? origin,
            connection: modelOptions.session?.connection || new model().__connection,
            isSessionAllowed: async session => {
                const id = fields.primaryKey === "_id" ? await model.objectId(session.subject, { noExceptions: true }) : session.subject;
                const user = id !== null && id !== undefined ? await model.where(fields.primaryKey, "=", id).first() : null;
                if (!await allowed(user)) return false;
                sessionUsers.set(session, user!);
                return true;
            } });
        super(sessions, { ...modelOptions, origin, allowInsecureLocalhost: modelOptions.allowInsecureLocalhost ?? true });
        this.sessionUsers = sessionUsers;
        this.model = model;
        this.fields = fields;
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
        const session = await super.login(req, res, verifyCredentials);
        if (this.modelOptions.trackActivity !== false) await this.sessions.recordLogin(session, authHeader(req, "user-agent"));
        if (this.modelOptions.onLogin) await this.modelOptions.onLogin(session, req);
        return session;
    }

    /** Resolve a fresh validated session and its model; never trusts a client-supplied req.auth. */
    async resolve<TUser extends Model = Model>(req: Request): Promise<AuthContext<TUser> | null> {
        Object.defineProperty(req, "auth", { value: null, writable: true, configurable: true, enumerable: false });
        const session = await super.authenticate(req);
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
                || ["constructor", "prototype"].includes(field)) continue;
            const value = (auth.user as any)[field];
            if (value !== undefined) user[field] = value;
        }
        return JSON.parse(JSON.stringify({ user, session: auth.session }));
    }

    /** Optional auth for public routes, or required auth for protected controllers. */
    middleware(options: { required?: boolean } = {}) {
        return async (next: Function, reject: Function, req: Request, res: Response) => {
            try {
                const auth = await this.resolve(req);
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
                message: this.message(code) });
        }
    }
}

export function authRoute(operation: AuthOperation, options: AuthRouteOptions) {
    let auth: ModelAuth | undefined;
    return (req: Request, res: Response) => {
        auth ||= typeof options.auth === "function" ? options.auth() : options.auth || new ModelAuth(options as ModelAuthOptions);
        return auth.handle(operation, req, res, options.loginResponse);
    };
}
