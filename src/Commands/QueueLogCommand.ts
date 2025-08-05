import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { Config } from "../Config";
import { ConsoleCommand } from "./ConsoleCommand";
import { storageDir } from "../Functions/FileFunctions";
import { ConsoleOutputHelper } from "./ConsoleOutputHelper";

export class QueueLogCommand extends ConsoleCommand {
    static signature = "queue:log";
    static description = "Displays the log files of the queue workers";

    async handle() {
        const config = Config.get("queue");
        if (!config || !config.workers || Object.keys(config.workers).length < 1) {
            this.error("No queue workers configured.");
            return;
        }

        const files: string[] = [];
        const args = this.getArguments();
        for (let workerKey in config.workers) {
            if (args && args.length > 0 && !args.find((arg) => arg && arg.trim() === workerKey)) {
                continue;
            }

            const statusPath = path.join(storageDir(), "queue", "worker_" + workerKey + ".json");
            if (fs.existsSync(statusPath)) {
                try {
                    const file = JSON.parse(fs.readFileSync(statusPath, "utf8"));
                    if (file && file.log_file && fs.existsSync(path.join(storageDir(), file.log_file))) {
                        files.push(path.join(storageDir(), file.log_file));
                    }
                } catch (e: any) {
                    this.error(`Error reading status for worker ${workerKey}: ${e.message}`);
                }
            }
        }

        if (files.length === 0) {
            this.error("No log files found for any workers.");
            return;
        }

        this.writeln(`[color=orange]Following ${files.length} worker-log-file(s):[/color]`);
        files.forEach((file) => this.writeln(`- ${file}`));
        this.writeln("[color=grey]Press Ctrl+C to stop...[/color]");
        this.writeln("".padEnd(80, "-"));
        this.writeln("");

        const tailProcess = spawn("tail", ["-f", ...files], {
            stdio: ["pipe", "pipe", "pipe"],
        });

        tailProcess.stdout?.on("data", (data) => {
            const lines = data.toString().split("\n");

            for (const line of lines) {
                if (!line.trim() || line.startsWith("==>") || line.includes("<==")) {
                    continue;
                }

                if (line.startsWith("[")) {
                    const match = line.match(/^(\[.*?\])(.*)/);
                    if (match) {
                        const blueText = `[color=blue]${match[1]}[/color]`; // Blue color
                        const restText = match[2];
                        ConsoleOutputHelper.writeln(blueText + restText);
                    } else {
                        ConsoleOutputHelper.writeln(line, { formatDisabled: true });
                    }
                } else {
                    ConsoleOutputHelper.writeln(line, { formatDisabled: true });
                }
            }
        });

        tailProcess.stderr?.on("data", (data) => {
            this.error(`tail error: ${data.toString()}`);
        });

        tailProcess.on("close", (code) => {
            if (code !== 0) {
                this.error(`tail process exited with code ${code}`);
            }
        });

        process.on("SIGINT", () => {
            tailProcess.kill("SIGTERM");
            process.exit(0);
        });
    }
}
