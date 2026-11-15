import type { DataBuilderFields } from "./DataBuilderTypes";
/** Old forms could persist literal dotted keys instead of embedded object fields. */
export declare function expandFormDocument(fields: DataBuilderFields, source: any): {
    document: any;
    legacyKeys: string[];
};
/** Remove literal keys and write the edited document in one atomic operation. */
export declare function formDocumentUpdate(document: any, legacyKeys: string[]): {
    $set: any;
} | {
    $replaceWith: {
        $mergeObjects: ({
            $arrayToObject: {
                $filter: {
                    input: {
                        $objectToArray: string;
                    };
                    as: string;
                    cond: {
                        $not: {
                            $in: (string | {
                                $literal: string[];
                            })[];
                        }[];
                    };
                };
            };
            $literal?: undefined;
        } | {
            $literal: {
                [k: string]: unknown;
            };
            $arrayToObject?: undefined;
        })[];
    };
}[];
