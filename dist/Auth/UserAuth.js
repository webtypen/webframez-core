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
exports.UserAuth = void 0;
const crypto = __importStar(require("crypto"));
const Config_1 = require("../Config");
const DBConnection_1 = require("../Database/DBConnection");
const AUTHENTICATED_PROPERTY = "__webframez_auth_authenticated";
const DEFAULT_AUTH_TOKEN_EXPIRES_IN = "15m";
const DEFAULT_REFRESH_TOKEN_EXPIRES_IN = "30d";
function setAuthState(target, authenticated) {
    Object.defineProperty(target, AUTHENTICATED_PROPERTY, {
        value: authenticated,
        writable: true,
        enumerable: false,
        configurable: true,
    });
}
function readBoolean(value) {
    return typeof value === "boolean" ? value : undefined;
}
function getAuthConfig(modelClass) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v;
    const authConfig = (_a = modelClass.auth) !== null && _a !== void 0 ? _a : {};
    return {
        strategy: (_b = authConfig.strategy) !== null && _b !== void 0 ? _b : "jwt",
        primaryKey: (_c = authConfig.primaryKey) !== null && _c !== void 0 ? _c : "_id",
        jwtSecret: (_d = authConfig.jwtSecret) !== null && _d !== void 0 ? _d : Config_1.Config.get("auth.jwtSecret"),
        authTokenExpiresIn: (_e = authConfig.authTokenExpiresIn) !== null && _e !== void 0 ? _e : DEFAULT_AUTH_TOKEN_EXPIRES_IN,
        refreshTokenExpiresIn: (_f = authConfig.refreshTokenExpiresIn) !== null && _f !== void 0 ? _f : DEFAULT_REFRESH_TOKEN_EXPIRES_IN,
        collection: (_g = authConfig.collection) !== null && _g !== void 0 ? _g : "auth_tokens",
        userKey: (_h = authConfig.userKey) !== null && _h !== void 0 ? _h : "user_id",
        authTokenKey: (_j = authConfig.authTokenKey) !== null && _j !== void 0 ? _j : "auth_token",
        refreshTokenKey: (_k = authConfig.refreshTokenKey) !== null && _k !== void 0 ? _k : "refresh_token",
        authTokenExpiresAtKey: (_l = authConfig.authTokenExpiresAtKey) !== null && _l !== void 0 ? _l : "auth_token_expires_at",
        refreshTokenExpiresAtKey: (_m = authConfig.refreshTokenExpiresAtKey) !== null && _m !== void 0 ? _m : "refresh_token_expires_at",
        authTokenRequest: {
            source: (_p = (_o = authConfig.authTokenRequest) === null || _o === void 0 ? void 0 : _o.source) !== null && _p !== void 0 ? _p : "bearer",
            key: (_r = (_q = authConfig.authTokenRequest) === null || _q === void 0 ? void 0 : _q.key) !== null && _r !== void 0 ? _r : "authorization",
        },
        refreshTokenRequest: {
            source: (_t = (_s = authConfig.refreshTokenRequest) === null || _s === void 0 ? void 0 : _s.source) !== null && _t !== void 0 ? _t : "header",
            key: (_v = (_u = authConfig.refreshTokenRequest) === null || _u === void 0 ? void 0 : _u.key) !== null && _v !== void 0 ? _v : "x-refresh-token",
        },
    };
}
function parseDurationSeconds(value) {
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
function base64UrlEncode(value) {
    return Buffer.from(value)
        .toString("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
}
function base64UrlDecode(value) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return Buffer.from(padded, "base64").toString("utf8");
}
function createSignature(input, secret) {
    return base64UrlEncode(crypto.createHmac("sha256", secret).update(input).digest());
}
function getJwtSecret(config) {
    if (!config.jwtSecret) {
        throw new Error("Missing auth.jwtSecret config for UserAuth JWT strategy.");
    }
    return config.jwtSecret;
}
function createJwtToken(subject, type, expiresIn, secret) {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
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
function verifyJwtToken(token, expectedType, secret) {
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
    let payload;
    try {
        payload = JSON.parse(base64UrlDecode(parts[1]));
    }
    catch (e) {
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
function getHeaderValue(req, key) {
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
function getRequestToken(req, config) {
    var _a, _b;
    const source = (_a = config.source) !== null && _a !== void 0 ? _a : "header";
    const key = (_b = config.key) !== null && _b !== void 0 ? _b : "authorization";
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
function resolvePrimaryKeyValue(modelClass, primaryKey, value) {
    return __awaiter(this, void 0, void 0, function* () {
        if (primaryKey === "_id" && typeof value === "string" && modelClass.objectId) {
            const objectId = yield modelClass.objectId(value, { noExceptions: true });
            return objectId !== null && objectId !== void 0 ? objectId : value;
        }
        return value;
    });
}
function findUserByPrimaryKey(modelClass, config, value) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!modelClass.where) {
            throw new Error("UserAuth requires a model with a static where(...) method.");
        }
        const primaryKeyValue = yield resolvePrimaryKeyValue(modelClass, config.primaryKey, value);
        return yield modelClass.where(config.primaryKey, "=", primaryKeyValue).first();
    });
}
function getUserPrimaryKeyValue(user, config) {
    const value = user ? user[config.primaryKey] : null;
    if (value === undefined || value === null || value === "") {
        throw new Error(`Cannot generate auth token without user primary key "${config.primaryKey}".`);
    }
    return value;
}
function createOpaqueToken() {
    return base64UrlEncode(crypto.randomBytes(48));
}
function getExpiresAt(expiresIn) {
    return new Date(Date.now() + parseDurationSeconds(expiresIn) * 1000);
}
function isExpired(value) {
    if (!value) {
        return true;
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) || date.getTime() <= Date.now();
}
function findAuthRecord(modelClass, config, match) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!modelClass.aggregate) {
            throw new Error("UserAuth collection strategy requires a model with a static aggregate(...) method.");
        }
        const data = yield modelClass.aggregate([{ $match: match }, { $limit: 1 }], undefined, config.collection);
        return data && data[0] ? data[0] : null;
    });
}
function saveCollectionTokens(modelClass, config, user, tokens) {
    return __awaiter(this, void 0, void 0, function* () {
        const model = new modelClass();
        const userId = getUserPrimaryKeyValue(user, config);
        const existingRecord = yield findAuthRecord(modelClass, config, { [config.userKey]: userId });
        const data = {
            [config.userKey]: userId,
            [config.authTokenKey]: tokens.auth_token,
            [config.refreshTokenKey]: tokens.refresh_token,
            [config.authTokenExpiresAtKey]: getExpiresAt(config.authTokenExpiresIn),
            [config.refreshTokenExpiresAtKey]: getExpiresAt(config.refreshTokenExpiresIn),
            updated_at: new Date(),
        };
        if (existingRecord && existingRecord._id) {
            yield DBConnection_1.DBConnection.execute({
                type: "updateOne",
                table: config.collection,
                filter: { _id: existingRecord._id },
                data,
            }, model.__connection);
            return;
        }
        yield DBConnection_1.DBConnection.execute({
            type: "insertOne",
            table: config.collection,
            data: Object.assign(Object.assign({}, data), { created_at: new Date() }),
        }, model.__connection);
    });
}
function generateCollectionTokenPair(modelClass, config, user) {
    return __awaiter(this, void 0, void 0, function* () {
        const tokens = {
            auth_token: createOpaqueToken(),
            refresh_token: createOpaqueToken(),
        };
        yield saveCollectionTokens(modelClass, config, user, tokens);
        return tokens;
    });
}
function getCollectionUserByToken(modelClass, config, token, tokenType) {
    return __awaiter(this, void 0, void 0, function* () {
        const tokenKey = tokenType === "auth" ? config.authTokenKey : config.refreshTokenKey;
        const expiresAtKey = tokenType === "auth" ? config.authTokenExpiresAtKey : config.refreshTokenExpiresAtKey;
        const authRecord = yield findAuthRecord(modelClass, config, { [tokenKey]: token });
        if (!authRecord || isExpired(authRecord[expiresAtKey])) {
            return null;
        }
        return yield findUserByPrimaryKey(modelClass, config, authRecord[config.userKey]);
    });
}
function UserAuth(Base) {
    return class extends Base {
        static refreshAuthTokenByRequest(req) {
            return __awaiter(this, void 0, void 0, function* () {
                const modelClass = this;
                const config = getAuthConfig(modelClass);
                const refreshToken = getRequestToken(req, config.refreshTokenRequest);
                if (!refreshToken) {
                    return null;
                }
                let user = null;
                if (config.strategy === "collection") {
                    user = yield getCollectionUserByToken(modelClass, config, refreshToken, "refresh");
                }
                else {
                    const payload = verifyJwtToken(refreshToken, "refresh", getJwtSecret(config));
                    user = payload ? yield findUserByPrimaryKey(modelClass, config, payload.sub) : null;
                }
                return user ? yield user.generateAuthToken() : null;
            });
        }
        static getUserByRequest(req) {
            return __awaiter(this, void 0, void 0, function* () {
                const modelClass = this;
                const config = getAuthConfig(modelClass);
                const authToken = getRequestToken(req, config.authTokenRequest);
                if (!authToken) {
                    return null;
                }
                return yield this.getUserByAuthToken(authToken);
            });
        }
        static getUserByAuthToken(token) {
            return __awaiter(this, void 0, void 0, function* () {
                const modelClass = this;
                const config = getAuthConfig(modelClass);
                if (!token) {
                    return null;
                }
                if (config.strategy === "collection") {
                    return yield getCollectionUserByToken(modelClass, config, token, "auth");
                }
                const payload = verifyJwtToken(token, "auth", getJwtSecret(config));
                return payload ? yield findUserByPrimaryKey(modelClass, config, payload.sub) : null;
            });
        }
        login() {
            setAuthState(this, true);
            return this;
        }
        logout() {
            setAuthState(this, false);
            return this;
        }
        isAuthenticated() {
            var _a, _b, _c;
            const target = this;
            return ((_c = (_b = (_a = readBoolean(target[AUTHENTICATED_PROPERTY])) !== null && _a !== void 0 ? _a : readBoolean(target.authenticated)) !== null && _b !== void 0 ? _b : readBoolean(target.is_authenticated)) !== null && _c !== void 0 ? _c : false);
        }
        generateAuthToken() {
            return __awaiter(this, void 0, void 0, function* () {
                const modelClass = this.constructor;
                const config = getAuthConfig(modelClass);
                const userPrimaryKeyValue = getUserPrimaryKeyValue(this, config);
                if (config.strategy === "collection") {
                    return yield generateCollectionTokenPair(modelClass, config, this);
                }
                const secret = getJwtSecret(config);
                return {
                    auth_token: createJwtToken(userPrimaryKeyValue, "auth", config.authTokenExpiresIn, secret),
                    refresh_token: createJwtToken(userPrimaryKeyValue, "refresh", config.refreshTokenExpiresIn, secret),
                };
            });
        }
    };
}
exports.UserAuth = UserAuth;
