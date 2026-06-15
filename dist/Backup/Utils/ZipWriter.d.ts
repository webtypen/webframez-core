export declare function createZipFile(zipPath: string, files: Array<{
    source: string;
    name: string;
}>): string;
export declare function createZipFileFromDirectory(zipPath: string, sourceDir: string, options?: {
    driver?: "auto" | "system" | "node";
    compressionLevel?: number;
}): {
    path: string;
    driver: "system";
} | {
    path: string;
    driver: "node";
};
