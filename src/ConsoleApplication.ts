const { Command } = require("commander");
import { Config } from "./Config";
import { BuildFinishCommand } from "./Commands/BuildFinishCommand";

export class ConsoleApplication {
  /**
   * Init the routes and start the http-server
   */
  boot(options?: any) {
    if (options && options.config) {
      for (let key in options.config) {
        Config.register(key, options.config[key]);
      }
    }

    const program = new Command();
    program.name("webframez console").description("CLI to some JavaScript string utilities").version("0.0.1");

    const systemCommands = [BuildFinishCommand];
    for (let command of systemCommands) {
      if (!command.signature) {
        continue;
      }

      const consoleCommand = new Command(command.signature);
      if (command.description && command.description.trim() !== "") {
        consoleCommand.description(command.description);
      }
      consoleCommand.action(async () => {
        const service = await new command();
        return await service.handle();
      });
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
        consoleCommand.action(async () => {
          const service = await new command();
          const result = await service.handle();
          
          if (options && options.onEnd) {
              await options.onEnd(command.signature);
          }
          return result;
        });
        program.addCommand(consoleCommand);
      }
    }

    program.parse();
  }
}
