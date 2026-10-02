import { Config } from "../Config";
import { Model } from "../Database/Model";
import type { Request } from "../Router/Request";
import type { Response } from "../Router/Response";
import { AuthScope, AuthScopeOptions, AuthOperation, AuthRouteOptions } from "./ModelAuth";

export type AuthConfig = {
    /** Disable automatic main creation; explicitly configured scopes remain available. */
    main?: boolean;
    defaults?: Partial<AuthScopeOptions>;
    scopes?: Record<string, AuthScopeOptions>;
};

function mergeOptions(base: Partial<AuthScopeOptions>, config: Partial<AuthScopeOptions>): AuthScopeOptions {
    return { model: Model, ...base, ...config,
        fields: { ...base.fields, ...config.fields },
        session: { ...base.session, ...config.session },
        passwordReset: config.passwordReset === false ? false : config.passwordReset === undefined && base.passwordReset === false ? false
            : { ...(base.passwordReset || {}), ...(config.passwordReset || {}) },
        messages: { ...base.messages, ...config.messages } };
}

/** Application-wide registry of named browser-authentication scopes. */
export class AuthFacade {
    private readonly scopes = new Map<string, AuthScope>();
    private initialized = false;

    init(): void {
        if (this.initialized) return;
        const config: AuthConfig = Config.get("auth") || {};
        const configured = new Map<string, AuthScope>();
        for (const [key, options] of Object.entries(config.scopes || {})) {
            configured.set(key, new AuthScope({ ...mergeOptions(config.defaults || {}, options), key }));
        }
        if (config.main !== false && !configured.has("main")) {
            configured.set("main", new AuthScope({ ...mergeOptions(config.defaults || {}, {}), key: "main" }));
        }
        for (const [key, scope] of configured) this.scopes.set(key, scope);
        this.initialized = true;
    }

    scope(key = "main"): AuthScope {
        this.init();
        const scope = this.scopes.get(key);
        if (!scope) throw new Error(`Auth scope "${key}" is not registered.`);
        return scope;
    }

    async revokeUserSessions(model: typeof Model, subject: string): Promise<void> {
        this.init();
        for (const scope of this.scopes.values()) {
            if (scope.configuration.model === model) await scope.sessions.revokeAll(subject);
        }
    }

    registerScope(key: string, config: Partial<AuthScopeOptions>): AuthScope {
        this.init();
        const defaults = Config.get("auth.defaults") || {};
        const base = this.scopes.get(key)?.configuration || defaults;
        const scope = new AuthScope({ ...mergeOptions(base, config), key });
        this.scopes.set(key, scope);
        return scope;
    }
}

export const Auth = new AuthFacade();

export function authRoute(operation: AuthOperation, options: AuthRouteOptions) {
    return (req: Request, res: Response) => Auth.scope(options.auth || "main").handle(operation, req, res, options.loginResponse);
}
