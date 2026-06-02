export type WebframezBuildRuntimeFile = string | {
    from: string;
    to?: string;
    optional?: boolean;
};
export type WebframezBuildContext = {
    projectRoot: string;
    stagingDir: string;
    outDir: string;
    config: WebframezAppConfig;
    run: (binaryName: string, args: string[], envAdditions?: Record<string, string>) => Promise<number>;
};
export type WebframezBuildPlugin = {
    name?: string;
    beforeBuild?: (context: WebframezBuildContext) => Promise<void> | void;
    afterTypescriptBuild?: (context: WebframezBuildContext) => Promise<void> | void;
    afterRuntimeFilesCopied?: (context: WebframezBuildContext) => Promise<void> | void;
    buildAssets?: (context: WebframezBuildContext) => Promise<void> | void;
    validateBuild?: (context: WebframezBuildContext) => Promise<void> | void;
};
export type WebframezBuildConfig = {
    dir?: string;
    tsconfig?: string;
    entry?: string;
    runtimeFiles?: WebframezBuildRuntimeFile[];
    prunePaths?: string[];
    plugins?: Array<string | WebframezBuildPlugin | ((config: WebframezAppConfig) => WebframezBuildPlugin)>;
};
export type WebframezAppConfig = {
    setup?: (context: {
        mode: "web" | "console" | "build";
        projectRoot: string;
    }) => Promise<void> | void;
    kernel?: any;
    consoleKernel?: any;
    kernelConsole?: any;
    config?: Record<string, unknown>;
    jobs?: any[];
    modules?: any[];
    datatables?: any;
    errorHandler?: any;
    onEnd?: (...args: any[]) => Promise<void> | void;
    build?: WebframezBuildConfig;
};
type BuildApplicationOptions = {
    outDir: string;
};
export declare class BuildApplication {
    private readonly projectRoot;
    private readonly config;
    private readonly outDir;
    private readonly buildRoot;
    private readonly stagingDir;
    private readonly buildId;
    constructor(projectRoot: string, config: WebframezAppConfig, options: BuildApplicationOptions);
    run(): Promise<void>;
    private logBuildStep;
    private runStep;
    private createContext;
    private callHook;
    private runTypescriptBuild;
    private copyRuntimeFiles;
    private validateCoreBuild;
    private promoteBuild;
    private loadPlugins;
    private discoverPackagePlugins;
    private resolvePlugin;
    private runOrFail;
    private runBinary;
    private resolveBinary;
}
export {};
