"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Router = void 0;
const qs_1 = __importDefault(require("qs"));
const Response_1 = require("./Response");
// @ts-ignore
const Kernel_1 = require("../../../../../app/Kernel");
class RouterFacade {
    constructor() {
        /**
         * GET Route Store
         */
        this.routesGET = {};
        /**
         * POST Route Store
         */
        this.routesPOST = {};
        /**
         * PUT Route Store
         */
        this.routesPUT = {};
        /**
         * DELETE Route Store
         */
        this.routesDELETE = {};
    }
    /**
     * Load the application-routes
     *
     */
    init() {
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
    register(type, path, component, options) {
        if (type === "GET") {
            this.routesGET[path] = {
                path: path,
                component: component,
                options: options,
            };
        }
        else if (type === "POST") {
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
    dissolve(req) {
        if (!req.url) {
            return null;
        }
        if (req.method === "GET") {
            return this.dissolveRoute(this.routesGET, req.url);
        }
        else if (req.method === "POST") {
            return this.dissolveRoute(this.routesPOST, req.url);
        }
        else if (req.method === "PUT") {
            return this.dissolveRoute(this.routesPUT, req.url);
        }
        else if (req.method === "DELETE") {
            return this.dissolveRoute(this.routesDELETE, req.url);
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
    dissolveRoute(routes, url) {
        if (routes[url]) {
            // If url matches directly -> instant return
            return Object.assign(Object.assign({}, routes[url]), { params: {} });
        }
        else {
            // Try to find the matching route: Run through the slash-separated parts of the route
            const partsRequest = url.split("/");
            for (let path in routes) {
                let status = true;
                const parts = path.split("/");
                const params = {};
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
                    return Object.assign(Object.assign({}, routes[path]), { params: params });
                }
            }
        }
    }
    /**
     * Sends the default 404-Page
     *
     * @param res
     */
    sendError(res, code, message) {
        res.writeHead(code, { "Content-Type": "text/html" });
        res.end(message
            ? message
            : code === 404
                ? "Oops! Page not found ..."
                : "Oops! There was an unexpected error ...");
    }
    /**
     * Processes a request
     *
     * @param req
     * @param res
     */
    handleRequest(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            const route = this.dissolve(req);
            // Check-Middleware
            if (route &&
                route.options &&
                route.options.middleware &&
                route.options.middleware.length > 0) {
                for (let middlewareKey of route.options.middleware) {
                    const middleware = Kernel_1.Kernel.middleware[middlewareKey];
                    if (!middleware) {
                        return this.sendError(res, 500, "Unknown middleware `" + middlewareKey + "` ...");
                    }
                    try {
                        yield new Promise((resolve, reject) => {
                            try {
                                middleware(resolve, (status, data) => {
                                    reject({ status: status, data: data });
                                }, req, res);
                            }
                            catch (e) {
                                console.error(e);
                                return this.sendError(res, 500, "Error in middleware `" + middlewareKey + "` ...");
                            }
                        });
                    }
                    catch (e) {
                        // Send Middleware-Abort
                        res.writeHead(e.status, typeof e.data === "object"
                            ? { "Content-Type": "application/json" }
                            : { "Content-Type": "text/html" });
                        res.end(typeof e.data === "object"
                            ? JSON.stringify(e.data)
                            : e.data
                                ? e.data
                                : " ");
                        return;
                    }
                }
            }
            // Resolve route-component (handle controller definition)
            if (route && typeof route.component === "string") {
                const split = route.component.split("@");
                const controller = Kernel_1.Kernel.controller[split[0]];
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
                let body = [];
                const bodyPlain = yield new Promise((resolve) => {
                    req
                        .on("data", (chunk) => {
                        body.push(chunk);
                    })
                        .on("end", () => {
                        resolve(Buffer.concat(body).toString());
                    });
                });
                try {
                    yield route.component({
                        body: bodyPlain ? qs_1.default.parse(bodyPlain) : {},
                        bodyPlain: bodyPlain,
                        params: route.params,
                        httpVersionMajor: req.httpVersionMajor,
                        httpVersionMinor: req.httpVersionMinor,
                        httpVersion: req.httpVersion,
                        headers: req.headers,
                        rawHeaders: req.rawHeaders,
                        url: req.url,
                        method: req.method,
                    }, new Response_1.Response().setServerResponse(res));
                    res.end();
                }
                catch (e) {
                    console.error(e);
                    this.sendError(res, 500);
                }
            }
            else {
                this.sendError(res, 404);
            }
        });
    }
}
exports.Router = new RouterFacade();
