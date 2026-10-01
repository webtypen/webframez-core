const test=require('node:test');const assert=require('node:assert/strict');
const {SessionAuth,WebAuth,AuthCookies,Request,Response,UserAuth}=require('../dist');
const {database}=require('../test-support/auth-store.cjs');

function setup(extra={}){const db=database();const options={issuer:'https://id.example/',audience:'website',isSessionAllowed:async()=>true,database:async()=>db,...extra};return {db,options,auth:new SessionAuth(options)}}

function request(method='POST',cookies={},extra={}){return Object.assign(new Request(),{method,headers:{origin:'https://site.example','sec-fetch-site':'same-origin',cookie:Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join('; '),'x-csrf-token':cookies['__Host-wf_csrf'],...extra}})}

function jar(res){return Object.fromEntries(res.headers['Set-Cookie'].map(cookie=>cookie.split(';')[0].split('=')))}

test('sessions are separate per device, secrets are hashed and public results omit hashes',async()=>{
 const {auth,db}=setup();const a=await auth.create('user'),b=await auth.create('user');
 assert.notEqual(a.session.id,b.session.id);assert.equal((await auth.list('user')).length,2);
 const stored=JSON.stringify([...db.tables.get('auth_sessions').values()]);
 for(const token of [a.auth_token,a.refresh_token,a.csrf_token,b.auth_token])assert.ok(!stored.includes(token));
 assert.equal((await auth.authenticate(a.auth_token)).subject,'user');assert.equal(await auth.authenticate(a.refresh_token),null);
 assert.ok(!('accessHash' in (await auth.authenticate(a.auth_token))));
 await auth.revoke(a.session.id);assert.equal(await auth.authenticate(a.auth_token),null);assert.ok(await auth.authenticate(b.auth_token));
 await auth.revokeAll('user');assert.equal(await auth.authenticate(b.auth_token),null);
});
test('issuer, audience and environment are checked on authentication, refresh and revocation',async()=>{
 const {auth,options}=setup({environment:'hall'});const a=await auth.create('user');
 for(const scope of [{issuer:'https://other.example/'},{audience:'other'},{environment:'club'}]){
  const other=new SessionAuth({...options,...scope});assert.equal(await other.authenticate(a.auth_token),null);assert.equal(await other.refresh(a.refresh_token),null);
  await other.revoke(a.session.id);assert.ok(await auth.authenticate(a.auth_token));
 }
});
test('expiry is enforced independently from cleanup, refresh retains absolute expiry',async()=>{
 const {auth,db}=setup();const a=await auth.create('user');
 await db.collection('auth_sessions').updateOne({_id:a.session.id},{$set:{accessExpiresAt:Date.now()-1}});
 assert.equal(await auth.authenticate(a.auth_token),null);const b=await auth.refresh(a.refresh_token);assert.equal(b.refresh_expires_at,a.refresh_expires_at);
 await db.collection('auth_sessions').updateOne({_id:a.session.id},{$set:{expiresAt:Date.now()-1}});
 assert.equal(await auth.authenticate(b.auth_token),null);assert.equal(await auth.refresh(b.refresh_token),null);await auth.cleanup();assert.equal(db.tables.get('auth_sessions').size,0);
});
test('refresh rotates both tokens, rejects unknown secrets and revokes the family on replay',async()=>{
 const {auth}=setup();const a=await auth.create('user'),other=await auth.create('user');const b=await auth.refresh(a.refresh_token);
 assert.equal(await auth.authenticate(a.auth_token),null);assert.ok(await auth.authenticate(b.auth_token));
 assert.equal(await auth.refresh(`${a.session.id}.${'X'.repeat(43)}`),null);assert.ok(await auth.authenticate(b.auth_token));
 assert.equal(await auth.refresh(a.refresh_token),null);assert.equal(await auth.authenticate(b.auth_token),null);assert.equal(await auth.refresh(b.refresh_token),null);assert.ok(await auth.authenticate(other.auth_token));
});
test('parallel refresh has at most one winner and revokes the replayed family',async()=>{
 const {auth}=setup();const a=await auth.create('user');const results=await Promise.all(Array.from({length:8},()=>auth.refresh(a.refresh_token)));
 assert.equal(results.filter(Boolean).length,1);assert.equal(await auth.authenticate(results.find(Boolean).auth_token),null);
});
test('account/tenant policy applies to issuance, access, refresh and introspection; exceptions fail closed',async()=>{
 let active=true;const {auth}=setup({isSessionAllowed:async()=>active});const a=await auth.create('user');active=false;
 assert.equal(await auth.authenticate(a.auth_token),null);assert.equal(await auth.refresh(a.refresh_token),null);assert.equal(await auth.inspect(a.session.id),null);await assert.rejects(auth.create('user'));
});
test('malformed tokens/configuration fail closed',async()=>{
 const {auth,options}=setup();for(const token of ['',null,{},'a.b', 'x'.repeat(9000)]){assert.equal(await auth.authenticate(token),null);assert.equal(await auth.refresh(token),null)}
 for(const seconds of [0,-1,NaN,Infinity,1.5])assert.throws(()=>new SessionAuth({...options,accessTokenSeconds:seconds}));
});
test('web login requires pre-login CSRF before invoking credential verification, rotates CSRF and sets protected cookies',async()=>{
 const {auth}=setup();const web=new WebAuth(auth,{origin:'https://site.example'});let verified=0;
 await assert.rejects(web.login(request(),new Response(),async()=>{verified++;return 'user'}));assert.equal(verified,0);
 const pre=new Response();web.bootstrap(request('GET'),pre);const oldJar=jar(pre),res=new Response();
 await web.login(request('POST',oldJar),res,async()=>{verified++;return 'user'});assert.equal(verified,1);
 const cookies=jar(res);assert.notEqual(cookies['__Host-wf_csrf'],oldJar['__Host-wf_csrf']);
 for(const raw of res.headers['Set-Cookie']){assert.match(raw,/Path=\/;.*SameSite=Lax; Secure/);assert.ok(!raw.includes('Domain='));if(!raw.startsWith('__Host-wf_csrf='))assert.match(raw,/HttpOnly/)}
 assert.ok(await web.authenticate(request('POST',cookies)));assert.equal(res.headers['Cache-Control'],'no-store');
});
test('web requests reject missing, foreign, sibling-site and session-mismatched CSRF',async()=>{
 const {auth}=setup();const web=new WebAuth(auth,{origin:'https://site.example'});const res=new Response();await web.establishSession('user',res);const cookies=jar(res);
 for(const headers of [{'x-csrf-token':''},{origin:'https://evil.example'},{origin:'null'},{origin:'https://sibling.example','sec-fetch-site':'same-site'},{origin:'','sec-fetch-site':''}])await assert.rejects(web.authenticate(request('POST',cookies,headers)),error=>error.status===403);
 const second=new Response();await web.establishSession('user',second);const other=jar(second);
 await assert.rejects(web.authenticate(request('POST',{...cookies,'__Host-wf_csrf':other['__Host-wf_csrf']})));
 const duplicate=request('POST',cookies);duplicate.headers.cookie+='; __Host-wf_access='+cookies['__Host-wf_access'];await assert.rejects(web.authenticate(duplicate));
});
test('refresh works with expired access; logout revokes tokens, clears cookies and rejects GET',async()=>{
 const {auth,db}=setup();const web=new WebAuth(auth,{origin:'https://site.example'});const res=new Response();const session=await web.establishSession('user',res);const cookies=jar(res);
 await db.collection('auth_sessions').updateOne({_id:session.id},{$set:{accessExpiresAt:Date.now()-1}});
 const refreshed=new Response();await web.refresh(request('POST',cookies),refreshed);const fresh={...cookies,...jar(refreshed)};
 await assert.rejects(web.logout(request('GET',fresh),new Response()));
 const out=new Response();await web.logout(request('POST',fresh),out);assert.equal(await auth.authenticate(fresh['__Host-wf_access']),null);assert.equal(await auth.refresh(fresh['__Host-wf_refresh']),null);
 assert.ok(out.headers['Set-Cookie'].every(value=>value.includes('Max-Age=0')));
});
test('web refresh replay also revokes the device session',async()=>{
 const {auth}=setup();const web=new WebAuth(auth,{origin:'https://site.example'});const res=new Response();await web.establishSession('user',res);const old=jar(res),fresh=new Response();await web.refresh(request('POST',old),fresh);
 await assert.rejects(web.refresh(request('POST',old),new Response()),e=>e.status===401);
 assert.equal(await auth.authenticate(jar(fresh)['__Host-wf_access']),null);
});
test('cookies append to existing response cookies, localhost is explicit and remote HTTP is forbidden',()=>{
 for(const options of [{origin:'http://site.example'},{origin:'http://site.example',allowInsecureLocalhost:true},{origin:'https://site.example/path'},{origin:'https://site.example',cookiePrefix:'weak_'}])assert.throws(()=>new AuthCookies(options));
 const cookies=new AuthCookies({origin:'http://localhost:3000',allowInsecureLocalhost:true}),res=new Response();res.headers['set-cookie']=['existing=1'];cookies.write(res,'csrf','value',100,false);
 assert.equal(res.headers['Set-Cookie'].length,2);assert.match(res.headers['Set-Cookie'][1],/^wf_dev_csrf=/);
});
test('legacy UserAuth login/logout remain synchronous and compatible',()=>{const User=UserAuth(class {});const user=new User();assert.equal(user.login(),user);assert.equal(user.isAuthenticated(),true);assert.equal(user.logout(),user);assert.equal(user.isAuthenticated(),false)});
test('policy and storage outages never authenticate or refresh a session',async()=>{
 const {auth,options}=setup();const a=await auth.create('user');
 const down=new SessionAuth({...options,isSessionAllowed:async()=>{throw Error('authority unavailable')}});
 await assert.rejects(down.authenticate(a.auth_token),/unavailable/);await assert.rejects(down.refresh(a.refresh_token),/unavailable/);
 const storageDown=new SessionAuth({...options,database:async()=>{throw Error('database unavailable')}});await assert.rejects(storageDown.authenticate(a.auth_token),/unavailable/);
});
