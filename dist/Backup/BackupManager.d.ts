import { BackupCleanupOptions, BackupCleanupResult, BackupConfig, BackupOutputConfig, BackupRetentionConfig, BackupRestorePoint, BackupRestoreResult, BackupRunOptions, BackupRunResult, BackupTypeConfig } from "./BackupTypes";
type ResolvedBackupTypeConfig = BackupTypeConfig & {
    workDir: string;
    outputDir: string;
    filename: string;
    zip: boolean;
    zipDriver: "auto" | "system" | "node";
    zipCompressionLevel?: number;
    cleanupWorkDir: boolean;
    retention?: BackupRetentionConfig;
    outputs: BackupOutputConfig[];
};
export declare class BackupManager {
    private log;
    private logInterval;
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
    private buildFileIndex;
    private fileIndexChanged;
    private incrementalEnabled;
    private assertIncrementalSupported;
    private chooseOutputForRead;
    private listRestorePointsForOutput;
    listRestorePoints(key: string, options?: {
        channels?: string[];
    }): Promise<BackupRestorePoint[]>;
    private isFullIncrementalRun;
    private buildBackupManifest;
    private writeContentManifest;
    private backupDatabase;
    private buildArtifact;
    run(key: string, options?: BackupRunOptions): Promise<BackupRunResult>;
    private downloadRestoreArtifact;
    private restoreChain;
    private extractArtifact;
    restore(key: string, targetDir: string | undefined, options?: {
        backupId?: string;
        channels?: string[];
        dryRun?: boolean;
    }): Promise<BackupRestoreResult>;
    cleanup(key: string, options?: BackupCleanupOptions): Promise<BackupCleanupResult[]>;
}
export {};
