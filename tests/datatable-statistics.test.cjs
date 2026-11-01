const assert = require('node:assert/strict');
const test = require('node:test');
const { Datatable } = require('../dist/Datatable/Datatable');
const { DBConnection } = require('../dist/Database/DBConnection');
const { Model } = require('../dist/Database/Model');

test('statistics retain filters and required joins, skip presentation and never mutate shared definitions', async t => {
    const table = new Datatable();
    table.columnPreferences = false;
    table.aggregation = [{ $match: { tenant: 'a' } }, { $lookup: { from: 'required' } }, { skipStats: true, $sort: { created_at: -1 } }];
    table.subAggregation = [{ skipStats: true, $lookup: { from: 'display' } }, { $skip: 0 }, { $limit: 25 }];
    const original = JSON.stringify([table.aggregation, table.subAggregation]);
    const req = { body: {} };
    const expected = [{ $match: { tenant: 'a' } }, { $lookup: { from: 'required' } }];
    assert.deepEqual(await table.getStatisticsAggregation(req), expected);
    t.mock.method(DBConnection, 'getConnection', async () => ({}));
    const calls = [];
    t.mock.method(DBConnection, 'documentStore', () => ({ collection: () => ({ aggregate: (pipeline, options) => {
        calls.push({ pipeline, options });
        return { toArray: async () => [] };
    } }) }));
    await table.getData(req);
    assert.deepEqual(calls[0].options.collation, { locale: 'de', strength: 2 });
    assert.ok(calls[0].pipeline.some(stage => stage.$lookup?.from === 'display'));
    assert.ok(calls.every(call => call.pipeline.every(stage => !('skipStats' in stage))));
    assert.deepEqual(await table.getStatisticsAggregation(req), expected);
    assert.equal(JSON.stringify([table.aggregation, table.subAggregation]), original);
    table.collation = async request => ({ locale: request.body.binary ? 'simple' : 'de' });
    await table.getData({ body: { binary: true } });
    assert.deepEqual(calls[2].options.collation, { locale: 'simple' });
});

test('Model.aggregate passes execution limits and options to the database driver', async t => {
    class Receipt extends Model { __table = 'receipts'; __connection = 'tenant'; }
    const pipeline = [{ $match: { tenant: 'a' } }];
    const options = { maxTimeMS: 1000, collation: { locale: 'simple' } };
    t.mock.method(DBConnection, 'execute', async (query, connection, received) => {
        assert.equal(query.table, 'receipts');
        assert.equal(query.aggregation, pipeline);
        assert.equal(connection, 'tenant');
        assert.equal(received, options);
        return [{ count: 1 }];
    });
    assert.deepEqual(await Receipt.aggregate(pipeline, options), [{ count: 1 }]);
});


test('exports include deferred display fields and use the same collation without injecting pagination', async t => {
    const table = new Datatable();
    table.columnPreferences = false;
    table.collation = { locale: 'simple' };
    table.aggregation = [{ $match: { tenant: 'a' } }, { skipStats: true, $sort: { created_at: -1 } }];
    table.subAggregation = [{ skipStats: true, $lookup: { from: 'customers' } }];
    t.mock.method(DBConnection, 'getConnection', async () => ({}));
    t.mock.method(DBConnection, 'documentStore', () => ({ collection: () => ({ aggregate: (pipeline, options) => {
        assert.deepEqual(pipeline, [{ $match: { tenant: 'a' } }, { $sort: { created_at: -1 } }, { $lookup: { from: 'customers' } }]);
        assert.deepEqual(options.collation, { locale: 'simple' });
        return { toArray: async () => [{ customer: 'Ada' }] };
    } }) }));
    assert.deepEqual(await table.getTotalData({ body: { page: 3, perPage: 1 } }), [{ customer: 'Ada' }]);
    assert.equal(table.subAggregation[0].skipStats, true);
});


test('opt-in defers display stages after page bounds but keeps filtering dependencies and sorting', async t => {
    const table = new Datatable();
    table.columnPreferences = false;
    table.deferPresentation = true;
    table.aggregation = [
        { $match: { tenant: 'a' } },
        { $lookup: { from: 'filter_dependency' } },
        { $match: { 'dependency.active': true } },
        { skipStats: true, $lookup: { from: 'display' } },
        { skipStats: true, $sort: { created_at: -1 } },
    ];
    table.subAggregation = [{ skipStats: true, $project: { _id: 1, display: 1 } }];
    const original = JSON.stringify(table.aggregation);
    t.mock.method(DBConnection, 'getConnection', async () => ({}));
    const calls = [];
    t.mock.method(DBConnection, 'documentStore', () => ({ collection: () => ({ aggregate: (pipeline) => {
        calls.push(pipeline);
        return { toArray: async () => [] };
    } }) }));
    await table.getData({ body: { page: 1, perPage: 10 } });
    assert.deepEqual(calls[0].map(stage => Object.keys(stage)[0]), ['$match', '$lookup', '$match', '$sort', '$skip', '$limit', '$lookup', '$project']);
    assert.deepEqual(calls[0][4], { $skip: 10 });
    assert.deepEqual(calls[1].map(stage => Object.keys(stage)[0]), ['$match', '$lookup', '$match', '$group']);
    assert.equal(JSON.stringify(table.aggregation), original);
    table.aggregation.push({ skipStats: true, $limit: 5 });
    await table.getData({ body: {} });
    assert.equal(calls[2].filter(stage => stage.$limit !== undefined).length, 1);
    assert.deepEqual(calls[2].find(stage => stage.$limit !== undefined), { $limit: 5 });
});
