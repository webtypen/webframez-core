/// <reference types="node" />
import type { Request } from "../Router/Request";
/** Internal primitives shared by session, browser and SSO authentication. */
export declare function randomAuthToken(): string;
export declare function hashAuthToken(value: string): string;
export declare function equalAuthToken(left: unknown, right: unknown): boolean;
export declare function authText(value: unknown, name: string, max?: number): string;
export declare function authLifetime(value: number | undefined, fallback: number): number;
export declare function authHeader(req: Pick<Request, "headers">, name: string): string;
export declare function authCookie(req: Pick<Request, "headers">, name: string): string;
export declare function authUrl(value: string, allowInsecureLocalhost?: boolean): URL;
