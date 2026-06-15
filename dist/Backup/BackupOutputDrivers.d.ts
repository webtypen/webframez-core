import { BaseBackupOutputDriver } from "./OutputDrivers/BaseBackupOutputDriver";
declare class BackupOutputDriversFacade {
    drivers: {
        [key: string]: any;
    };
    constructor();
    register(name: string, driver: any): this;
    private registerCommands;
    get(name: string): BaseBackupOutputDriver;
    keys(): string[];
}
export declare const BackupOutputDrivers: BackupOutputDriversFacade;
export {};
