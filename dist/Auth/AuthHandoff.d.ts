import type { DocumentDatabase } from "../Database/DatabaseAdapter";
/** Single-use delivery to a separate frontend origin after a server-side SSO callback. */
export declare class AuthHandoff {
    private readonly options;
    private readonly key;
    constructor(options: {
        secret: string;
        audience: string;
        connection?: string;
        database?: () => Promise<DocumentDatabase>;
    });
    private rows;
    create(payload: object): Promise<string>;
    consume<T = unknown>(code: string): Promise<T | null>;
    cleanup(): Promise<void>;
}
