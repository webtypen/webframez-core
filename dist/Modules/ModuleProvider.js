"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModuleProvider = void 0;
class ModuleProvider {
    constructor() {
        this.controller = {};
        this.middleware = {};
        this.apiScopes = [];
        this.commands = [];
    }
    boot(_context) { }
    routes() { }
    bootByRouter() {
        this.boot();
        this.routes();
    }
}
exports.ModuleProvider = ModuleProvider;
ModuleProvider.key = "example-module";
