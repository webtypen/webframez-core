"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackupOutputDrivers = void 0;
const LocalBackupOutputDriver_1 = require("./OutputDrivers/LocalBackupOutputDriver");
class BackupOutputDriversFacade {
    constructor() {
        this.drivers = {};
        this.register("local", LocalBackupOutputDriver_1.LocalBackupOutputDriver);
    }
    register(name, driver) {
        this.drivers[name] = driver;
        return this;
    }
    get(name) {
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
exports.BackupOutputDrivers = new BackupOutputDriversFacade();
