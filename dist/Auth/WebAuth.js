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
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebAuth = exports.AuthCookies = exports.WebAuthError = void 0;
const AuthSecurity_1 = require("./AuthSecurity");
class WebAuthError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
        this.name = "WebAuthError";
    }
}
exports.WebAuthError = WebAuthError;
/** Host-only cookies: no Domain override. Separate origins must use SSO, not shared cookies. */
class AuthCookies {
    constructor(options) {
        const url = (0, AuthSecurity_1.authUrl)(options.origin, options.allowInsecureLocalhost);
        if (url.pathname !== "/" || url.search)
            throw new Error("WebAuth origin must not contain a path or query.");
        this.origin = url.origin;
        this.secure = url.protocol === "https:";
        this.prefix = options.cookiePrefix || (this.secure ? "__Host-wf_" : "wf_dev_");
        if (!/^[A-Za-z0-9_-]+$/.test(this.prefix) || (this.secure && !this.prefix.startsWith("__Host-")) || (!this.secure && this.prefix.startsWith("__Host-")))
            throw new Error("Invalid auth cookie prefix.");
    }
    read(req, name) { return (0, AuthSecurity_1.authCookie)(req, this.prefix + name); }
    write(res, name, value, seconds, httpOnly = true) {
        var _a, _b, _c;
        if (!/^[a-z_]+$/.test(name))
            throw new Error("Invalid auth cookie name.");
        const cookie = `${this.prefix}${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${Math.max(0, Math.floor(seconds))}; SameSite=Lax${this.secure ? "; Secure" : ""}${httpOnly ? "; HttpOnly" : ""}`;
        const existingKey = Object.keys(res.headers).find(key => key.toLowerCase() === "set-cookie");
        const previous = (_b = (_a = res.res) === null || _a === void 0 ? void 0 : _a.getHeader("Set-Cookie")) !== null && _b !== void 0 ? _b : (existingKey ? res.headers[existingKey] : undefined);
        const cookies = [...(Array.isArray(previous) ? previous.map(String) : previous ? [String(previous)] : []), cookie];
        if (existingKey && existingKey !== "Set-Cookie")
            delete res.headers[existingKey];
        res.headers["Set-Cookie"] = cookies;
        (_c = res.res) === null || _c === void 0 ? void 0 : _c.setHeader("Set-Cookie", cookies);
        res.header("Cache-Control", "no-store");
    }
    /** Check the configured origin, never Host or forwarded headers supplied by the request. */
    assertOrigin(req) {
        const origin = (0, AuthSecurity_1.authHeader)(req, "origin"), site = (0, AuthSecurity_1.authHeader)(req, "sec-fetch-site");
        if (site === "cross-site" || site === "same-site" || (origin ? origin !== this.origin : site !== "same-origin")) {
            throw new WebAuthError(403, "Invalid request origin.");
        }
    }
}
exports.AuthCookies = AuthCookies;
/** Browser adapter. Unsafe requests require both same-origin evidence and a session-bound CSRF token. */
class WebAuth {
    constructor(sessions, options) {
        this.sessions = sessions;
        this.cookies = new AuthCookies(options);
    }
    csrf(req) {
        var _a;
        this.cookies.assertOrigin(req);
        const cookie = this.cookies.read(req, "csrf");
        const submitted = (0, AuthSecurity_1.authHeader)(req, "x-csrf-token") || (typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a._csrf) === "string" ? req.body._csrf : "");
        if (!/^[A-Za-z0-9_-]{43}$/.test(cookie) || !(0, AuthSecurity_1.equalAuthToken)(cookie, submitted))
            throw new WebAuthError(403, "Invalid CSRF token.");
        return cookie;
    }
    post(req) { if (req.method !== "POST")
        throw new WebAuthError(403, "This auth operation requires POST."); }
    /** GET /auth/csrf, fetched from this origin. Also protects login before a user session exists. */
    bootstrap(req, res) {
        this.cookies.assertOrigin(req);
        const current = this.cookies.read(req, "csrf");
        const token = /^[A-Za-z0-9_-]{43}$/.test(current) ? current : (0, AuthSecurity_1.randomAuthToken)();
        if (token !== current)
            this.cookies.write(res, "csrf", token, 3600, false);
        res.header("Cache-Control", "no-store");
        return token;
    }
    writePair(res, pair) {
        this.cookies.write(res, "access", pair.auth_token, (pair.auth_expires_at - Date.now()) / 1000);
        this.cookies.write(res, "refresh", pair.refresh_token, (pair.refresh_expires_at - Date.now()) / 1000);
    }
    /** GET/HEAD only. A current refresh secret and matching session-bound CSRF cookie are required. */
    resume(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!["GET", "HEAD"].includes(req.method))
                return null;
            const token = this.cookies.read(req, "refresh"), csrf = this.cookies.read(req, "csrf");
            if (!(yield this.sessions.verifyCsrf(token, csrf, "refresh")))
                return null;
            const pair = yield this.sessions.renewAccess(token);
            if (!pair)
                return this.sessions.inspectRefresh(token);
            this.writePair(res, pair);
            const name = this.cookies.prefix + "access";
            const cookies = (0, AuthSecurity_1.authHeader)(req, "cookie").split(";").map(value => value.trim()).filter(value => value && !value.startsWith(`${name}=`));
            req.headers = Object.assign(Object.assign({}, req.headers), { cookie: [...cookies, `${name}=${encodeURIComponent(pair.auth_token)}`].join("; ") });
            return pair.session;
        });
    }
    /** Credential verification is supplied by the app, after CSRF checks. Never accepts a user ID from the browser. */
    login(req, res, verifyCredentials) {
        return __awaiter(this, void 0, void 0, function* () {
            this.post(req);
            this.csrf(req);
            const subject = yield verifyCredentials();
            if (!subject)
                throw new WebAuthError(401, "Invalid credentials.");
            return this.establishSession(subject, res);
        });
    }
    /** Trusted-server entry point after a validated SSO callback (not a public login endpoint). */
    establishSession(subject, res, parent = null) {
        return __awaiter(this, void 0, void 0, function* () {
            const created = yield this.sessions.create(subject, parent);
            this.writePair(res, created);
            this.cookies.write(res, "csrf", created.csrf_token, (created.refresh_expires_at - Date.now()) / 1000, false);
            return created.session;
        });
    }
    authenticate(req) {
        return __awaiter(this, void 0, void 0, function* () {
            const token = this.cookies.read(req, "access");
            if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
                const csrf = this.csrf(req);
                if (!(yield this.sessions.verifyCsrf(token, csrf)))
                    throw new WebAuthError(403, "Invalid session CSRF token.");
            }
            return this.sessions.authenticate(token);
        });
    }
    refresh(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            this.post(req);
            const csrf = this.csrf(req), token = this.cookies.read(req, "refresh");
            if (!(yield this.sessions.verifyCsrf(token, csrf, "refresh")))
                throw new WebAuthError(403, "Invalid session CSRF token.");
            const pair = yield this.sessions.refresh(token);
            if (!pair)
                throw new WebAuthError(401, "Session expired or refresh token reused.");
            this.writePair(res, pair);
            return pair.session;
        });
    }
    logoutSession(req) {
        return __awaiter(this, void 0, void 0, function* () {
            this.post(req);
            const csrf = this.csrf(req), token = this.cookies.read(req, "refresh");
            if (!(yield this.sessions.verifyCsrf(token, csrf, "refresh")))
                throw new WebAuthError(403, "Invalid session CSRF token.");
            const session = yield this.sessions.inspect(token.split(".")[0]);
            if (!session)
                throw new WebAuthError(401, "Invalid session.");
            return session;
        });
    }
    finishLogout(session, res) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.sessions.revoke(session.id);
            for (const key of ["access", "refresh", "csrf"])
                this.cookies.write(res, key, "", 0, key !== "csrf");
        });
    }
    logout(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.finishLogout(yield this.logoutSession(req), res);
        });
    }
}
exports.WebAuth = WebAuth;
