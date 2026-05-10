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
const http_1 = require("http");
const Response_1 = require("./Response");
const Request_1 = require("./Request");
const querystring_1 = __importDefault(require("querystring"));
const url_1 = __importDefault(require("url"));
const ErrorHandler_1 = require("../ErrorHandling/ErrorHandler");
const WebframezHooks_1 = require("../Hooks/WebframezHooks");
class RouterFacade {
    constructor() {
        /**
         * Basename
         */
        this.basename = null;
        /**
         * Kernel-Class
         */
        this.kernel = null;
        /**
         * Mode
         */
        this.mode = null;
        this.maxRequestBodySizeBytes = 10 * 1024 * 1024;
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
     */
    init(options) {
        this.basename = options && options.basename ? options.basename : null;
        this.kernel = options && options.kernel ? options.kernel : null;
        this.mode = options && options.mode ? options.mode : null;
        this.maxRequestBodySizeBytes =
            options && options.maxRequestBodySizeBytes !== undefined
                ? options.maxRequestBodySizeBytes
                : 10 * 1024 * 1024;
        this.routesGET = {};
        this.routesPOST = {};
        this.routesPUT = {};
        this.routesDELETE = {};
        // Load routes
        if (options.routesFunction) {
            options.routesFunction();
        }
        else {
            require(process.cwd() + "/app/routes");
        }
    }
    /**
     * Dissolves 'MyController@myFunction'
     *
     * @param str
     */
    dissolveStringComponent(str, path) {
        const split = str.split("@");
        if (!split || !split[0] || split[0].trim() === "" || !split[1] || split[1].trim() === "") {
            throw new Error("Missing Controller Route for '" + path + "'");
        }
        const controller = this.kernel.controller[split[0]];
        if (!controller) {
            throw new Error("Could not dissvole Controller '" + split[0] + "' from route ' +  path+ '");
        }
        return {
            controller: controller,
            method_name: split[1],
        };
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
        if (this.basename) {
            path = this.basename + path;
        }
        let routeConf = {
            path: path,
            options: options,
        };
        if (typeof component === "string") {
            const stringComponent = this.dissolveStringComponent(component, path);
            routeConf.controller = stringComponent.controller;
            routeConf.method_name = stringComponent.method_name;
        }
        else {
            routeConf.component = component;
        }
        if (type === "GET") {
            if (!this.routesGET[path]) {
                this.routesGET[path] = [];
            }
            this.routesGET[path].push(routeConf);
        }
        else if (type === "POST") {
            if (!this.routesPOST[path]) {
                this.routesPOST[path] = [];
            }
            this.routesPOST[path].push(routeConf);
        }
        else if (type === "PUT") {
            if (!this.routesPUT[path]) {
                this.routesPUT[path] = [];
            }
            this.routesPUT[path].push(routeConf);
        }
        else if (type === "DELETE") {
            if (!this.routesDELETE[path]) {
                this.routesDELETE[path] = [];
            }
            this.routesDELETE[path].push(routeConf);
        }
    }
    /**
     * Loads the matching route based on the request-url
     *
     * @param req
     * @returns
     */
    dissolve(req) {
        if (!req || !req.url) {
            return null;
        }
        const cleanUrl = req.url.indexOf("?") > 0
            ? req.url.substring(0, req.url.indexOf("?"))
            : req.url.indexOf("#") > 0
                ? req.url.substring(0, req.url.indexOf("#"))
                : req.url;
        if (req.method === "GET") {
            return this.dissolveRoute(this.routesGET, cleanUrl, req);
        }
        else if (req.method === "POST") {
            return this.dissolveRoute(this.routesPOST, cleanUrl, req);
        }
        else if (req.method === "PUT") {
            return this.dissolveRoute(this.routesPUT, cleanUrl, req);
        }
        else if (req.method === "DELETE") {
            return this.dissolveRoute(this.routesDELETE, cleanUrl, req);
        }
        else if (req.method === "OPTIONS") {
            if (req.headers["access-control-request-method"] === "GET") {
                return this.dissolveRoute(this.routesGET, cleanUrl, req);
            }
            else if (req.headers["access-control-request-method"] === "POST") {
                return this.dissolveRoute(this.routesPOST, cleanUrl, req);
            }
            else if (req.headers["access-control-request-method"] === "PUT") {
                return this.dissolveRoute(this.routesPUT, cleanUrl, req);
            }
            else if (req.headers["access-control-request-method"] === "DELETE") {
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
    extractParams(path, match) {
        const params = {};
        const paramNames = path.match(/\/:\w+\??/g) || [];
        const wildcards = path.match(/\/\*\*|\/\*|\*\*/g) || [];
        // Extract named parameters
        paramNames.forEach((param, index) => {
            params[param.substring(2).replace("?", "")] = match[index + 1] || null;
        });
        // Extract wildcard parameters
        let wildcardIndex = paramNames.length + 1;
        wildcards.forEach((wildcard, index) => {
            if (wildcard === "/**") {
                params["wildcard"] = match[wildcardIndex] || "";
            }
            else if (wildcard === "/*") {
                params["splat"] = match[wildcardIndex] || "";
            }
            else if (wildcard === "**") {
                params["wildcard"] = match[wildcardIndex] || "";
            }
            else if (wildcard === "*") {
                params["splat"] = match[wildcardIndex] || "";
            }
            wildcardIndex++;
        });
        return params;
    }
    escapeRegexPart(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    buildRouteRegex(path) {
        const placeholders = [];
        const addPlaceholder = (fragment) => {
            const key = "__WFZ_TOKEN_" + placeholders.length + "__";
            placeholders.push(fragment);
            return key;
        };
        const withPlaceholders = path
            .replace(/\/:\w+\?/g, () => addPlaceholder("(?:/([^/]+))?"))
            .replace(/\/:\w+/g, () => addPlaceholder("/([^/]+)"))
            .replace(/\/\*\*/g, () => addPlaceholder("/(.*)"))
            .replace(/\/\*/g, () => addPlaceholder("(?:/(.*))?"))
            .replace(/\*\*/g, () => addPlaceholder("(.*)"))
            .replace(/\*/g, () => addPlaceholder("(.*)"));
        const escaped = this.escapeRegexPart(withPlaceholders);
        const regexString = "^" + escaped.replace(/__WFZ_TOKEN_(\d+)__/g, (all, tokenIndex) => placeholders[tokenIndex]) + "$";
        return new RegExp(regexString);
    }
    normalizeDomainString(value) {
        if (!value || value.trim() === "") {
            return null;
        }
        let normalized = value.trim().toLowerCase();
        if (normalized.includes("://")) {
            normalized = normalized.split("://")[1];
        }
        if (normalized.includes("/")) {
            normalized = normalized.split("/")[0];
        }
        if (normalized.startsWith("[")) {
            const bracketEnd = normalized.indexOf("]");
            if (bracketEnd > 0) {
                normalized = normalized.substring(1, bracketEnd);
            }
        }
        else {
            normalized = normalized.replace(/:\d+$/, "");
        }
        normalized = normalized.replace(/\.$/, "");
        return normalized.trim() !== "" ? normalized : null;
    }
    getRequestHostCandidates(request) {
        if (!request || !request.headers) {
            return [];
        }
        const possibleHeaders = [
            request.headers["x-forwarded-host"],
            request.headers["x-original-host"],
            request.headers["host"],
        ];
        const values = [];
        for (const headerValue of possibleHeaders) {
            if (!headerValue) {
                continue;
            }
            if (Array.isArray(headerValue)) {
                for (const singleHeaderValue of headerValue) {
                    if (typeof singleHeaderValue === "string") {
                        values.push(...singleHeaderValue.split(","));
                    }
                }
            }
            else if (typeof headerValue === "string") {
                values.push(...headerValue.split(","));
            }
        }
        const normalizedValues = values
            .map((value) => this.normalizeDomainString(value))
            .filter((value) => !!value);
        return [...new Set(normalizedValues)];
    }
    getRouteDomainFilters(routeObj) {
        if (!routeObj || !routeObj.options || !Array.isArray(routeObj.options.domains)) {
            return [];
        }
        const domains = routeObj.options.domains
            .filter((domain) => typeof domain === "string")
            .map((domain) => this.normalizeDomainString(domain))
            .filter((domain) => !!domain);
        return [...new Set(domains)];
    }
    buildDomainRegex(domainFilter) {
        const escapedSegments = domainFilter.split("*").map((segment) => this.escapeRegexPart(segment));
        const regexBody = escapedSegments.join("(.*)");
        return new RegExp("^" + regexBody + "$", "i");
    }
    matchDomainFilter(hostname, domainFilter) {
        const regex = this.buildDomainRegex(domainFilter);
        const match = hostname.match(regex);
        if (!match) {
            return { matches: false, matchedDomain: null, wildcard: null };
        }
        const wildcardValue = domainFilter.includes("*") && match.length > 1 ? match[1] || "" : null;
        return {
            matches: true,
            matchedDomain: hostname,
            wildcard: wildcardValue,
        };
    }
    resolveDomainMatch(routeObj, request) {
        const domainFilters = this.getRouteDomainFilters(routeObj);
        if (domainFilters.length < 1) {
            return { matches: true, matchedDomain: null, wildcard: null };
        }
        const hostCandidates = this.getRequestHostCandidates(request);
        for (const hostCandidate of hostCandidates) {
            for (const domainFilter of domainFilters) {
                const match = this.matchDomainFilter(hostCandidate, domainFilter);
                if (match.matches) {
                    return match;
                }
            }
        }
        return { matches: false, matchedDomain: null, wildcard: null };
    }
    applyDomainMatchToRequest(request, domainMatch) {
        request.routeDomainMatch = domainMatch.matchedDomain;
        request.routeDomainWildcard = domainMatch.wildcard;
    }
    createMiddlewareRejectSignal(reason) {
        return {
            __middlewareReject: true,
            reason: reason,
        };
    }
    isMiddlewareRejectSignal(error) {
        return !!(error && typeof error === "object" && error.__middlewareReject === true);
    }
    /**
     * Dissolves the matching route based on the request-url and an object of routes
     *
     * @param routes
     * @param url
     * @returns
     */
    dissolveRoute(routes, url, request) {
        const exactRouteCandidates = routes[url];
        if (exactRouteCandidates && exactRouteCandidates.length > 0) {
            for (const routeObj of exactRouteCandidates) {
                const domainMatch = this.resolveDomainMatch(routeObj, request);
                if (!domainMatch.matches) {
                    continue;
                }
                if (request) {
                    request.params = {};
                    this.applyDomainMatchToRequest(request, domainMatch);
                }
                return Object.assign(Object.assign({}, routeObj), { params: {} });
            }
        }
        for (const route in routes) {
            const routeCandidates = routes[route];
            if (!Array.isArray(routeCandidates)) {
                continue;
            }
            for (const routeObj of routeCandidates) {
                const match = url.match(this.buildRouteRegex(routeObj.path));
                if (!match) {
                    continue;
                }
                const domainMatch = this.resolveDomainMatch(routeObj, request);
                if (!domainMatch.matches) {
                    continue;
                }
                const extractedParams = this.extractParams(routeObj.path, match);
                if (request) {
                    request.params = extractedParams;
                    this.applyDomainMatchToRequest(request, domainMatch);
                }
                return Object.assign(Object.assign({}, routeObj), { params: extractedParams });
            }
        }
    }
    /**
     * Processes a request
     *
     * @param req
     * @param res
     */
    handleRequest(req, res, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const httpOperationId = WebframezHooks_1.WebframezHooks.createOperationId("http");
            const initialMethod = req && req.method
                ? req.method
                : this.mode === "aws-lambda" && options && options.event && options.event.requestContext && options.event.requestContext.http
                    ? options.event.requestContext.http.method
                    : null;
            yield WebframezHooks_1.WebframezHooks.emit("http.request.start", {
                operationId: httpOperationId,
                name: initialMethod || (this.mode === "aws-lambda" ? "lambda" : "request"),
                attributes: {
                    "http.request.method": initialMethod,
                    "webframez.mode": this.mode,
                },
            });
            let request;
            let routeOperationId = null;
            try {
                request = yield this.mapRequest(req, options);
            }
            catch (e) {
                const response = new Response_1.Response({ mode: this.mode });
                if (res) {
                    response.setServerResponse(res);
                }
                const fallbackRequest = new Request_1.Request();
                if (req) {
                    fallbackRequest.headers = req.headers;
                    fallbackRequest.url = req.url ? req.url : "";
                    fallbackRequest.method = req.method ? req.method : "";
                }
                const statusCode = e && typeof e === "object" && e.statusCode && !isNaN(parseInt(e.statusCode))
                    ? parseInt(e.statusCode)
                    : 500;
                yield ErrorHandler_1.ErrorHandler.report(e, {
                    scope: "controller",
                    source: "router.mapRequest",
                    controller: {
                        method: fallbackRequest.method,
                        url: fallbackRequest.url,
                    },
                });
                const errorResult = this.handleError(fallbackRequest, response, statusCode, e);
                yield WebframezHooks_1.WebframezHooks.emit("http.request.error", {
                    operationId: httpOperationId,
                    name: `${fallbackRequest.method || "HTTP"} unmatched`,
                    status: "error",
                    error: e,
                    attributes: {
                        "http.request.method": fallbackRequest.method || null,
                        "http.response.status_code": statusCode,
                        "webframez.mode": this.mode,
                    },
                });
                return errorResult;
            }
            const route = this.dissolve(request);
            const response = new Response_1.Response({ mode: this.mode });
            if (res) {
                response.setServerResponse(res);
            }
            if (!route) {
                const notFoundResult = this.handleError(request, response, 404, "Not found '" + request.url + "' ...");
                yield WebframezHooks_1.WebframezHooks.emit("http.request.end", {
                    operationId: httpOperationId,
                    name: `${request.method} unmatched`,
                    status: "ok",
                    attributes: {
                        "http.request.method": request.method,
                        "http.response.status_code": 404,
                        "webframez.mode": this.mode,
                    },
                });
                return notFoundResult;
            }
            if (!(route.component && typeof route.component === "function") && !(route.controller && route.method_name)) {
                const missingRouteResult = this.handleError(request, response, 404, "Missing route function ...");
                yield WebframezHooks_1.WebframezHooks.emit("http.request.end", {
                    operationId: httpOperationId,
                    name: `${request.method} ${route.path}`,
                    status: "ok",
                    attributes: {
                        "http.request.method": request.method,
                        "http.response.status_code": 404,
                        "url.template": route.path,
                        "webframez.route": route.path,
                        "webframez.mode": this.mode,
                    },
                });
                return missingRouteResult;
            }
            try {
                yield this.handleMiddleware(route, request, response);
                if (request.method === "OPTIONS" && !request.skipOptionsForward) {
                    const optionsResult = this.handleReturn(request, response, "");
                    yield WebframezHooks_1.WebframezHooks.emit("http.request.end", {
                        operationId: httpOperationId,
                        name: `${request.method} ${route.path}`,
                        status: "ok",
                        attributes: {
                            "http.request.method": request.method,
                            "http.response.status_code": response.statusCode || 200,
                            "url.template": route.path,
                            "webframez.route": route.path,
                            "webframez.mode": this.mode,
                        },
                    });
                    return optionsResult;
                }
                let result = null;
                routeOperationId = WebframezHooks_1.WebframezHooks.createOperationId("route");
                yield WebframezHooks_1.WebframezHooks.emit("route.handler.start", {
                    operationId: routeOperationId,
                    parentOperationId: httpOperationId,
                    name: `${request.method} ${route.path}`,
                    attributes: {
                        "http.request.method": request.method,
                        "url.template": route.path,
                        "webframez.route": route.path,
                        "webframez.route.handler": route.controller && route.method_name
                            ? `${route.controller.name || "Controller"}@${route.method_name}`
                            : "component",
                    },
                });
                if (route.controller && route.method_name) {
                    const controllerInstance = new route.controller();
                    if (!controllerInstance[route.method_name]) {
                        const unknownMethodResult = this.handleError(request, response, 404, "Unknown method '" + route.method_name + "'.");
                        yield WebframezHooks_1.WebframezHooks.emit("route.handler.error", {
                            operationId: routeOperationId,
                            parentOperationId: httpOperationId,
                            name: `${request.method} ${route.path}`,
                            status: "error",
                            error: new Error("Unknown route method"),
                            attributes: {
                                "http.request.method": request.method,
                                "http.response.status_code": 404,
                                "url.template": route.path,
                                "webframez.route": route.path,
                                "webframez.route.handler": `${route.controller.name || "Controller"}@${route.method_name}`,
                            },
                        });
                        yield WebframezHooks_1.WebframezHooks.emit("http.request.end", {
                            operationId: httpOperationId,
                            name: `${request.method} ${route.path}`,
                            status: "ok",
                            attributes: {
                                "http.request.method": request.method,
                                "http.response.status_code": 404,
                                "url.template": route.path,
                                "webframez.route": route.path,
                                "webframez.mode": this.mode,
                            },
                        });
                        return unknownMethodResult;
                    }
                    result = yield controllerInstance[route.method_name].bind(controllerInstance)(request, response);
                }
                else {
                    result = yield route.component(request, response);
                }
                const returnResult = this.handleReturn(request, response, result);
                yield WebframezHooks_1.WebframezHooks.emit("route.handler.end", {
                    operationId: routeOperationId,
                    parentOperationId: httpOperationId,
                    name: `${request.method} ${route.path}`,
                    status: "ok",
                    attributes: {
                        "http.request.method": request.method,
                        "http.response.status_code": response.statusCode || 200,
                        "url.template": route.path,
                        "webframez.route": route.path,
                    },
                });
                yield WebframezHooks_1.WebframezHooks.emit("http.request.end", {
                    operationId: httpOperationId,
                    name: `${request.method} ${route.path}`,
                    status: "ok",
                    attributes: {
                        "http.request.method": request.method,
                        "http.response.status_code": response.statusCode || 200,
                        "url.template": route.path,
                        "webframez.route": route.path,
                        "webframez.mode": this.mode,
                    },
                });
                return returnResult;
            }
            catch (e) {
                if (this.isMiddlewareRejectSignal(e)) {
                    const middlewareErrorResult = this.handleError(request, response, 500, e.reason);
                    yield WebframezHooks_1.WebframezHooks.emit("http.request.error", {
                        operationId: httpOperationId,
                        name: `${request.method} ${route.path}`,
                        status: "error",
                        error: e.reason || e,
                        attributes: {
                            "http.request.method": request.method,
                            "http.response.status_code": 500,
                            "url.template": route.path,
                            "webframez.route": route.path,
                            "webframez.mode": this.mode,
                        },
                    });
                    return middlewareErrorResult;
                }
                yield ErrorHandler_1.ErrorHandler.report(e, {
                    scope: "controller",
                    source: "router.handleRequest",
                    controller: {
                        routePath: route.path,
                        method: request.method,
                        url: request.url,
                    },
                    metadata: {
                        params: request.params,
                        query: request.query,
                    },
                });
                const errorResult = this.handleError(request, response, 500, e);
                if (routeOperationId) {
                    yield WebframezHooks_1.WebframezHooks.emit("route.handler.error", {
                        operationId: routeOperationId,
                        parentOperationId: httpOperationId,
                        name: `${request.method} ${route.path}`,
                        status: "error",
                        error: e,
                        attributes: {
                            "http.request.method": request.method,
                            "http.response.status_code": 500,
                            "url.template": route.path,
                            "webframez.route": route.path,
                        },
                    });
                }
                yield WebframezHooks_1.WebframezHooks.emit("http.request.error", {
                    operationId: httpOperationId,
                    name: `${request.method} ${route.path}`,
                    status: "error",
                    error: e,
                    attributes: {
                        "http.request.method": request.method,
                        "http.response.status_code": 500,
                        "url.template": route.path,
                        "webframez.route": route.path,
                        "webframez.mode": this.mode,
                    },
                });
                return errorResult;
            }
        });
    }
    handleMiddleware(route, request, response) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!route || !route.options || !route.options.middleware || route.options.middleware.length < 1) {
                return;
            }
            for (let middlewareKey of route.options.middleware) {
                const middleware = this.kernel.middleware[middlewareKey];
                if (!middleware) {
                    throw new Error("Unknown middleware `" + middlewareKey + "` ...");
                }
                yield new Promise((resolve, reject) => {
                    try {
                        middleware(resolve, (reason) => reject(this.createMiddlewareRejectSignal(reason)), request, response);
                    }
                    catch (e) {
                        reject(e);
                    }
                });
            }
        });
    }
    mapRequest(req, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const request = new Request_1.Request();
            if (!req && this.mode === "aws-lambda" && options && options.event) {
                request.method = options.event.requestContext.http.method;
                request.url =
                    options.event.rawPath +
                        (options.event.rawQueryString && options.event.rawQueryString.trim() !== "" ? "?" + options.event.rawQueryString : "");
                request.headers = options.event.headers;
                request.query = options.event.queryStringParameters ? options.event.queryStringParameters : {};
                request.bodyPlain = options && options.event && options.event.body ? options.event.body : "";
            }
            else if (req && req instanceof http_1.IncomingMessage) {
                const parsedUrl = req.url ? url_1.default.parse(req.url) : null;
                const searchParams = parsedUrl && parsedUrl.query ? new URLSearchParams(parsedUrl.query) : null;
                const queryParams = searchParams ? Object.fromEntries(searchParams.entries()) : {};
                request.message = req;
                request.headers = req.headers;
                request.rawHeaders = req.rawHeaders;
                request.url = req.url ? req.url : "";
                request.method = req.method ? req.method : "";
                request.socket = req.socket;
                request.query = queryParams;
                request.queryRaw = parsedUrl && parsedUrl.query ? parsedUrl.query : "";
                request.pathname = parsedUrl ? parsedUrl.pathname : "";
                const shouldParseBody = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method.toUpperCase());
                if (shouldParseBody) {
                    const parsedBody = yield this.parseRequestBody(req);
                    request.bodyPlain = parsedBody ? parsedBody.plain : "";
                    request.body = parsedBody ? parsedBody.parsed : {};
                }
                else {
                    request.bodyPlain = "";
                    request.body = {};
                }
            }
            return request;
        });
    }
    parseRequestBody(req) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                let settled = false;
                const safeResolve = (value) => {
                    if (settled)
                        return;
                    settled = true;
                    resolve(value);
                };
                const safeReject = (error) => {
                    if (settled)
                        return;
                    settled = true;
                    reject(error);
                };
                const contentType = req.headers["content-type"] || "";
                if (contentType.includes("multipart/form-data")) {
                    safeResolve({ plain: {}, parsed: {} });
                    return;
                }
                const chunks = [];
                let bodyLength = 0;
                const maxBodySize = this.maxRequestBodySizeBytes;
                req.on("data", (chunk) => {
                    const chunkBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                    bodyLength += chunkBuffer.length;
                    if (maxBodySize !== null && maxBodySize !== undefined && maxBodySize >= 0 && bodyLength > maxBodySize) {
                        const error = new Error("Payload too large");
                        error.statusCode = 413;
                        safeReject(error);
                        return;
                    }
                    chunks.push(chunkBuffer);
                });
                req.on("end", () => {
                    const body = Buffer.concat(chunks);
                    // Content-Type Verarbeitung
                    if (contentType.includes("application/json")) {
                        try {
                            const text = body.toString();
                            safeResolve({ plain: body, parsed: text && text.trim() !== "" ? JSON.parse(text) : {} });
                        }
                        catch (e) {
                            const error = new Error("Invalid JSON");
                            error.statusCode = 400;
                            safeReject(error);
                        }
                    }
                    else if (contentType.includes("application/x-www-form-urlencoded")) {
                        safeResolve({ plain: body, parsed: querystring_1.default.parse(body.toString()) });
                    }
                    else {
                        safeResolve({ plain: body, parsed: body.toString() });
                    }
                });
                req.on("error", (err) => {
                    safeReject(err);
                });
            });
        });
    }
    handleReturn(request, response, body) {
        const contentType = response.headers["content-type"] || request.headers["content-type"] || "";
        if (response.res && response.res instanceof http_1.ServerResponse) {
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
            }
            else {
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
    handleError(request, response, statusCode, error) {
        if (error) {
            console.error(error);
        }
        if (response.res && response.res instanceof http_1.ServerResponse && response.res.writableEnded) {
            return;
        }
        const errorMessage = error && typeof error === "string" && error.trim() !== ""
            ? error.trim()
            : error && error.toString() && error.toString().trim() !== ""
                ? error.toString().trim()
                : "Internal Server Error";
        let data = "";
        const contentType = response.headers["content-type"] || request.headers["content-type"] || "";
        if (contentType.includes("application/json")) {
            if (response.res && response.res instanceof http_1.ServerResponse) {
                response.header("Content-Type", "application/json");
            }
            data = {
                status: "error",
                message: errorMessage,
            };
        }
        else {
            if (response.res && response.res instanceof http_1.ServerResponse) {
                response.header("Content-Type", "text/html");
            }
            data = "<div>" + errorMessage + "</div>";
        }
        if (response.res && response.res instanceof http_1.ServerResponse) {
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
exports.Router = new RouterFacade();
