import { BackupManager } from "../Backup/BackupManager";
import { ConsoleCommand } from "./ConsoleCommand";

function parseChannels(value: string | boolean | null) {
    if (!value || typeof value !== "string") {
        return undefined;
    }

    return value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry !== "");
}

export class BackupRunCommand extends ConsoleCommand {
    static signature = "backup:run";
    static description = "Runs a configured backup type";

    async handle() {
        const key = this.getArguments()[0];
        if (!key) {
            this.error("You must specify a backup key.");
            return;
        }

        const result = await new BackupManager().run(key, {
            dryRun: this.getOption("dry-run") === true,
            channels: parseChannels(this.getOption("channel")),
        });

        if (result.dryRun) {
            this.info(`Dry run for backup '${key}' finished.`);
        } else {
            this.success(`Backup '${key}' finished.`);
        }

        this.writeln(`  ID: ${result.id}`);
        if (result.artifact) {
            this.writeln(`  Artifact: ${result.artifact.filename} (${result.artifact.size} bytes)`);
        }
        this.writeln(`  Files: ${result.files.length}`);
        this.writeln(`  Databases: ${result.databases.length}`);
        for (const output of result.outputs) {
            this.writeln(
                `  Output [color=blue]${output.driver}[/color]: [color=${
                    output.status === "success" ? "green" : output.status === "failed" ? "red" : "grey"
                }]${output.status}[/color]${output.path ? " " + output.path : ""}${output.error ? " - " + output.error : ""}`,
            );
        }
        for (const cleanup of result.cleanup) {
            this.writeln(`  Cleanup [color=blue]${cleanup.driver}[/color]: ${cleanup.deleted.length} deleted`);
        }
    }
}
