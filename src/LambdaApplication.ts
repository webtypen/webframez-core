import http, { Server } from "http";
import { Config } from "./Config";
import { Router } from "./Router/Router";

export class LambdaApplication {
  private server!: Server;

  /**
   * Init the routes and start the http-server
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
    });

    return { status: "success", mode: "lambda", event: event };
  }
}
