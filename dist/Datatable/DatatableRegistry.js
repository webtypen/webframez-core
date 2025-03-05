"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatatableRegistry = void 0;
class DatatableRegistryWrapper {
    constructor() {
        this.tables = {};
    }
    register(key, tableClass) {
        this.tables[key] = tableClass;
        return this;
    }
    registerMany(data) {
        if (typeof data === "object") {
            for (let key in data) {
                this.register(key, data[key]);
            }
        }
        return this;
    }
    getTable(key) {
        return this.tables[key] ? this.tables[key] : null;
    }
}
exports.DatatableRegistry = new DatatableRegistryWrapper();
