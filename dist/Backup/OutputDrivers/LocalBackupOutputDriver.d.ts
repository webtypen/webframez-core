import { BackupArtifact, BackupCleanupEntry, BackupCleanupOptions, BackupCleanupResult, BackupOutputConfig, BackupOutputResult } from "../BackupTypes";
import { BaseBackupOutputDriver, BackupOutputDriverContext } from "./BaseBackupOutputDriver";
type LocalBackupEntry = BackupCleanupEntry & {
    manifestPath?: string;
};
export declare class LocalBackupOutputDriver implements BaseBackupOutputDriver {
    private outputPath;
    write(artifact: BackupArtifact, output: BackupOutputConfig, context: BackupOutputDriverContext): Promise<BackupOutputResult>;
    list(output: BackupOutputConfig, context: BackupOutputDriverContext): LocalBackupEntry[];
    cleanup(output: BackupOutputConfig, context: BackupOutputDriverContext, options?: BackupCleanupOptions): Promise<BackupCleanupResult>;
}
export {};
