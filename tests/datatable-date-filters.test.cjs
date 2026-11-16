const assert = require("node:assert/strict");
const test = require("node:test");
const { Datatable } = require("../dist/Datatable/Datatable");

test("structured ranges use both dates for current and legacy date definitions", async () => {
    const table = new Datatable();
    table.filter = {
        date: { type: "date" },
        legacy: { type: "daterange", mapping: "ordered_on" },
        alias: { type: "date-range" },
        timestamp: { type: "date", cast: "date" },
        ignored: { type: "date", ignore: true },
    };
    const entry = { operator: "between", value: { date1: "2026-10-24", date2: "25.10.2026" } };
    const req = { body: { filter: { date: entry, legacy: entry, alias: entry, timestamp: entry, ignored: entry } } };
    const calendarRange = { $gte: "2026-10-24", $lte: "2026-10-25" };
    assert.deepEqual(await table.getFilterMatch(req, req.body.filter), {
        date: calendarRange,
        ordered_on: calendarRange,
        alias: calendarRange,
        timestamp: { $gte: new Date(2026, 9, 24), $lt: new Date(2026, 9, 26) },
    });
});

test("legacy single dates, range strings and operators still work", async () => {
    const table = new Datatable();
    table.filter = { day: { type: "date" }, legacy: { type: "daterange" }, amount: { type: "currency" } };
    async function match(key, value) {
        return (await table.getFilterMatch({}, { [key]: { operator: "==", value } }))[key];
    }
    const calendarRange = { $gte: "2026-11-01", $lte: "2026-11-10" };
    assert.equal(await match("day", { date1: "2026-11-01" }), "2026-11-01");
    assert.equal(await match("day", "01.11.2026"), "2026-11-01");
    assert.equal(await match("legacy", "2026-11-01"), "2026-11-01");
    assert.equal(await match("legacy", { date1: "2026-11-01" }), "2026-11-01");
    assert.deepEqual(await match("legacy", "01.11.2026 - 10.11.2026"), calendarRange);
    assert.deepEqual(await match("legacy", "2026-11-01-2026-11-10"), calendarRange);
    assert.deepEqual(await match("legacy", ">=01.11.2026"), { $gte: "2026-11-01" });
    assert.deepEqual(await match("amount", "10,50 - 20,00"), { $gte: 10.5, $lte: 20 });
});

test("invalid or incomplete structured ranges never fall through to a single date", async () => {
    const table = new Datatable();
    table.filter = { day: { type: "date" }, legacy: { type: "date-range" } };
    for (const value of [
        { date1: "2026-11-01" },
        { date1: "2026-11-10", date2: "2026-11-01" },
        { date1: "2026-02-30", date2: "2026-03-05" },
    ]) {
        const entry = { mode: "between", value };
        assert.deepEqual(await table.getFilterMatch({}, { day: entry, legacy: entry }), {});
    }
});

test("datetime filters match full minutes and cast both endpoints in the table timezone", async () => {
    const table = new Datatable();
    table.filter = {
        single: { type: "datetime", mapping: "booked_at" },
        range: { type: "datetime-range", cast: "date", timezone: "Europe/Berlin" },
    };
    assert.deepEqual(await table.getFilterMatch({}, {
        single: { operator: "==", value: { date1: "2026-11-16T13:30" } },
        range: { operator: "between", value: { date1: "2026-10-24 23:50", date2: "2026-10-25 23:59" } },
    }), {
        booked_at: { $gte: "2026-11-16 13:30", $lt: "2026-11-16 13:31" },
        range: { $gte: new Date("2026-10-24T21:50:00Z"), $lt: new Date("2026-10-25T23:00:00Z") },
    });
    assert.deepEqual(await table.getFilterMatch({}, {
        range: { operator: "between", value: { date1: "2026-11-16 14:00", date2: "2026-11-16 13:59" } },
    }), {});
});
