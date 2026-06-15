import {
    BackupArtifact,
    BackupCleanupOptions,
    BackupCleanupResult,
    BackupOutputConfig,
    BackupOutputResult,
    BackupRetentionConfig,
} from "../BackupTypes";

export type BackupOutputDriverContext = {
    backupKey: string;
    backupId: string;
    retention?: BackupRetentionConfig;
    log?: (message: string, payload?: any) => void;
};

export interface BaseBackupOutputDriver {
    write(
        artifact: BackupArtifact,
        output: BackupOutputConfig,
        context: BackupOutputDriverContext,
    ): Promise<BackupOutputResult>;
    cleanup(
        output: BackupOutputConfig,
        context: BackupOutputDriverContext,
        options?: BackupCleanupOptions,
    ): Promise<BackupCleanupResult>;
}
