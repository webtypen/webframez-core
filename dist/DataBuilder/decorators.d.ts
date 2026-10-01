import type { ModelFormConstructor } from "./ModelForm";
import type { DataBuilderValidationRule } from "./DataBuilderValidationType";
import type { DataBuilderFieldOptions } from "./DataBuilderTypes";
export type { DataBuilderFieldOptions } from "./DataBuilderTypes";
/** TypeScript declare types are erased: use type for non-string fields. */
export declare function Field(options?: DataBuilderFieldOptions): PropertyDecorator;
export declare function Validates(...rules: DataBuilderValidationRule[]): PropertyDecorator;
export declare function Forms(factory: () => ModelFormConstructor[]): ClassDecorator;
export declare function modelFields(ctor: Function): Record<string, DataBuilderFieldOptions>;
export declare function modelForms(ctor: any): ModelFormConstructor[];
