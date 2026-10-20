const assert = require('node:assert/strict');
const test = require('node:test');
const { Model, DBConnection } = require('../dist');

test('atomic model updates use the model connection, preserve filters and map the result', async t => {
    class Run extends Model { __table = 'runs'; __connection = 'tenant'; }
    let claimed = false;
    const calls = [];
    t.mock.method(DBConnection, 'getDocumentStore', async connection => {
        assert.equal(connection, 'tenant');
        return { collection(table) {
            assert.equal(table, 'runs');
            return { async findOneAndUpdate(filter, update, options) {
                calls.push({ filter, update, options });
                if (claimed) return null;
                claimed = true;
                return { _id: 'id', status: 'running' };
            } };
        } };
    });
    const filter = { _id: 'id', status: 'queued' };
    const update = { $set: { status: 'running' } };
    const results = await Promise.all([Run.findOneAndUpdate(filter, update), Run.findOneAndUpdate(filter, update)]);
    assert.ok(results[0] instanceof Run);
    assert.equal(results[1], null);
    assert.equal(results[0].status, 'running');
    assert.deepEqual(calls[0], { filter, update, options: { returnDocument: 'after' } });
});
