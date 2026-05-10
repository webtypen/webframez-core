export declare function normalizeBackupPath(value: string): string;
export declare function resolveProjectPath(value: string, projectRoot?: string): string;
export declare function formatBackupFilename(template: string, values: {
    key: string;
    id: string;
    date: Date;
}): string;
export declare function backupTimestampId(date?: Date): string;
