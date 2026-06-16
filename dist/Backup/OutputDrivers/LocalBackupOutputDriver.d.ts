import { BackupArtifact, BackupCleanupEntry, BackupCleanupOptions, BackupCleanupResult, BackupOutputConfig, BackupOutputResult } from "../BackupTypes";
import { BaseBackupOutputDriver, BackupOutputDriverContext } from "./BaseBackupOutputDriver";
type LocalBackupEntry = BackupCleanupEntry & {
    manifestPath?: string;
    payload?: any;
};
export declare class LocalBackupOutputDriver implements BaseBackupOutputDriver {
    private outputPath;
    private targetDir;
    private listDirs;
    write(artifact: BackupArtifact, output: BackupOutputConfig, context: BackupOutputDriverContext): Promise<BackupOutputResult>;
    listArtifacts(output: BackupOutputConfig, context: BackupOutputDriverContext): LocalBackupEntry[];
    list(output: BackupOutputConfig, context: BackupOutputDriverContext): LocalBackupEntry[];
    readManifest(output: BackupOutputConfig, entry: LocalBackupEntry): any;
    downloadArtifact(output: BackupOutputConfig, entry: LocalBackupEntry, targetPath: string): string;
    private protectIncrementalChains;
    cleanup(output: BackupOutputConfig, context: BackupOutputDriverContext, options?: BackupCleanupOptions): Promise<BackupCleanupResult>;
}
export {};
