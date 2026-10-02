import { createHash } from "crypto";
import * as https from "https";
import * as http from "http";
import { DBConnection } from "../Database/DBConnection";
import type { DocumentDatabase } from "../Database/DatabaseAdapter";
import type { Request } from "../Router/Request";
import type { Response } from "../Router/Response";
import { AuthSession, SessionAuth } from "./SessionAuth";
import { AuthCookies, WebAuthOptions } from "./WebAuth";
import { authHeader, authText, authUrl, equalAuthToken, hashAuthToken, randomAuthToken } from "./AuthSecurity";

/** Generate once during trusted instance provisioning; store only secretHash at the authority. */
export function createSsoClientCredentials() {
    const secret = randomAuthToken();
    return { id: randomAuthToken(), secret, secretHash: hashAuthToken(secret) };
}

export function readSsoClientCredentials(req: Request): { clientId: string; clientSecret: string } | null {
    const header = authHeader(req, "authorization");
    if (header.length > 2048 || !/^Basic [A-Za-z0-9+/]+={0,2}$/i.test(header)) return null;
    const text = Buffer.from(header.slice(6), "base64").toString("utf8"), separator = text.indexOf(":");
    if (separator < 1 || /[\x00-\x20\x7f]/.test(text)) return null;
    return { clientId: text.slice(0, separator), clientSecret: text.slice(separator + 1) };
}

export type SsoClientRegistration = { id: string; secretHash: string; redirectUris: string[] };

export type SsoAuthorizationRequest = {
    clientId: string; redirectUri: string; environment: string; state: string;
    codeChallenge: string; codeChallengeMethod: "S256";
};

export type SsoCodeExchange = { clientId: string; clientSecret: string; redirectUri: string; environment: string; code: string; codeVerifier: string };

export type SsoIdentity = {
    issuer: string; audience: string; subject: string; environment: string;
    authoritySessionId: string; expiresAt: number;
};

export type SsoAuthorityOptions = {
    issuer: string;
    sessions: SessionAuth;
    getClient: (clientId: string) => Promise<SsoClientRegistration | null>;
    /** Required on issuance, exchange and introspection: verify the instance owns the environment AND the user is a member. */
    authorize: (session: AuthSession, client: SsoClientRegistration, environment: string) => Promise<boolean>;
    connection?: string;
    collection?: string;
    database?: () => Promise<DocumentDatabase>;
    allowInsecureLocalhost?: boolean;
};

function challenge(verifier: string) { return createHash("sha256").update(verifier).digest("base64url"); }

function verifierValid(value: string) { return typeof value === "string" && /^[A-Za-z0-9._~-]{43,128}$/.test(value); }

function sessionIdValid(value: string) {
    return typeof value === "string" && (/^[a-fA-F0-9]{24}$/.test(value) || /^[0-9]{1,20}$/.test(value)
        || /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(value) || opaqueValid(value));
}

function opaqueValid(value: string) { return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value); }

function redirectAllowed(value: string, allowLocal = false) {
    const url = authUrl(value, allowLocal);
    if (["code", "state", "iss"].some(key => url.searchParams.has(key))) throw new Error("Reserved SSO redirect query parameter.");
    return url;
}

/** First-party, confidential-client SSO code bridge. Not a full OAuth/OIDC provider. */
export class SsoAuthority {
    readonly issuer: string;

    constructor(private readonly options: SsoAuthorityOptions) {
        this.issuer = authUrl(options.issuer, options.allowInsecureLocalhost).href;
        if (typeof options.getClient !== "function" || typeof options.authorize !== "function") throw new Error("SSO client registry and authorization policy are required.");
    }

    private async rows() {
        const db = await (this.options.database ? this.options.database() : DBConnection.getDocumentStore(this.options.connection));
        return db.collection(this.options.collection || "auth_sso_codes");
    }

    private async client(id: string, redirectUri?: string): Promise<SsoClientRegistration | null> {
        authText(id, "client ID");
        const client = await this.options.getClient(id);
        if (!client || client.id !== id || !/^[a-f0-9]{64}$/.test(client.secretHash)) return null;
        if (redirectUri !== undefined) {
            redirectAllowed(redirectUri, this.options.allowInsecureLocalhost);
            if (!client.redirectUris.includes(redirectUri)) return null;
        }
        return client;
    }

    private async authenticatedClient(id: string, secret: string, redirectUri?: string) {
        if (typeof secret !== "string" || secret.length < 32 || secret.length > 512) return null;
        const client = await this.client(id, redirectUri);
        return client && equalAuthToken(client.secretHash, hashAuthToken(secret)) ? client : null;
    }

    /** The caller authenticates the central browser session; its access token never leaves the authority. */
    async authorize(accessToken: string, request: SsoAuthorizationRequest): Promise<string | null> {
        if (!opaqueValid(request.state) || !opaqueValid(request.codeChallenge) || request.codeChallengeMethod !== "S256") return null;
        authText(request.environment, "environment");
        const client = await this.client(request.clientId, request.redirectUri);
        const session = await this.options.sessions.authenticate(accessToken);
        if (!client || !session || !await this.options.authorize(session, client, request.environment)) return null;
        const code = randomAuthToken();
        await (await this.rows()).insertOne({ _id: hashAuthToken(code), issuer: this.issuer,
            audience: client.id, subject: session.subject, environment: request.environment,
            authoritySessionId: session.id, redirectUri: request.redirectUri, challenge: request.codeChallenge,
            expiresAt: Math.min(Date.now() + 60000, session.expiresAt), purgeAt: new Date(Date.now() + 60000), consumedAt: null });
        const redirect = new URL(request.redirectUri);
        redirect.searchParams.set("code", code); redirect.searchParams.set("state", request.state); redirect.searchParams.set("iss", this.issuer);
        return redirect.href;
    }

    /** Server-to-server only; registered client credentials and PKCE are both mandatory. */
    async exchange(request: SsoCodeExchange): Promise<SsoIdentity | null> {
        if (!opaqueValid(request.code) || !verifierValid(request.codeVerifier)) return null;
        authText(request.environment, "environment");
        const client = await this.authenticatedClient(request.clientId, request.clientSecret, request.redirectUri);
        if (!client) return null;
        const rows = await this.rows();
        const filter = { _id: hashAuthToken(request.code), issuer: this.issuer, audience: client.id,
            environment: request.environment, redirectUri: request.redirectUri, challenge: challenge(request.codeVerifier),
            consumedAt: null, expiresAt: { $gt: Date.now() } };
        const candidate = await rows.findOne(filter);
        if (!candidate) return null;
        const session = await this.options.sessions.inspect(candidate.authoritySessionId);
        if (!session || session.subject !== candidate.subject || !await this.options.authorize(session, client, candidate.environment)) return null;
        const claimed = await rows.findOneAndUpdate({ ...filter, expiresAt: { $gt: Date.now() } }, { $set: { consumedAt: Date.now() } }, { returnDocument: "after" });
        if (!claimed || session.expiresAt <= Date.now()) return null;
        return { issuer: this.issuer, audience: client.id, subject: session.subject, environment: claimed.environment,
            authoritySessionId: session.id, expiresAt: session.expiresAt };
    }

    /** Use from instance session policy for central logout/account/membership revocation. */
    async introspect(clientId: string, clientSecret: string, sessionId: string, environment: string): Promise<SsoIdentity | null> {
        authText(environment, "environment");
        const client = await this.authenticatedClient(clientId, clientSecret);
        const session = client ? await this.options.sessions.inspect(sessionId) : null;
        if (!client || !session || !await this.options.authorize(session, client, environment)) return null;
        await this.options.sessions.touch(session);
        return { issuer: this.issuer, audience: client.id, subject: session.subject, environment,
            authoritySessionId: session.id, expiresAt: session.expiresAt };
    }

    async cleanup() { await (await this.rows()).deleteMany({ issuer: this.issuer, expiresAt: { $lte: Date.now() } }); }
}

export type SsoClientOptions = WebAuthOptions & {
    issuer: string;
    clientId: string;
    clientSecret: string;
    authorizationEndpoint: string;
    tokenEndpoint: string;
    introspectionEndpoint: string;
    redirectUri: string;
    connection?: string;
    collection?: string;
    database?: () => Promise<DocumentDatabase>;
};

/** Fixed-endpoint backchannel: no redirects, bounded response size and timeout, normal TLS verification. */
function postBackchannel(url: URL, clientId: string, secret: string, body: object): Promise<any> {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const request = (url.protocol === "https:" ? https : http).request(url, { method: "POST", headers: {
            "Content-Type": "application/json", Accept: "application/json", "Content-Length": Buffer.byteLength(payload),
            Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
        } }, response => {
            const chunks: Buffer[] = []; let length = 0;
            response.on("data", chunk => {
                length += chunk.length;
                if (length > 16384) { response.destroy(); request.destroy(new Error("SSO response too large.")); return; }
                chunks.push(Buffer.from(chunk));
            });
            response.on("error", reject);
            response.on("end", () => {
                if (response.statusCode !== 200) return reject(new Error("SSO backchannel rejected the request."));
                try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(new Error("Invalid SSO response.")); }
            });
        });
        const deadline = setTimeout(() => request.destroy(new Error("SSO backchannel timeout.")), 5000);
        request.on("close", () => clearTimeout(deadline));
        request.on("error", reject);
        request.end(payload);
    });
}

/** Instance-side redirect flow. state + server-held PKCE verifier + host-only browser-binding cookie. */
export class SsoClient {
    readonly cookies: AuthCookies;
    readonly issuer: string;
    private readonly authorization: URL;
    private readonly token: URL;
    private readonly introspection: URL;

    constructor(private readonly options: SsoClientOptions) {
        this.cookies = new AuthCookies(options);
        authText(options.clientId, "client ID");
        if (options.clientId.includes(":")) throw new Error("Client IDs cannot contain a colon.");
        if (typeof options.clientSecret !== "string" || options.clientSecret.length < 32 || options.clientSecret.length > 512 || /[\r\n:]/.test(options.clientSecret)) throw new Error("Use a random SSO client secret with at least 32 characters.");
        this.issuer = authUrl(options.issuer, options.allowInsecureLocalhost).href;
        this.authorization = authUrl(options.authorizationEndpoint, options.allowInsecureLocalhost);
        this.token = authUrl(options.tokenEndpoint, options.allowInsecureLocalhost);
        this.introspection = authUrl(options.introspectionEndpoint, options.allowInsecureLocalhost);
        if ([this.authorization, this.token, this.introspection].some(url => url.origin !== new URL(this.issuer).origin)) throw new Error("SSO endpoints must belong to the configured issuer origin.");
        if (redirectAllowed(options.redirectUri, options.allowInsecureLocalhost).origin !== this.cookies.origin) throw new Error("SSO callback must belong to this instance origin.");
    }

    private async rows() {
        const db = await (this.options.database ? this.options.database() : DBConnection.getDocumentStore(this.options.connection));
        return db.collection(this.options.collection || "auth_sso_transactions");
    }

    async begin(res: Response, environment: string): Promise<string> {
        authText(environment, "environment");
        const state = randomAuthToken(), binding = randomAuthToken(), verifier = randomAuthToken();
        await (await this.rows()).insertOne({ _id: hashAuthToken(state), issuer: this.issuer, clientId: this.options.clientId,
            bindingHash: hashAuthToken(binding), verifier, environment, expiresAt: Date.now() + 300000, purgeAt: new Date(Date.now() + 300000), consumedAt: null });
        this.cookies.write(res, "sso", binding, 300);
        res.header("Referrer-Policy", "no-referrer");
        const url = new URL(this.authorization.href);
        for (const [key, value] of Object.entries({ client_id: this.options.clientId, redirect_uri: this.options.redirectUri,
            environment, state, code_challenge: challenge(verifier), code_challenge_method: "S256", response_type: "code" })) url.searchParams.set(key, value);
        return url.href;
    }

    private identity(value: any, environment: string): SsoIdentity | null {
        if (!value || value.issuer !== this.issuer || value.audience !== this.options.clientId || value.environment !== environment ||
            typeof value.subject !== "string" || !value.subject.length || value.subject.length > 512 ||
            !sessionIdValid(value.authoritySessionId) || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()) return null;
        return { issuer: value.issuer, audience: value.audience, subject: value.subject, environment: value.environment,
            authoritySessionId: value.authoritySessionId, expiresAt: value.expiresAt };
    }

    async complete(req: Request, res: Response): Promise<SsoIdentity | null> {
        res.header("Cache-Control", "no-store"); res.header("Referrer-Policy", "no-referrer");
        const { state, code, iss } = req.query || {};
        const binding = this.cookies.read(req, "sso");
        if (req.method !== "GET" || !opaqueValid(state) || !opaqueValid(code) || iss !== this.issuer || !opaqueValid(binding)) return null;
        const transaction = await (await this.rows()).findOneAndUpdate({ _id: hashAuthToken(state), issuer: this.issuer,
            clientId: this.options.clientId, bindingHash: hashAuthToken(binding), consumedAt: null, expiresAt: { $gt: Date.now() } },
            { $set: { consumedAt: Date.now() } }, { returnDocument: "before" });
        if (!transaction) return null;
        this.cookies.write(res, "sso", "", 0);
        const response = await postBackchannel(this.token, this.options.clientId, this.options.clientSecret, {
            grant_type: "authorization_code", code, code_verifier: transaction.verifier,
            redirect_uri: this.options.redirectUri, environment: transaction.environment,
        });
        return this.identity(response, transaction.environment);
    }

    async introspect(sessionId: string, environment: string): Promise<SsoIdentity | null> {
        if (!sessionIdValid(sessionId)) return null;
        authText(environment, "environment");
        const response = await postBackchannel(this.introspection, this.options.clientId, this.options.clientSecret,
            { session_id: sessionId, environment });
        const identity = this.identity(response, environment);
        return identity?.authoritySessionId === sessionId ? identity : null;
    }

    async cleanup() { await (await this.rows()).deleteMany({ issuer: this.issuer, clientId: this.options.clientId, expiresAt: { $lte: Date.now() } }); }
}
