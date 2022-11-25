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

    // Load routes
    console.log("loadRoutes");
    require(process.cwd() + "/app/routes");
    console.log("finishRoutes");
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
  dissolve(req: IncomingMessage): RouteObject | null {
    if (!req.url) {
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
    res.end(
      message
        ? message
        : code === 404
        ? "Oops! Page not found ..."
        : "Oops! There was an unexpected error ..."
    );
  }

  /**
   * Processes a request
   *
   * @param req
   * @param res
   */
  async handleRequest(req: IncomingMessage, res: ServerResponse) {
    const route = this.dissolve(req);
    const response = new Response();
    response.setServerResponse(res);

    if (!this.kernel) {
      throw new Error("Missing Kernel in Router ...");
    }

    // Check-Middleware
    if (
      route &&
      route.options &&
      route.options.middleware &&
      route.options.middleware.length > 0
    ) {
      for (let middlewareKey of route.options.middleware) {
        const middleware = this.kernel.middleware[middlewareKey];
        if (!middleware) {
          return this.sendError(
            res,
            500,
            "Unknown middleware `" + middlewareKey + "` ..."
          );
        }

        try {
          await new Promise((resolve, reject) => {
            try {
              middleware(
                resolve,
                (status: number, data: any) => {
                  reject({ status: status, data: data });
                },
                req,
                response
              );
            } catch (e) {
              console.error(e);

              return this.sendError(
                res,
                500,
                "Error in middleware `" + middlewareKey + "` ..."
              );
            }
          });
        } catch (e: any) {
          // Send Middleware-Abort
          res.writeHead(
            e.status,
            typeof e.data === "object"
              ? { "Content-Type": "application/json" }
              : { "Content-Type": "text/html" }
          );
          res.end(
            typeof e.data === "object"
              ? JSON.stringify(e.data)
              : e.data
              ? e.data
              : " "
          );
          return;
        }
      }
    }

    // Handle OPTIONS-Request
    if (req.method === "OPTIONS") {
      res.statusCode = 200;
      res.setHeader("Content-Length", "0");
      res.end();
      return;
    }

    // Resolve route-component (handle controller definition)
    if (route && typeof route.component === "string") {
      const split = route.component.split("@");
      const controller = this.kernel.controller[split[0]];
      if (!controller) {
        res.writeHead(500, { "Content-Type": "text/html" });
        res.end("Controller `" + split[0] + "` not found ...");
        return;
      }

      // Set Controller method as route-component
      const controllerInstance = new controller();
      route.component = controllerInstance[split[1]];
    }

    if (route && route.component !== undefined) {
      let body: any = [];
      const bodyPlain: any = await new Promise((resolve: Function) => {
        req
          .on("data", (chunk) => {
            body.push(chunk);
          })
          .on("end", () => {
            resolve(Buffer.concat(body).toString());
          });
      });

      try {
        await route.component(
          {
            body:
              bodyPlain &&
              req.headers["content-type"] === "application/json" &&
              (bodyPlain.trim().substring(0, 1) === "[" ||
                bodyPlain.trim().substring(0, 1) === "{")
                ? JSON.parse(bodyPlain)
                : bodyPlain
                ? qs.parse(bodyPlain)
                : {},
            bodyPlain: bodyPlain,
            params: route.params,
            httpVersionMajor: req.httpVersionMajor,
            httpVersionMinor: req.httpVersionMinor,
            httpVersion: req.httpVersion,
            headers: req.headers,
            rawHeaders: req.rawHeaders,
            url: req.url,
            method: req.method,
          },
          response
        );
        res.end();
      } catch (e) {
        console.error(e);
        this.sendError(res, 500);
      }
    } else {
      this.sendError(res, 404);
    }
  }

  requestConsoleLog(req: IncomingMessage) {
    if (Config.get("router.requests.logConsole") !== true) {
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

    console.log(
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
        '" }'
    );
  }
}

export const Router = new RouterFacade();
