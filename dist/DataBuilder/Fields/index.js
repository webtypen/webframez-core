"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.standardDataBuilderFields = exports.WysiwygFieldType = exports.TimeFieldType = exports.StringFieldType = exports.SecureFieldType = exports.PasswordFieldType = exports.OptionFieldType = exports.ObjectIdFieldType = exports.ObjectFieldType = exports.ModelFieldType = exports.IntegerFieldType = exports.FloatFieldType = exports.DatetimeFieldType = exports.DaterangeFieldType = exports.DateFieldType = exports.CustomFieldType = exports.CurrencyFieldType = exports.ColorFieldType = exports.BooleanFieldType = exports.ArrayFieldType = exports.ApiAutocompleteFieldType = exports.NumericFieldType = void 0;
var NumericFieldType_1 = require("./NumericFieldType");
Object.defineProperty(exports, "NumericFieldType", { enumerable: true, get: function () { return NumericFieldType_1.NumericFieldType; } });
const ApiAutocompleteFieldType_1 = require("./ApiAutocompleteFieldType");
Object.defineProperty(exports, "ApiAutocompleteFieldType", { enumerable: true, get: function () { return ApiAutocompleteFieldType_1.ApiAutocompleteFieldType; } });
const ArrayFieldType_1 = require("./ArrayFieldType");
Object.defineProperty(exports, "ArrayFieldType", { enumerable: true, get: function () { return ArrayFieldType_1.ArrayFieldType; } });
const BooleanFieldType_1 = require("./BooleanFieldType");
Object.defineProperty(exports, "BooleanFieldType", { enumerable: true, get: function () { return BooleanFieldType_1.BooleanFieldType; } });
const ColorFieldType_1 = require("./ColorFieldType");
Object.defineProperty(exports, "ColorFieldType", { enumerable: true, get: function () { return ColorFieldType_1.ColorFieldType; } });
const CurrencyFieldType_1 = require("./CurrencyFieldType");
Object.defineProperty(exports, "CurrencyFieldType", { enumerable: true, get: function () { return CurrencyFieldType_1.CurrencyFieldType; } });
const CustomFieldType_1 = require("./CustomFieldType");
Object.defineProperty(exports, "CustomFieldType", { enumerable: true, get: function () { return CustomFieldType_1.CustomFieldType; } });
const DateFieldType_1 = require("./DateFieldType");
Object.defineProperty(exports, "DateFieldType", { enumerable: true, get: function () { return DateFieldType_1.DateFieldType; } });
const DaterangeFieldType_1 = require("./DaterangeFieldType");
Object.defineProperty(exports, "DaterangeFieldType", { enumerable: true, get: function () { return DaterangeFieldType_1.DaterangeFieldType; } });
const DatetimeFieldType_1 = require("./DatetimeFieldType");
Object.defineProperty(exports, "DatetimeFieldType", { enumerable: true, get: function () { return DatetimeFieldType_1.DatetimeFieldType; } });
const FloatFieldType_1 = require("./FloatFieldType");
Object.defineProperty(exports, "FloatFieldType", { enumerable: true, get: function () { return FloatFieldType_1.FloatFieldType; } });
const IntegerFieldType_1 = require("./IntegerFieldType");
Object.defineProperty(exports, "IntegerFieldType", { enumerable: true, get: function () { return IntegerFieldType_1.IntegerFieldType; } });
const ModelFieldType_1 = require("./ModelFieldType");
Object.defineProperty(exports, "ModelFieldType", { enumerable: true, get: function () { return ModelFieldType_1.ModelFieldType; } });
const ObjectFieldType_1 = require("./ObjectFieldType");
Object.defineProperty(exports, "ObjectFieldType", { enumerable: true, get: function () { return ObjectFieldType_1.ObjectFieldType; } });
const ObjectIdFieldType_1 = require("./ObjectIdFieldType");
Object.defineProperty(exports, "ObjectIdFieldType", { enumerable: true, get: function () { return ObjectIdFieldType_1.ObjectIdFieldType; } });
const OptionFieldType_1 = require("./OptionFieldType");
Object.defineProperty(exports, "OptionFieldType", { enumerable: true, get: function () { return OptionFieldType_1.OptionFieldType; } });
const PasswordFieldType_1 = require("./PasswordFieldType");
Object.defineProperty(exports, "PasswordFieldType", { enumerable: true, get: function () { return PasswordFieldType_1.PasswordFieldType; } });
const SecureFieldType_1 = require("./SecureFieldType");
Object.defineProperty(exports, "SecureFieldType", { enumerable: true, get: function () { return SecureFieldType_1.SecureFieldType; } });
const StringFieldType_1 = require("./StringFieldType");
Object.defineProperty(exports, "StringFieldType", { enumerable: true, get: function () { return StringFieldType_1.StringFieldType; } });
const TimeFieldType_1 = require("./TimeFieldType");
Object.defineProperty(exports, "TimeFieldType", { enumerable: true, get: function () { return TimeFieldType_1.TimeFieldType; } });
const WysiwygFieldType_1 = require("./WysiwygFieldType");
Object.defineProperty(exports, "WysiwygFieldType", { enumerable: true, get: function () { return WysiwygFieldType_1.WysiwygFieldType; } });
function standardDataBuilderFields() {
    return [
        new ApiAutocompleteFieldType_1.ApiAutocompleteFieldType(),
        new ArrayFieldType_1.ArrayFieldType(),
        new BooleanFieldType_1.BooleanFieldType(),
        new ColorFieldType_1.ColorFieldType(),
        new CurrencyFieldType_1.CurrencyFieldType(),
        new CustomFieldType_1.CustomFieldType(),
        new DateFieldType_1.DateFieldType(),
        new DaterangeFieldType_1.DaterangeFieldType(),
        new DatetimeFieldType_1.DatetimeFieldType(),
        new FloatFieldType_1.FloatFieldType(),
        new IntegerFieldType_1.IntegerFieldType(),
        new ModelFieldType_1.ModelFieldType(),
        new ObjectFieldType_1.ObjectFieldType(),
        new ObjectIdFieldType_1.ObjectIdFieldType(),
        new OptionFieldType_1.OptionFieldType(),
        new PasswordFieldType_1.PasswordFieldType(),
        new SecureFieldType_1.SecureFieldType(),
        new StringFieldType_1.StringFieldType(),
        new TimeFieldType_1.TimeFieldType(),
        new WysiwygFieldType_1.WysiwygFieldType(),
    ];
}
exports.standardDataBuilderFields = standardDataBuilderFields;
