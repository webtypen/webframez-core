import http, { Server } from "http";
import { Router } from "./Router/Router";

export class WebApplication {
  private server!: Server;

  /**
   * Init the routes and start the http-server
   */
  boot() {
    Router.init();

    this.server = http
      .createServer((req, res) => {
        Router.handleRequest(req, res);
      })
      .listen(3000, () => {
        console.log("Server started and listening on port 3000");
      });
  }
}
