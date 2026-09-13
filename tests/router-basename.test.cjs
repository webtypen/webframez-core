const assert = require('node:assert/strict');
const test = require('node:test');
const {Config, Router, Route, Request, Response, LambdaApplication} = require('../dist');
const {appPath, appRelativePath, normalizeBasename} = require('../routing');
function init(basename, options={}) {
 Config.set('application.router.basename', basename);
 Router.init({routesFunction(){
  Route.get('/', ()=> 'home');
  Route.group({prefix:'/api'},()=>{
   Route.get('/items/:id',()=> 'item');
   Route.post('/items',()=> 'created');
  });
 },...options});
}
function match(url,method='GET') { return Router.dissolve(Object.assign(new Request(),{url,method})) ?? null; }

test('router config mounts root, grouped and API routes at segment boundaries',()=>{
 init('/tenant/site/');
 assert.equal(Route.basename,'/tenant/site');
 assert.ok(match('/tenant/site/'));
 assert.equal(match('/tenant/site/api/items/42?x=1').params.id,'42');
 assert.ok(match('/tenant/site/api/items','POST'));
 for(const value of ['/','/api/items/42','/tenant/site-other/api/items/42']) assert.equal(match(value),null);
 assert.equal(Route.path('/api/items'),'/tenant/site/api/items');
 assert.equal(Route.relativePath('/tenant/site/api/items'),'/api/items');
});

test('legacy boot option overrides config, including an explicit empty root mount',()=>{
 init('/configured',{basename:'/legacy/'});assert.ok(match('/legacy/'));
 init('/configured',{basename:''});assert.ok(match('/'));assert.equal(match('/configured/'),null);
 init(undefined);assert.ok(match('/api/items','POST'));
});

test('URL helpers and redirects preserve queries, hashes and external targets',()=>{
 init('/site');
 for(const url of ['/site','/site/x','/site?x=1','/site#anchor','//example.com/x','https://example.com','mailto:a@b','?query','relative','#anchor']) assert.equal(appPath(url),url);
 assert.equal(appPath('/api?next=/x#tab'),'/site/api?next=/x#tab');
 assert.equal(appRelativePath('/site?x=1'),'/?x=1');
 assert.equal(appRelativePath('/site-other/x'),'/site-other/x');
 const res = new Response({mode:'aws-lambda'}).redirect('/login?next=/x',303);
 assert.equal(res.statusCode,303);assert.equal(res.headers.Location,'/site/login?next=/x');
 assert.equal(new Response({mode:'aws-lambda'}).redirect('https://example.com').headers.Location,'https://example.com');
});

test('invalid basename fails before route registration',()=>{
 for(const value of ['//host','//','/a/../b','/a/./b','/a b','/a?x=1','/a#b','/a\\b','/%2e%2e',42]) assert.throws(()=>init(value),/basename/);
 for(const value of ['', '/', null, undefined, ' ']) assert.equal(normalizeBasename(value),'');
});

test('Lambda boot uses the same router configuration',async()=>{
 const app = new LambdaApplication();
 const result = await app.boot({requestContext:{http:{method:'GET'}},rawPath:'/lambda/',rawQueryString:'',headers:{},body:''},{},{
  config:{application:{router:{basename:'/lambda'}}}, routesFunction(){Route.get('/',()=> 'lambda mounted');}
 });
 assert.equal(result.statusCode,200);
 assert.equal(Router.basename,'/lambda');
 assert.ok(match('/lambda/'));
});
