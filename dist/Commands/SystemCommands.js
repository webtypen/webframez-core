"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemCommands = void 0;
class SystemCommandsFacade {
    constructor() {
        this.commands = [];
        this.registered = {};
    }
    register(data) {
        const commands = Array.isArray(data) ? data : [data];
        for (const command of commands) {
            if (!command || !command.signature || this.registered[command.signature]) {
                continue;
            }
            this.registered[command.signature] = true;
            this.commands.push(command);
        }
        return this;
    }
    getCommands() {
        return this.commands;
    }
}
exports.SystemCommands = new SystemCommandsFacade();
