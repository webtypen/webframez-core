import type { Request } from "../Router/Request";
import type { DataBuilderForm, DataBuilderFormDefinition, DataBuilderFormFieldDefinition } from "./DataBuilderTypes";

/** Internal identity survives object spread but is omitted by JSON serialization. */
export const modelFormNode = Symbol("ModelForm.node");

export type ModelFormNode = DataBuilderFormDefinition & { [modelFormNode]: "field" | "component" };

export type ModelFormContext<T = any> = {
    request: Request;
    model: new (...args: any[]) => T;
    /** Submitted values; never an authorization source. */
    data: any;
    id?: string;
};

export type ModelFormConstructor = new () => ModelForm<any>;

/** Request-local, server-side form definition. Component names use the frontend registry. */
export abstract class ModelForm<T = any> {
    key = "main";

    abstract layout(context: ModelFormContext<T>): DataBuilderFormDefinition[] | Promise<DataBuilderFormDefinition[]>;

    options(_context: ModelFormContext<T>): Omit<DataBuilderForm, "fields"> | Promise<Omit<DataBuilderForm, "fields">> {
        return {};
    }

    protected component(type: string, settings: Record<string, any> = {}): ModelFormNode {
        return { ...settings, type, [modelFormNode]: "component" };
    }

    protected field(
        name: string,
        settings: Omit<DataBuilderFormFieldDefinition, "field"> = {},
    ): DataBuilderFormFieldDefinition & ModelFormNode {
        return { ...settings, field: name, [modelFormNode]: "field" };
    }
}
