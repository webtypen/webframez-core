/// <reference types="node" />
import { Config } from "./Config";
import { ConsoleOutputHelper } from "./Commands/ConsoleOutputHelper";
import { QueueWorkerCommand } from "./Commands/QueueWorkerCommand";
import { BuildFinishCommand } from "./Commands/BuildFinishCommand";
import { DatatableRegistry } from "./Datatable/DatatableRegistry";
import { QueueJobsRegisty } from "./Queue/QueueJobsRegisty";
import { QueueStartCommand } from "./Commands/QueueStartCommand";
import { QueueStatusCommand } from "./Commands/QueueStatusCommand";
import { QueueStopCommand } from "./Commands/QueueStopCommand";
import { QueueLogCommand } from "./Commands/QueueLogCommand";
import { QueueWorkerAutorestartCommand } from "./Commands/QueueWorkerAutorestartCommand";
import { WebframezInfo } from "./info";

export class ConsoleApplication {
    systemCommands: any = [
        QueueStartCommand,
        QueueStatusCommand,
        QueueStopCommand,
        QueueLogCommand,
        QueueWorkerCommand,
        QueueWorkerAutorestartCommand,
        BuildFinishCommand,
    ];

    /**
     * Init the routes and start the http-server
     */
    boot(options?: any) {
        if (options && options.config) {
            for (let key in options.config) {
                Config.register(key, options.config[key]);
            }
        }

        // if (options && options.signoz) {
        //     void SigNozTelemetry.init(options.signoz);
        // }

        if (options && options.datatables) {
            DatatableRegistry.registerMany(options.datatables);
        }

        if (options.jobs && options.jobs.length > 0) {
            QueueJobsRegisty.registerJob(options.jobs);
        }

        const args = this.parseArgs();
        const signature = args.arguments.shift();

        if (signature) {
            const command = this.getCommand(signature, options);
            if (!command) {
                ConsoleOutputHelper.error(`Command "${signature}" not found!`);
                return;
            }

            (async () => {
                const commandInstance = new command(args);
                await commandInstance.handleSystem();

                if (options && options.onEnd) {
                    await options.onEnd(command.signature);
                }
            })();
        } else {
            if (args.options["version"] || args.options["v"]) {
                this.renderVersion();
            } else {
                this.renderStart(options);
            }
        }
    }

    getCommand(signature: string, options?: any) {
        if (!signature || signature.trim() === "") return null;

        for (let command of this.systemCommands) {
            if (command.signature === signature) {
                return command;
            }
        }

        if (options && options.kernel && options.kernel.commands && options.kernel.commands.length > 0) {
            for (let command of options.kernel.commands) {
                if (command.signature === signature) {
                    return command;
                }
            }
        }
        return null;
    }

    parseArgs() {
        const out: { arguments: string[]; options: { [key: string]: boolean | string } } = { arguments: [], options: {} };

        for (let i = 2; i < process.argv.length; i++) {
            const arg = process.argv[i];

            if (arg.startsWith("-")) {
                const argKey = arg.startsWith("--") ? arg.substring(2) : arg.substring(1);
                if (process.argv[i + 1] && !process.argv[i + 1].startsWith("-")) {
                    while (process.argv[i + 1] && !process.argv[i + 1].startsWith("-")) {
                        out.options[argKey] = (out.options[argKey] || "") + " " + process.argv[i + 1];
                        i++;
                    }
                } else {
                    if (argKey.includes("=")) {
                        const [key, value] = argKey.split("=");
                        out.options[key] = value === "true" ? true : value === "false" ? false : value;
                    } else {
                        out.options[argKey] = true;
                    }
                }
            } else {
                if (arg && arg.trim() !== "") {
                    out.arguments.push(arg);
                }
            }
        }

        return out;
    }

    renderStart(options?: any) {
        let maxSignatureLength = 15;
        const groups: { [key: string]: { signature: string; description: string }[] } = {};

        // Load system commands
        for (let command of this.systemCommands) {
            if (!command || !command.signature || command.hidden) continue;
            let groupKey = " ";
            const commandGroups = command.signature.split(":");
            if (commandGroups && commandGroups.length > 0 && commandGroups[0] && commandGroups[0].trim() !== "") {
                groupKey = commandGroups[0];
            }

            if (!groups[groupKey]) {
                groups[groupKey] = [];
            }

            groups[groupKey].push({
                signature: command.signature,
                description: command.description || "",
            });

            if (command.signature.length > maxSignatureLength) {
                maxSignatureLength = command.signature.length;
            }
        }

        // Load application commands
        if (options && options.kernel && options.kernel.commands && options.kernel.commands.length > 0) {
            for (let command of options.kernel.commands) {
                if (!command || !command.signature || command.hidden) continue;
                let groupKey = " ";
                const commandGroups = command.signature.split(":");
                if (commandGroups && commandGroups.length > 0 && commandGroups[0] && commandGroups[0].trim() !== "") {
                    groupKey = commandGroups[0];
                }

                if (!groups[groupKey]) {
                    groups[groupKey] = [];
                }

                groups[groupKey].push({
                    signature: command.signature,
                    description: command.description || "",
                });

                if (command.signature.length > maxSignatureLength) {
                    maxSignatureLength = command.signature.length;
                }
            }
        }

        const { writeln } = ConsoleOutputHelper;
        writeln("webframez Framework [color=green]" + WebframezInfo.version + "[/color]", {
            minLength: 125,
        });

        writeln("[color=orange]Usage:[/color]", { linesBefore: 1 });
        writeln("  command [color=grey][options][/color] [color=grey][arguments][/color]");

        writeln("[color=orange]Available commands:[/color]", { linesBefore: 1 });
        let groupCount = 0;
        const groupsKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));
        for (let groupKey of groupsKeys) {
            if (!groups[groupKey] || groups[groupKey].length < 1) continue;

            if (groupKey && groupKey.trim() !== "") {
                if (groupCount > 0) {
                    writeln("");
                }
                writeln(`  [color=orange]${groupKey}:[/color]`);
            }

            groups[groupKey].sort((a, b) => a.signature.localeCompare(b.signature));
            for (let entry of groups[groupKey]) {
                const signature = entry.signature.padEnd(maxSignatureLength, " ");
                const description = entry.description ? entry.description : "";
                writeln(`    [color=green]${signature}[/color]  ${description}`);
            }
            groupCount++;
        }
    }

    renderVersion() {
        ConsoleOutputHelper.writeln("webframez Framework [color=green]" + WebframezInfo.version + "[/color]");
    }
}
