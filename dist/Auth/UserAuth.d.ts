import { Request } from "../Router/Request";
import { Constructor } from "./AuthTypes";
type UserAuthStrategy = "jwt" | "collection";
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
export declare function UserAuth<TBase extends Constructor>(Base: TBase): {
    new (...args: any[]): {
        login(): any;
        logout(): any;
        isAuthenticated(): boolean;
        generateAuthToken(): Promise<{
            auth_token: string;
            refresh_token: string;
        }>;
    };
    refreshAuthTokenByRequest(req: Request): Promise<any>;
    getUserByRequest(req: Request): Promise<unknown>;
    getUserByAuthToken(token: string): Promise<unknown>;
} & TBase;
export {};
