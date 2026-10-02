"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelAuth = exports.AuthScope = exports.AuthLoginError = void 0;
const bcryptjs_1 = require("bcryptjs");
const routing_1 = require("../routing");
const Config_1 = require("../Config");
const Request_1 = require("../Router/Request");
const Auth_1 = require("./Auth");
const AuthMembership_1 = require("./AuthMembership");
const PasswordReset_1 = require("./PasswordReset");
const AuthSecurity_1 = require("./AuthSecurity");
const SessionAuth_1 = require("./SessionAuth");
const WebAuth_1 = require("./WebAuth");
class AuthLoginError extends WebAuth_1.WebAuthError {
    constructor(code, status, message) {
        super(status, message);
        this.code = code;
    }
}
exports.AuthLoginError = AuthLoginError;
class AuthHookError extends AuthLoginError {
    constructor(code, error) {
        super(code, error instanceof WebAuth_1.WebAuthError ? error.status : 403, error instanceof Error ? error.message : typeof error === "string" ? error : "Authentication action was blocked.");
    }
}
const defaultMessages = {
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
let dummyHash;
/** Model-backed browser authentication with secure default routes and revocable sessions. */
class AuthScope extends WebAuth_1.WebAuth {
    constructor(modelOptions) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        if (modelOptions.csrfDisabled)
            throw new Error("Browser auth routes require CSRF protection.");
        if (!modelOptions.model)
            throw new Error("Route.auth requires a Model class.");
        const origin = new URL(modelOptions.origin || Config_1.Config.get("auth.origin") || Config_1.Config.get("website.baseUrl") || Config_1.Config.get("application.website.baseUrl") || process.env.WEBSITE_URL || process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3035}`).origin;
        const key = (_a = modelOptions.key) !== null && _a !== void 0 ? _a : "main";
        if (!/^[A-Za-z0-9_-]+$/.test(key))
            throw new Error("Invalid auth scope key.");
        const model = modelOptions.model;
        const fields = Object.assign({ identifier: "email", password: "password", active: "is_active", primaryKey: new model().__primaryKey || "_id" }, modelOptions.fields);
        const allowed = (user) => __awaiter(this, void 0, void 0, function* () {
            return Boolean(user && (fields.active === false || user[fields.active] !== false)
                && (!modelOptions.isUserAllowed || (yield modelOptions.isUserAllowed(user))));
        });
        const sessionUsers = new WeakMap();
        const sessions = new SessionAuth_1.SessionAuth(Object.assign(Object.assign({ accessTokenSeconds: 15 * 60, sessionSeconds: 30 * 86400, idleTimeoutSeconds: 7 * 86400 }, modelOptions.session), { issuer: origin, scope: key, audience: (_d = (_b = modelOptions.audience) !== null && _b !== void 0 ? _b : (_c = modelOptions.session) === null || _c === void 0 ? void 0 : _c.audience) !== null && _d !== void 0 ? _d : origin, connection: ((_e = modelOptions.session) === null || _e === void 0 ? void 0 : _e.connection) || new model().__connection, isSessionAllowed: (session) => __awaiter(this, void 0, void 0, function* () {
                const id = fields.primaryKey === "_id" ? yield model.objectId(session.subject, { noExceptions: true }) : session.subject;
                const user = id !== null && id !== undefined ? yield model.where(fields.primaryKey, "=", id).first() : null;
                if (!(yield allowed(user)) || (modelOptions.isSessionAllowed && !(yield modelOptions.isSessionAllowed(session, user))))
                    return false;
                sessionUsers.set(session, user);
                return true;
            }) }));
        super(sessions, Object.assign(Object.assign({}, modelOptions), { origin, cookiePrefix: (_f = modelOptions.cookiePrefix) !== null && _f !== void 0 ? _f : (key === "main" ? undefined : `${origin.startsWith("https:") ? "__Host-wf_" : "wf_dev_"}${key}_`), allowInsecureLocalhost: (_g = modelOptions.allowInsecureLocalhost) !== null && _g !== void 0 ? _g : true }));
        this.modelOptions = modelOptions;
        this.memberships = new Map();
        this.contexts = new WeakSet();
        this.authPaths = { basePath: "/api/auth", loginPath: "/api/auth/login" };
        for (const [name, options] of Object.entries(modelOptions.memberships || {})) {
            if (!/^[A-Za-z0-9_-]+$/.test(name))
                throw new Error("Invalid auth membership key.");
            this.memberships.set(name, new AuthMembership_1.AuthMembership(options));
        }
        this.key = key;
        this.sessionUsers = sessionUsers;
        this.model = model;
        this.fields = fields;
        this.passwordReset = modelOptions.passwordReset === false ? null : new PasswordReset_1.PasswordReset(model, key, fields, modelOptions.passwordReset || {}, (user) => __awaiter(this, void 0, void 0, function* () { return allowed(user); }), (user, mode) => __awaiter(this, void 0, void 0, function* () {
            const subject = String(user[fields.primaryKey]);
            yield this.sessions.revokeAll(subject);
            if (mode === "all")
                yield Auth_1.Auth.revokeUserSessions(model, subject);
        }), (_h = modelOptions.session) === null || _h === void 0 ? void 0 : _h.database);
    }
    configureRoutes(basePath, loginPath) {
        this.authPaths = { basePath, loginPath: loginPath || `${basePath}/login` };
    }
    get browserConfiguration() {
        return { basePath: (0, routing_1.appPath)(this.authPaths.basePath), loginPaths: [(0, routing_1.appPath)(this.authPaths.loginPath)], cookieName: this.cookies.prefix + "csrf" };
    }
    get configuration() {
        return this.modelOptions;
    }
    message(code) {
        var _a, _b;
        return (_b = (_a = this.modelOptions.messages) === null || _a === void 0 ? void 0 : _a[code]) !== null && _b !== void 0 ? _b : defaultMessages[this.modelOptions.locale || "en"][code];
    }
    /** Use this when creating users; existing bcrypt hashes are supported without migration. */
    static hashPassword(password) {
        return (0, bcryptjs_1.hash)(password, 12);
    }
    verifyCredentials(req) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const identifier = (_a = req.body) === null || _a === void 0 ? void 0 : _a[this.fields.identifier], password = (_b = req.body) === null || _b === void 0 ? void 0 : _b.password;
            if (typeof identifier !== "string" || !identifier.trim() || identifier.length > 320
                || typeof password !== "string" || !password || password.length > 1024) {
                throw new AuthLoginError("missing_login", 401, this.message("missing_login"));
            }
            const user = yield this.model.where(this.fields.identifier, "=", identifier.trim().toLowerCase()).first();
            const stored = user === null || user === void 0 ? void 0 : user[this.fields.password];
            const verify = this.modelOptions.verifyPassword || bcryptjs_1.compare;
            const valid = yield verify(password, typeof stored === "string" ? stored : yield (dummyHash || (dummyHash = (0, bcryptjs_1.hash)("webframez-invalid-account", 12))));
            if (!user || typeof stored !== "string" || !valid)
                throw new AuthLoginError("invalid_login", 401, this.message("invalid_login"));
            if ((this.fields.active !== false && user[this.fields.active] === false)
                || (this.modelOptions.isUserAllowed && !(yield this.modelOptions.isUserAllowed(user)))) {
                throw new AuthLoginError("inactive_user", 403, this.message("inactive_user"));
            }
            const id = user[this.fields.primaryKey];
            if (id === null || id === undefined || id === "")
                throw new Error("Auth user has no primary key.");
            return String(id);
        });
    }
    login(req, res, verifyCredentials = () => this.verifyCredentials(req)) {
        const _super = Object.create(null, {
            login: { get: () => super.login }
        });
        return __awaiter(this, void 0, void 0, function* () {
            let user = null;
            const session = yield _super.login.call(this, req, res, () => __awaiter(this, void 0, void 0, function* () {
                const subject = yield verifyCredentials();
                if (subject && (this.modelOptions.beforeLogin || this.modelOptions.afterLogin)) {
                    const id = this.fields.primaryKey === "_id" ? yield this.model.objectId(subject, { noExceptions: true }) : subject;
                    user = id == null ? null : yield this.model.where(this.fields.primaryKey, "=", id).first();
                    if (!user)
                        throw new AuthLoginError("invalid_login", 401, this.message("invalid_login"));
                    if (this.modelOptions.beforeLogin) {
                        try {
                            yield this.modelOptions.beforeLogin(req, user, this);
                        }
                        catch (error) {
                            throw new AuthHookError("login_blocked", error);
                        }
                    }
                }
                return subject;
            }));
            if (this.modelOptions.trackActivity !== false)
                yield this.sessions.recordLogin(session, (0, AuthSecurity_1.authHeader)(req, "user-agent"));
            if (this.modelOptions.onLogin)
                yield this.modelOptions.onLogin(session, req);
            if (this.modelOptions.afterLogin)
                yield this.modelOptions.afterLogin(req, user, this);
            return session;
        });
    }
    logout(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            const session = yield this.logoutSession(req);
            const user = this.sessionUsers.get(session);
            if (!user)
                throw new AuthLoginError("unauthorized", 401, this.message("unauthorized"));
            if (this.modelOptions.beforeLogout) {
                try {
                    yield this.modelOptions.beforeLogout(req, user, this);
                }
                catch (error) {
                    throw new AuthHookError("logout_blocked", error);
                }
            }
            yield this.finishLogout(session, res);
            if (this.modelOptions.afterLogout)
                yield this.modelOptions.afterLogout(req, user, this);
        });
    }
    /** Trusted SSO/server entry point; the subject must already be verified by the caller. */
    establishBearerSession(req, subject, parent = null, environment, parentExpiresAt) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.modelOptions.transport !== "bearer")
                throw new Error("Bearer transport is not enabled for this auth scope.");
            const id = this.fields.primaryKey === "_id" ? yield this.model.objectId(subject, { noExceptions: true }) : subject;
            const user = id == null ? null : yield this.model.where(this.fields.primaryKey, "=", id).first();
            if (!user || (this.fields.active !== false && user[this.fields.active] === false)
                || (this.modelOptions.isUserAllowed && !(yield this.modelOptions.isUserAllowed(user)))) {
                throw new AuthLoginError("inactive_user", 403, this.message("inactive_user"));
            }
            if (this.modelOptions.beforeLogin) {
                try {
                    yield this.modelOptions.beforeLogin(req, user, this);
                }
                catch (error) {
                    throw new AuthHookError("login_blocked", error);
                }
            }
            const pair = yield this.sessions.create(subject, parent, environment, parentExpiresAt);
            if (!pair.reused && this.modelOptions.trackActivity !== false)
                yield this.sessions.recordLogin(pair.session, (0, AuthSecurity_1.authHeader)(req, "user-agent"));
            if (this.modelOptions.onLogin)
                yield this.modelOptions.onLogin(pair.session, req);
            if (this.modelOptions.afterLogin)
                yield this.modelOptions.afterLogin(req, user, this);
            const { csrf_token, reused } = pair, tokens = __rest(pair, ["csrf_token", "reused"]);
            return tokens;
        });
    }
    logoutBearer(req) {
        return __awaiter(this, void 0, void 0, function* () {
            if (req.method !== "POST")
                throw new WebAuth_1.WebAuthError(403, "Logout requires POST.");
            const auth = yield this.resolveBearer(req);
            if (!auth)
                throw new AuthLoginError("unauthorized", 401, this.message("unauthorized"));
            if (this.modelOptions.beforeLogout) {
                try {
                    yield this.modelOptions.beforeLogout(req, auth.user, this);
                }
                catch (error) {
                    throw new AuthHookError("logout_blocked", error);
                }
            }
            yield this.sessions.revoke(auth.session.id);
            if (this.modelOptions.afterLogout)
                yield this.modelOptions.afterLogout(req, auth.user, this);
        });
    }
    /** Explicit Authorization credentials require no cookie CSRF and are never read from query parameters. */
    resolveBearer(req, res) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            if (this.modelOptions.transport !== "bearer")
                throw new Error("Bearer transport is not enabled for this auth scope.");
            res === null || res === void 0 ? void 0 : res.header("Cache-Control", "no-store");
            Object.defineProperty(req, "auth", { value: null, writable: true, configurable: true, enumerable: false });
            const header = (0, AuthSecurity_1.authHeader)(req, "authorization");
            const token = (_a = /^Bearer ([A-Za-z0-9_-]{1,128}\.[A-Za-z0-9_-]{43})$/i.exec(header)) === null || _a === void 0 ? void 0 : _a[1];
            if (!token)
                return null;
            const session = yield this.sessions.authenticate(token);
            const user = session && this.sessionUsers.get(session);
            if (!session || !user)
                return null;
            if (this.modelOptions.trackActivity !== false)
                yield this.sessions.touch(session);
            const auth = { user, session };
            this.contexts.add(auth);
            if (this.modelOptions.onAuthenticate)
                yield this.modelOptions.onAuthenticate(auth, req);
            req.auth = auth;
            return auth;
        });
    }
    /** Resolve a fresh validated session and its model; never trusts a client-supplied req.auth. */
    resolve(req, res) {
        const _super = Object.create(null, {
            authenticate: { get: () => super.authenticate },
            resume: { get: () => super.resume }
        });
        return __awaiter(this, void 0, void 0, function* () {
            if (this.modelOptions.transport === "bearer")
                return this.resolveBearer(req, res);
            res === null || res === void 0 ? void 0 : res.header("Cache-Control", "no-store");
            Object.defineProperty(req, "auth", { value: null, writable: true, configurable: true, enumerable: false });
            const session = (yield _super.authenticate.call(this, req)) || (res ? yield _super.resume.call(this, req, res) : null);
            if (!session)
                return null;
            const user = this.sessionUsers.get(session);
            if (!user)
                return null;
            if (this.modelOptions.trackActivity !== false)
                yield this.sessions.touch(session);
            const auth = { user, session };
            this.contexts.add(auth);
            if (this.modelOptions.onAuthenticate)
                yield this.modelOptions.onAuthenticate(auth, req);
            req.auth = auth;
            return auth;
        });
    }
    /** For integrations whose authenticated User was established by another trusted transport. */
    findMembership(name, user, resource) {
        return __awaiter(this, void 0, void 0, function* () {
            const resolver = this.memberships.get(name);
            if (!resolver)
                throw new Error(`Auth membership "${name}" is not configured.`);
            return resolver.find(user, resource);
        });
    }
    /** Attaches a fresh membership only to a context authenticated by this scope. */
    authorizeMembership(req, name, resource) {
        return __awaiter(this, void 0, void 0, function* () {
            const auth = req.auth;
            if (!auth || !this.contexts.has(auth))
                return null;
            if (auth.memberships)
                delete auth.memberships[name];
            const resolver = this.memberships.get(name);
            if (!resolver)
                throw new Error(`Auth membership "${name}" is not configured.`);
            if (!resolver.matchesEnvironment(resource, auth.session.environment))
                return null;
            const membership = yield resolver.find(auth.user, resource);
            if (!membership)
                return null;
            if (!auth.memberships)
                auth.memberships = Object.create(null);
            auth.memberships[name] = { resource, membership };
            return membership;
        });
    }
    resolveCookies(cookies) {
        return __awaiter(this, void 0, void 0, function* () {
            const req = Object.assign(new Request_1.Request(), { method: "GET", headers: { cookie: `${this.cookies.prefix}access=${encodeURIComponent(cookies[`${this.cookies.prefix}access`] || "")}` } });
            return this.resolve(req);
        });
    }
    /** Only explicit public fields are sent to browsers; Model instances remain on the server. */
    snapshot(auth) {
        var _a;
        if (!auth)
            return null;
        const fields = this.modelOptions.publicUserFields || [this.fields.primaryKey, "email", "name", "firstname", "lastname", "roles"];
        const user = {};
        for (const field of fields) {
            if (field.startsWith("__") || field === this.fields.password || ((_a = auth.user.__hidden) === null || _a === void 0 ? void 0 : _a.includes(field))
                || field.startsWith("auth_reset_") || ["constructor", "prototype"].includes(field))
                continue;
            const value = auth.user[field];
            if (value !== undefined)
                user[field] = value;
        }
        return JSON.parse(JSON.stringify({ user, session: auth.session }));
    }
    /** Optional auth for public routes, or required auth for protected controllers. */
    middleware(options = {}) {
        return (next, reject, req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const auth = yield this.resolve(req, res);
                res.header("Cache-Control", "no-store");
                if (!auth && options.required) {
                    res.status(401).send({ status: "error", code: "unauthorized" });
                    res.end();
                    return reject("Unauthorized");
                }
                return next(true);
            }
            catch (error) {
                if (!(error instanceof WebAuth_1.WebAuthError))
                    throw error;
                res.status(error.status).send({ status: "error", code: "invalid_csrf" });
                res.end();
                return reject(error.message);
            }
        });
    }
    handle(operation, req, res, loginResponse) {
        var _a, _b, _c;
        return __awaiter(this, void 0, void 0, function* () {
            res.header("Cache-Control", "no-store");
            try {
                if (this.modelOptions.transport === "bearer") {
                    if (operation === "csrf")
                        return res.status(405).send({ status: "error", code: "unsupported_operation" });
                    if (req.method !== "POST")
                        throw new WebAuth_1.WebAuthError(403, "Authentication requires POST.");
                    if (operation === "logout") {
                        yield this.logoutBearer(req);
                        return res.send({ status: "success" });
                    }
                    if (operation === "refresh") {
                        const token = (_a = req.body) === null || _a === void 0 ? void 0 : _a.refresh_token;
                        const pair = typeof token === "string" ? yield this.sessions.refresh(token) : null;
                        if (!pair)
                            throw new AuthLoginError("unauthorized", 401, this.message("unauthorized"));
                        return res.send(Object.assign({ status: "success" }, pair));
                    }
                    const pair = yield this.establishBearerSession(req, yield this.verifyCredentials(req));
                    return res.send(Object.assign(Object.assign(Object.assign({}, (loginResponse ? yield loginResponse(req, pair.session) : {})), { status: "success" }), pair));
                }
                if (operation === "csrf")
                    return res.send({ csrf: this.bootstrap(req, res) });
                if (operation === "logout") {
                    yield this.logout(req, res);
                    return res.send({ status: "success" });
                }
                if (operation === "refresh") {
                    yield this.refresh(req, res);
                    return res.send({ status: "success" });
                }
                const session = yield this.login(req, res);
                return res.send(Object.assign(Object.assign({}, (loginResponse ? yield loginResponse(req, session) : {})), { status: "success" }));
            }
            catch (error) {
                const code = error instanceof AuthLoginError ? error.code : error instanceof WebAuth_1.WebAuthError
                    ? error.message === "Invalid request origin." ? "invalid_origin" : error.status === 401 ? "unauthorized" : "invalid_csrf" : "server_error";
                if (!(error instanceof WebAuth_1.WebAuthError))
                    console.error(error);
                return res.status(error instanceof WebAuth_1.WebAuthError ? error.status : 500).send({ status: "error", code,
                    message: error instanceof AuthHookError ? (_c = (_b = this.modelOptions.messages) === null || _b === void 0 ? void 0 : _b[code]) !== null && _c !== void 0 ? _c : error.message : this.message(code) });
            }
        });
    }
}
exports.AuthScope = AuthScope;
exports.ModelAuth = AuthScope;
