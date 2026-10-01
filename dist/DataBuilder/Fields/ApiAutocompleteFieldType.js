"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiAutocompleteFieldType = void 0;
const DataBuilderFieldType_1 = require("../DataBuilderFieldType");
class ApiAutocompleteFieldType extends DataBuilderFieldType_1.DataBuilderFieldType {
    constructor() {
        super(...arguments);
        this.key = "api-autocomplete";
        this.type = "api-autocomplete";
    }
}
exports.ApiAutocompleteFieldType = ApiAutocompleteFieldType;
