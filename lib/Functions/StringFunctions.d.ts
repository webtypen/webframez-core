declare class StringFunctionsFacade {
    slug(string: string): string;
    random(length: number): string;
    nl2br(str: string, replaceMode?: boolean, isXhtml?: boolean): string;
}
export declare const StringFunctions: StringFunctionsFacade;
export {};
