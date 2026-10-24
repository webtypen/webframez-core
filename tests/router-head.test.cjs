const assert = require('node:assert/strict');
const test = require('node:test');
const { Router, Route, Request } = require('../dist');

test('explicit HEAD preserves groups, params, domains, middleware and CORS resolution independently of GET', () => {
    Router.init({ basename: '/api', routesFunction() {
        Route.group({ prefix: '/media', middleware: ['auth'], domains: ['*.example.test'] }, () => {
            Route.get('/:id', () => 'body');
            Route.head('/:id', () => 'metadata', { middleware: ['acl'] });
        });
    } });
    const req = method => Object.assign(new Request(), { method, url: '/api/media/123?ticket=test', headers: { host: 'one.example.test' } });
    const head = Router.dissolve(req('HEAD'));
    assert.equal(head.component(), 'metadata');
    assert.deepEqual(head.params, { id: '123' });
    assert.deepEqual(head.options.middleware, ['auth', 'acl']);
    assert.equal(Router.dissolve(req('GET')).component(), 'body');
    const preflight = req('OPTIONS'); preflight.headers['access-control-request-method'] = 'HEAD';
    assert.equal(Router.dissolve(preflight).component(), 'metadata');
    const foreign = req('HEAD'); foreign.headers.host = 'foreign.test';
    assert.equal(Router.dissolve(foreign), undefined);
    Router.init({ basename: '', routesFunction() {} });
    assert.equal(Router.dissolve(req('HEAD')), undefined, 'reinitialization removes HEAD routes');
});
