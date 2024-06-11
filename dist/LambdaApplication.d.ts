export declare class LambdaApplication {
    /**
     * Init the routes and handle the request
     */
    boot(event: any, context: any, options?: any): Promise<{
        statusCode: number;
        body: any;
        headers: {
            [key: string]: any;
        };
    } | undefined>;
}
