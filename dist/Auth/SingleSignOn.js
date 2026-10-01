"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
exports.SsoClient = exports.SsoAuthority = exports.readSsoClientCredentials = exports.createSsoClientCredentials = void 0;
const crypto_1 = require("crypto");
const https = __importStar(require("https"));
const http = __importStar(require("http"));
const DBConnection_1 = require("../Database/DBConnection");
const WebAuth_1 = require("./WebAuth");
const AuthSecurity_1 = require("./AuthSecurity");
/** Generate once during trusted instance provisioning; store only secretHash at the authority. */
function createSsoClientCredentials() {
    const secret = (0, AuthSecurity_1.randomAuthToken)();
    return { id: (0, AuthSecurity_1.randomAuthToken)(), secret, secretHash: (0, AuthSecurity_1.hashAuthToken)(secret) };
}
exports.createSsoClientCredentials = createSsoClientCredentials;
function readSsoClientCredentials(req) {
    const header = (0, AuthSecurity_1.authHeader)(req, "authorization");
    if (header.length > 2048 || !/^Basic [A-Za-z0-9+/]+={0,2}$/i.test(header))
        return null;
    const text = Buffer.from(header.slice(6), "base64").toString("utf8"), separator = text.indexOf(":");
    if (separator < 1 || /[\x00-\x20\x7f]/.test(text))
        return null;
    return { clientId: text.slice(0, separator), clientSecret: text.slice(separator + 1) };
}
exports.readSsoClientCredentials = readSsoClientCredentials;
function challenge(verifier) { return (0, crypto_1.createHash)("sha256").update(verifier).digest("base64url"); }
function verifierValid(value) { return typeof value === "string" && /^[A-Za-z0-9._~-]{43,128}$/.test(value); }
function opaqueValid(value) { return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value); }
function redirectAllowed(value, allowLocal = false) {
    const url = (0, AuthSecurity_1.authUrl)(value, allowLocal);
    if (["code", "state", "iss"].some(key => url.searchParams.has(key)))
        throw new Error("Reserved SSO redirect query parameter.");
    return url;
}
/** First-party, confidential-client SSO code bridge. Not a full OAuth/OIDC provider. */
class SsoAuthority {
    constructor(options) {
        this.options = options;
        this.issuer = (0, AuthSecurity_1.authUrl)(options.issuer, options.allowInsecureLocalhost).href;
        if (typeof options.getClient !== "function" || typeof options.authorize !== "function")
            throw new Error("SSO client registry and authorization policy are required.");
    }
    rows() {
        return __awaiter(this, void 0, void 0, function* () {
            const db = yield (this.options.database ? this.options.database() : DBConnection_1.DBConnection.getDocumentStore(this.options.connection));
            return db.collection(this.options.collection || "auth_sso_codes");
        });
    }
    client(id, redirectUri) {
        return __awaiter(this, void 0, void 0, function* () {
            (0, AuthSecurity_1.authText)(id, "client ID");
            const client = yield this.options.getClient(id);
            if (!client || client.id !== id || !/^[a-f0-9]{64}$/.test(client.secretHash))
                return null;
            if (redirectUri !== undefined) {
                redirectAllowed(redirectUri, this.options.allowInsecureLocalhost);
                if (!client.redirectUris.includes(redirectUri))
                    return null;
            }
            return client;
        });
    }
    authenticatedClient(id, secret, redirectUri) {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof secret !== "string" || secret.length < 32 || secret.length > 512)
                return null;
            const client = yield this.client(id, redirectUri);
            return client && (0, AuthSecurity_1.equalAuthToken)(client.secretHash, (0, AuthSecurity_1.hashAuthToken)(secret)) ? client : null;
        });
    }
    /** The caller authenticates the central browser session; its access token never leaves the authority. */
    authorize(accessToken, request) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!opaqueValid(request.state) || !opaqueValid(request.codeChallenge) || request.codeChallengeMethod !== "S256")
                return null;
            (0, AuthSecurity_1.authText)(request.environment, "environment");
            const client = yield this.client(request.clientId, request.redirectUri);
            const session = yield this.options.sessions.authenticate(accessToken);
            if (!client || !session || !(yield this.options.authorize(session, client, request.environment)))
                return null;
            const code = (0, AuthSecurity_1.randomAuthToken)();
            yield (yield this.rows()).insertOne({ _id: (0, AuthSecurity_1.hashAuthToken)(code), issuer: this.issuer,
                audience: client.id, subject: session.subject, environment: request.environment,
                authoritySessionId: session.id, redirectUri: request.redirectUri, challenge: request.codeChallenge,
                expiresAt: Math.min(Date.now() + 60000, session.expiresAt), consumedAt: null });
            const redirect = new URL(request.redirectUri);
            redirect.searchParams.set("code", code);
            redirect.searchParams.set("state", request.state);
            redirect.searchParams.set("iss", this.issuer);
            return redirect.href;
        });
    }
    /** Server-to-server only; registered client credentials and PKCE are both mandatory. */
    exchange(request) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!opaqueValid(request.code) || !verifierValid(request.codeVerifier))
                return null;
            (0, AuthSecurity_1.authText)(request.environment, "environment");
            const client = yield this.authenticatedClient(request.clientId, request.clientSecret, request.redirectUri);
            if (!client)
                return null;
            const rows = yield this.rows();
            const filter = { _id: (0, AuthSecurity_1.hashAuthToken)(request.code), issuer: this.issuer, audience: client.id,
                environment: request.environment, redirectUri: request.redirectUri, challenge: challenge(request.codeVerifier),
                consumedAt: null, expiresAt: { $gt: Date.now() } };
            const candidate = yield rows.findOne(filter);
            if (!candidate)
                return null;
            const session = yield this.options.sessions.inspect(candidate.authoritySessionId);
            if (!session || session.subject !== candidate.subject || !(yield this.options.authorize(session, client, candidate.environment)))
                return null;
            const claimed = yield rows.findOneAndUpdate(Object.assign(Object.assign({}, filter), { expiresAt: { $gt: Date.now() } }), { $set: { consumedAt: Date.now() } }, { returnDocument: "after" });
            if (!claimed || session.expiresAt <= Date.now())
                return null;
            return { issuer: this.issuer, audience: client.id, subject: session.subject, environment: claimed.environment,
                authoritySessionId: session.id, expiresAt: session.expiresAt };
        });
    }
    /** Use from instance session policy for central logout/account/membership revocation. */
    introspect(clientId, clientSecret, sessionId, environment) {
        return __awaiter(this, void 0, void 0, function* () {
            (0, AuthSecurity_1.authText)(environment, "environment");
            const client = yield this.authenticatedClient(clientId, clientSecret);
            const session = client ? yield this.options.sessions.inspect(sessionId) : null;
            if (!client || !session || !(yield this.options.authorize(session, client, environment)))
                return null;
            return { issuer: this.issuer, audience: client.id, subject: session.subject, environment,
                authoritySessionId: session.id, expiresAt: session.expiresAt };
        });
    }
    cleanup() {
        return __awaiter(this, void 0, void 0, function* () { yield (yield this.rows()).deleteMany({ issuer: this.issuer, expiresAt: { $lte: Date.now() } }); });
    }
}
exports.SsoAuthority = SsoAuthority;
/** Fixed-endpoint backchannel: no redirects, bounded response size and timeout, normal TLS verification. */
function postBackchannel(url, clientId, secret, body) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const request = (url.protocol === "https:" ? https : http).request(url, { method: "POST", headers: {
                "Content-Type": "application/json", Accept: "application/json", "Content-Length": Buffer.byteLength(payload),
                Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
            } }, response => {
            const chunks = [];
            let length = 0;
            response.on("data", chunk => {
                length += chunk.length;
                if (length > 16384) {
                    response.destroy();
                    request.destroy(new Error("SSO response too large."));
                    return;
                }
                chunks.push(Buffer.from(chunk));
            });
            response.on("error", reject);
            response.on("end", () => {
                if (response.statusCode !== 200)
                    return reject(new Error("SSO backchannel rejected the request."));
                try {
                    resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
                }
                catch (_a) {
                    reject(new Error("Invalid SSO response."));
                }
            });
        });
        const deadline = setTimeout(() => request.destroy(new Error("SSO backchannel timeout.")), 5000);
        request.on("close", () => clearTimeout(deadline));
        request.on("error", reject);
        request.end(payload);
    });
}
/** Instance-side redirect flow. state + server-held PKCE verifier + host-only browser-binding cookie. */
class SsoClient {
    constructor(options) {
        this.options = options;
        this.cookies = new WebAuth_1.AuthCookies(options);
        (0, AuthSecurity_1.authText)(options.clientId, "client ID");
        if (options.clientId.includes(":"))
            throw new Error("Client IDs cannot contain a colon.");
        if (typeof options.clientSecret !== "string" || options.clientSecret.length < 32 || options.clientSecret.length > 512 || /[\r\n:]/.test(options.clientSecret))
            throw new Error("Use a random SSO client secret with at least 32 characters.");
        this.issuer = (0, AuthSecurity_1.authUrl)(options.issuer, options.allowInsecureLocalhost).href;
        this.authorization = (0, AuthSecurity_1.authUrl)(options.authorizationEndpoint, options.allowInsecureLocalhost);
        this.token = (0, AuthSecurity_1.authUrl)(options.tokenEndpoint, options.allowInsecureLocalhost);
        this.introspection = (0, AuthSecurity_1.authUrl)(options.introspectionEndpoint, options.allowInsecureLocalhost);
        if ([this.authorization, this.token, this.introspection].some(url => url.origin !== new URL(this.issuer).origin))
            throw new Error("SSO endpoints must belong to the configured issuer origin.");
        if (redirectAllowed(options.redirectUri, options.allowInsecureLocalhost).origin !== this.cookies.origin)
            throw new Error("SSO callback must belong to this instance origin.");
    }
    rows() {
        return __awaiter(this, void 0, void 0, function* () {
            const db = yield (this.options.database ? this.options.database() : DBConnection_1.DBConnection.getDocumentStore(this.options.connection));
            return db.collection(this.options.collection || "auth_sso_transactions");
        });
    }
    begin(res, environment) {
        return __awaiter(this, void 0, void 0, function* () {
            (0, AuthSecurity_1.authText)(environment, "environment");
            const state = (0, AuthSecurity_1.randomAuthToken)(), binding = (0, AuthSecurity_1.randomAuthToken)(), verifier = (0, AuthSecurity_1.randomAuthToken)();
            yield (yield this.rows()).insertOne({ _id: (0, AuthSecurity_1.hashAuthToken)(state), issuer: this.issuer, clientId: this.options.clientId,
                bindingHash: (0, AuthSecurity_1.hashAuthToken)(binding), verifier, environment, expiresAt: Date.now() + 300000, consumedAt: null });
            this.cookies.write(res, "sso", binding, 300);
            res.header("Referrer-Policy", "no-referrer");
            const url = new URL(this.authorization.href);
            for (const [key, value] of Object.entries({ client_id: this.options.clientId, redirect_uri: this.options.redirectUri,
                environment, state, code_challenge: challenge(verifier), code_challenge_method: "S256", response_type: "code" }))
                url.searchParams.set(key, value);
            return url.href;
        });
    }
    identity(value, environment) {
        if (!value || value.issuer !== this.issuer || value.audience !== this.options.clientId || value.environment !== environment ||
            typeof value.subject !== "string" || !value.subject.length || value.subject.length > 512 ||
            !opaqueValid(value.authoritySessionId) || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now())
            return null;
        return { issuer: value.issuer, audience: value.audience, subject: value.subject, environment: value.environment,
            authoritySessionId: value.authoritySessionId, expiresAt: value.expiresAt };
    }
    complete(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            res.header("Cache-Control", "no-store");
            res.header("Referrer-Policy", "no-referrer");
            const { state, code, iss } = req.query || {};
            const binding = this.cookies.read(req, "sso");
            if (req.method !== "GET" || !opaqueValid(state) || !opaqueValid(code) || iss !== this.issuer || !opaqueValid(binding))
                return null;
            const transaction = yield (yield this.rows()).findOneAndUpdate({ _id: (0, AuthSecurity_1.hashAuthToken)(state), issuer: this.issuer,
                clientId: this.options.clientId, bindingHash: (0, AuthSecurity_1.hashAuthToken)(binding), consumedAt: null, expiresAt: { $gt: Date.now() } }, { $set: { consumedAt: Date.now() } }, { returnDocument: "before" });
            if (!transaction)
                return null;
            this.cookies.write(res, "sso", "", 0);
            const response = yield postBackchannel(this.token, this.options.clientId, this.options.clientSecret, {
                grant_type: "authorization_code", code, code_verifier: transaction.verifier,
                redirect_uri: this.options.redirectUri, environment: transaction.environment,
            });
            return this.identity(response, transaction.environment);
        });
    }
    introspect(sessionId, environment) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!opaqueValid(sessionId))
                return null;
            (0, AuthSecurity_1.authText)(environment, "environment");
            const response = yield postBackchannel(this.introspection, this.options.clientId, this.options.clientSecret, { session_id: sessionId, environment });
            const identity = this.identity(response, environment);
            return (identity === null || identity === void 0 ? void 0 : identity.authoritySessionId) === sessionId ? identity : null;
        });
    }
    cleanup() {
        return __awaiter(this, void 0, void 0, function* () { yield (yield this.rows()).deleteMany({ issuer: this.issuer, clientId: this.options.clientId, expiresAt: { $lte: Date.now() } }); });
    }
}
exports.SsoClient = SsoClient;
