export declare class DBDriversFacade {
    drivers: {
        [key: string]: any;
    };
    register(name: string, component: any): void;
    get(name: string): any;
}
export declare const DBDrivers: DBDriversFacade;
