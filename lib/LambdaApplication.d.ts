export declare class LambdaApplication {
    /**
     * Init the routes and handle the request
     */
    boot(event: any, context: any, options?: any): Promise<void | {
        statusCode: number;
        body: string;
        headers?: undefined;
    } | {
        statusCode: number;
        body: string;
        headers: {
            [key: string]: string;
        };
    }>;
}
