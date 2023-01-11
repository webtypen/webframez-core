import fs from "fs";
import qs from "qs";
import { IncomingMessage, ServerResponse } from "http";
import { Response } from "./Response";
import { Config } from "../Config";

type RouteObject = {
  path: string;
  component: any;
  options: { [key: string]: any };
  params: object;
};

class RouterFacade {
  /**
   * Basename
   */
  basename: string | null = null;

  /**
   * Kernel-Class
   */
  kernel: any | null = null;

  /**
   * Mode
   */
  mode: any | null = null;

  /**
   * GET Route Store
   */
  routesGET: {
    [key: string]: {
      path: string;
      component: any;
      options: object;
      params?: object;
    };
  } = {};

  /**
   * POST Route Store
   */
  routesPOST: {
    [key: string]: {
      path: string;
      component: any;
      options: object;
      params?: object;
    };
  } = {};

  /**
   * PUT Route Store
   */
  routesPUT: {
    [key: string]: {
      path: string;
      component: any;
      options: object;
      params?: object;
    };
  } = {};

  /**
   * DELETE Route Store
   */
  routesDELETE: {
    [key: string]: {
      path: string;
      component: any;
      options: object;
      params?: object;
    };
  } = {};

  /**
   * Load the application-routes
   *
   */
  init(options?: any) {
    this.basename = options && options.basename ? options.basename : null;
    this.kernel = options && options.kernel ? options.kernel : null;
    this.mode = options && options.mode ? options.mode : null;

    // Load routes
    require(process.cwd() + "/app/routes");
  }

  /**
   * Register a route
   *
   * @param type
   * @param path
   * @param component
   * @param options
   */
  register(type: string, path: string, component: any, options: object) {
    if (this.basename) {
      path = this.basename + path;
    }

    if (type === "GET") {
      this.routesGET[path] = {
        path: path,
        component: component,
        options: options,
      };
    } else if (type === "POST") {
      this.routesPOST[path] = {
        path: path,
        component: component,
        options: options,
      };
    }
  }

  /**
   * Loads the matching route based on the request-url
   *
   * @param req
   * @returns
   */
  dissolve(req: IncomingMessage | any | null): RouteObject | null {
    if (!req || !req.url) {
      return null;
    }

    if (req.method === "GET") {
      return this.dissolveRoute(this.routesGET, req.url);
    } else if (req.method === "POST") {
      return this.dissolveRoute(this.routesPOST, req.url);
    } else if (req.method === "PUT") {
      return this.dissolveRoute(this.routesPUT, req.url);
    } else if (req.method === "DELETE") {
      return this.dissolveRoute(this.routesDELETE, req.url);
    } else if (req.method === "OPTIONS") {
      if (req.headers["access-control-request-method"] === "GET") {
        return this.dissolveRoute(this.routesGET, req.url);
      } else if (req.headers["access-control-request-method"] === "POST") {
        return this.dissolveRoute(this.routesPOST, req.url);
      } else if (req.headers["access-control-request-method"] === "PUT") {
        return this.dissolveRoute(this.routesPUT, req.url);
      } else if (req.headers["access-control-request-method"] === "DELETE") {
        return this.dissolveRoute(this.routesDELETE, req.url);
      }
    }
    return null;
  }

  /**
   * Dissolves the matching route based on the request-url and an object of routes
   *
   * @param routes
   * @param url
   * @returns
   */
  dissolveRoute(routes: any, url: string) {
    if (routes[url]) {
      // If url matches directly -> instant return
      return { ...routes[url], params: {} };
    } else {
      // Try to find the matching route: Run through the slash-separated parts of the route
      const partsRequest = url.split("/");

      for (let path in routes) {
        let status = true;
        const parts = path.split("/");
        const params: { [key: string]: any } = {};

        for (let i in partsRequest) {
          if (partsRequest[i] !== parts[i]) {
            // Handle URL-Params
            if (parts[i] && parts[i].trim().substring(0, 1) === ":") {
              params[parts[i].trim().substring(1).toString()] = partsRequest[i];
              continue;
            }

            status = false;
            continue;
          }
        }

        if (status) {
          return { ...routes[path], params: params };
        }
      }
    }
  }

  /**
   * Sends the default 404-Page
   *
   * @param res
   */
  sendError(res: ServerResponse, code: number, message?: string) {
    res.writeHead(code, { "Content-Type": "text/html" });
    res.end(message ? message : code === 404 ? "Oops! Page not found ..." : "Oops! There was an unexpected error ...");
  }

  /**
   * Processes a request
   *
   * @param req
   * @param res
   */
  async handleRequest(req: null | IncomingMessage, res: null | ServerResponse, options?: any) {
    let customRequest = null;
    if (!req && this.mode === "aws-lambda" && options && options.event) {
      customRequest = {
        method: options.event.requestContext.http.method,
        url: options.event.requestContext.http.path,
        headers: options.event.headers,
      };
    }

    if (!this.kernel) {
      if (res) {
        res.end();
      }
      throw new Error("Missing Kernel in Router ...");
    }

    const route = this.dissolve(customRequest !== null && this.mode === "aws-lambda" ? customRequest : req);
    const response = new Response({ mode: this.mode });
    if (res) {
      response.setServerResponse(res);
    }

    // Load Body
    let body: any = [];
    const bodyPlain: any =
      this.mode === "aws-lambda"
        ? options && options.event && options.event.body
          ? Buffer.concat(options.event.body).toString()
          : null
        : req
        ? await new Promise((resolve: Function) => {
            req
              .on("data", (chunk) => {
                body.push(chunk);
              })
              .on("end", () => {
                resolve(Buffer.concat(body).toString());
              });
          })
        : null;

    const request =
      this.mode === "aws-lambda" && customRequest
        ? {
            body:
              bodyPlain &&
              customRequest.headers["content-type"] === "application/json" &&
              (bodyPlain.trim().substring(0, 1) === "[" || bodyPlain.trim().substring(0, 1) === "{")
                ? JSON.parse(bodyPlain)
                : bodyPlain
                ? qs.parse(bodyPlain)
                : {},
            bodyPlain: bodyPlain,
            params: route && route.params ? route.params : {},
            headers: customRequest.headers,
            method: customRequest.method,
          }
        : req
        ? {
            body:
              bodyPlain &&
              req.headers["content-type"] === "application/json" &&
              (bodyPlain.trim().substring(0, 1) === "[" || bodyPlain.trim().substring(0, 1) === "{")
                ? JSON.parse(bodyPlain)
                : bodyPlain
                ? qs.parse(bodyPlain)
                : {},
            bodyPlain: bodyPlain,
            params: route && route.params ? route.params : {},
            httpVersionMajor: req.httpVersionMajor,
            httpVersionMinor: req.httpVersionMinor,
            httpVersion: req.httpVersion,
            headers: req.headers,
            rawHeaders: req.rawHeaders,
            url: req.url,
            method: req.method,
          }
        : null;

    // Check-Middleware
    if (route && route.options && route.options.middleware && route.options.middleware.length > 0) {
      for (let middlewareKey of route.options.middleware) {
        const middleware = this.kernel.middleware[middlewareKey];
        if (!middleware) {
          if (this.mode === "aws-lambda") {
            return {
              statusCode: 500,
              body: JSON.stringify({ status: "error", message: "Unknown middleware `" + middlewareKey + "` ..." }),
            };
          } else if (req && res) {
            this.requestConsoleLog(req, 500);
            return this.sendError(res, 500, "Unknown middleware `" + middlewareKey + "` ...");
          }
        }

        try {
          await new Promise((resolve, reject) => {
            try {
              middleware(
                resolve,
                (status: number, data: any) => {
                  reject({ status: status, data: data });
                },
                request,
                response
              );
            } catch (e) {
              console.error(e);

              if (this.mode === "aws-lambda") {
                return {
                  statusCode: 500,
                  body: JSON.stringify({ status: "error", message: "Middleware run error `" + middlewareKey + "` ..." }),
                };
              } else if (req && res) {
                this.requestConsoleLog(req, 500);
                return this.sendError(res, 500, "Error in middleware `" + middlewareKey + "` ...");
              }
            }
          });
        } catch (e: any) {
          // Send Middleware-Abort
          if (this.mode === "aws-lambda") {
            return { statusCode: 500, body: JSON.stringify({ status: "error", message: e.data }) };
          } else if (res) {
            res.writeHead(e.status, typeof e.data === "object" ? { "Content-Type": "application/json" } : { "Content-Type": "text/html" });
            res.end(typeof e.data === "object" ? JSON.stringify(e.data) : e.data ? e.data : " ");
          }
          return;
        }
      }
    }

    // Handle OPTIONS-Request
    if (req && res && req.method === "OPTIONS") {
      res.statusCode = 200;
      res.setHeader("Content-Length", "0");
      res.end();
      this.requestConsoleLog(req, 200);
      return;
    }

    // Resolve route-component (handle controller definition)
    if (route && typeof route.component === "string") {
      const split = route.component.split("@");
      const controller = this.kernel.controller[split[0]];
      if (!controller) {
        if (this.mode === "aws-lambda") {
          return { statusCode: 500, body: JSON.stringify({ status: "error", message: "Controller `" + split[0] + "` not found ..." }) };
        } else if (res) {
          res.writeHead(500, { "Content-Type": "text/html" });
          res.end("Controller `" + split[0] + "` not found ...");
        }

        return;
      }

      // Set Controller method as route-component
      const controllerInstance = new controller();
      route.component = controllerInstance[split[1]].bind(controllerInstance);
    }

    if (route && route.component !== undefined) {
      try {
        await route.component(request, response);

        if (this.mode === "aws-lambda") {
          return { statusCode: response.statusCode, body: JSON.stringify(response.content) };
        } else if (res && req) {
          res.end();
          this.requestConsoleLog(req, response.statusCode);
        }
      } catch (e) {
        if (this.mode === "aws-lambda") {
          return { statusCode: 500, body: JSON.stringify({ status: "error", message: "Error running the component ..." }) };
        } else if (res && req) {
          this.sendError(res, 500);
          this.requestConsoleLog(req, 500);
        }
      }
    } else {
      if (this.mode === "aws-lambda") {
        return { statusCode: 500, body: JSON.stringify({ status: "error", message: "Route component not found ..." }) };
      } else if (res && req) {
        this.sendError(res, 404);
        this.requestConsoleLog(req, 404);
      }
    }
  }

  requestConsoleLog(req: IncomingMessage, httpCode: number) {
    if (Config.get("application.router.requests.logConsole") !== true && !Config.get("application.router.requests.logFile")) {
      return;
    }

    const date = new Date();
    const month = date.getMonth() + 1;
    const ip = req.headers["x-forwarded-for"]
      ? req.headers["x-forwarded-for"]
      : req.headers["x-forwarded"]
      ? req.headers["x-forwarded"]
      : req.headers["forwarded-for"]
      ? req.headers["forwarded-for"]
      : req.socket && req.socket.remoteAddress
      ? req.socket.remoteAddress
      : null;
    const logString =
      '{ date: "' +
      date.getFullYear() +
      "-" +
      (month < 10 ? "0" + month : month) +
      "-" +
      date.getDate() +
      " " +
      (date.getHours() + 1) +
      ":" +
      date.getMinutes() +
      ":" +
      date.getSeconds() +
      '", method: "' +
      req.method +
      '", url: "' +
      req.url +
      '", ip: "' +
      ip +
      '", httpcode: ' +
      httpCode.toString() +
      " }";

    if (Config.get("application.router.requests.logConsole")) {
      console.log(logString);
    }

    if (Config.get("application.router.requests.logFile")) {
      try {
        const filepath = Config.get("application.router.requests.logFile");
        if (filepath && filepath.trim() !== "") {
          fs.appendFileSync(filepath.trim().substring(0, 1) === "/" ? filepath : process.cwd() + "/" + filepath, logString + "\n");
        }
      } catch (e) {
        console.error(e);
      }
    }
  }
}

export const Router = new RouterFacade();
