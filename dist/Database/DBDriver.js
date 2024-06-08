"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DBDrivers = exports.DBDriversFacade = void 0;
class DBDriversFacade {
    constructor() {
        this.drivers = {};
    }
    register(name, component) {
        this.drivers[name] = component;
    }
    get(name) {
        return this.drivers[name];
    }
}
exports.DBDriversFacade = DBDriversFacade;
exports.DBDrivers = new DBDriversFacade();
