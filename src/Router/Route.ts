import { Router } from "./Router";

export class RouteFacade {
  tempGroupPrefix: string | null = null;
  tempGroupMiddleware: string[] | null = null;

  /**
   * Register a GET-Method
   *
   * @param path
   * @param component
   * @param options
   */
  get(path: string, component: any, options?: { [key: string]: any }) {
    Router.register(
      "GET",
      (this.tempGroupPrefix ? this.tempGroupPrefix : "") + path,
      component,
      options || this.tempGroupMiddleware
        ? {
            ...(options ? options : {}),
            middleware:
              this.tempGroupMiddleware || (options && options.middleware)
                ? [
                    ...(this.tempGroupMiddleware
                      ? this.tempGroupMiddleware
                      : []),
                    ...(options && options.middleware
                      ? options.middleware
                      : []),
                  ]
                : null,
          }
        : {}
    );
  }

  /**
   * Register a POST-Method
   *
   * @param path
   * @param component
   * @param options
   */
  post(path: string, component: any, options?: { [key: string]: any }) {
    Router.register(
      "POST",
      (this.tempGroupPrefix ? this.tempGroupPrefix : "") + path,
      component,
      options || this.tempGroupMiddleware
        ? {
            ...(options ? options : {}),
            middleware:
              this.tempGroupMiddleware || (options && options.middleware)
                ? [
                    ...(this.tempGroupMiddleware
                      ? this.tempGroupMiddleware
                      : []),
                    ...(options && options.middleware
                      ? options.middleware
                      : []),
                  ]
                : null,
          }
        : {}
    );
  }

  /**
   * Register a PUT-Method
   *
   * @param path
   * @param component
   * @param options
   */
  put(path: string, component: any, options?: { [key: string]: any }) {
    Router.register(
      "PUT",
      (this.tempGroupPrefix ? this.tempGroupPrefix : "") + path,
      component,
      options || this.tempGroupMiddleware
        ? {
            ...(options ? options : {}),
            middleware:
              this.tempGroupMiddleware || (options && options.middleware)
                ? [
                    ...(this.tempGroupMiddleware
                      ? this.tempGroupMiddleware
                      : []),
                    ...(options && options.middleware
                      ? options.middleware
                      : []),
                  ]
                : null,
          }
        : {}
    );
  }

  /**
   * Register a DELETE-Method
   *
   * @param path
   * @param component
   * @param options
   */
  delete(path: string, component: any, options?: { [key: string]: any }) {
    Router.register(
      "DELETE",
      (this.tempGroupPrefix ? this.tempGroupPrefix : "") + path,
      component,
      options || this.tempGroupMiddleware
        ? {
            ...(options ? options : {}),
            middleware:
              this.tempGroupMiddleware || (options && options.middleware)
                ? [
                    ...(this.tempGroupMiddleware
                      ? this.tempGroupMiddleware
                      : []),
                    ...(options && options.middleware
                      ? options.middleware
                      : []),
                  ]
                : null,
          }
        : {}
    );
  }

  group(config: { [key: string]: any }, children: any) {
    // Handle group prefix
    if (config && config.prefix && config.prefix.trim() !== "") {
      this.tempGroupPrefix =
        (this.tempGroupPrefix ? this.tempGroupPrefix : "") + config.prefix;
    }

    // Handle group middleware
    if (config && config.middleware && config.middleware.length > 0) {
      if (!this.tempGroupMiddleware || this.tempGroupMiddleware.length === 0) {
        this.tempGroupMiddleware = config.middleware;
      } else {
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

export const Route = new RouteFacade();
