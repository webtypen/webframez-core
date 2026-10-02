const assert = require("node:assert/strict");
const test = require("node:test");
const { Router, Route, Request, WebframezHooks } = require("../dist");

function request(url, host = "one.example.com") {
    return Object.assign(new Request(), { url, method: "GET", headers: { host } });
}

test("registered patterns compile once while preserving domain, optional and wildcard matching", () => {
    const buildRoute = Router.buildRouteRegex;
    const buildDomain = Router.buildDomainRegex;
    let routeCompilations = 0;
    let domainCompilations = 0;
    Router.buildRouteRegex = function (...args) { routeCompilations++; return buildRoute.apply(this, args); };
    Router.buildDomainRegex = function (...args) { domainCompilations++; return buildDomain.apply(this, args); };
    try {
        Router.init({ basename: "", routesFunction() {
            Route.get("/items/:id", () => "item", { domains: ["*.example.com"] });
            Route.get("/optional/:tab?", () => "optional");
            Route.get("/files/**", () => "file");
            Route.get("/literal.+", () => "literal");
        } });
        assert.equal(routeCompilations, 4);
        assert.equal(domainCompilations, 1);
        for (let i = 0; i < 100; i++) {
            const req = request("/items/42");
            assert.deepEqual(Router.dissolve(req).params, { id: "42" });
            assert.equal(req.routeDomainWildcard, "one");
            assert.deepEqual(Router.dissolve(request("/optional/details")).params, { tab: "details" });
            assert.deepEqual(Router.dissolve(request("/optional")).params, { tab: null });
            assert.equal(Router.dissolve(request("/files/a/b")).params.wildcard, "a/b");
            assert.ok(Router.dissolve(request("/literal.+")));
            assert.equal(Router.dissolve(request("/literalXYZ")), undefined);
            assert.equal(Router.dissolve(request("/items/42", "elsewhere.test")), undefined);
        }
        assert.equal(routeCompilations, 4);
        assert.equal(domainCompilations, 1);
        // Runtime registration and changes through the legacy public route stores remain supported.
        Route.get("/runtime/:id", () => "runtime");
        assert.equal(Router.dissolve(request("/runtime/9")).params.id, "9");
        Router.routesGET["/manual/:id"] = [{ path: "/manual/:id", options: {} }];
        assert.equal(Router.dissolve(request("/manual/8")).params.id, "8");
        Router.routesGET["/manual/:id"][0].path = "/changed/:id";
        assert.equal(Router.dissolve(request("/changed/7")).params.id, "7");
        Router.init({ basename: "", routesFunction() { Route.get("/items/:id", () => "new"); } });
        assert.ok(Router.dissolve(request("/items/1")));
        assert.equal(Router.dissolve(request("/runtime/9")), undefined);
        assert.equal(routeCompilations, 8);
    } finally {
        Router.buildRouteRegex = buildRoute;
        Router.buildDomainRegex = buildDomain;
    }
});

test("hooks without listeners skip payload normalization and retain awaited listener snapshots", async () => {
    WebframezHooks.clear();
    assert.equal(WebframezHooks.hasListeners("http.request.start"), false);
    await WebframezHooks.emit("http.request.start", {
        operationId: "empty",
        get attributes() { throw new Error("Unused payload was read"); },
    });
    const received = [];
    let removeSecond;
    const removeFirst = WebframezHooks.on("http.request.start", async event => {
        await Promise.resolve();
        received.push(event.context.operation);
        removeSecond();
    });
    removeSecond = WebframezHooks.on("http.request.start", event => received.push(event.context.phase));
    assert.equal(WebframezHooks.hasListeners("http.request.start"), true);
    await WebframezHooks.emit("http.request.start", { operationId: "one" });
    assert.deepEqual(received, ["http.request", "start"]);
    await WebframezHooks.emit("http.request.start", { operationId: "two" });
    assert.deepEqual(received, ["http.request", "start", "http.request"]);
    removeFirst();
    assert.equal(WebframezHooks.hasListeners("http.request.start"), false);
    WebframezHooks.clear();
});

test("cached routing retains exact-route precedence and ordered domain fallbacks", () => {
    Router.init({ basename: "", routesFunction() {
        Route.get("/items/:id", () => "dynamic");
        Route.get("/items/new", () => "exact");
        Route.get("/shared/:id", () => "domain", { domains: ["*.example.com"] });
        Route.get("/shared/:id", () => "fallback");
    } });
    for (let i = 0; i < 10; i++) {
        assert.equal(Router.dissolve(request("/items/new")).component(), "exact");
        assert.equal(Router.dissolve(request("/shared/1")).component(), "domain");
        assert.equal(Router.dissolve(request("/shared/1", "elsewhere.test")).component(), "fallback");
    }
});

test("router hooks retain order, parent IDs and async completion", async () => {
    const events = [];
    WebframezHooks.clear();
    for (const name of ["http.request.start", "route.handler.start", "route.handler.end", "http.request.end"]) {
        WebframezHooks.on(name, async event => { await Promise.resolve(); events.push(event); });
    }
    try {
        Router.init({ basename: "", mode: "aws-lambda", routesFunction() { Route.get("/hooks", () => "OK"); } });
        await Router.handleRequest(null, null, {
            event: { requestContext: { http: { method: "GET" } }, rawPath: "/hooks", rawQueryString: "", headers: {} },
        });
        assert.deepEqual(events.map(event => event.type), ["http.request.start", "route.handler.start", "route.handler.end", "http.request.end"]);
        assert.equal(events[1].context.parentOperationId, events[0].context.operationId);
        assert.equal(events[2].context.operationId, events[1].context.operationId);
        assert.equal(events[3].context.operationId, events[0].context.operationId);
        assert.equal(events[3].context.attributes["http.response.status_code"], 200);
    } finally { WebframezHooks.clear(); }
});
