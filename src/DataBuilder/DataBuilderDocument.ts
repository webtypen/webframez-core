import lodash from "lodash";
import { assertFieldName } from "./DataBuilderFieldPath";
import type { DataBuilderFields } from "./DataBuilderTypes";

/** Old forms could persist literal dotted keys instead of embedded object fields. */
export function expandFormDocument(fields: DataBuilderFields, source: any) {
    const document = lodash.cloneDeep(source);
    const legacyKeys = Object.keys(document).filter(key => {
        const root = key.split(".")[0];
        return key.includes(".") && fields[root]?.type === "object" && !!fields[root].schema;
    }).sort((a, b) => a.split(".").length - b.split(".").length);
    for (const key of legacyKeys) {
        assertFieldName(key);
        const path = key.split(".");
        const value = document[key];
        delete document[key];
        // A canonical value (including null) wins over a stale legacy alias.
        const blocked = path.slice(0, -1).some((_, index) => {
            const parent = path.slice(0, index + 1);
            return lodash.has(document, parent) && !lodash.isPlainObject(lodash.get(document, parent));
        });
        if (!blocked && !lodash.has(document, path)) lodash.set(document, path, value);
    }
    return { document, legacyKeys };
}

/** Remove literal keys and write the edited document in one atomic operation. */
export function formDocumentUpdate(document: any, legacyKeys: string[]) {
    if (!legacyKeys.length) return { $set: { ...document } };
    const removed = [...legacyKeys, ...Object.keys(document).filter(key => document[key] === undefined)];
    const values = Object.fromEntries(Object.entries(document).filter(([, value]) => value !== undefined));
    return [{ $replaceWith: { $mergeObjects: [
        { $arrayToObject: { $filter: {
            input: { $objectToArray: "$$ROOT" }, as: "field",
            cond: { $not: [{ $in: ["$$field.k", { $literal: removed }] }] },
        } } },
        { $literal: values },
    ] } }];
}
