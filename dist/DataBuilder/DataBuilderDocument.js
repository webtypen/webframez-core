"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formDocumentUpdate = exports.expandFormDocument = void 0;
const lodash_1 = __importDefault(require("lodash"));
const DataBuilderFieldPath_1 = require("./DataBuilderFieldPath");
/** Old forms could persist literal dotted keys instead of embedded object fields. */
function expandFormDocument(fields, source) {
    const document = lodash_1.default.cloneDeep(source);
    const legacyKeys = Object.keys(document).filter(key => {
        var _a;
        const root = key.split(".")[0];
        return key.includes(".") && ((_a = fields[root]) === null || _a === void 0 ? void 0 : _a.type) === "object" && !!fields[root].schema;
    }).sort((a, b) => a.split(".").length - b.split(".").length);
    for (const key of legacyKeys) {
        (0, DataBuilderFieldPath_1.assertFieldName)(key);
        const path = key.split(".");
        const value = document[key];
        delete document[key];
        // A canonical value (including null) wins over a stale legacy alias.
        const blocked = path.slice(0, -1).some((_, index) => {
            const parent = path.slice(0, index + 1);
            return lodash_1.default.has(document, parent) && !lodash_1.default.isPlainObject(lodash_1.default.get(document, parent));
        });
        if (!blocked && !lodash_1.default.has(document, path))
            lodash_1.default.set(document, path, value);
    }
    return { document, legacyKeys };
}
exports.expandFormDocument = expandFormDocument;
/** Remove literal keys and write the edited document in one atomic operation. */
function formDocumentUpdate(document, legacyKeys) {
    if (!legacyKeys.length)
        return { $set: Object.assign({}, document) };
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
exports.formDocumentUpdate = formDocumentUpdate;
