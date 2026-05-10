"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackupListCommand = void 0;
const BackupManager_1 = require("../Backup/BackupManager");
const BackupOutputDrivers_1 = require("../Backup/BackupOutputDrivers");
const ConsoleCommand_1 = require("./ConsoleCommand");
class BackupListCommand extends ConsoleCommand_1.ConsoleCommand {
    handle() {
        return __awaiter(this, void 0, void 0, function* () {
            const manager = new BackupManager_1.BackupManager();
            const types = manager.listTypes();
            this.writeln("Backup Types:");
            if (types.length < 1) {
                this.writeln("  [color=grey]No backup types configured.[/color]");
                return;
            }
            for (const entry of types) {
                const outputs = entry.config.outputs.map((output) => output.driver).join(", ");
                const active = entry.config.is_active === false ? "[color=red]inactive[/color]" : "[color=green]active[/color]";
                this.writeln(`  [color=blue]${entry.key}[/color] ${active} [color=grey]outputs: ${outputs}[/color]`);
            }
            this.writeln("", { linesBefore: 1 });
            this.writeln("Available Output Drivers:");
            this.writeln("  " + BackupOutputDrivers_1.BackupOutputDrivers.keys().sort().join(", "));
        });
    }
}
exports.BackupListCommand = BackupListCommand;
BackupListCommand.signature = "backup:list";
BackupListCommand.description = "Lists configured backup types";
