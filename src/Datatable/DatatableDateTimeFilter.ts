import moment from "moment-timezone";

const datetimeFormat = "YYYY-MM-DD HH:mm";
const datetimeFormats = [datetimeFormat, "YYYY-MM-DD[T]HH:mm"];

function parseDateTime(value: unknown, timezone?: string) {
    if (typeof value !== "string") return undefined;
    const input = moment.utc(value.trim(), datetimeFormats, true);
    if (!input.isValid()) return undefined;
    if (!timezone) return input;

    const local = input.format(datetimeFormat);
    const zoned = moment.tz(local, datetimeFormat, true, timezone);
    return zoned.format(datetimeFormat) === local ? zoned : undefined;
}

/** Match complete minutes. Strings are stored in local YYYY-MM-DD HH:mm format. */
export function datatableDateTimeFilterMatch(operator: string, value: unknown, castToDate = false, timezone?: string) {
    if (operator !== "==" && operator !== "between") return null;
    if (timezone && !moment.tz.zone(timezone)) return undefined;

    const dates = value && typeof value === "object" ? value as Record<string, unknown> : { date1: value };
    const zone = castToDate ? timezone ?? moment.tz.guess() : undefined;
    const start = parseDateTime(dates.date1, zone);
    const end = operator === "between" ? parseDateTime(dates.date2, zone) : start;
    if (!start || !end || end.isBefore(start)) return undefined;

    const nextMinute = end.clone().add(1, "minute");
    return castToDate
        ? { $gte: start.toDate(), $lt: nextMinute.toDate() }
        : { $gte: start.format(datetimeFormat), $lt: nextMinute.format(datetimeFormat) };
}
