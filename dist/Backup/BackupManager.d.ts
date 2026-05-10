import { BackupCleanupOptions, BackupCleanupResult, BackupConfig, BackupOutputConfig, BackupRetentionConfig, BackupRunOptions, BackupRunResult, BackupTypeConfig } from "./BackupTypes";
type ResolvedBackupTypeConfig = BackupTypeConfig & {
    workDir: string;
    outputDir: string;
    filename: string;
    zip: boolean;
    cleanupWorkDir: boolean;
    retention?: BackupRetentionConfig;
    outputs: BackupOutputConfig[];
};
export declare class BackupManager {
    getConfig(): BackupConfig;
    listTypes(): {
        key: string;
        config: ResolvedBackupTypeConfig;
    }[];
    resolveType(key: string): ResolvedBackupTypeConfig;
    getAutomationEntries(workerKey?: string): any[];
    private ensureActive;
    private resolveOutputs;
    private collectFilesFromSource;
    private copyFiles;
    private backupDatabase;
    private buildArtifact;
    run(key: string, options?: BackupRunOptions): Promise<BackupRunResult>;
    cleanup(key: string, options?: BackupCleanupOptions): Promise<BackupCleanupResult[]>;
}
export {};
