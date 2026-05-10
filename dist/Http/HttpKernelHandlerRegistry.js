"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpKernelHandlerRegistry = void 0;
class HttpKernelHandlerRegistryFacade {
    constructor() {
        this.handlers = new Map();
    }
    register(name, handler) {
        if (!name || name.trim() === "") {
            throw new Error("HttpKernelHandlerRegistry.register requires a non-empty name");
        }
        if (!handler || typeof handler !== "function") {
            throw new Error("HttpKernelHandlerRegistry.register requires a handler function");
        }
        this.handlers.set(name, handler);
        return () => this.unregister(name);
    }
    unregister(name) {
        this.handlers.delete(name);
        return this;
    }
    clear() {
        this.handlers.clear();
        return this;
    }
    handle(context) {
        return __awaiter(this, void 0, void 0, function* () {
            for (const handler of Array.from(this.handlers.values())) {
                if (yield handler(context)) {
                    return true;
                }
            }
            return false;
        });
    }
}
exports.HttpKernelHandlerRegistry = new HttpKernelHandlerRegistryFacade();
