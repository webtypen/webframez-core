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
exports.ConsoleApplication = void 0;
const Config_1 = require("./Config");
const ConsoleOutputHelper_1 = require("./Commands/ConsoleOutputHelper");
const QueueWorkerCommand_1 = require("./Commands/QueueWorkerCommand");
const BuildFinishCommand_1 = require("./Commands/BuildFinishCommand");
const DatatableRegistry_1 = require("./Datatable/DatatableRegistry");
const QueueJobsRegisty_1 = require("./Queue/QueueJobsRegisty");
const QueueStartCommand_1 = require("./Commands/QueueStartCommand");
const QueueStatusCommand_1 = require("./Commands/QueueStatusCommand");
const QueueStopCommand_1 = require("./Commands/QueueStopCommand");
const QueueLogCommand_1 = require("./Commands/QueueLogCommand");
const QueueWorkerAutorestartCommand_1 = require("./Commands/QueueWorkerAutorestartCommand");
const info_1 = require("./info");
class ConsoleApplication {
    constructor() {
        this.systemCommands = [
            QueueStartCommand_1.QueueStartCommand,
            QueueStatusCommand_1.QueueStatusCommand,
            QueueStopCommand_1.QueueStopCommand,
            QueueLogCommand_1.QueueLogCommand,
            QueueWorkerCommand_1.QueueWorkerCommand,
            QueueWorkerAutorestartCommand_1.QueueWorkerAutorestartCommand,
            BuildFinishCommand_1.BuildFinishCommand,
        ];
    }
    /**
     * Init the routes and start the http-server
     */
    boot(options) {
        if (options && options.config) {
            for (let key in options.config) {
                Config_1.Config.register(key, options.config[key]);
            }
        }
        if (options && options.datatables) {
            DatatableRegistry_1.DatatableRegistry.registerMany(options.datatables);
        }
        if (options.jobs && options.jobs.length > 0) {
            QueueJobsRegisty_1.QueueJobsRegisty.registerJob(options.jobs);
        }
        const args = this.parseArgs();
        const signature = args.arguments.shift();
        if (signature) {
            const command = this.getCommand(signature, options);
            if (!command) {
                ConsoleOutputHelper_1.ConsoleOutputHelper.error(`Command "${signature}" not found!`);
                return;
            }
            (() => __awaiter(this, void 0, void 0, function* () {
                const commandInstance = new command(args);
                yield commandInstance.handleSystem();
                if (options && options.onEnd) {
                    yield options.onEnd(command.signature);
                }
            }))();
        }
        else {
            if (args.options["version"] || args.options["v"]) {
                this.renderVersion();
            }
            else {
                this.renderStart(options);
            }
        }
    }
    getCommand(signature, options) {
        if (!signature || signature.trim() === "")
            return null;
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
        const out = { arguments: [], options: {} };
        for (let i = 2; i < process.argv.length; i++) {
            const arg = process.argv[i];
            if (arg.startsWith("-")) {
                const argKey = arg.startsWith("--") ? arg.substring(2) : arg.substring(1);
                if (process.argv[i + 1] && !process.argv[i + 1].startsWith("-")) {
                    while (process.argv[i + 1] && !process.argv[i + 1].startsWith("-")) {
                        out.options[argKey] = (out.options[argKey] || "") + " " + process.argv[i + 1];
                        i++;
                    }
                }
                else {
                    if (argKey.includes("=")) {
                        const [key, value] = argKey.split("=");
                        out.options[key] = value === "true" ? true : value === "false" ? false : value;
                    }
                    else {
                        out.options[argKey] = true;
                    }
                }
            }
            else {
                if (arg && arg.trim() !== "") {
                    out.arguments.push(arg);
                }
            }
        }
        return out;
    }
    renderStart(options) {
        let maxSignatureLength = 15;
        const groups = {};
        // Load system commands
        for (let command of this.systemCommands) {
            if (!command || !command.signature || command.hidden)
                continue;
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
                if (!command || !command.signature || command.hidden)
                    continue;
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
        const { writeln } = ConsoleOutputHelper_1.ConsoleOutputHelper;
        writeln("webframez Framework [color=green]" + info_1.WebframezInfo.version + "[/color]", {
            minLength: 125,
        });
        writeln("[color=orange]Usage:[/color]", { linesBefore: 1 });
        writeln("  command [color=grey][options][/color] [color=grey][arguments][/color]");
        writeln("[color=orange]Available commands:[/color]", { linesBefore: 1 });
        let groupCount = 0;
        const groupsKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));
        for (let groupKey of groupsKeys) {
            if (!groups[groupKey] || groups[groupKey].length < 1)
                continue;
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
        ConsoleOutputHelper_1.ConsoleOutputHelper.writeln("webframez Framework [color=green]" + info_1.WebframezInfo.version + "[/color]");
    }
}
exports.ConsoleApplication = ConsoleApplication;
