import type { DocumentDatabase } from "../Database/DatabaseAdapter";
import { Model } from "../Database/Model";
export type PasswordResetOptions = {
    tokenSeconds?: number;
    cooldownSeconds?: number;
    /** Revoke registered scopes using the same model, only this scope, or leave sessions intact. */
    revokeSessions?: "all" | "scope" | false;
};
export type PasswordResetDelivery = (user: Model, token: string, expiresAt: number) => void | Promise<void>;
/** Framework adapter: the password change and token consumption are one conditional database update. */
export declare class PasswordReset {
    private readonly model;
    private readonly key;
    private readonly fields;
    private readonly options;
    private readonly allowed;
    private readonly invalidate;
    private readonly database?;
    readonly tokenSeconds: number;
    readonly cooldownSeconds: number;
    readonly revokeSessions: "all" | "scope" | false;
    readonly hiddenFields: string[];
    private readonly hashField;
    private readonly expiresField;
    private readonly requestedField;
    constructor(model: typeof Model, key: string, fields: {
        identifier: string;
        password: string;
        primaryKey: string;
        active: string | false;
    }, options: PasswordResetOptions, allowed: (user: Model) => boolean | Promise<boolean>, invalidate: (user: Model, mode: "all" | "scope") => Promise<void>, database?: (() => Promise<DocumentDatabase>) | undefined);
    private rows;
    private digest;
    private userForToken;
    /** No account-existence result is returned. Deliver the raw token only through a trusted server callback. */
    request(identifier: string, deliver: PasswordResetDelivery): Promise<void>;
    /** A non-consuming check for the reset form; reset() always checks again atomically. */
    validate(token: string): Promise<Model | null>;
    reset(token: string, password: string): Promise<Model | null>;
}
