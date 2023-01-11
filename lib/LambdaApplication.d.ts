export declare class LambdaApplication {
    private server;
    /**
     * Init the routes and start the http-server
     */
    boot(event: any, context: any, options?: any): {
        status: string;
        mode: string;
        event: any;
    };
}
