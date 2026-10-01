import type { DataBuilderFields, DataBuilderFormDefinition, DataBuilderErrors } from "./DataBuilderTypes";
/** Standard layout slots accept v1 descriptors; custom slots accept explicit ModelForm nodes. */
export declare function formSchema(schema: DataBuilderFields, definitions: DataBuilderFormDefinition[]): DataBuilderFields;
export declare function projectFormData(schema: DataBuilderFields, data: any): any;
export declare function unexpectedFormFields(schema: DataBuilderFields, data: any, errors: DataBuilderErrors, path?: string, primaryKey?: string): void;
/** Supply child layouts for automatically generated forms using the v1 fields property. */
export declare function defaultFormFields(schema: DataBuilderFields): DataBuilderFormDefinition[];
