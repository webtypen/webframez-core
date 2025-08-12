export declare class ConsoleApplication {
    systemCommands: any;
    /**
     * Init the routes and start the http-server
     */
    boot(options?: any): void;
    getCommand(signature: string, options?: any): any;
    parseArgs(): {
        arguments: string[];
        options: {
            [key: string]: string | boolean;
        };
    };
    renderStart(options?: any): void;
    renderVersion(): void;
}
