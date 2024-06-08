"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Route = exports.RouteFacade = void 0;
const Router_1 = require("./Router");
class RouteFacade {
    constructor() {
        this.tempGroupPrefix = null;
        this.tempGroupMiddleware = null;
    }
    /**
     * Register a GET-Method
     *
     * @param path
     * @param component
     * @param options
     */
    get(path, component, options) {
        Router_1.Router.register("GET", (this.tempGroupPrefix ? this.tempGroupPrefix : "") + path, component, options || this.tempGroupMiddleware
            ? Object.assign(Object.assign({}, (options ? options : {})), { middleware: this.tempGroupMiddleware || (options && options.middleware)
                    ? [
                        ...(this.tempGroupMiddleware
                            ? this.tempGroupMiddleware
                            : []),
                        ...(options && options.middleware
                            ? options.middleware
                            : []),
                    ]
                    : null }) : {});
    }
    /**
     * Register a POST-Method
     *
     * @param path
     * @param component
     * @param options
     */
    post(path, component, options) {
        Router_1.Router.register("POST", (this.tempGroupPrefix ? this.tempGroupPrefix : "") + path, component, options || this.tempGroupMiddleware
            ? Object.assign(Object.assign({}, (options ? options : {})), { middleware: this.tempGroupMiddleware || (options && options.middleware)
                    ? [
                        ...(this.tempGroupMiddleware
                            ? this.tempGroupMiddleware
                            : []),
                        ...(options && options.middleware
                            ? options.middleware
                            : []),
                    ]
                    : null }) : {});
    }
    /**
     * Register a PUT-Method
     *
     * @param path
     * @param component
     * @param options
     */
    put(path, component, options) {
        Router_1.Router.register("PUT", (this.tempGroupPrefix ? this.tempGroupPrefix : "") + path, component, options || this.tempGroupMiddleware
            ? Object.assign(Object.assign({}, (options ? options : {})), { middleware: this.tempGroupMiddleware || (options && options.middleware)
                    ? [
                        ...(this.tempGroupMiddleware
                            ? this.tempGroupMiddleware
                            : []),
                        ...(options && options.middleware
                            ? options.middleware
                            : []),
                    ]
                    : null }) : {});
    }
    /**
     * Register a DELETE-Method
     *
     * @param path
     * @param component
     * @param options
     */
    delete(path, component, options) {
        Router_1.Router.register("DELETE", (this.tempGroupPrefix ? this.tempGroupPrefix : "") + path, component, options || this.tempGroupMiddleware
            ? Object.assign(Object.assign({}, (options ? options : {})), { middleware: this.tempGroupMiddleware || (options && options.middleware)
                    ? [
                        ...(this.tempGroupMiddleware
                            ? this.tempGroupMiddleware
                            : []),
                        ...(options && options.middleware
                            ? options.middleware
                            : []),
                    ]
                    : null }) : {});
    }
    group(config, children) {
        // Handle group prefix
        if (config && config.prefix && config.prefix.trim() !== "") {
            this.tempGroupPrefix =
                (this.tempGroupPrefix ? this.tempGroupPrefix : "") + config.prefix;
        }
        // Handle group middleware
        if (config && config.middleware && config.middleware.length > 0) {
            if (!this.tempGroupMiddleware || this.tempGroupMiddleware.length === 0) {
                this.tempGroupMiddleware = config.middleware;
            }
            else {
                this.tempGroupMiddleware = [
                    ...this.tempGroupMiddleware,
                    ...config.middleware,
                ];
            }
        }
        // Handle children / group body
        children();
        // Reset temp-group data
        this.tempGroupPrefix = null;
        this.tempGroupMiddleware = null;
    }
}
exports.RouteFacade = RouteFacade;
exports.Route = new RouteFacade();
