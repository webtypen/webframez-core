import { IncomingMessage, ServerResponse } from "http";
import { Response } from "./Response";
import { Request } from "./Request";
import querystring from "querystring";

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
        if (options.routesFunction) {
            options.routesFunction();
        } else {
            require(process.cwd() + "/app/routes");
        }
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
    dissolve(req: Request): RouteObject | null {
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
            return this.dissolveRoute(this.routesGET, cleanUrl, req);
        } else if (req.method === "POST") {
            return this.dissolveRoute(this.routesPOST, cleanUrl, req);
        } else if (req.method === "PUT") {
            return this.dissolveRoute(this.routesPUT, cleanUrl, req);
        } else if (req.method === "DELETE") {
            return this.dissolveRoute(this.routesDELETE, cleanUrl, req);
        } else if (req.method === "OPTIONS") {
            if (req.headers["access-control-request-method"] === "GET") {
                return this.dissolveRoute(this.routesGET, cleanUrl, req);
            } else if (req.headers["access-control-request-method"] === "POST") {
                return this.dissolveRoute(this.routesPOST, cleanUrl, req);
            } else if (req.headers["access-control-request-method"] === "PUT") {
                return this.dissolveRoute(this.routesPUT, cleanUrl, req);
            } else if (req.headers["access-control-request-method"] === "DELETE") {
                return this.dissolveRoute(this.routesDELETE, cleanUrl, req);
            }
        }
        return null;
    }

    /**
     * Extrahiert die Parameterwerte aus einer URL basierend auf einem Routenpfad.
     * @param {string} path - Der Routenpfad.
     * @param {Array} match - Das Match-Array des regulären Ausdrucks.
     * @returns {Object} - Ein Objekt mit den extrahierten Parametern.
     */
    extractParams(path: string, match: any) {
        const params: any = {};
        const paramNames = path.match(/\/:([\w]+)\??/g) || [];

        paramNames.forEach((param, index) => {
            params[param.substring(2).replace("?", "")] = match[index + 1] || null;
        });

        return params;
    }

    /**
     * Dissolves the matching route based on the request-url and an object of routes
     *
     * @param routes
     * @param url
     * @returns
     */
    dissolveRoute(routes: any, url: string, request?: Request) {
        if (routes[url]) {
            // If url matches directly -> instant return
            return { ...routes[url], params: {} };
        } else {
            for (const route in routes) {
                const routeObj = routes[route];
                const regex = routeObj.path
                    .replace(/\/:\w+\?/g, "(?:/([^/]+))?")
                    .replace(/\/:\w+/g, "/([^/]+)")
                    .replace(/\//g, "\\/");
                const match = url.match(regex);

                if (match) {
                    if (request) {
                        request.params = this.extractParams(routeObj.path, match);
                        return { ...routeObj };
                    }
                    return { ...routeObj, params: this.extractParams(routeObj.path, match) };
                }
            }
        }
    }

    /**
     * Processes a request
     *
     * @param req
     * @param res
     */
    async handleRequest(req: null | IncomingMessage, res: null | ServerResponse, options?: any) {
        const request = await this.mapRequest(req, options);

        const route = this.dissolve(request);
        const response = new Response({ mode: this.mode });
        if (res) {
            response.setServerResponse(res);
        }

        if (!route) {
            return this.handleError(request, response, 404, "Not found ...");
        }

        if (!route.component) {
            return this.handleError(request, response, 404, "Missing route function ...");
        }

        try {
            await this.handleMiddleware(route, request, response);

            if (request.method === "OPTIONS" && !request.skipOptionsForward) {
                return this.handleReturn(request, response, "");
            }

            const result = await route.component(request, response);
            this.handleReturn(request, response, result);
        } catch (e: any) {
            return this.handleError(request, response, 500, e);
        }
    }

    async handleMiddleware(route: RouteObject, request: Request, response: Response) {
        if (!route || !route.options || !route.options.middleware || route.options.middleware.length < 1) {
            return;
        }

        for (let middlewareKey of route.options.middleware) {
            const middleware = this.kernel.middleware[middlewareKey];
            if (!middleware) {
                throw new Error("Unknown middleware `" + middlewareKey + "` ...");
            }

            await new Promise((resolve, reject) => {
                try {
                    middleware(resolve, reject, request, response);
                } catch (e) {
                    reject(e);
                }
            });
        }
    }

    async mapRequest(req: null | IncomingMessage, options?: any) {
        const request = new Request();
        if (!req && this.mode === "aws-lambda" && options && options.event) {
            request.method = options.event.requestContext.http.method;
            request.url =
                options.event.rawPath +
                (options.event.rawQueryString && options.event.rawQueryString.trim() !== "" ? "?" + options.event.rawQueryString : "");
            request.headers = options.event.headers;
            request.query = options.event.queryStringParameters ? options.event.queryStringParameters : {};
            request.bodyPlain = options && options.event && options.event.body ? options.event.body : "";
        } else if (req && req instanceof IncomingMessage) {
            const parsedBody: any = await this.parseRequestBody(req);
            request.message = req;
            request.bodyPlain = parsedBody ? parsedBody.plain : "";
            request.body = parsedBody ? parsedBody.parsed : {};
            request.headers = req.headers;
            request.rawHeaders = req.rawHeaders;
            request.url = req.url ? req.url : "";
            request.method = req.method ? req.method : "";
            request.socket = req.socket;
        }
        return request;
    }

    async parseRequestBody(req: IncomingMessage) {
        return new Promise((resolve, reject) => {
            const contentType = req.headers["content-type"] || "";
            if (contentType.includes("multipart/form-data")) {
                resolve({ plain: {}, parsed: {} });
                return;
            }

            let body: any = [];
            req.on("data", (chunk: any) => {
                body.push(chunk);
            });

            req.on("end", () => {
                body = Buffer.concat(body);

                // Content-Type Verarbeitung
                if (contentType.includes("application/json")) {
                    try {
                        resolve({ plain: body, parsed: JSON.parse(body.toString()) });
                    } catch (e) {
                        reject(new Error("Invalid JSON"));
                    }
                } else if (contentType.includes("application/x-www-form-urlencoded")) {
                    resolve({ plain: body, parsed: querystring.parse(body.toString()) });
                } else {
                    resolve({ plain: body, parsed: body.toString() });
                }
            });

            req.on("error", (err) => {
                reject(err);
            });
        });
    }

    handleReturn(request: Request, response: Response, body: any) {
        const contentType = response.headers["content-type"] || request.headers["content-type"] || "";
        if (response.res && response.res instanceof ServerResponse) {
            if (!response.res.statusCode) {
                response.res.statusCode = 200;
            }

            // @Todo
            if (typeof body === "object" && !Buffer.isBuffer(body)) {
                // if (!response.res.headersSent) {
                //     response.header("Content-Type", "application/json");
                // }
                // if (!response.res.writableEnded) {
                //     response.res.write(JSON.stringify(body));
                // }
            } else {
                // if(!response.res.)
                // if (!response.res.writableEnded) {
                //     response.res.write(body);
                // }
            }

            response.end();
            return;
        }

        return {
            statusCode: response.statusCode ? response.statusCode : 200,
            body: contentType.includes("application/json") ? JSON.stringify(body) : body,
            headers: response.headers,
        };
    }

    handleError(request: Request, response: Response, statusCode: number, error: Error | string) {
        if (error) {
            console.error(error);
        }

        if (response.res && response.res instanceof ServerResponse && response.res.writableEnded) {
            return;
        }

        const errorMessage =
            error && typeof error === "string" && error.trim() !== ""
                ? error.trim()
                : error && error.toString() && error.toString().trim() !== ""
                ? error.toString().trim()
                : "Internal Server Error";

        let data: any = "";
        const contentType = response.headers["content-type"] || request.headers["content-type"] || "";
        if (contentType.includes("application/json")) {
            if (response.res && response.res instanceof ServerResponse) {
                response.header("Content-Type", "application/json");
            }

            data = {
                status: "error",
                message: errorMessage,
            };
        } else {
            if (response.res && response.res instanceof ServerResponse) {
                response.header("Content-Type", "text/html");
            }

            data = "<div>" + errorMessage + "</div>";
        }

        if (response.res && response.res instanceof ServerResponse) {
            response.status(statusCode);
            response.send(data);
            response.end();
            return;
        }

        return {
            statusCode: statusCode,
            body: contentType.includes("application/json") ? JSON.stringify(data) : data,
            headers: response.headers,
        };
    }
}

export const Router = new RouterFacade();
