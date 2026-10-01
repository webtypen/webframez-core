"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authUrl = exports.authCookie = exports.authHeader = exports.authLifetime = exports.authText = exports.equalAuthToken = exports.hashAuthToken = exports.randomAuthToken = void 0;
const crypto_1 = require("crypto");
/** Internal primitives shared by session, browser and SSO authentication. */
function randomAuthToken() { return (0, crypto_1.randomBytes)(32).toString("base64url"); }
exports.randomAuthToken = randomAuthToken;
function hashAuthToken(value) { return (0, crypto_1.createHash)("sha256").update(value).digest("hex"); }
exports.hashAuthToken = hashAuthToken;
function equalAuthToken(left, right) {
    if (typeof left !== "string" || typeof right !== "string" || left.length > 4096 || right.length > 4096)
        return false;
    const a = Buffer.from(left), b = Buffer.from(right);
    return a.length === b.length && (0, crypto_1.timingSafeEqual)(a, b);
}
exports.equalAuthToken = equalAuthToken;
function authText(value, name, max = 512) {
    if (typeof value !== "string" || !value.length || value.length > max || /[\x00-\x20\x7f]/.test(value))
        throw new Error(`Invalid ${name}.`);
    return value;
}
exports.authText = authText;
function authLifetime(value, fallback) {
    const result = value === undefined ? fallback : value;
    if (!Number.isSafeInteger(result) || result <= 0)
        throw new Error("Auth lifetimes must be positive integer seconds.");
    return result;
}
exports.authLifetime = authLifetime;
function authHeader(req, name) {
    const key = Object.keys(req.headers || {}).find(key => key.toLowerCase() === name.toLowerCase());
    const value = key ? req.headers[key] : undefined;
    return typeof value === "string" ? value : "";
}
exports.authHeader = authHeader;
function authCookie(req, name) {
    const matches = authHeader(req, "cookie").split(";").map(part => part.trim()).filter(part => part.startsWith(`${name}=`));
    if (matches.length !== 1)
        return ""; // Reject ambiguous/shadowed cookies.
    try {
        return decodeURIComponent(matches[0].slice(name.length + 1));
    }
    catch (_a) {
        return "";
    }
}
exports.authCookie = authCookie;
function authUrl(value, allowInsecureLocalhost = false) {
    const url = new URL(value);
    const local = allowInsecureLocalhost && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((!local && url.protocol !== "https:") || url.username || url.password || url.hash)
        throw new Error("Auth URLs require HTTPS and must not contain credentials or fragments.");
    return url;
}
exports.authUrl = authUrl;
