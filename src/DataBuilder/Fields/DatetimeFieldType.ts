import { DataBuilderFieldType } from "../DataBuilderFieldType";

export class DatetimeFieldType extends DataBuilderFieldType {
    key = "datetime";
    type = "datetime";

    convert(value: any) {
        if (typeof value !== "string") return null;
        const [datePart, timePart] = value.trim().split(" ");
        if (!datePart || !datePart.trim()) return value;
        if (!datePart.includes("-") && datePart.match(/^\d{1,2}:\d{2}$/)) return null;
        return datePart.trim() + " " + (timePart && timePart.includes(":") ? timePart.trim() : "00:00");
    }
}
