const assert = require("node:assert/strict");
const test = require("node:test");
const { ApiFunction, ApiScope, ApiScopeRegistry, Route, Router, Request } = require("../dist");

function initialize(middleware) {
    const functions = ["GET", "POST", "PUT", "PATCH", "DELETE"].map(method => class extends ApiFunction {
        key = method.toLowerCase();
        requestMethod = method;
        params = {};
    });
    class Scope extends ApiScope {
        key = "middleware-test";
        apiBasePath = "/api/scope";
        routeMiddleware = middleware;
        functions = functions;
    }
    Router.init({ basename: "", routesFunction() {
        Route.group({ middleware: ["outer"] }, () => {
            ApiScopeRegistry.register({ kernel: { apiScopes: [Scope] }, modulesLoader: null });
        });
    } });
}

test("API-scope middleware survives HTTP and automatic preflight route resolution", () => {
    initialize(["cors"]);
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
        const url = `/api/scope/${method.toLowerCase()}`;
        for (const requestMethod of [method, "OPTIONS"]) {
            const request = Object.assign(new Request(), { url, method: requestMethod,
                headers: { "access-control-request-method": method } });
            const route = Router.dissolve(request);
            assert.ok(route);
            assert.deepEqual(route.options.middleware, ["outer", "cors"]);
        }
    }
});

test("empty API-scope middleware retains surrounding route middleware", () => {
    initialize([]);
    const route = Router.dissolve(Object.assign(new Request(), { url: "/api/scope/get", method: "GET" }));
    assert.deepEqual(route.options.middleware, ["outer"]);
});
