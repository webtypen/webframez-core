import http, { Server } from "http";
import { Router } from "./Router/Router";

export class WebApplication {
  private server!: Server;

  /**
   * Init the routes and start the http-server
   */
  boot(options?: any) {
    Router.init({
      basename: options && options.basename ? options.basename : null,
    });

    const port = options && options.port ? options.port : 3000;
    this.server = http
      .createServer((req, res) => {
        Router.handleRequest(req, res);
      })
      .listen(port, () => {
        console.log("Server started and listening on port " + port);
      });
  }
}
