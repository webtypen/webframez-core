import * as crypto from "crypto";
import { Config } from "../Config";
import { DBConnection } from "../Database/DBConnection";
import { Request } from "../Router/Request";
import { Constructor } from "./AuthTypes";

const AUTHENTICATED_PROPERTY = "__webframez_auth_authenticated";
const DEFAULT_AUTH_TOKEN_EXPIRES_IN = "15m";
const DEFAULT_REFRESH_TOKEN_EXPIRES_IN = "30d";

type AuthState = {
    [AUTHENTICATED_PROPERTY]?: boolean;
    authenticated?: boolean;
    is_authenticated?: boolean;
};

type UserAuthStrategy = "jwt" | "collection";
type UserAuthTokenType = "auth" | "refresh";
type UserAuthTokenRequestSource = "bearer" | "header" | "body" | "query";

export type UserAuthTokenPair = {
    auth_token: string;
    refresh_token: string;
};

export type UserAuthRequestTokenConfig = {
    source?: UserAuthTokenRequestSource;
    key?: string;
};

export type UserAuthConfig = {
    strategy?: UserAuthStrategy;
    primaryKey?: string;
    jwtSecret?: string;
    authTokenExpiresIn?: string | number;
    refreshTokenExpiresIn?: string | number;
    collection?: string;
    userKey?: string;
    authTokenKey?: string;
    refreshTokenKey?: string;
    authTokenExpiresAtKey?: string;
    refreshTokenExpiresAtKey?: string;
    authTokenRequest?: UserAuthRequestTokenConfig;
    refreshTokenRequest?: UserAuthRequestTokenConfig;
};

export interface UserAuthConstructorMethods<TUser> {
    auth?: UserAuthConfig;
    refreshAuthTokenByRequest(req: Request): Promise<UserAuthTokenPair | null>;
    getUserByRequest(req: Request): Promise<TUser | null>;
    getUserByAuthToken(token: string): Promise<TUser | null>;
}

export interface UserAuthMethods {
    login(): this;
    logout(): this;
    isAuthenticated(): boolean;
    generateAuthToken(): Promise<UserAuthTokenPair>;
}

type UserAuthModelConstructor = Constructor & {
    auth?: UserAuthConfig;
    where?: (column: any, operator: any, value: any, collection?: string) => any;
    aggregate?: (aggregation: any, options?: any, collection?: string) => Promise<any>;
    objectId?: (val?: any, options?: any) => Promise<any>;
};

type JwtPayload = {
    sub: string;
    type: UserAuthTokenType;
    iat: number;
    exp: number;
    jti: string;
};

function setAuthState(target: AuthState, authenticated: boolean) {
    Object.defineProperty(target, AUTHENTICATED_PROPERTY, {
        value: authenticated,
        writable: true,
        enumerable: false,
        configurable: true,
    });
}

function readBoolean(value: unknown) {
    return typeof value === "boolean" ? value : undefined;
}

function getAuthConfig(modelClass: UserAuthModelConstructor): Required<UserAuthConfig> {
    const authConfig = modelClass.auth ?? {};

    return {
        strategy: authConfig.strategy ?? "jwt",
        primaryKey: authConfig.primaryKey ?? "_id",
        jwtSecret: authConfig.jwtSecret ?? Config.get("auth.jwtSecret"),
        authTokenExpiresIn: authConfig.authTokenExpiresIn ?? DEFAULT_AUTH_TOKEN_EXPIRES_IN,
        refreshTokenExpiresIn: authConfig.refreshTokenExpiresIn ?? DEFAULT_REFRESH_TOKEN_EXPIRES_IN,
        collection: authConfig.collection ?? "auth_tokens",
        userKey: authConfig.userKey ?? "user_id",
        authTokenKey: authConfig.authTokenKey ?? "auth_token",
        refreshTokenKey: authConfig.refreshTokenKey ?? "refresh_token",
        authTokenExpiresAtKey: authConfig.authTokenExpiresAtKey ?? "auth_token_expires_at",
        refreshTokenExpiresAtKey: authConfig.refreshTokenExpiresAtKey ?? "refresh_token_expires_at",
        authTokenRequest: {
            source: authConfig.authTokenRequest?.source ?? "bearer",
            key: authConfig.authTokenRequest?.key ?? "authorization",
        },
        refreshTokenRequest: {
            source: authConfig.refreshTokenRequest?.source ?? "header",
            key: authConfig.refreshTokenRequest?.key ?? "x-refresh-token",
        },
    };
}

function parseDurationSeconds(value: string | number) {
    if (typeof value === "number") {
        return value;
    }

    const match = value.match(/^(\d+)(s|m|h|d)$/);
    if (!match) {
        throw new Error(`Invalid auth token duration "${value}".`);
    }

    const amount = parseInt(match[1], 10);
    const unit = match[2];

    if (unit === "s") {
        return amount;
    }
    if (unit === "m") {
        return amount * 60;
    }
    if (unit === "h") {
        return amount * 60 * 60;
    }
    return amount * 60 * 60 * 24;
}

function base64UrlEncode(value: string | Buffer) {
    return Buffer.from(value)
        .toString("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
}

function base64UrlDecode(value: string) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return Buffer.from(padded, "base64").toString("utf8");
}

function createSignature(input: string, secret: string) {
    return base64UrlEncode(crypto.createHmac("sha256", secret).update(input).digest());
}

function getJwtSecret(config: Required<UserAuthConfig>) {
    if (!config.jwtSecret) {
        throw new Error("Missing auth.jwtSecret config for UserAuth JWT strategy.");
    }

    return config.jwtSecret;
}

function createJwtToken(subject: unknown, type: UserAuthTokenType, expiresIn: string | number, secret: string) {
    const now = Math.floor(Date.now() / 1000);
    const payload: JwtPayload = {
        sub: String(subject),
        type,
        iat: now,
        exp: now + parseDurationSeconds(expiresIn),
        jti: crypto.randomBytes(16).toString("hex"),
    };
    const header = {
        alg: "HS256",
        typ: "JWT",
    };
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    return `${signingInput}.${createSignature(signingInput, secret)}`;
}

function verifyJwtToken(token: string, expectedType: UserAuthTokenType, secret: string): JwtPayload | null {
    const parts = token.split(".");
    if (parts.length !== 3) {
        return null;
    }

    const signingInput = `${parts[0]}.${parts[1]}`;
    const expectedSignature = createSignature(signingInput, secret);
    const tokenSignature = parts[2];
    const expectedBuffer = Buffer.from(expectedSignature);
    const tokenBuffer = Buffer.from(tokenSignature);

    if (expectedBuffer.length !== tokenBuffer.length || !crypto.timingSafeEqual(expectedBuffer, tokenBuffer)) {
        return null;
    }

    let payload: JwtPayload;
    try {
        payload = JSON.parse(base64UrlDecode(parts[1]));
    } catch (e) {
        return null;
    }

    if (!payload || payload.type !== expectedType || !payload.sub || !payload.exp) {
        return null;
    }

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
        return null;
    }

    return payload;
}

function getHeaderValue(req: Request, key: string) {
    if (!req.headers) {
        return null;
    }

    const lowerKey = key.toLowerCase();
    const foundKey = Object.keys(req.headers).find((headerKey) => headerKey.toLowerCase() === lowerKey);
    const value = foundKey ? req.headers[foundKey] : null;

    if (Array.isArray(value)) {
        return value[0] ? String(value[0]) : null;
    }

    return value ? String(value) : null;
}

function getRequestToken(req: Request, config: UserAuthRequestTokenConfig) {
    const source = config.source ?? "header";
    const key = config.key ?? "authorization";

    if (source === "bearer") {
        const headerValue = getHeaderValue(req, key);
        const match = headerValue ? headerValue.match(/^Bearer\s+(.+)$/i) : null;
        return match && match[1] ? match[1].trim() : null;
    }

    if (source === "header") {
        return getHeaderValue(req, key);
    }

    if (source === "body") {
        return req.body && req.body[key] ? String(req.body[key]) : null;
    }

    return req.query && req.query[key] ? String(req.query[key]) : null;
}

async function resolvePrimaryKeyValue(modelClass: UserAuthModelConstructor, primaryKey: string, value: any) {
    if (primaryKey === "_id" && typeof value === "string" && modelClass.objectId) {
        const objectId = await modelClass.objectId(value, { noExceptions: true });
        return objectId ?? value;
    }

    return value;
}

async function findUserByPrimaryKey<TUser>(
    modelClass: UserAuthModelConstructor,
    config: Required<UserAuthConfig>,
    value: any
): Promise<TUser | null> {
    if (!modelClass.where) {
        throw new Error("UserAuth requires a model with a static where(...) method.");
    }

    const primaryKeyValue = await resolvePrimaryKeyValue(modelClass, config.primaryKey, value);
    return await modelClass.where(config.primaryKey, "=", primaryKeyValue).first();
}

function getUserPrimaryKeyValue(user: any, config: Required<UserAuthConfig>) {
    const value = user ? user[config.primaryKey] : null;
    if (value === undefined || value === null || value === "") {
        throw new Error(`Cannot generate auth token without user primary key "${config.primaryKey}".`);
    }

    return value;
}

function createOpaqueToken() {
    return base64UrlEncode(crypto.randomBytes(48));
}

function getExpiresAt(expiresIn: string | number) {
    return new Date(Date.now() + parseDurationSeconds(expiresIn) * 1000);
}

function isExpired(value: unknown) {
    if (!value) {
        return true;
    }

    const date = value instanceof Date ? value : new Date(value as any);
    return Number.isNaN(date.getTime()) || date.getTime() <= Date.now();
}

async function findAuthRecord(modelClass: UserAuthModelConstructor, config: Required<UserAuthConfig>, match: any) {
    if (!modelClass.aggregate) {
        throw new Error("UserAuth collection strategy requires a model with a static aggregate(...) method.");
    }

    const data = await modelClass.aggregate([{ $match: match }, { $limit: 1 }], undefined, config.collection);
    return data && data[0] ? data[0] : null;
}

async function saveCollectionTokens(
    modelClass: UserAuthModelConstructor,
    config: Required<UserAuthConfig>,
    user: any,
    tokens: UserAuthTokenPair
) {
    const model = new modelClass() as any;
    const userId = getUserPrimaryKeyValue(user, config);
    const existingRecord = await findAuthRecord(modelClass, config, { [config.userKey]: userId });
    const data = {
        [config.userKey]: userId,
        [config.authTokenKey]: tokens.auth_token,
        [config.refreshTokenKey]: tokens.refresh_token,
        [config.authTokenExpiresAtKey]: getExpiresAt(config.authTokenExpiresIn),
        [config.refreshTokenExpiresAtKey]: getExpiresAt(config.refreshTokenExpiresIn),
        updated_at: new Date(),
    };

    if (existingRecord && existingRecord._id) {
        await DBConnection.execute(
            {
                type: "updateOne",
                table: config.collection,
                filter: { _id: existingRecord._id },
                data,
            },
            model.__connection
        );
        return;
    }

    await DBConnection.execute(
        {
            type: "insertOne",
            table: config.collection,
            data: {
                ...data,
                created_at: new Date(),
            },
        },
        model.__connection
    );
}

async function generateCollectionTokenPair(
    modelClass: UserAuthModelConstructor,
    config: Required<UserAuthConfig>,
    user: any
) {
    const tokens = {
        auth_token: createOpaqueToken(),
        refresh_token: createOpaqueToken(),
    };

    await saveCollectionTokens(modelClass, config, user, tokens);
    return tokens;
}

async function getCollectionUserByToken<TUser>(
    modelClass: UserAuthModelConstructor,
    config: Required<UserAuthConfig>,
    token: string,
    tokenType: UserAuthTokenType
) {
    const tokenKey = tokenType === "auth" ? config.authTokenKey : config.refreshTokenKey;
    const expiresAtKey = tokenType === "auth" ? config.authTokenExpiresAtKey : config.refreshTokenExpiresAtKey;
    const authRecord = await findAuthRecord(modelClass, config, { [tokenKey]: token });

    if (!authRecord || isExpired(authRecord[expiresAtKey])) {
        return null;
    }

    return await findUserByPrimaryKey<TUser>(modelClass, config, authRecord[config.userKey]);
}

export function UserAuth<TBase extends Constructor>(Base: TBase) {
    return class extends Base implements UserAuthMethods {
        static async refreshAuthTokenByRequest(req: Request) {
            const modelClass = this as UserAuthModelConstructor;
            const config = getAuthConfig(modelClass);
            const refreshToken = getRequestToken(req, config.refreshTokenRequest);

            if (!refreshToken) {
                return null;
            }

            let user: any = null;
            if (config.strategy === "collection") {
                user = await getCollectionUserByToken(modelClass, config, refreshToken, "refresh");
            } else {
                const payload = verifyJwtToken(refreshToken, "refresh", getJwtSecret(config));
                user = payload ? await findUserByPrimaryKey(modelClass, config, payload.sub) : null;
            }

            return user ? await user.generateAuthToken() : null;
        }

        static async getUserByRequest(req: Request) {
            const modelClass = this as UserAuthModelConstructor;
            const config = getAuthConfig(modelClass);
            const authToken = getRequestToken(req, config.authTokenRequest);

            if (!authToken) {
                return null;
            }

            return await this.getUserByAuthToken(authToken);
        }

        static async getUserByAuthToken(token: string) {
            const modelClass = this as UserAuthModelConstructor;
            const config = getAuthConfig(modelClass);

            if (!token) {
                return null;
            }

            if (config.strategy === "collection") {
                return await getCollectionUserByToken(modelClass, config, token, "auth");
            }

            const payload = verifyJwtToken(token, "auth", getJwtSecret(config));
            return payload ? await findUserByPrimaryKey(modelClass, config, payload.sub) : null;
        }

        login() {
            setAuthState(this as AuthState, true);
            return this;
        }

        logout() {
            setAuthState(this as AuthState, false);
            return this;
        }

        isAuthenticated() {
            const target = this as AuthState;

            return (
                readBoolean(target[AUTHENTICATED_PROPERTY]) ??
                readBoolean(target.authenticated) ??
                readBoolean(target.is_authenticated) ??
                false
            );
        }

        async generateAuthToken() {
            const modelClass = this.constructor as UserAuthModelConstructor;
            const config = getAuthConfig(modelClass);
            const userPrimaryKeyValue = getUserPrimaryKeyValue(this, config);

            if (config.strategy === "collection") {
                return await generateCollectionTokenPair(modelClass, config, this);
            }

            const secret = getJwtSecret(config);

            return {
                auth_token: createJwtToken(userPrimaryKeyValue, "auth", config.authTokenExpiresIn, secret),
                refresh_token: createJwtToken(userPrimaryKeyValue, "refresh", config.refreshTokenExpiresIn, secret),
            };
        }
    };
}
