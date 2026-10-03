import type { Request } from "../Router/Request";
import type { DataBuilderValidationRule } from "./DataBuilderValidationType";

export type DataBuilderFieldOptions = {
    type?: string;
    required?: boolean | ((data: any) => boolean | Promise<boolean>);
    validations?: DataBuilderValidationRule[];
    schema?: DataBuilderFields;
    // Project-specific component and v1 options are intentionally extensible.
    [key: string]: any;
};

export type DataBuilderFields = Record<string, DataBuilderFieldOptions>;

export type DataBuilderErrors = Record<string, string>;

export type DataBuilderSchema = {
    version: string;
    collection?: string;
    primaryKey?: string;
    primaryKeyPlain?: boolean;
    beforeSave?: any;
    afterSave?: any;
    beforeDelete?: any;
    afterDelete?: any;
    /** Override persistence for nested/model-backed records; authorization and hooks still run. */
    deleteHandler?: (element: any, req: Request) => Promise<void>;
    getAggregation?: any;
    events?: { [key: string]: any };
    fields: DataBuilderFields | ((req: Request) => DataBuilderFields | Promise<DataBuilderFields>);
    newDataHandler?: Function;
    canDelete?: any;
};

export type DataBuilderOptionMapping = {
    from: string;
    value: string;
    label: string;
    valuePrefix?: string;
    labelPrefix?: string;
};

export type DataBuilderOptionsMapping = DataBuilderOptionMapping | DataBuilderOptionMapping[];

export type DataBuilderFormWidth = string | number | Partial<Record<"width" | "default" | "xs" | "sm" | "md" | "lg" | "xl", string | number>>;

export type DataBuilderFormFieldDefinition = {
    field: string;
    width?: DataBuilderFormWidth;
    placement?: "content" | "actions";
    hidden?: string | boolean;
    disabled?: string | boolean;
    fields?: DataBuilderFormDefinition[];
    [key: string]: any;
};

export type DataBuilderFormTabDefinition = {
    key: string;
    title: string;
    icon?: string;
    disabled?: boolean;
    fields: DataBuilderFormDefinition[];
};

export type DataBuilderFormTabsDefinition = {
    type: "tabs";
    label?: string;
    width?: DataBuilderFormWidth;
    appearance?: "card" | "plain";
    tabs: DataBuilderFormTabDefinition[];
};

export type DataBuilderFormLayoutDefinition = {
    type: string;
    width?: DataBuilderFormWidth;
    children?: DataBuilderFormDefinition[];
    [key: string]: any;
};

export type DataBuilderFormDefinition = DataBuilderFormFieldDefinition | DataBuilderFormTabsDefinition | DataBuilderFormLayoutDefinition;

export type DataBuilderForm = {
    fields: DataBuilderFormDefinition[] | ((req: Request) => DataBuilderFormDefinition[] | Promise<DataBuilderFormDefinition[]>);
    [key: string]: any;
};

export type DataBuilderType = {
    key: string;
    singular: string;
    plural: string;
    schema: DataBuilderSchema;
    forms?:
        | { [key: string]: DataBuilderForm }
        | ((req: Request) => { [key: string]: DataBuilderForm } | Promise<{ [key: string]: DataBuilderForm }>);
    unmapped?: boolean;
};
