import type { Request } from "../Router/Request";
import type { DataBuilderFieldOptions, DataBuilderFields } from "./DataBuilderTypes";

export type DataBuilderValidationContext = {
    field: DataBuilderFieldOptions;
    path: string;
    data: any;
    payload: any;
    request?: Request;
    structured: boolean;
};

/** Conversion-only capabilities are deliberately absent from validation contexts. */
export type DataBuilderFieldContext = DataBuilderValidationContext & {
    currentValue?: any;
    objectId: (value?: any) => Promise<any>;
    applyChildren: (fields: DataBuilderFields, target: any, path: string) => Promise<any>;
};

export type LegacyDataBuilderFieldType = {
    key?: string;
    type?: string;
    onSave?: (value: any, payload?: any) => any;
    onSearch?: (query: string, request: Request) => any;
    [key: string]: any;
};

/** Base for project field types. Missing/empty values are handled before conversion. */
export const DataBuilderFieldType = class DataBuilderFieldType {
    key = "string";
    type = "string";
    onSave?: (value: any, payload?: any) => any;
    onSearch?: (query: string, request: Request) => any;

    isMissing(value: any): boolean {
        return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
    }

    missingValue(_context: DataBuilderFieldContext): any {
        return null;
    }

    convert(value: any, _context: DataBuilderFieldContext): any {
        return value;
    }

    validationValue(value: any, _context: DataBuilderValidationContext): any {
        return value;
    }

    async save(value: any, context: DataBuilderFieldContext) {
        return this.isMissing(value) ? this.missingValue(context) : this.convert(value, context);
    }

    async validate(value: any, context: DataBuilderValidationContext): Promise<string | null> {
        const required = typeof context.field.required === "function" ? await context.field.required(context.data) : context.field.required;
        // Preserve v1 required semantics, including required checkboxes.
        if (
            required &&
            (this.isMissing(value) ||
                value === false ||
                (Array.isArray(value) && !value.length) ||
                (!Array.isArray(value) && value != null && value.toString().trim() === ""))
        ) {
            return "Dieses Feld muss ausgefüllt werden.";
        }
        return null;
    }
};

/** Historical v1 object contract. The value of the same name is the extensible field constructor. */
export type DataBuilderFieldType =
    | {
          key: string;
          type: "api-autocomplete";
          onSave: (value: any, payload?: any) => void;
          onSearch: (query: string, req: Request) => void;
      }
    | {
          key: string;
          type: "object";
          onSave: (value: any, payload?: any) => void;
          onSearch?: never;
      };

/** Instance contract for the new class API; v1 object annotations remain unchanged. */
export type DataBuilderFieldTypeInstance = InstanceType<typeof DataBuilderFieldType>;
