import type { DocumentDatabase } from "../Database/DatabaseAdapter";
import type { Request } from "../Router/Request";
import type { Response } from "../Router/Response";
import { AuthSession, SessionAuth } from "./SessionAuth";
import { AuthCookies, WebAuthOptions } from "./WebAuth";
/** Generate once during trusted instance provisioning; store only secretHash at the authority. */
export declare function createSsoClientCredentials(): {
    id: string;
    secret: string;
    secretHash: string;
};
export declare function readSsoClientCredentials(req: Request): {
    clientId: string;
    clientSecret: string;
} | null;
export type SsoClientRegistration = {
    id: string;
    secretHash: string;
    redirectUris: string[];
};
export type SsoAuthorizationRequest = {
    clientId: string;
    redirectUri: string;
    environment: string;
    state: string;
    codeChallenge: string;
    codeChallengeMethod: "S256";
};
export type SsoCodeExchange = {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    environment: string;
    code: string;
    codeVerifier: string;
};
export type SsoIdentity = {
    issuer: string;
    audience: string;
    subject: string;
    environment: string;
    authoritySessionId: string;
    expiresAt: number;
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
/** First-party, confidential-client SSO code bridge. Not a full OAuth/OIDC provider. */
export declare class SsoAuthority {
    private readonly options;
    readonly issuer: string;
    constructor(options: SsoAuthorityOptions);
    private rows;
    private client;
    private authenticatedClient;
    /** The caller authenticates the central browser session; its access token never leaves the authority. */
    authorize(accessToken: string, request: SsoAuthorizationRequest): Promise<string | null>;
    /** Server-to-server only; registered client credentials and PKCE are both mandatory. */
    exchange(request: SsoCodeExchange): Promise<SsoIdentity | null>;
    /** Use from instance session policy for central logout/account/membership revocation. */
    introspect(clientId: string, clientSecret: string, sessionId: string, environment: string): Promise<SsoIdentity | null>;
    cleanup(): Promise<void>;
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
/** Instance-side redirect flow. state + server-held PKCE verifier + host-only browser-binding cookie. */
export declare class SsoClient {
    private readonly options;
    readonly cookies: AuthCookies;
    readonly issuer: string;
    private readonly authorization;
    private readonly token;
    private readonly introspection;
    constructor(options: SsoClientOptions);
    private rows;
    begin(res: Response, environment: string): Promise<string>;
    private identity;
    complete(req: Request, res: Response): Promise<SsoIdentity | null>;
    introspect(sessionId: string, environment: string): Promise<SsoIdentity | null>;
    cleanup(): Promise<void>;
}
