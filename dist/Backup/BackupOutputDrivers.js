"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackupOutputDrivers = void 0;
const LocalBackupOutputDriver_1 = require("./OutputDrivers/LocalBackupOutputDriver");
const SystemCommands_1 = require("../Commands/SystemCommands");
class BackupOutputDriversFacade {
    constructor() {
        this.drivers = {};
        this.register("local", LocalBackupOutputDriver_1.LocalBackupOutputDriver);
    }
    register(name, driver) {
        this.drivers[name] = driver;
        this.registerCommands(driver);
        return this;
    }
    registerCommands(driver) {
        const commands = (driver === null || driver === void 0 ? void 0 : driver.commands) || (driver === null || driver === void 0 ? void 0 : driver.consoleCommands);
        if (!commands) {
            return;
        }
        SystemCommands_1.SystemCommands.register(commands);
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
