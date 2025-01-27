import { Config } from "./Config";
import { QueueJobsRegisty } from "./Queue/QueueJobsRegisty";
import { Router } from "./Router/Router";

export class LambdaApplication {
    /**
     * Init the routes and handle the request
     */
    boot(event: any, context: any, options?: any) {
        if (options && options.config) {
            for (let key in options.config) {
                Config.register(key, options.config[key]);
            }
        }

        Router.init({
            mode: "aws-lambda",
            kernel: options && options.kernel ? options.kernel : null,
            basename: options && options.basename ? options.basename : null,
            routesFunction: options && options.routesFunction ? options.routesFunction : null,
            tempDir: options && options.tempDir ? options.tempDir : null,
        });

        if (options.jobs && options.jobs.length > 0) {
            QueueJobsRegisty.registerJob(options.jobs);
        }

        return Router.handleRequest(null, null, { event: event });
    }
}
