import { hash } from "bcryptjs";
import { DBConnection } from "../Database/DBConnection";
import type { DocumentDatabase } from "../Database/DatabaseAdapter";
import { Model } from "../Database/Model";
import { authLifetime, hashAuthToken, randomAuthToken } from "./AuthSecurity";

export type PasswordResetOptions = {
    tokenSeconds?: number;
    cooldownSeconds?: number;
    /** Revoke registered scopes using the same model, only this scope, or leave sessions intact. */
    revokeSessions?: "all" | "scope" | false;
};

export type PasswordResetDelivery = (user: Model, token: string, expiresAt: number) => void | Promise<void>;

/** Framework adapter: the password change and token consumption are one conditional database update. */
export class PasswordReset {
    readonly tokenSeconds: number;
    readonly cooldownSeconds: number;
    readonly revokeSessions: "all" | "scope" | false;
    readonly hiddenFields: string[];
    private readonly hashField: string;
    private readonly expiresField: string;
    private readonly requestedField: string;

    constructor(private readonly model: typeof Model, private readonly key: string,
        private readonly fields: { identifier: string; password: string; primaryKey: string; active: string | false },
        private readonly options: PasswordResetOptions,
        private readonly allowed: (user: Model) => boolean | Promise<boolean>,
        private readonly invalidate: (user: Model, mode: "all" | "scope") => Promise<void>,
        private readonly database?: () => Promise<DocumentDatabase>) {
        this.tokenSeconds = authLifetime(options.tokenSeconds, 15 * 60);
        this.cooldownSeconds = authLifetime(options.cooldownSeconds, 3 * 60);
        this.revokeSessions = options.revokeSessions ?? "all";
        if (!["all", "scope", false].includes(this.revokeSessions)) throw new Error("Invalid password reset session policy.");
        const prefix = `auth_reset_${key}_`;
        this.hashField = prefix + "hash";
        this.expiresField = prefix + "expires_at";
        this.requestedField = prefix + "requested_at";
        this.hiddenFields = [this.hashField, this.expiresField, this.requestedField];
    }

    private async rows() {
        const instance = new this.model();
        const db = await (this.database ? this.database() : DBConnection.getDocumentStore(instance.__connection));
        return db.collection(instance.__table);
    }

    private digest(token: string, user: Model): string {
        // Bind reset tokens to the scope and current password: a later password change invalidates them.
        return hashAuthToken(`${this.key}\0${token}\0${(user as any)[this.fields.password]}`);
    }

    private async userForToken(token: string): Promise<Model | null> {
        if (typeof token !== "string" || !/^[A-Za-z0-9_-]{1,128}\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
        const subject = token.split(".")[0];
        const id = this.fields.primaryKey === "_id" ? await this.model.objectId(subject, { noExceptions: true }) : subject;
        if (id == null) return null;
        const user = await this.model.where(this.fields.primaryKey, "=", id).first();
        if (!user || typeof (user as any)[this.fields.password] !== "string" || !await this.allowed(user)) return null;
        return user;
    }

    /** No account-existence result is returned. Deliver the raw token only through a trusted server callback. */
    async request(identifier: string, deliver: PasswordResetDelivery): Promise<void> {
        if (typeof identifier !== "string" || !identifier.trim() || identifier.length > 320) return;
        const user = await this.model.where(this.fields.identifier, "=", identifier.trim().toLowerCase()).first();
        if (!user || typeof (user as any)[this.fields.password] !== "string" || !await this.allowed(user)) return;
        const now = Date.now(), expiresAt = now + this.tokenSeconds * 1000;
        const token = `${(user as any)[this.fields.primaryKey]}.${randomAuthToken()}`;
        const filter = { [this.fields.primaryKey]: (user as any)[this.fields.primaryKey],
            [this.fields.password]: (user as any)[this.fields.password],
            $or: [{ [this.requestedField]: { $exists: false } }, { [this.requestedField]: { $lte: now - this.cooldownSeconds * 1000 } }] };
        const updated = await (await this.rows()).findOneAndUpdate(filter,
            { $set: { [this.hashField]: this.digest(token, user), [this.expiresField]: expiresAt, [this.requestedField]: now } }, { returnDocument: "after" });
        if (updated) await deliver(user, token, expiresAt);
    }

    /** A non-consuming check for the reset form; reset() always checks again atomically. */
    async validate(token: string): Promise<Model | null> {
        const user = await this.userForToken(token);
        if (!user) return null;
        const row = await (await this.rows()).findOne({ [this.fields.primaryKey]: (user as any)[this.fields.primaryKey],
            [this.fields.password]: (user as any)[this.fields.password], [this.hashField]: this.digest(token, user), [this.expiresField]: { $gt: Date.now() } });
        return row ? user : null;
    }

    async reset(token: string, password: string): Promise<Model | null> {
        if (typeof password !== "string" || !password || password.length > 1024) throw new Error("Invalid password.");
        const user = await this.validate(token);
        if (!user) return null;
        const stored = (user as any)[this.fields.password];
        const nextPassword = await hash(password, 12);
        const row = await (await this.rows()).findOneAndUpdate({ [this.fields.primaryKey]: (user as any)[this.fields.primaryKey],
            [this.fields.password]: stored, [this.hashField]: this.digest(token, user), [this.expiresField]: { $gt: Date.now() },
            ...(this.fields.active === false ? {} : { [this.fields.active]: { $ne: false } }) },
            { $set: { [this.fields.password]: nextPassword }, $unset: { [this.hashField]: "", [this.expiresField]: "" } }, { returnDocument: "after" });
        if (!row) return null;
        (user as any)[this.fields.password] = nextPassword;
        if (this.revokeSessions !== false) await this.invalidate(user, this.revokeSessions);
        return user;
    }
}
