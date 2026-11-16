import moment from "moment";

const dateFormats = ["YYYY-MM-DD", "DD.MM.YYYY"];
const dateToken = "(?:[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{2}\\.[0-9]{2}\\.[0-9]{4})";
const legacyDateExpression = new RegExp(`^(${dateToken})(?:\\s*-\\s*(${dateToken}))?$`);

function isDatatableDateFilterType(type: unknown): boolean {
    return type === "date" || type === "date-range" || type === "daterange";
}

function parseDate(value: unknown) {
    if (typeof value !== "string") return undefined;
    const date = moment(value.trim(), dateFormats, true);
    return date.isValid() ? date : undefined;
}

type DateFilterMatch = string | { $gte: string; $lte: string } | { $gte: Date; $lt: Date };

/** null leaves legacy operators to Datatable; undefined denotes an invalid date input. */
export function datatableDateFilterMatch(type: string, operator: string, value: unknown, castToDate = false): DateFilterMatch | null | undefined {
    if (!isDatatableDateFilterType(type)) return null;

    const structured = value !== null && typeof value === "object" && !Array.isArray(value);
    if (operator === "between" && structured) {
        const { date1, date2 } = value as Record<string, unknown>;
        const start = parseDate(date1);
        const end = parseDate(date2);
        if (!start || !end || end.isBefore(start)) return undefined;

        return castToDate
            ? { $gte: start.toDate(), $lt: end.add(1, "day").toDate() }
            : { $gte: start.format("YYYY-MM-DD"), $lte: end.format("YYYY-MM-DD") };
    }

    if (operator === "==" && structured && type !== "date") {
        return parseDate((value as Record<string, unknown>).date1)?.format("YYYY-MM-DD");
    }

    if (typeof value !== "string" || (operator !== "==" && !(operator === "between" && type !== "date"))) return null;
    const legacy = legacyDateExpression.exec(value.trim());
    if (!legacy) return null;
    const start = parseDate(legacy[1]);
    if (!start) return undefined;
    if (!legacy[2]) return start.format("YYYY-MM-DD");
    if (type === "date") return null;
    const end = parseDate(legacy[2]);
    // Older textual range filters use inclusive string bounds.
    return end && !end.isBefore(start) ? { $gte: start.format("YYYY-MM-DD"), $lte: end.format("YYYY-MM-DD") } : undefined;
}
