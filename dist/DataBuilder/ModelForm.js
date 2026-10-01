"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelForm = exports.modelFormNode = void 0;
/** Internal identity survives object spread but is omitted by JSON serialization. */
exports.modelFormNode = Symbol("ModelForm.node");
/** Request-local, server-side form definition. Component names use the frontend registry. */
class ModelForm {
    constructor() {
        this.key = "main";
    }
    options(_context) {
        return {};
    }
    component(type, settings = {}) {
        return Object.assign(Object.assign({}, settings), { type, [exports.modelFormNode]: "component" });
    }
    field(name, settings = {}) {
        return Object.assign(Object.assign({}, settings), { field: name, [exports.modelFormNode]: "field" });
    }
}
exports.ModelForm = ModelForm;
