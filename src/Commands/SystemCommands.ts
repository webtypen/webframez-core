class SystemCommandsFacade {
    private commands: any[] = [];
    private registered: { [signature: string]: boolean } = {};

    register(data: any) {
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

export const SystemCommands = new SystemCommandsFacade();
