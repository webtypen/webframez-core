const assert = require('node:assert/strict');
const test = require('node:test');
const http = require('node:http');
const { Router, Route, Request, Response } = require('../dist');

test('explicit middleware status/body survives HTTP handling and stops the controller', async () => {
    let called = false;
    Router.kernel = { middleware: { auth: async (_next, reject) => reject(401, { status: 'error', message: 'Unauthorized!', error_code: 'unauthorized' }) } };
    Route.post('/auth-contract', () => { called = true; }, { middleware: ['auth'] });
    const server = http.createServer((req, res) => Router.handleRequest(req, res));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const result = await fetch(`http://127.0.0.1:${server.address().port}/auth-contract`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        assert.equal(result.status, 401);
        assert.deepEqual(await result.json(), { status: 'error', message: 'Unauthorized!', error_code: 'unauthorized' });
        assert.equal(called, false);
    } finally { await new Promise(resolve => server.close(resolve)); }
});

test('reason-only rejections and async throws keep their existing semantics', async () => {
    const reason = Object.assign(new Error('Forbidden'), { statusCode: 403 });
    Router.kernel = { middleware: { auth: async (_next, reject) => reject(reason) } };
    await assert.rejects(Router.runMiddleware(['auth'], new Request(), new Response()), value => value.reason === reason && value.statusCode === undefined);
    Router.kernel.middleware.auth = async () => { throw reason; };
    await assert.rejects(Router.runMiddleware(['auth'], new Request(), new Response()), value => value === reason);
});

test('explicit middleware response also preserves the Lambda envelope', async () => {
    const previous = Router.mode;
    Router.mode = 'aws-lambda';
    Router.kernel = { middleware: { auth: (_next, reject) => reject(403, { status: 'error', error_code: 'forbidden' }) } };
    Route.post('/lambda-auth-contract', () => { throw new Error('must not run'); }, { middleware: ['auth'] });
    try {
        const response = await Router.handleRequest(null, null, { event: { rawPath: '/lambda-auth-contract', headers: { 'content-type': 'application/json' }, requestContext: { http: { method: 'POST', path: '/lambda-auth-contract' } }, body: '{}' } });
        assert.equal(response.statusCode, 403);
        assert.deepEqual(JSON.parse(response.body), { status: 'error', error_code: 'forbidden' });
    } finally { Router.mode = previous; }
});
