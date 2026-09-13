export declare function normalizeBasename(value?: string | null): string;
export declare function getBasename(): string;
/** Prefix application-absolute URLs once; preserve external and relative URLs. */
export declare function appPath(value: string, basename?: string): string;
export declare function appRelativePath(value: string, basename?: string): string;
