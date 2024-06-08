"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = void 0;
const lodash_1 = __importDefault(require("lodash"));
class ConfigFacade {
    constructor() {
        this.configs = {};
    }
    register(key, component) {
        if (typeof key === "string") {
            this.configs[key] = component;
        }
        else if (Array.isArray(key)) {
            for (let conf of key) {
                if (!conf.key || !conf.component) {
                    continue;
                }
                this.configs[conf.key] = conf.component;
            }
        }
        return this;
    }
    get(key) {
        return lodash_1.default.get(this.configs, key);
    }
    set(path, value) {
        const newConfig = Object.assign({}, this.configs);
        lodash_1.default.set(newConfig, path, value);
        this.configs = newConfig;
        return this;
    }
}
exports.Config = new ConfigFacade();
