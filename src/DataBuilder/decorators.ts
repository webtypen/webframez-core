import type { ModelFormConstructor } from "./ModelForm";
import type { DataBuilderValidationRule } from "./DataBuilderValidationType";

import { assertFieldName } from "./DataBuilderFieldPath";
import type { DataBuilderFieldOptions } from "./DataBuilderTypes";

export type { DataBuilderFieldOptions } from "./DataBuilderTypes";

const fields = new WeakMap<Function, Record<string, DataBuilderFieldOptions>>();
const forms = new WeakMap<Function, () => ModelFormConstructor[]>();

function ownField(target: any, property: string | symbol) {
    if (typeof property !== "string") throw new Error("DataBuilder fields require string property names");
    assertFieldName(property);
    const ctor = typeof target === "function" ? target : target.constructor;
    let metadata = fields.get(ctor);
    if (!metadata) {
        metadata = {};
        fields.set(ctor, metadata);
    }
    if (!Object.prototype.hasOwnProperty.call(metadata, property)) metadata[property] = {};
    return metadata[property];
}

/** TypeScript declare types are erased: use type for non-string fields. */
export function Field(options: DataBuilderFieldOptions = {}): PropertyDecorator {
    return (target, property) => {
        const field = ownField(target, property);
        const validations = [...(field.validations || []), ...(options.validations || [])];
        Object.assign(field, options);
        if (validations.length) field.validations = validations;
    };
}

export function Validates(...rules: DataBuilderValidationRule[]): PropertyDecorator {
    return (target, property) => {
        const field = ownField(target, property);
        field.validations = [...(field.validations || []), ...rules];
    };
}

export function Forms(factory: () => ModelFormConstructor[]): ClassDecorator {
    return (target) => {
        forms.set(target, factory);
    };
}

export function modelFields(ctor: Function): Record<string, DataBuilderFieldOptions> {
    const parent = Object.getPrototypeOf(ctor);
    const inherited = parent && parent !== Function.prototype ? modelFields(parent) : {};
    for (const [name, field] of Object.entries(fields.get(ctor) || {})) {
        inherited[name] = {
            type: "string",
            ...inherited[name],
            ...field,
            validations: [...(inherited[name]?.validations || []), ...(field.validations || [])],
        };
    }
    return inherited;
}

export function modelForms(ctor: any): ModelFormConstructor[] {
    const factory = forms.get(ctor);
    if (factory) return factory();
    if (Object.prototype.hasOwnProperty.call(ctor, "forms")) return typeof ctor.forms === "function" ? ctor.forms() : ctor.forms;
    const parent = Object.getPrototypeOf(ctor);
    return parent && parent !== Function.prototype ? modelForms(parent) : [];
}
