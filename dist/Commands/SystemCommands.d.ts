declare class SystemCommandsFacade {
    private commands;
    private registered;
    register(data: any): this;
    getCommands(): any[];
}
export declare const SystemCommands: SystemCommandsFacade;
export {};
