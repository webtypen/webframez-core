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
const { Command } = require("commander");
const Config_1 = require("./Config");
const BuildFinishCommand_1 = require("./Commands/BuildFinishCommand");
class ConsoleApplication {
    /**
     * Init the routes and start the http-server
     */
    boot(options) {
        if (options && options.config) {
            for (let key in options.config) {
                Config_1.Config.register(key, options.config[key]);
            }
        }
        const program = new Command();
        program.name("webframez console").description("CLI to some JavaScript string utilities").version("0.0.1");
        const systemCommands = [BuildFinishCommand_1.BuildFinishCommand];
        for (let command of systemCommands) {
            if (!command.signature) {
                continue;
            }
            const consoleCommand = new Command(command.signature);
            if (command.description && command.description.trim() !== "") {
                consoleCommand.description(command.description);
            }
            consoleCommand.action(() => __awaiter(this, void 0, void 0, function* () {
                const service = yield new command();
                return yield service.handleSystem();
            }));
            program.addCommand(consoleCommand);
        }
        if (options && options.kernel && options.kernel.commands && options.kernel.commands.length > 0) {
            for (let command of options.kernel.commands) {
                if (!command.signature) {
                    continue;
                }
                const consoleCommand = new Command(command.signature);
                if (command.description && command.description.trim() !== "") {
                    consoleCommand.description(command.description);
                }
                consoleCommand.action(() => __awaiter(this, void 0, void 0, function* () {
                    const service = yield new command();
                    const result = yield service.handleSystem();
                    if (options && options.onEnd) {
                        yield options.onEnd(command.signature);
                    }
                    return result;
                }));
                program.addCommand(consoleCommand);
            }
        }
        program.parse();
    }
}
exports.ConsoleApplication = ConsoleApplication;
