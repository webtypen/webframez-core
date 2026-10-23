const assert = require('node:assert/strict');
const test = require('node:test');
const { defaultFormFields } = require('../dist');

test('public defaultFormFields builds nested object and array editors without mutating the schema', () => {
    const schema = {
        name: { type: 'string' },
        tariffs: { type: 'array', schema: {
            month: { type: 'string' },
            rate: { type: 'object', schema: { price: { type: 'number' }, quantity: { type: 'integer' } } },
        } },
        tags: { type: 'array' },
    };
    const before = structuredClone(schema);
    const layout = defaultFormFields(schema);
    assert.deepEqual(layout, [
        { field: 'name' },
        { field: 'tariffs', fields: [
            { field: 'month' },
            { field: 'rate', fields: [{ field: 'price' }, { field: 'quantity' }] },
        ] },
        { field: 'tags' },
    ]);
    assert.deepEqual(schema, before);
    assert.deepEqual(defaultFormFields({}), []);
});
