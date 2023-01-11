import http, { Server } from "http";
import { Config } from "./Config";
import { Router } from "./Router/Router";

export class WebApplication {
  private server!: Server;

  /**
   * Init the routes and start the http-server
   */
  boot(options?: any) {
    if (options && options.config) {
      for (let key in options.config) {
        Config.register(key, options.config[key]);
      }
    }

    Router.init({
      kernel: options && options.kernel ? options.kernel : null,
      basename: options && options.basename ? options.basename : null,
    });

    const port = options && options.port ? options.port : 3000;
    this.server = http
      .createServer((req, res) => {
        Router.handleRequest(req, res);
      })
      .listen(port, () => {
        console.log(
          "Server started and listening on port " +
            port +
            (options && options.basename
              ? " (Basename: " + options && options.basename + ")"
              : "")
        );
      });

      return this.server;
  }
}
