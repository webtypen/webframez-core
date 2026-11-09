const test = require('node:test');
const assert = require('node:assert/strict');
const { Model, AuthResourceAccess } = require('../dist');

function matches(row, filter) {
    return Object.entries(filter).every(([key, value]) => {
        if (key === '$and') return value.every(part => matches(row, part));
        if (key === '$or') return value.some(part => matches(row, part));
        return Object.entries(value).every(([op, expected]) => op === '$in' ? expected.includes(row[key])
            : op === '$eq' ? Array.isArray(row[key]) ? row[key].includes(expected) : row[key] === expected
            : op === '$ne' ? row[key] !== expected : false);
    });
}

function fixture() {
    const rows = [
        { _id: 'own', created_by: 'alice', administrators: [] },
        { _id: 'assigned', created_by: 'bob', administrators: ['alice'] },
        { _id: 'other', created_by: 'bob', administrators: ['bob'] },
        { _id: 'legacy' },
        { _id: 'deleted', created_by: 'alice', is_deleted: true },
    ];
    class Resource extends Model {
        static async objectId(value) { return typeof value === 'string' ? value : null; }

        static where(key, _operator, value) {
            return { first: async () => {
                const row = rows.find(row => matches(row, { [key]: value }));
                return row ? Object.assign(new Resource(), row) : null;
            } };
        }
    }
    const access = new AuthResourceAccess({ model: Resource, ownerField: 'created_by', membersField: 'administrators',
        userConditions: [{ field: 'is_active', operator: '!=', value: false }],
        resourceConditions: [{ field: 'is_deleted', operator: '!=', value: true }],
    });
    return { rows, Resource, access, user: Object.assign(new Model(), { _id: 'alice' }) };
}

test('ownership and explicit memberships compose as a union, with identical list/detail scope', async () => {
    const { rows, access, user } = fixture();
    for (const [grants, ids] of [[{}, []], [{ own: true }, ['own']], [{ assigned: true }, ['assigned']],
        [{ own: true, assigned: true }, ['own', 'assigned']], [{ all: true }, ['own', 'assigned', 'other', 'legacy']]]) {
        assert.deepEqual(rows.filter(row => matches(row, access.filter(user, grants))).map(row => row._id), ids);
        for (const row of rows) assert.equal(!!await access.find(user, row._id, grants), ids.includes(row._id));
    }
});

test('missing identity, disabled users, untrusted objects and invalid IDs fail closed', async () => {
    const { rows, access, user } = fixture();
    for (const identity of [null, {}, { _id: 'alice' }, new Model(), Object.assign(new Model(), { _id: '' }), Object.assign(new Model(), { _id: 'alice', is_active: false })]) {
        assert.deepEqual(rows.filter(row => matches(row, access.filter(identity, { all: true }))), []);
        assert.equal(await access.find(identity, 'own', { all: true }), null);
    }
    for (const id of [null, undefined, '', { $ne: null }]) assert.equal(await access.find(user, id, { all: true }), null);
    assert.equal(await access.find(user, 'other', { all: 'true', assigned: 'true' }), null);
});

test('membership revocation and ownership changes apply to the next lookup without cached grants', async () => {
    const { rows, access, user } = fixture();
    assert.ok(await access.find(user, 'assigned', { assigned: true }));
    rows[1].administrators = [];
    assert.equal(await access.find(user, 'assigned', { assigned: true }), null);
    rows[0].created_by = 'bob';
    assert.equal(await access.find(user, 'own', { own: true }), null);
});

test('configuration rejects operator fields and absent ownership/membership mappings grant nothing', () => {
    const { Resource, user } = fixture();
    assert.throws(() => new AuthResourceAccess({ model: Resource, ownerField: '$or' }), /Invalid/);
    assert.throws(() => new AuthResourceAccess({ model: Resource, ownerField: 'same', membersField: 'same' }), /separate/);
    const access = new AuthResourceAccess({ model: Resource });
    assert.deepEqual(access.filter(user, { own: true, assigned: true }), { _id: { $in: [] } });
});
