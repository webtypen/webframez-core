import { BaseBackupOutputDriver } from "./OutputDrivers/BaseBackupOutputDriver";
import { LocalBackupOutputDriver } from "./OutputDrivers/LocalBackupOutputDriver";
import { SystemCommands } from "../Commands/SystemCommands";

class BackupOutputDriversFacade {
    drivers: { [key: string]: any } = {};

    constructor() {
        this.register("local", LocalBackupOutputDriver);
    }

    register(name: string, driver: any) {
        this.drivers[name] = driver;
        this.registerCommands(driver);
        return this;
    }

    private registerCommands(driver: any) {
        const commands = driver?.commands || driver?.consoleCommands;
        if (!commands) {
            return;
        }

        SystemCommands.register(commands);
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
