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
        } else if (type === "PUT") {
            this.routesPUT[path] = {
                path: path,
                component: component,
                options: options,
            };
        } else if (type === "DELETE") {
            this.routesDELETE[path] = {
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

        const cleanUrl =
            req.url.indexOf("?") > 0
                ? req.url.substring(0, req.url.indexOf("?"))
                : req.url.indexOf("#") > 0
                ? req.url.substring(0, req.url.indexOf("#"))
                : req.url;

        if (req.method === "GET") {
            return this.dissolveRoute(this.routesGET, cleanUrl);
        } else if (req.method === "POST") {
            return this.dissolveRoute(this.routesPOST, cleanUrl);
        } else if (req.method === "PUT") {
            return this.dissolveRoute(this.routesPUT, cleanUrl);
        } else if (req.method === "DELETE") {
            return this.dissolveRoute(this.routesDELETE, cleanUrl);
        } else if (req.method === "OPTIONS") {
            if (req.headers["access-control-request-method"] === "GET") {
                return this.dissolveRoute(this.routesGET, cleanUrl);
            } else if (req.headers["access-control-request-method"] === "POST") {
                return this.dissolveRoute(this.routesPOST, cleanUrl);
            } else if (req.headers["access-control-request-method"] === "PUT") {
                return this.dissolveRoute(this.routesPUT, cleanUrl);
            } else if (req.headers["access-control-request-method"] === "DELETE") {
                return this.dissolveRoute(this.routesDELETE, cleanUrl);
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
                url:
                    options.event.rawPath +
                    (options.event.rawQueryString && options.event.rawQueryString.trim() !== "" ? "?" + options.event.rawQueryString : ""),
                headers: options.event.headers,
                urlParams: options.event.queryStringParameters ? options.event.queryStringParameters : {},
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
                    ? options.event.body
                    : null
                : req
                ? await new Promise((resolve: Function) => {
                      req.on("data", (chunk) => {
                          body.push(chunk);
                      }).on("end", () => {
                          resolve(Buffer.concat(body).toString());
                      });
                  })
                : null;

        const urlParams: any = {};
        if (!customRequest) {
            if (req && req.url && req.url.indexOf("?") > 0) {
                const temp = req.url.substring(req.url.indexOf("?") + 1);
                if (temp && temp.trim() !== "") {
                    const entries = temp.split("&");
                    for (let entry of entries) {
                        if (entry.indexOf("=") > 0) {
                            urlParams[entry.substring(0, entry.indexOf("="))] = entry.substring(entry.indexOf("=") + 1);
                        } else {
                            urlParams[entry] = true;
                        }
                    }
                }
            }
        }

        const request =
            this.mode === "aws-lambda" && customRequest
                ? {
                      body:
                          bodyPlain &&
                          customRequest.headers["content-type"] === "application/json" &&
                          (bodyPlain.trim().substring(0, 1) === "[" || bodyPlain.trim().substring(0, 1) === "{")
                              ? JSON.parse(bodyPlain)
                              : bodyPlain
                              ? qs.parse(
                                    options && options.event && options.event.isBase64Encoded
                                        ? Buffer.from(bodyPlain, "base64").toString("utf-8")
                                        : bodyPlain
                                )
                              : {},
                      bodyPlain: bodyPlain,
                      params: route && route.params ? route.params : {},
                      url: customRequest.url,
                      urlParams: customRequest.urlParams,
                      headers: customRequest.headers,
                      method: customRequest.method,
                      on: req ? req.on : undefined,
                      request: req,
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
                      urlParams: urlParams,
                      httpVersionMajor: req.httpVersionMajor,
                      httpVersionMinor: req.httpVersionMinor,
                      httpVersion: req.httpVersion,
                      headers: req.headers,
                      rawHeaders: req.rawHeaders,
                      url: req.url,
                      method: req.method,
                      socket: req.socket,
                      on: req.on,
                      request: req,
                  }
                : null;

        // Check-Middleware
        if (route && route.options && route.options.middleware && route.options.middleware.length > 0) {
            for (let middlewareKey of route.options.middleware) {
                const middleware = this.kernel.middleware[middlewareKey];
                if (!middleware) {
                    this.handleResponseAfter(response, request, { status: 500 });
                    
                    if (this.mode === "aws-lambda") {
                        return {
                            statusCode: 500,
                            body: JSON.stringify({
                                status: "error",
                                message: "Unknown middleware `" + middlewareKey + "` ...",
                            }),
                            headers: response.headers,
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

                            this.handleResponseAfter(response, request, { status: 500 });
                            if (this.mode === "aws-lambda") {
                                return {
                                    statusCode: 500,
                                    body: JSON.stringify({
                                        status: "error",
                                        message: "Middleware run error `" + middlewareKey + "` ...",
                                    }),
                                    headers: response.headers,
                                };
                            } else if (req && res) {
                                this.requestConsoleLog(req, 500);
                                return this.sendError(res, 500, "Error in middleware `" + middlewareKey + "` ...");
                            }
                        }
                    });
                } catch (e: any) {
                    this.handleResponseAfter(response, request, { status: 500, error: typeof e.data === "object" ? JSON.stringify(e.data) : e.data ? e.data : undefined });
                    
                    // Send Middleware-Abort
                    if (this.mode === "aws-lambda") {
                        return {
                            statusCode: 500,
                            body: JSON.stringify({ status: "error", message: e.data }),
                            headers: response.headers,
                        };
                    } else if (res) {
                        res.writeHead(
                            e.status,
                            typeof e.data === "object" ? { "Content-Type": "application/json" } : { "Content-Type": "text/html" }
                        );
                        res.end(typeof e.data === "object" ? JSON.stringify(e.data) : e.data ? e.data : " ");
                    }
                    return;
                }
            }
        }

        // Handle OPTIONS-Request
        if (request && request.method === "OPTIONS") {
            if (this.mode === "aws-lambda") {
                return {
                    statusCode: 200,
                    body: "",
                    headers: response.headers,
                };
            } else if (res && req) {
                res.statusCode = 200;
                res.setHeader("Content-Length", "0");
                res.end();
                this.requestConsoleLog(req, 200);
            }
            return;
        }

        // Resolve route-component (handle controller definition)
        if (route && typeof route.component === "string") {
            const split = route.component.split("@");
            const controller = this.kernel.controller[split[0]];
            if (!controller) {
                this.handleResponseAfter(response, request, { status: 500, error: "Controller `" + split[0] + "` not found ..." });
                
                if (this.mode === "aws-lambda") {
                    return {
                        statusCode: 500,
                        body: JSON.stringify({
                            status: "error",
                            message: "Controller `" + split[0] + "` not found ...",
                        }),
                        headers: response.headers,
                    };
                } else if (res) {
                    res.writeHead(500, { "Content-Type": "text/html" });
                    res.end("Controller `" + split[0] + "` not found ...");
                }
                return;
            }

            // Set Controller method as route-component
            const controllerInstance = new controller();
            if (!controllerInstance || !split || !split[1] || !controllerInstance[split[1]]) {
                this.handleResponseAfter(response, request, { status: 500, error: "controllerInstance `" + split[1] + "` not found ..." });
                throw new Error("controllerInstance " + split[1] + " not found ...");
            }
            route.component = controllerInstance[split[1]].bind(controllerInstance);
        }

        if (route && route.component !== undefined) {
            try {
                await route.component(request, response);

                this.handleResponseAfter(response, request, { status: response.statusCode });
                if (this.mode === "aws-lambda") {
                    return {
                        statusCode: response.statusCode,
                        body: typeof response.content === "object" ? JSON.stringify(response.content) : response.content,
                        headers: response.headers,
                    };
                } else if (res && req) {
                    res.end();
                    this.requestConsoleLog(req, response.statusCode);
                }
            } catch (e: any) {
                if (process.env.APP_DEBUG_CONSOLE) {
                    console.error(e);
                }

                this.handleResponseAfter(response, request, { status: 500, error: e && e.stack && e.stack.toString().trim() !== '' ? e.stack : e && e.toString() !== '' ? e.toString() : "Error running the component ..." });
                if (this.mode === "aws-lambda") {
                    return {
                        statusCode: 500,
                        body: JSON.stringify({
                            status: "error",
                            message: "Error running the component ...",
                            error: e.toString(),
                        }),
                        headers: response.headers,
                    };
                } else if (res && req) {
                    this.sendError(res, 500, process.env.APP_DEBUG && process.env.APP_DEBUG !== "false" ? e.stack : null);
                    this.requestConsoleLog(req, 500);
                }
            }
        } else {
            this.handleResponseAfter(response, request, { status: 500, error: "Route component not found ..." });
            if (this.mode === "aws-lambda") {
                return {
                    statusCode: 500,
                    body: JSON.stringify({
                        status: "error",
                        message: "Route component not found ...",
                    }),
                    headers: response.headers,
                };
            } else if (res && req) {
                this.sendError(res, 404);
                this.requestConsoleLog(req, 404);
            }
        }
    }

    async handleResponseAfter(response: any, req: any, payload: any) {
        response.handleEvents("after", req, payload);
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
                    fs.appendFileSync(
                        filepath.trim().substring(0, 1) === "/" ? filepath : process.cwd() + "/" + filepath,
                        logString + "\n"
                    );
                }
            } catch (e) {
                console.error(e);
            }
        }
    }
}

export const Router = new RouterFacade();
