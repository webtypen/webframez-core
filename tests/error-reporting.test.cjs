const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { ErrorHandler, Router, Request, Response, ApiScopeRegistry, ApiFunction, ApiScope } = require('../dist');

test('observers survive logging replacement and isolate concurrent operations', async () => {
    const events = [];
    const off = ErrorHandler.onReport(event => events.push(event));
    ErrorHandler.setHandler(() => {});
    const reused = new Error('same object in independent requests');
    try {
        await Promise.all(['a','b'].map(operationId => ErrorHandler.withContext({scope:'controller',operationId,controller:{routePath:operationId}},async()=>{
            await new Promise(resolve=>setTimeout(resolve,operationId==='a'?5:1));
            await ErrorHandler.report(reused);
            await ErrorHandler.report(reused);
        })));
        assert.equal(events.length,2);
        assert.notEqual(events[0].eventId,events[1].eventId);
        assert.deepEqual(new Set(events.map(e=>e.controller.routePath)),new Set(['a','b']));
        assert.equal(events[0].process.pid,process.pid);
        ErrorHandler.setHandlers([]);
        ErrorHandler.setHandler(()=>{});
        await ErrorHandler.report(new Error('third'));
        assert.equal(events.length,3);
    } finally {off();ErrorHandler.clearHandlers();}
});

test('async middleware throw rejects the request instead of an unhandled rejection',async()=>{
    Router.kernel={middleware:{bad:async()=>{await Promise.resolve();throw new Error('middleware failed')}}};
    await assert.rejects(Router.handleMiddleware({options:{middleware:['bad']}},new Request(),new Response()),/middleware failed/);
});

test('unexpected API exceptions report once and return safe HTTP errors',async()=>{
    const events=[];const off=ErrorHandler.onReport(e=>events.push(e));ErrorHandler.setHandler(()=>{});
    class Failure extends ApiFunction{params={};async handle(){throw new Error('database password=secret')}}
    class Scope extends ApiScope{}
    try {
        const req=Object.assign(new Request(),{method:'POST',body:{}}),res=new Response({mode:'aws-lambda'});
        await ApiScopeRegistry.handleHttpFunction({scopeClass:Scope},Failure,req,res);
        assert.equal(res.statusCode,500);assert.equal(res.content.message,'Internal Server Error');assert.equal(events.length,1);
        assert.equal(events[0].api.function,'unnamed-function');
        class Invalid extends ApiFunction{params={};async handle(){throw Object.assign(new Error('Invalid input'),{statusCode:422})}}
        await ApiScopeRegistry.handleHttpFunction({scopeClass:Scope},Invalid,req,new Response({mode:'aws-lambda'}));
        assert.equal(events[1].expected,true);
    } finally {off();ErrorHandler.clearHandlers();}
});

test('HTTP errors hide internal details and escape expected HTML',()=>{
    const previous=console.error;console.error=()=>{};
    try {
        const req=Object.assign(new Request(),{headers:{}});
        assert.equal(Router.handleError(req,new Response({mode:'aws-lambda'}),500,new Error('<script>private</script>')).body,'<div>Internal Server Error</div>');
        assert.equal(Router.handleError(req,new Response({mode:'aws-lambda'}),400,'<script>input</script>').body,'<div>&lt;script&gt;input&lt;/script&gt;</div>');
    } finally {console.error=previous;}
});

test('failed command exits nonzero without a custom error handler',()=>{
    const child=spawnSync(process.execPath,['-e',`const {ConsoleCommand}=require('./dist');class Broken extends ConsoleCommand{async handle(){throw new Error('expected-test-failure')}};new Broken().handleSystem();`],{cwd:require('node:path').resolve(__dirname,'..'),encoding:'utf8'});
    assert.ifError(child.error);assert.equal(child.status,1);assert.match(child.stderr,/expected-test-failure/);
});
