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
exports.DataBuilderForms = void 0;
const decorators_1 = require("./decorators");
const formScope_1 = require("./formScope");
/** Owns model registrations and creates the selected form for one operation. */
class DataBuilderForms {
    constructor(registerType = (type) => this.register(type)) {
        this.registerType = registerType;
        this.types = new Map();
        this.forms = new Map();
    }
    get(key) {
        return this.types.get(key) || null;
    }
    register(type) {
        this.types.set(type.key, type);
        this.forms.delete(type.key);
    }
    registerModel(key, model) {
        if (!model)
            return this;
        const ctor = typeof model === "function" ? model : model.constructor;
        const decorated = (0, decorators_1.modelFields)(ctor);
        const forms = (0, decorators_1.modelForms)(ctor);
        // Support both v1 instances and static model definitions without constructing static-only models.
        const source = typeof model === "function" && !model.__schema ? new model() : model;
        const legacy = source.__schema || {};
        const fields = typeof legacy.fields === "function"
            ? (req) => __awaiter(this, void 0, void 0, function* () { return (Object.assign(Object.assign({}, (yield legacy.fields(req))), decorated)); })
            : Object.assign(Object.assign({}, legacy.fields), decorated);
        if (typeof fields !== "function" && !Object.keys(fields).length)
            return this;
        const type = {
            key,
            singular: source.__singular,
            plural: source.__plural,
            schema: Object.assign(Object.assign({ version: "1" }, legacy), { collection: legacy.collection || source.__table || model.__table || key, fields }),
            forms: source.__forms,
        };
        this.registerType(type);
        if (forms.length) {
            const keys = new Set();
            forms.forEach((Form, index) => {
                const form = new Form();
                if (!/^[a-zA-Z0-9_-]+$/.test(form.key) || keys.has(form.key))
                    throw new Error("Invalid or duplicate ModelForm key: " + form.key);
                keys.add(form.key);
                const formKey = key + ":" + form.key;
                this.registerType(Object.assign(Object.assign({}, type), { key: formKey }));
                this.forms.set(formKey, { model: ctor, form: Form });
                if (index === 0 || form.key === "main")
                    this.forms.set(key, { model: ctor, form: Form });
            });
        }
        else if (Object.keys(decorated).length && !source.__forms)
            this.forms.set(key, { model: ctor });
        return this;
    }
    resolve(type, req) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const definition = this.forms.get(type.key);
            if (!definition)
                return { type, structured: false };
            const fields = typeof type.schema.fields === "function" ? yield type.schema.fields(req) : type.schema.fields;
            const context = { request: req, model: definition.model, data: (_a = req.body) === null || _a === void 0 ? void 0 : _a.data, id: (_b = req.body) === null || _b === void 0 ? void 0 : _b.__builder_id };
            const form = definition.form ? new definition.form() : null;
            const layout = form ? yield form.layout(context) : (0, formScope_1.defaultFormFields)(fields);
            const options = form ? yield form.options(context) : {};
            return {
                structured: true,
                type: Object.assign(Object.assign({}, type), { schema: Object.assign(Object.assign({}, type.schema), { fields: (0, formScope_1.formSchema)(fields, layout) }), forms: { main: Object.assign(Object.assign({}, options), { fields: layout }) } }),
            };
        });
    }
}
exports.DataBuilderForms = DataBuilderForms;
