import { BaseBackupOutputDriver } from "./OutputDrivers/BaseBackupOutputDriver";
import { LocalBackupOutputDriver } from "./OutputDrivers/LocalBackupOutputDriver";

class BackupOutputDriversFacade {
    drivers: { [key: string]: any } = {};

    constructor() {
        this.register("local", LocalBackupOutputDriver);
    }

    register(name: string, driver: any) {
        this.drivers[name] = driver;
        return this;
    }

    get(name: string): BaseBackupOutputDriver {
        const driverClass = this.drivers[name];
        if (!driverClass) {
            throw new Error(`Unknown backup output driver '${name}'.`);
        }
        return new driverClass();
    }

    keys() {
        return Object.keys(this.drivers);
    }
}

export const BackupOutputDrivers = new BackupOutputDriversFacade();
