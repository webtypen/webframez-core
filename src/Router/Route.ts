import { Router } from "./Router";

type RouteRegistrationOptions = { [key: string]: any };
type RouteRegistrationHandler = (
    method: string,
    path: string,
    component: any,
    options?: RouteRegistrationOptions
) => void;

type RouteExtensionFactory = (route: RouteFacade) => (...args: any[]) => any;

export class RouteFacade {
    tempGroupPrefix: string | null = null;
    tempGroupMiddleware: string[] | null = null;
    tempGroupDomains: string[] | null = null;

    private normalizeStringArray(values: any): string[] {
        if (!Array.isArray(values)) {
            return [];
        }

        return values
            .filter((value) => typeof value === "string" && value.trim() !== "")
            .map((value) => value.trim());
    }

    private registerWithGroupContext: RouteRegistrationHandler = (method, path, component, options) => {
        const mergedOptions: RouteRegistrationOptions = {
            ...(options ? options : {}),
        };

        const middlewareFromGroup = this.normalizeStringArray(this.tempGroupMiddleware);
        const middlewareFromRoute = this.normalizeStringArray(options && options.middleware ? options.middleware : []);
        const domainsFromGroup = this.normalizeStringArray(this.tempGroupDomains);
        const domainsFromRoute = this.normalizeStringArray(options && options.domains ? options.domains : []);

        const mergedMiddleware = [...middlewareFromGroup, ...middlewareFromRoute];
        if (mergedMiddleware.length > 0) {
            mergedOptions.middleware = Array.from(new Set(mergedMiddleware));
        }

        const mergedDomains = [...domainsFromGroup, ...domainsFromRoute];
        if (mergedDomains.length > 0) {
            mergedOptions.domains = Array.from(new Set(mergedDomains));
        }

        Router.register(
            method,
            (this.tempGroupPrefix ? this.tempGroupPrefix : "") + path,
            component,
            mergedOptions
        );
    };

    /**
     * Register a custom route-method on the Route facade.
     * Allows optional packages to add framework-specific route helpers.
     */
    extend(name: string, factory: RouteExtensionFactory) {
        if (!name || name.trim() === "") {
            throw new Error("Route.extend requires a non-empty method name");
        }

        if (name in this && typeof (this as any)[name] === "function") {
            throw new Error("Route method '" + name + "' already exists");
        }

        if (!factory || typeof factory !== "function") {
            throw new Error("Route.extend requires a factory function");
        }

        (this as any)[name] = factory(this);
        return this;
    }

    /**
     * Register a GET-Method
     *
     * @param path
     * @param component
     * @param options
     */
    get(path: string, component: any, options?: RouteRegistrationOptions) {
        this.registerWithGroupContext("GET", path, component, options);
    }

    /**
     * Register a POST-Method
     *
     * @param path
     * @param component
     * @param options
     */
    post(path: string, component: any, options?: RouteRegistrationOptions) {
        this.registerWithGroupContext("POST", path, component, options);
    }

    /**
     * Register a PUT-Method
     *
     * @param path
     * @param component
     * @param options
     */
    put(path: string, component: any, options?: RouteRegistrationOptions) {
        this.registerWithGroupContext("PUT", path, component, options);
    }

    /**
     * Register a DELETE-Method
     *
     * @param path
     * @param component
     * @param options
     */
    delete(path: string, component: any, options?: RouteRegistrationOptions) {
        this.registerWithGroupContext("DELETE", path, component, options);
    }

    group(config: { [key: string]: any }, children: any) {
        // Handle group prefix
        const tempGroupPrefixBefore = this.tempGroupPrefix ? this.tempGroupPrefix + "" : null;
        const tempGroupMiddlewareBefore =
            this.tempGroupMiddleware && this.tempGroupMiddleware.length > 0 ? [...this.tempGroupMiddleware] : null;
        const tempGroupDomainsBefore = this.tempGroupDomains && this.tempGroupDomains.length > 0 ? [...this.tempGroupDomains] : null;
        if (config && config.prefix && config.prefix.trim() !== "") {
            this.tempGroupPrefix = (this.tempGroupPrefix ? this.tempGroupPrefix : "") + config.prefix;
        }

        // Handle group middleware
        const groupMiddleware = this.normalizeStringArray(config && config.middleware ? config.middleware : []);
        if (groupMiddleware.length > 0) {
            if (!this.tempGroupMiddleware || this.tempGroupMiddleware.length === 0) {
                this.tempGroupMiddleware = [...groupMiddleware];
            } else {
                this.tempGroupMiddleware = [...new Set([...this.tempGroupMiddleware, ...groupMiddleware])];
            }
        }

        // Handle group domains
        const groupDomains = this.normalizeStringArray(config && config.domains ? config.domains : []);
        if (groupDomains.length > 0) {
            if (!this.tempGroupDomains || this.tempGroupDomains.length === 0) {
                this.tempGroupDomains = [...groupDomains];
            } else {
                this.tempGroupDomains = [...new Set([...this.tempGroupDomains, ...groupDomains])];
            }
        }

        // Handle children / group body
        children();

        // Reset temp-group data
        this.tempGroupPrefix = tempGroupPrefixBefore;
        this.tempGroupMiddleware = tempGroupMiddlewareBefore;
        this.tempGroupDomains = tempGroupDomainsBefore;
    }
}

export const Route = new RouteFacade();
