import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { DBConnection } from "../Database/DBConnection";
import type { DocumentDatabase } from "../Database/DatabaseAdapter";
import { hashAuthToken, randomAuthToken } from "./AuthSecurity";

/** Single-use delivery to a separate frontend origin after a server-side SSO callback. */
export class AuthHandoff {
    private readonly key: Buffer;

    constructor(private readonly options: { secret: string; audience: string; connection?: string; database?: () => Promise<DocumentDatabase> }) {
        if (typeof options.secret !== "string" || options.secret.length < 32) throw new Error("Auth handoff requires a strong server secret.");
        if (!options.audience) throw new Error("Auth handoff requires an audience.");
        this.key = createHash("sha256").update(`webframez-handoff:${options.secret}`).digest();
    }

    private async rows() {
        const db = await (this.options.database ? this.options.database() : DBConnection.getDocumentStore(this.options.connection));
        return db.collection("auth_handoffs");
    }

    async create(payload: object): Promise<string> {
        const code = randomAuthToken(), iv = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", this.key, iv);
        cipher.setAAD(Buffer.from(this.options.audience));
        const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
        await (await this.rows()).insertOne({ _id: hashAuthToken(code), audience: this.options.audience,
            iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), payload: encrypted.toString("base64"),
            expiresAt: Date.now() + 30000, purgeAt: new Date(Date.now() + 60000), consumedAt: null });
        return code;
    }

    async consume<T = unknown>(code: string): Promise<T | null> {
        if (typeof code !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(code)) return null;
        const row = await (await this.rows()).findOneAndUpdate({ _id: hashAuthToken(code), audience: this.options.audience,
            expiresAt: { $gt: Date.now() }, consumedAt: null }, { $set: { consumedAt: Date.now(), payload: "" } }, { returnDocument: "before" });
        if (!row) return null;
        const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(row.iv, "base64"));
        decipher.setAAD(Buffer.from(this.options.audience));
        decipher.setAuthTag(Buffer.from(row.tag, "base64"));
        return JSON.parse(Buffer.concat([decipher.update(Buffer.from(row.payload, "base64")), decipher.final()]).toString("utf8"));
    }

    async cleanup(): Promise<void> {
        await (await this.rows()).deleteMany({ audience: this.options.audience, expiresAt: { $lte: Date.now() } });
    }
}
