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
exports.WebframezHooks = void 0;
let operationCounter = 0;
function parseEventName(eventName) {
    const lastDotIndex = eventName.lastIndexOf(".");
    return {
        operation: eventName.substring(0, lastDotIndex),
        phase: eventName.substring(lastDotIndex + 1),
    };
}
function normalizeErrorType(error) {
    if (!error) {
        return null;
    }
    if (error instanceof Error && error.name) {
        return error.name;
    }
    return typeof error;
}
class WebframezHooksFacade {
    constructor() {
        this.handlers = {};
    }
    createOperationId(prefix = "op") {
        operationCounter++;
        return `${prefix}-${Date.now().toString(36)}-${operationCounter.toString(36)}`;
    }
    on(eventName, handler) {
        var _a;
        if (!this.handlers[eventName]) {
            this.handlers[eventName] = new Set();
        }
        (_a = this.handlers[eventName]) === null || _a === void 0 ? void 0 : _a.add(handler);
        return () => this.off(eventName, handler);
    }
    off(eventName, handler) {
        var _a;
        (_a = this.handlers[eventName]) === null || _a === void 0 ? void 0 : _a.delete(handler);
        return this;
    }
    clear(eventName) {
        if (eventName) {
            delete this.handlers[eventName];
            return this;
        }
        this.handlers = {};
        return this;
    }
    emit(eventName, context) {
        return __awaiter(this, void 0, void 0, function* () {
            const parsed = parseEventName(eventName);
            const attributes = Object.assign({}, (context.attributes || {}));
            if (context.error && attributes["error.type"] === undefined) {
                attributes["error.type"] = normalizeErrorType(context.error);
            }
            const event = {
                type: eventName,
                context: Object.assign(Object.assign({}, context), { operation: parsed.operation, phase: parsed.phase, timestamp: context.timestamp || new Date(), attributes }),
            };
            const handlers = this.handlers[eventName];
            if (!handlers || handlers.size < 1) {
                return;
            }
            for (const handler of Array.from(handlers)) {
                try {
                    yield handler(event);
                }
                catch (handlerError) {
                    console.error("[webframez:hooks] Handler failed:", handlerError);
                }
            }
        });
    }
}
exports.WebframezHooks = new WebframezHooksFacade();
