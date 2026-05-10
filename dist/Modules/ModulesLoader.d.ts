export declare class ModulesLoader {
    private loadedModules;
    load(modules: any[], context?: any): void;
    getLoadedModules(): {
        [key: string]: any;
    };
    getLoadedModuleInstances(): any[];
    getCommands(): any[];
    initRoutes(): void;
    loadKernel(kernel: any): void;
}
