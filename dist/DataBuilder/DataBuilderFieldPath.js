"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertFieldName = void 0;
function assertFieldName(name) {
    if (!name || name.split(/[.\[\]]/).some((part) => ["__proto__", "constructor", "prototype"].includes(part))) {
        throw new Error("Invalid DataBuilder field name: " + name);
    }
}
exports.assertFieldName = assertFieldName;
