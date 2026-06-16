import moment from "moment-timezone";
import { DateFunctions } from "../Functions/DateFunctions";

export type DueAutomationExecution = {
    type: string;
    value: any;
    options: any;
    executionKey: string;
    identifier: string | null;
    dueAt: any;
};

function pushIfDue(out: DueAutomationExecution[], entry: DueAutomationExecution, since: any, until: any) {
    if (entry.dueAt.isAfter(since) && !entry.dueAt.isAfter(until)) {
        out.push(entry);
    }
}

export function getDueAutomationExecutions(
    executions: any[],
    since: any,
    until: any,
    timezone = "Europe/Berlin",
    identifier?: string | null,
) {
    const out: DueAutomationExecution[] = [];
    const days = DateFunctions.getDays();
    const now = until.clone().tz(timezone);
    const checkedSince = since.clone().tz(timezone);

    for (const execution of executions || []) {
        if (!Array.isArray(execution)) {
            continue;
        }

        const [type, value, rawOptions, rawExtraOptions] = execution;
        const options = type === "monthly" && typeof rawOptions === "string" ? rawExtraOptions : rawOptions;
        if (type !== "every_x_mins" && type !== "daily" && type !== "every_hour" && type !== "monthly" && !days.includes(type)) {
            continue;
        }
        if (type === "every_x_mins" && (!value || isNaN(parseInt(value)) || parseInt(value) <= 0)) {
            continue;
        }
        if (type === "monthly" && (!value || isNaN(parseInt(value)) || parseInt(value) < 1 || parseInt(value) > 31)) {
            continue;
        }
        if ((type === "daily" || days.includes(type)) && !moment(value, "HH:mm", true).isValid()) {
            continue;
        }
        if (type === "monthly" && (typeof rawOptions !== "string" || !moment(rawOptions, "HH:mm", true).isValid())) {
            continue;
        }

        const executionKey =
            type === "monthly"
                ? `${type}-${value}-${rawOptions}`
                : type + "-" + (value !== undefined && value !== null ? value : "0");
        const executionIdentifier = options && options.identifier ? options.identifier : identifier || null;
        const entry = (dueAt: any, executionValue: any = value): DueAutomationExecution => ({
            type: type,
            value: executionValue,
            options: options,
            executionKey: executionKey,
            identifier: executionIdentifier,
            dueAt: dueAt,
        });

        if (type === "every_hour") {
            const minute = parseInt(value && !isNaN(parseInt(value)) ? value : "0");
            let dueAt = checkedSince.clone().startOf("hour").minute(minute).second(0).millisecond(0);
            if (!dueAt.isAfter(checkedSince)) {
                dueAt.add(1, "hour");
            }
            while (!dueAt.isAfter(now)) {
                pushIfDue(out, entry(dueAt, minute), checkedSince, now);
                dueAt = dueAt.clone().add(1, "hour");
            }
            continue;
        }

        if (type === "every_x_mins") {
            const intervalMinutes = parseInt(value);
            let dueAt = checkedSince.clone().startOf("minute").second(0).millisecond(0);
            if (!dueAt.isAfter(checkedSince)) {
                dueAt.add(1, "minute");
            }
            while (!dueAt.isAfter(now)) {
                const diffMins = dueAt.diff(dueAt.clone().startOf("day"), "minutes");
                if (diffMins % intervalMinutes === 0) {
                    pushIfDue(out, entry(dueAt), checkedSince, now);
                }
                dueAt = dueAt.clone().add(1, "minute");
            }
            continue;
        }

        if (type === "daily") {
            let day = checkedSince.clone().startOf("day");
            const endDay = now.clone().startOf("day");
            while (!day.isAfter(endDay)) {
                pushIfDue(out, entry(moment.tz(`${day.format("YYYY-MM-DD")} ${value}`, "YYYY-MM-DD HH:mm", timezone)), checkedSince, now);
                day = day.clone().add(1, "day");
            }
            continue;
        }

        if (type === "monthly") {
            const dayOfMonth = parseInt(value);
            const time = rawOptions;
            let month = checkedSince.clone().startOf("month");
            const endMonth = now.clone().startOf("month");
            while (!month.isAfter(endMonth)) {
                if (dayOfMonth <= month.daysInMonth()) {
                    const day = month.clone().date(dayOfMonth);
                    pushIfDue(out, entry(moment.tz(`${day.format("YYYY-MM-DD")} ${time}`, "YYYY-MM-DD HH:mm", timezone)), checkedSince, now);
                }
                month = month.clone().add(1, "month");
            }
            continue;
        }

        if (days.includes(type)) {
            const isoWeekday = days.indexOf(type) + 1;
            let day = checkedSince.clone().startOf("day");
            const endDay = now.clone().startOf("day");
            while (!day.isAfter(endDay)) {
                if (day.isoWeekday() === isoWeekday) {
                    pushIfDue(out, entry(moment.tz(`${day.format("YYYY-MM-DD")} ${value}`, "YYYY-MM-DD HH:mm", timezone)), checkedSince, now);
                }
                day = day.clone().add(1, "day");
            }
        }
    }

    return out;
}

export function matchesAutomationExecutions(executions: any[] | undefined, date: Date | string | undefined, timezone = "Europe/Berlin") {
    if (!executions || executions.length < 1 || !date) {
        return false;
    }

    const dueAt = moment(date).tz(timezone).second(0).millisecond(0);
    const since = dueAt.clone().subtract(1, "millisecond");
    const until = dueAt.clone();
    return getDueAutomationExecutions(executions, since, until, timezone).some((execution) => execution.dueAt.isSame(dueAt));
}
