import { BackupManager } from "../Backup/BackupManager";
import { BackupOutputDrivers } from "../Backup/BackupOutputDrivers";
import { ConsoleCommand } from "./ConsoleCommand";

export class BackupListCommand extends ConsoleCommand {
    static signature = "backup:list";
    static description = "Lists configured backup types";

    async handle() {
        const manager = new BackupManager();
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
        this.writeln("  " + BackupOutputDrivers.keys().sort().join(", "));
    }
}
