import { ConsoleCommand } from "../../src/Commands/ConsoleCommand";

export class TestCommand extends ConsoleCommand {
    static signature = "test:command";
    static description = "a temporary test command";

    async handle() {
        while (true) {
            this.writeln(`Write "Test" every 5 seconds ...`);
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }
    }
}
