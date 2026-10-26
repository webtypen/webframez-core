const assert = require('node:assert/strict');
const test = require('node:test');
const { Datatable } = require('../dist/Datatable/Datatable');
const { DatatableController } = require('../dist/Datatable/DatatableController');
const { DatatableRegistry } = require('../dist/Datatable/DatatableRegistry');
const { DatatableColumnPreferences } = require('../dist/Datatable/DatatableColumnPreferences');
const { DBConnection } = require('../dist/Database/DBConnection');

class Customers extends Datatable {
    collection = 'customers';
    columns = { name: { label: 'Name', width: 200 }, email: { label: 'Email', mapping: 'contact.email', autogrow: true }, total: { label: 'Total', hidden: true } };
    aggregation = async (_req, context) => context.isColumnRequired('email') ? [{ $lookup: { from: 'contacts' } }] : [];
}

function database(t) {
    const documents = new Map();
    const calls = [];
    t.mock.method(DBConnection, 'getDocumentStore', async connection => ({ collection(name) {
        const key = scope => `${name}:${scope._id}`;
        return {
            async findOne(scope) { calls.push({ name, connection, scope }); return documents.get(key(scope)) ?? null; },
            async updateOne(scope, update, options) { assert.equal(options.upsert, true); documents.set(key(scope), { ...scope, ...update.$set }); },
            async deleteOne(scope) { documents.delete(key(scope)); },
        };
    } }));
    return { documents, calls };
}

const request = (user = 'alice', table = 'test-customers') => ({ body: { _table: table }, user: { _id: user } });

test('defaults, ordered widths, reset and per-user/table isolation survive fresh instances', async t => {
    const db = database(t);
    const req = request();
    const first = await new Customers().getInit(req);
    assert.deepEqual(first.columns.map(c => c.key), ['name', 'email']);
    assert.deepEqual(first.availableColumns.map(c => c.key), ['name', 'email', 'total']);
    assert.equal(first.columnPreferences, true);
    const columns = [{ key: 'total', width: { mode: 'percent', value: 25 } }, { key: 'name', width: { mode: 'auto' } }];
    await new Customers().saveColumnPreferences(req, columns);
    const saved = await new Customers().getInit(request());
    assert.deepEqual(saved.columns.map(c => c.key), ['total', 'name']);
    assert.equal(saved.columns[0].width, '25%');
    assert.equal(saved.columns[0].grow, 0);
    assert.equal(saved.columns[1].autogrow, true);
    assert.equal(saved.columns[1].width, undefined);
    assert.deepEqual(saved.columnSelection, columns);
    assert.deepEqual(await new Customers().getVisibleColumnKeys(request('bob')), ['name', 'email']);
    assert.deepEqual(await new Customers().getVisibleColumnKeys(request('alice', 'other')), ['name', 'email']);
    assert.equal(db.calls[0].name, 'users_datatables');
    await new Customers().resetColumnPreferences(request());
    assert.equal(db.documents.size, 0);
});

test('membership storage uses trusted server scope and caches reads only within a request', async t => {
    const db = database(t);
    const table = new Customers();
    table.columnPreferences = { collection: 'environments_users_datatables', connection: 'tenant', owner: req => req.envUser ? { _environment_user: req.envUser._id, _env: req.env._id } : null };
    const req = { ...request(), envUser: { _id: 'member-a' }, env: { _id: 'a' } };
    req.body.owner = 'member-b'; req.body._user = 'bob'; req.body.collection = 'secret';
    await table.saveColumnPreferences(req, [{ key: 'name', width: { mode: 'px', value: 120 } }]);
    const reads = db.calls.length;
    assert.equal(await table.isColumnVisible(req, 'email'), false);
    assert.deepEqual(await table.getVisibleColumnKeys(req), ['name']);
    assert.equal(db.calls.length, reads);
    assert.deepEqual(await table.getVisibleColumnKeys({ ...req, envUser: { _id: 'member-b' }, env: { _id: 'b' } }), ['name', 'email']);
    assert.equal(db.calls[0].name, 'environments_users_datatables');
    assert.equal(db.calls[0].connection, 'tenant');
    assert.equal(db.calls[0].scope._environment_user, 'member-a');
    assert.equal(db.calls[0].scope._env, 'a');
});

test('invalid layouts are rejected without writing, stale definitions fall back or are removed', async t => {
    const db = database(t);
    for (const columns of [[], [{ key: 'secret' }], [{ key: 'name' }, { key: 'name' }], [{ key: '__proto__' }], [{ key: 'name', width: { mode: 'percent', value: 101 } }], [{ key: 'name', width: { mode: 'px', value: -1 } }], [{ key: 'name', width: { mode: 'px', value: '20' } }]]) {
        await assert.rejects(new Customers().saveColumnPreferences(request(), columns), { status: 400 });
    }
    assert.equal(db.documents.size, 0);
    const columns = new Customers().columns;
    assert.deepEqual(Object.keys(DatatableColumnPreferences.apply(columns, [{ key: 'removed' }])), ['name', 'email']);
    assert.deepEqual(Object.keys(DatatableColumnPreferences.apply(columns, [{ key: 'removed' }, { key: 'name' }])), ['name']);
    const anonymous = { body: { _table: 'test-customers' } };
    assert.equal((await new Customers().getInit(anonymous)).columnPreferences, false);
    await assert.rejects(new Customers().saveColumnPreferences(anonymous, [{ key: 'name' }]), { status: 403 });
});

test('aggregation context skips hidden lookups but retains dependencies of filters/search/sort/sums', async t => {
    database(t);
    await new Customers().saveColumnPreferences(request(), [{ key: 'name' }]);
    const table = new Customers();
    assert.deepEqual(await table.getAggregation(request()), []);
    for (const input of [{ sort: { 'contact.email': 1 } }, { search: { email: { value: 'x' } } }, { sums: { email: { mapping: 'contact.email' } } }]) {
        const req = request(); Object.assign(req.body, input);
        assert.equal((await table.getAggregation(req)).length, 1);
        assert.equal((await table.getColumnContext(req)).isColumnVisible('email'), false);
    }
    table.filter = { domain: { mapping: 'contact.email' } };
    table.autoApplyFilter = null;
    const req = request(); req.body.filter = { domain: { value: 'example.test' } };
    assert.equal((await table.getAggregation(req)).length, 1);
});

test('shared controller exposes preference routes, revalidates columns, and configuration hooks', async t => {
    database(t);
    DatatableRegistry.register('test-customers', Customers);
    t.after(() => { delete DatatableRegistry.tables['test-customers']; });
    const res = { code: 200, status(code) { this.code = code; return this; }, send(body) { return body; } };
    const controller = new DatatableController();
    const req = request(); req.body = { ...req.body, mode: 'columns-save', columns: [{ key: 'email' }] };
    assert.deepEqual((await controller.restApi(req, res)).data.columns.map(c => c.key), ['email']);
    req.body = { ...req.body, columns: [{ key: 'unauthorized' }] };
    assert.equal((await controller.restApi(req, res)).status, 'error');
    assert.equal(res.code, 400);
    req.body.mode = 'columns-reset';
    assert.deepEqual((await controller.restApi(req, res)).data.columns.map(c => c.key), ['name', 'email']);
});

test('initialization rejects asynchronous column failures instead of hanging', async () => {
    const table = new Customers(); table.columns = async () => { throw new Error('permission denied'); };
    await assert.rejects(table.getInit(request()), /permission denied/);
});

test('custom getData overrides receive the resolved context from the controller', async t => {
    database(t);
    class Custom extends Customers {
        async getData(_req, context) { return { visible: context.columnKeys, email: context.isColumnVisible('email') }; }
    }
    DatatableRegistry.register('custom', Custom);
    t.after(() => { delete DatatableRegistry.tables.custom; });
    const req = request('alice', 'custom');
    await new Custom().saveColumnPreferences(req, [{ key: 'name' }]);
    const result = await new DatatableController().restApi(req, { send: body => body });
    assert.deepEqual(result.data, { visible: ['name'], email: false });
});
