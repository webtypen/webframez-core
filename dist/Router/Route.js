"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Route = exports.RouteFacade = void 0;
const Router_1 = require("./Router");
class RouteFacade {
    constructor() {
        this.tempGroupPrefix = null;
        this.tempGroupMiddleware = null;
        this.registerWithGroupContext = (method, path, component, options) => {
            Router_1.Router.register(method, (this.tempGroupPrefix ? this.tempGroupPrefix : "") + path, component, options || this.tempGroupMiddleware
                ? Object.assign(Object.assign({}, (options ? options : {})), { middleware: this.tempGroupMiddleware || (options && options.middleware)
                        ? [
                            ...(this.tempGroupMiddleware ? this.tempGroupMiddleware : []),
                            ...(options && options.middleware ? options.middleware : []),
                        ]
                        : null }) : {});
        };
    }
    /**
     * Register a custom route-method on the Route facade.
     * Allows optional packages to add framework-specific route helpers.
     */
    extend(name, factory) {
        if (!name || name.trim() === "") {
            throw new Error("Route.extend requires a non-empty method name");
        }
        if (name in this && typeof this[name] === "function") {
            throw new Error("Route method '" + name + "' already exists");
        }
        if (!factory || typeof factory !== "function") {
            throw new Error("Route.extend requires a factory function");
        }
        this[name] = factory(this);
        return this;
    }
    /**
     * Register a GET-Method
     *
     * @param path
     * @param component
     * @param options
     */
    get(path, component, options) {
        this.registerWithGroupContext("GET", path, component, options);
    }
    /**
     * Register a POST-Method
     *
     * @param path
     * @param component
     * @param options
     */
    post(path, component, options) {
        this.registerWithGroupContext("POST", path, component, options);
    }
    /**
     * Register a PUT-Method
     *
     * @param path
     * @param component
     * @param options
     */
    put(path, component, options) {
        this.registerWithGroupContext("PUT", path, component, options);
    }
    /**
     * Register a DELETE-Method
     *
     * @param path
     * @param component
     * @param options
     */
    delete(path, component, options) {
        this.registerWithGroupContext("DELETE", path, component, options);
    }
    group(config, children) {
        // Handle group prefix
        const tempGroupPrefixBefore = this.tempGroupPrefix ? this.tempGroupPrefix + "" : null;
        const tempGroupMiddlewareBefore = this.tempGroupMiddleware && this.tempGroupMiddleware.length > 0 ? this.tempGroupMiddleware : null;
        if (config && config.prefix && config.prefix.trim() !== "") {
            this.tempGroupPrefix = (this.tempGroupPrefix ? this.tempGroupPrefix : "") + config.prefix;
        }
        // Handle group middleware
        if (config && config.middleware && config.middleware.length > 0) {
            if (!this.tempGroupMiddleware || this.tempGroupMiddleware.length === 0) {
                this.tempGroupMiddleware = config.middleware;
            }
            else {
                this.tempGroupMiddleware = [...this.tempGroupMiddleware, ...config.middleware];
            }
        }
        // Handle children / group body
        children();
        // Reset temp-group data
        this.tempGroupPrefix = tempGroupPrefixBefore;
        this.tempGroupMiddleware = tempGroupMiddlewareBefore;
    }
}
exports.RouteFacade = RouteFacade;
exports.Route = new RouteFacade();
