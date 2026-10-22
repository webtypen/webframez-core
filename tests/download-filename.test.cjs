const assert = require('node:assert/strict');
const test = require('node:test');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Response } = require('../dist/Router/Response');

test('downloads preserve Unicode names without invalid or injected HTTP headers', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'core-download-'));
    const file = path.join(directory, 'stored.bin');
    await fs.writeFile(file, 'download bytes');
    const filename = '  Müller 日本語 "quote"\r\nX-Injected: value (1).pdf  ';
    const server = http.createServer(async (request, response) => {
        try { await new Response().setServerResponse(response).download(file, { filename, inline: request.url === '/inline' }); }
        catch (error) { response.statusCode = 500; response.end(String(error)); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        for (const mode of ['attachment', 'inline']) {
            const response = await fetch(`http://127.0.0.1:${server.address().port}/${mode}`);
            assert.equal(response.status, 200);
            const header = response.headers.get('content-disposition');
            assert.ok(header.startsWith(mode + ';'));
            assert.equal(decodeURIComponent(header.split("filename*=UTF-8''")[1]), filename);
            assert.doesNotMatch(header, /[\r\n]|[^\x20-\x7e]/);
            assert.equal(response.headers.get('x-injected'), null);
            assert.equal(await response.text(), 'download bytes');
        }
    } finally { await new Promise(resolve => server.close(resolve)); await fs.rm(directory, { recursive: true, force: true }); }
});
