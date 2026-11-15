const assert = require("node:assert/strict");
const test = require("node:test");
const { DataBuilder, Field } = require("../dist");
const { expandFormDocument } = require("../dist/DataBuilder/DataBuilderDocument");

class Environment {
    static __table = "environments";
    static __schema = { primaryKeyPlain: true };
}
Field({ type: "boolean" })(Environment.prototype, "team_access_disabled");
Field({ type: "object", schema: { name: { type: "string" }, city: { type: "string" } } })(Environment.prototype, "invoice_addr");
const builder = () => new DataBuilder().registerModelType("environments", Environment);
const request = data => ({ body: { __builder_type: "environments", __builder_id: "env", data } });
const fields = { invoice_addr: { type: "object", schema: {} } };

test("legacy object fields load without exposing unrelated fields or mutating the source", async () => {
    const source = { _id: "env", "invoice_addr.name": "Customer", "invoice_addr.city": "Dortmund", private_value: "secret" };
    const db = { collection: () => ({ aggregate: () => ({ toArray: async () => [source] }) }) };
    const details = await builder().details(db, request({}));
    assert.deepEqual(details.data.invoice_addr, { name: "Customer", city: "Dortmund" });
    assert.equal(details.data.private_value, undefined);
    assert.equal(source.invoice_addr, undefined);
});

test("canonical fields win over stale aliases, including null; unrelated dotted fields are preserved", () => {
    const source = { "invoice_addr.name": "Old", "invoice_addr.city": "Dortmund", invoice_addr: { name: null }, "other.key": 7 };
    const result = expandFormDocument(fields, source);
    assert.deepEqual(result.document.invoice_addr, { name: null, city: "Dortmund" });
    assert.equal(result.document["other.key"], 7);
    assert.deepEqual(expandFormDocument(fields, { invoice_addr: null, "invoice_addr.name": "Old" }).document, { invoice_addr: null });
    assert.throws(() => expandFormDocument(fields, { "invoice_addr.__proto__.polluted": true }), /Invalid/);
    assert.equal({}.polluted, undefined);
});

test("saving legacy fields uses one atomic update with literal values and keeps unknown address fields", async () => {
    const source = { _id: "env", "invoice_addr.name": "Old", "invoice_addr.city": "Dortmund", "invoice_addr.country": "DE", untouched: 7 };
    let written;
    const db = { collection: () => ({
        aggregate: () => ({ toArray: async () => [source] }),
        updateOne: async (filter, update, options) => { written = { filter, update, options }; return { matchedCount: 1 }; },
    }) };
    const result = await builder().save(db, request({ team_access_disabled: true, invoice_addr: { name: "$literal customer", city: "Berlin" } }));
    assert.equal(result.status, "success");
    assert.deepEqual(written.filter, { _id: "env" });
    const merge = written.update[0].$replaceWith.$mergeObjects;
    assert.deepEqual(merge[1].$literal.invoice_addr, { name: "$literal customer", city: "Berlin", country: "DE" });
    assert.equal(merge[1].$literal.team_access_disabled, true);
    assert.equal(merge[1].$literal.untouched, 7);
    assert.equal(Object.keys(merge[1].$literal).some(key => key.startsWith("invoice_addr.")), false);
    assert.deepEqual(written.options, { ignoreUndefined: true });
});
