export declare class ModuleProvider {
    static key: string;
    controller: {
        [key: string]: any;
    };
    middleware: {
        [key: string]: any;
    };
    boot(): void;
    routes(): void;
    bootByRouter(): void;
}
