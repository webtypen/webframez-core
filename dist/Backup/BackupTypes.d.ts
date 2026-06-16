export type BackupRetentionConfig = {
    keepLast?: number;
    maxAgeDays?: number;
    runAfterBackup?: boolean;
};
export type BackupFileSourceConfig = {
    from: string;
    to?: string;
    include?: string[];
    exclude?: string[];
    optional?: boolean;
};
export type BackupIncrementalConfig = {
    enabled?: boolean;
    fullExecutions?: any[];
    checksum?: boolean;
};
export type BackupDatabaseSourceConfig = {
    connection?: string;
    to?: string;
    options?: any;
};
export type BackupOutputConfig = {
    driver: string;
    path?: string;
    groupByDate?: boolean;
    retention?: BackupRetentionConfig;
    [key: string]: any;
};
export type BackupAutomationConfig = {
    worker?: string;
    executions?: any[];
    priority?: number;
    data?: any;
};
export type BackupDefaultsConfig = {
    workDir?: string;
    outputDir?: string;
    filename?: string;
    zip?: boolean;
    zipDriver?: "auto" | "system" | "node";
    zipCompressionLevel?: number;
    cleanupWorkDir?: boolean;
    retention?: BackupRetentionConfig;
    incremental?: BackupIncrementalConfig;
};
export type BackupTypeConfig = BackupDefaultsConfig & {
    is_active?: boolean;
    files?: BackupFileSourceConfig[];
    databases?: BackupDatabaseSourceConfig[];
    outputs?: BackupOutputConfig[];
    automation?: BackupAutomationConfig;
};
export type BackupConfig = {
    defaults?: BackupDefaultsConfig;
    types?: {
        [key: string]: BackupTypeConfig;
    };
};
export type BackupArtifact = {
    path: string;
    filename: string;
    size: number;
    type: "zip" | "directory" | "manifest";
    manifest?: BackupRunManifest;
};
export type BackupOutputResult = {
    driver: string;
    status: "success" | "skipped" | "failed";
    path?: string;
    payload?: any;
    error?: string;
};
export type BackupCleanupEntry = {
    path: string;
    filename: string;
    createdAt: Date;
    size: number;
    reason: string;
    payload?: any;
};
export type BackupFileIndexEntry = {
    path: string;
    size: number;
    mtimeMs?: number;
    checksum?: string;
};
export type BackupRunManifestFileChange = BackupFileIndexEntry & {
    source?: string;
};
export type BackupRunManifest = {
    backupKey: string;
    backupId: string;
    kind: "normal" | "full" | "incremental";
    chainId?: string;
    parentBackupId?: string;
    createdAt: string;
    artifact: string;
    artifactType: "zip" | "directory" | "manifest";
    files: {
        upserted: BackupRunManifestFileChange[];
        deleted: string[];
        fileIndex: {
            [path: string]: BackupFileIndexEntry;
        };
    };
};
export type BackupRestorePoint = BackupCleanupEntry & {
    backupKey: string;
    backupId: string;
    kind: "normal" | "full" | "incremental";
    chainId?: string;
    parentBackupId?: string;
    manifest?: BackupRunManifest | any;
};
export type BackupRestoreResult = {
    backupKey: string;
    backupId?: string;
    targetDir?: string;
    dryRun?: boolean;
    driver?: string;
    restorePoints?: BackupRestorePoint[];
    chain?: BackupRestorePoint[];
    restored?: Array<{
        artifact: string;
        backupId: string;
        kind: string;
    }>;
    deleted?: string[];
};
export type BackupCleanupResult = {
    driver: string;
    status: "success" | "skipped";
    deleted: BackupCleanupEntry[];
    kept: BackupCleanupEntry[];
    dryRun?: boolean;
    message?: string;
};
export type BackupRunResult = {
    key: string;
    id: string;
    kind?: "normal" | "full" | "incremental";
    chainId?: string;
    parentBackupId?: string;
    startedAt: string;
    endedAt: string;
    dryRun: boolean;
    artifact?: BackupArtifact;
    manifestPath?: string;
    outputs: BackupOutputResult[];
    cleanup: BackupCleanupResult[];
    files: Array<{
        from: string;
        to: string;
        size: number;
    }>;
    databases: Array<{
        connection?: string;
        to: string;
        payload?: any;
    }>;
    backupManifest?: BackupRunManifest;
};
export type BackupRunOptions = {
    dryRun?: boolean;
    full?: boolean;
    scheduledAt?: Date | string;
    channels?: string[];
    silent?: boolean;
    logInterval?: number;
    log?: (message: string, payload?: any) => void;
};
export type BackupCleanupOptions = {
    dryRun?: boolean;
    channels?: string[];
};
