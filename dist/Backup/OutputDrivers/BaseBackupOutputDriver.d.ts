import { BackupArtifact, BackupCleanupOptions, BackupCleanupResult, BackupCleanupEntry, BackupOutputConfig, BackupOutputResult, BackupRetentionConfig } from "../BackupTypes";
export type BackupOutputDriverContext = {
    backupKey: string;
    backupId: string;
    retention?: BackupRetentionConfig;
    log?: (message: string, payload?: any) => void;
};
export interface BaseBackupOutputDriver {
    write(artifact: BackupArtifact, output: BackupOutputConfig, context: BackupOutputDriverContext): Promise<BackupOutputResult>;
    cleanup(output: BackupOutputConfig, context: BackupOutputDriverContext, options?: BackupCleanupOptions): Promise<BackupCleanupResult>;
    listArtifacts?(output: BackupOutputConfig, context: BackupOutputDriverContext): Promise<BackupCleanupEntry[]> | BackupCleanupEntry[];
    readManifest?(output: BackupOutputConfig, entry: BackupCleanupEntry, context: BackupOutputDriverContext): Promise<any> | any;
    downloadArtifact?(output: BackupOutputConfig, entry: BackupCleanupEntry, targetPath: string, context: BackupOutputDriverContext): Promise<string> | string;
}
