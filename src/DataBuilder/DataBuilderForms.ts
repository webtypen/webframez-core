import type { Request } from "../Router/Request";
import type { DataBuilderType } from "./DataBuilderTypes";
import type { ModelFormConstructor } from "./ModelForm";
import { modelFields, modelForms } from "./decorators";
import { formSchema, defaultFormFields } from "./formScope";

type FormRegistration = { model: new (...args: any[]) => any; form?: ModelFormConstructor };

export type ResolvedDataBuilderForm = { type: DataBuilderType; structured: boolean };

/** Owns model registrations and creates the selected form for one operation. */
export class DataBuilderForms {
    constructor(private readonly registerType: (type: DataBuilderType) => void = (type) => this.register(type)) {}

    private types = new Map<string, DataBuilderType>();
    private forms = new Map<string, FormRegistration>();

    get(key: string) {
        return this.types.get(key) || null;
    }

    register(type: DataBuilderType) {
        this.types.set(type.key, type);
        this.forms.delete(type.key);
    }

    registerModel(key: string, model: any) {
        if (!model) return this;
        const ctor = typeof model === "function" ? model : model.constructor;
        const decorated = modelFields(ctor);
        const forms = modelForms(ctor);
        // Support both v1 instances and static model definitions without constructing static-only models.
        const source = typeof model === "function" && !model.__schema ? new model() : model;
        const legacy = source.__schema || {};
        const fields =
            typeof legacy.fields === "function"
                ? async (req: Request) => ({ ...(await legacy.fields(req)), ...decorated })
                : { ...legacy.fields, ...decorated };
        if (typeof fields !== "function" && !Object.keys(fields).length) return this;
        const type: DataBuilderType = {
            key,
            singular: source.__singular,
            plural: source.__plural,
            schema: { version: "1", ...legacy, collection: legacy.collection || source.__table || model.__table || key, fields },
            forms: source.__forms,
        };
        this.registerType(type);
        if (forms.length) {
            const keys = new Set<string>();
            forms.forEach((Form, index) => {
                const form = new Form();
                if (!/^[a-zA-Z0-9_-]+$/.test(form.key) || keys.has(form.key))
                    throw new Error("Invalid or duplicate ModelForm key: " + form.key);
                keys.add(form.key);
                const formKey = key + ":" + form.key;
                this.registerType({ ...type, key: formKey });
                this.forms.set(formKey, { model: ctor, form: Form });
                if (index === 0 || form.key === "main") this.forms.set(key, { model: ctor, form: Form });
            });
        } else if (Object.keys(decorated).length && !source.__forms) this.forms.set(key, { model: ctor });
        return this;
    }

    async resolve(type: DataBuilderType, req: Request): Promise<ResolvedDataBuilderForm> {
        const definition = this.forms.get(type.key);
        if (!definition) return { type, structured: false };

        const fields = typeof type.schema.fields === "function" ? await type.schema.fields(req) : type.schema.fields;
        const context = { request: req, model: definition.model, data: req.body?.data, id: req.body?.__builder_id };
        const form = definition.form ? new definition.form() : null;
        const layout = form ? await form.layout(context) : defaultFormFields(fields);
        const options = form ? await form.options(context) : {};
        return {
            structured: true,
            type: {
                ...type,
                schema: { ...type.schema, fields: formSchema(fields, layout) },
                forms: { main: { ...options, fields: layout } },
            },
        };
    }
}
