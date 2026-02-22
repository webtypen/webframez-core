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
exports.ErrorHandler = void 0;
class ErrorHandlerFacade {
    constructor() {
        this.handlers = [];
    }
    normalizeToError(error) {
        if (error instanceof Error) {
            return error;
        }
        if (typeof error === "string") {
            return new Error(error);
        }
        try {
            return new Error(JSON.stringify(error));
        }
        catch (e) {
            return new Error(String(error));
        }
    }
    setHandler(handler) {
        this.handlers = [];
        if (handler && typeof handler === "function") {
            this.handlers.push(handler);
        }
        return this;
    }
    setHandlers(handlers) {
        this.handlers = [];
        if (handlers && Array.isArray(handlers) && handlers.length > 0) {
            for (const handler of handlers) {
                if (handler && typeof handler === "function") {
                    this.handlers.push(handler);
                }
            }
        }
        return this;
    }
    addHandler(handler) {
        if (handler && typeof handler === "function") {
            this.handlers.push(handler);
        }
        return this;
    }
    clearHandlers() {
        this.handlers = [];
        return this;
    }
    report(error, context) {
        return __awaiter(this, void 0, void 0, function* () {
            const normalizedError = this.normalizeToError(error);
            const event = Object.assign({ timestamp: new Date(), error: normalizedError, originalError: error }, context);
            if (!this.handlers || this.handlers.length < 1) {
                console.error(normalizedError);
                return;
            }
            for (const handler of this.handlers) {
                try {
                    yield handler(event);
                }
                catch (handlerError) {
                    const handlerErrorMessage = this.normalizeToError(handlerError);
                    console.error("[webframez:error-handler] Handler failed:", handlerErrorMessage);
                }
            }
        });
    }
}
exports.ErrorHandler = new ErrorHandlerFacade();
