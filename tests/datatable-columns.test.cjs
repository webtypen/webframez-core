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

test('display fields are lazy, whitelisted per request, persisted with titles and resilient to removed options', async t => {
    database(t);
    let loads = 0;
    let options = [{ value: 'name', label: 'Name' }, { value: 'city', label: 'Stadt' }];
    class Relations extends Customers {
        columns = { name: { label: 'Name' }, winery: { label: 'Winzer', hidden: true, mapping: 'display.winery', displayOptions: async req => { loads++; return req.user._id === 'alice' ? options : []; } } };
    }
    const table = new Relations();
    const init = await table.getInit(request());
    assert.equal(loads, 0);
    assert.equal(init.availableColumns[1].displayOptions, true);
    assert.deepEqual(await table.getColumnDisplayOptions(request(), 'winery'), options);
    await assert.rejects(table.getColumnDisplayOptions(request(), '__proto__'), { status: 400 });
    const selection = [{ key: 'winery', title: '  Herkunft  ', displayField: 'city', width: { mode: 'px', value: 120 } }];
    const saved = await table.saveColumnPreferences(request(), selection);
    assert.equal(saved.columns[0].label, 'Herkunft');
    assert.equal(saved.columns[0].mapping, 'display.winery');
    assert.equal(saved.columns[0].displayField, 'city');
    assert.equal(saved.columnSelection[0].title, 'Herkunft');
    await assert.rejects(new Relations().saveColumnPreferences(request('bob'), selection), { status: 400 });
    await assert.rejects(new Relations().saveColumnPreferences(request(), [{ key: 'winery', displayField: 'password' }]), { status: 400 });
    await assert.rejects(new Relations().saveColumnPreferences(request(), [{ key: 'name', title: 'x'.repeat(161) }]), { status: 400 });
    options = options.slice(0, 1);
    const stale = await new Relations().getInit(request());
    assert.equal(stale.columns[0].label, 'Herkunft');
    assert.equal(stale.columns[0].displayField, 'name');
    assert.equal(stale.columnSelection[0].displayField, undefined);
    const reset = await new Relations().saveColumnPreferences(request(), [{ key: 'winery', title: '', displayField: '' }]);
    assert.equal(reset.columns[0].label, 'Winzer');
    assert.equal(reset.columns[0].displayField, 'name');
});

test('schema columns preserve nested scalar types and let hosts supply inline or lazy relation mappings', () => {
    const { DatatableSchemaColumns } = require('../dist/Datatable/DatatableSchemaColumns');
    const columns = DatatableSchemaColumns.fromSchema({ name: { type: 'string' }, amount: { type: 'currency' }, secret: { type: 'password' },
        address: { type: 'object', schema: { city: { type: 'string', label: 'Stadt' } } }, winery: { type: 'relation' } }, {
        prefix: 'attributes', prepare: (column, field) => field.type === 'relation' ? { ...column, displayOptions: [{ value: 'name', label: 'Name' }] } : column,
    });
    assert.equal(columns['attributes.amount'].plain, true);
    assert.equal(columns['attributes.address.city'].label, 'address · Stadt');
    assert.equal(columns['attributes.secret'], undefined);
    assert.equal(columns['attributes.winery'].displayOptions[0].value, 'name');
});
