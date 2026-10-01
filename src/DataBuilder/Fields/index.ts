export { NumericFieldType } from "./NumericFieldType";
import { ApiAutocompleteFieldType } from "./ApiAutocompleteFieldType";

export { ApiAutocompleteFieldType };
import { ArrayFieldType } from "./ArrayFieldType";

export { ArrayFieldType };
import { BooleanFieldType } from "./BooleanFieldType";

export { BooleanFieldType };
import { ColorFieldType } from "./ColorFieldType";

export { ColorFieldType };
import { CurrencyFieldType } from "./CurrencyFieldType";

export { CurrencyFieldType };
import { CustomFieldType } from "./CustomFieldType";

export { CustomFieldType };
import { DateFieldType } from "./DateFieldType";

export { DateFieldType };
import { DaterangeFieldType } from "./DaterangeFieldType";

export { DaterangeFieldType };
import { DatetimeFieldType } from "./DatetimeFieldType";

export { DatetimeFieldType };
import { FloatFieldType } from "./FloatFieldType";

export { FloatFieldType };
import { IntegerFieldType } from "./IntegerFieldType";

export { IntegerFieldType };
import { ModelFieldType } from "./ModelFieldType";

export { ModelFieldType };
import { ObjectFieldType } from "./ObjectFieldType";

export { ObjectFieldType };
import { ObjectIdFieldType } from "./ObjectIdFieldType";

export { ObjectIdFieldType };
import { OptionFieldType } from "./OptionFieldType";

export { OptionFieldType };
import { PasswordFieldType } from "./PasswordFieldType";

export { PasswordFieldType };
import { SecureFieldType } from "./SecureFieldType";

export { SecureFieldType };
import { StringFieldType } from "./StringFieldType";

export { StringFieldType };
import { TimeFieldType } from "./TimeFieldType";

export { TimeFieldType };
import { WysiwygFieldType } from "./WysiwygFieldType";

export { WysiwygFieldType };

export function standardDataBuilderFields() {
    return [
        new ApiAutocompleteFieldType(),
        new ArrayFieldType(),
        new BooleanFieldType(),
        new ColorFieldType(),
        new CurrencyFieldType(),
        new CustomFieldType(),
        new DateFieldType(),
        new DaterangeFieldType(),
        new DatetimeFieldType(),
        new FloatFieldType(),
        new IntegerFieldType(),
        new ModelFieldType(),
        new ObjectFieldType(),
        new ObjectIdFieldType(),
        new OptionFieldType(),
        new PasswordFieldType(),
        new SecureFieldType(),
        new StringFieldType(),
        new TimeFieldType(),
        new WysiwygFieldType(),
    ];
}
