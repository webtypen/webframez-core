"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoute = exports.Auth = exports.AuthFacade = void 0;
const Config_1 = require("../Config");
const Model_1 = require("../Database/Model");
const ModelAuth_1 = require("./ModelAuth");
function mergeOptions(base, config) {
    return Object.assign(Object.assign(Object.assign({ model: Model_1.Model }, base), config), { fields: Object.assign(Object.assign({}, base.fields), config.fields), session: Object.assign(Object.assign({}, base.session), config.session), messages: Object.assign(Object.assign({}, base.messages), config.messages) });
}
/** Application-wide registry of named browser-authentication scopes. */
class AuthFacade {
    constructor() {
        this.scopes = new Map();
        this.initialized = false;
    }
    init() {
        if (this.initialized)
            return;
        const config = Config_1.Config.get("auth") || {};
        const configured = new Map();
        for (const [key, options] of Object.entries(config.scopes || {})) {
            configured.set(key, new ModelAuth_1.AuthScope(Object.assign(Object.assign({}, mergeOptions(config.defaults || {}, options)), { key })));
        }
        if (config.main !== false && !configured.has("main")) {
            configured.set("main", new ModelAuth_1.AuthScope(Object.assign(Object.assign({}, mergeOptions(config.defaults || {}, {})), { key: "main" })));
        }
        for (const [key, scope] of configured)
            this.scopes.set(key, scope);
        this.initialized = true;
    }
    scope(key = "main") {
        this.init();
        const scope = this.scopes.get(key);
        if (!scope)
            throw new Error(`Auth scope "${key}" is not registered.`);
        return scope;
    }
    registerScope(key, config) {
        var _a;
        this.init();
        const defaults = Config_1.Config.get("auth.defaults") || {};
        const base = ((_a = this.scopes.get(key)) === null || _a === void 0 ? void 0 : _a.configuration) || defaults;
        const scope = new ModelAuth_1.AuthScope(Object.assign(Object.assign({}, mergeOptions(base, config)), { key }));
        this.scopes.set(key, scope);
        return scope;
    }
}
exports.AuthFacade = AuthFacade;
exports.Auth = new AuthFacade();
function authRoute(operation, options) {
    return (req, res) => exports.Auth.scope(options.auth || "main").handle(operation, req, res, options.loginResponse);
}
exports.authRoute = authRoute;
