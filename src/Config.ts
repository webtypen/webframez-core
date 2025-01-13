import lodash from "lodash";

type ConfigType = {
    key: string;
    component: any;
};

class ConfigFacade {
    configs: { [key: string]: any } = {};

    register(key: string | ConfigType[], component: { [key: string]: any }) {
        if (typeof key === "string") {
            this.configs[key] = component;
        } else if (Array.isArray(key)) {
            for (let conf of key) {
                if (!conf.key || !conf.component) {
                    continue;
                }
                this.configs[conf.key] = conf.component;
            }
        }
        return this;
    }

    get(key: string) {
        return lodash.get(this.configs, key);
    }

    set(path: string, value: any | null | undefined) {
        const newConfig = { ...this.configs };
        lodash.set(newConfig, path, value);
        this.configs = newConfig;
        return this;
    }
}

export const Config = new ConfigFacade();
