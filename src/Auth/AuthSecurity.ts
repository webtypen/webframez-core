import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { Request } from "../Router/Request";

/** Internal primitives shared by session, browser and SSO authentication. */
export function randomAuthToken() { return randomBytes(32).toString("base64url"); }

export function hashAuthToken(value: string) { return createHash("sha256").update(value).digest("hex"); }

export function equalAuthToken(left: unknown, right: unknown): boolean {
    if (typeof left !== "string" || typeof right !== "string" || left.length > 4096 || right.length > 4096) return false;
    const a = Buffer.from(left), b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
}

export function authText(value: unknown, name: string, max = 512): string {
    if (typeof value !== "string" || !value.length || value.length > max || /[\x00-\x20\x7f]/.test(value)) throw new Error(`Invalid ${name}.`);
    return value;
}

export function authLifetime(value: number | undefined, fallback: number): number {
    const result = value === undefined ? fallback : value;
    if (!Number.isSafeInteger(result) || result <= 0) throw new Error("Auth lifetimes must be positive integer seconds.");
    return result;
}

export function authHeader(req: Pick<Request, "headers">, name: string): string {
    const key = Object.keys(req.headers || {}).find(key => key.toLowerCase() === name.toLowerCase());
    const value = key ? req.headers[key] : undefined;
    return typeof value === "string" ? value : "";
}

export function authCookie(req: Pick<Request, "headers">, name: string): string {
    const matches = authHeader(req, "cookie").split(";").map(part => part.trim()).filter(part => part.startsWith(`${name}=`));
    if (matches.length !== 1) return ""; // Reject ambiguous/shadowed cookies.
    try { return decodeURIComponent(matches[0].slice(name.length + 1)); } catch { return ""; }
}

export function authUrl(value: string, allowInsecureLocalhost = false): URL {
    const url = new URL(value);
    const local = allowInsecureLocalhost && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((!local && url.protocol !== "https:") || url.username || url.password || url.hash) throw new Error("Auth URLs require HTTPS and must not contain credentials or fragments.");
    return url;
}
