const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),http=require('node:http');
const {SessionAuth,SsoAuthority,SsoClient,Request,Response,createSsoClientCredentials,readSsoClientCredentials}=require('../dist');
const {database}=require('../test-support/auth-store.cjs');
const random=()=>crypto.randomBytes(32).toString('base64url'),pkce=v=>crypto.createHash('sha256').update(v).digest('base64url');

async function fixture(){
 const db=database(),credentials=createSsoClientCredentials();let allowed=true;
 const sessions=new SessionAuth({issuer:'https://id.example/',audience:'website',idAdapter:db.idAdapter,database:async()=>db,isSessionAllowed:async()=>true});
 const registration={id:credentials.id,secretHash:credentials.secretHash,redirectUris:['https://instance.example/callback']};
 const authority=new SsoAuthority({issuer:'https://id.example/',sessions,idAdapter:db.idAdapter,database:async()=>db,getClient:async id=>id===registration.id?registration:null,authorize:async(s,c,e)=>allowed&&s.subject==='user'&&e==='hall'});
 const login=await sessions.create('user'),verifier=random();
 const request={clientId:credentials.id,redirectUri:registration.redirectUris[0],environment:'hall',state:random(),codeChallenge:pkce(verifier),codeChallengeMethod:'S256'};
 const exchange=code=>({clientId:credentials.id,clientSecret:credentials.secret,redirectUri:request.redirectUri,environment:'hall',code,codeVerifier:verifier});
 const issue=async()=>new URL(await authority.authorize(login.auth_token,request)).searchParams.get('code');
 return {db,sessions,authority,login,request,exchange,issue,credentials,setAllowed:value=>{allowed=value}};
}

test('SSO codes are hashed, short-lived, bound to client, exact redirect, tenant and PKCE; exchanged once',async()=>{
 const f=await fixture(),code=await f.issue();assert.ok(!JSON.stringify([...f.db.tables.get('auth_sso_codes').values()]).includes(code));
 for(const change of [{clientSecret:random()},{redirectUri:'https://instance.example/callback/extra'},{environment:'other'},{codeVerifier:random()},{clientId:'unregistered'}])assert.equal(await f.authority.exchange({...f.exchange(code),...change}),null);
 const identity=await f.authority.exchange(f.exchange(code));assert.equal(identity.subject,'user');assert.equal(identity.environment,'hall');assert.equal(identity.authoritySessionId,f.login.session.id);assert.equal(await f.authority.exchange(f.exchange(code)),null);
});
test('SSO issuance rejects arbitrary redirects, missing PKCE, inactive sessions and tenant access',async()=>{
 const f=await fixture();for(const change of [{redirectUri:'https://evil.example/callback'},{environment:'other'},{codeChallengeMethod:'plain'},{codeChallenge:'bad'},{state:'bad'}])assert.equal(await f.authority.authorize(f.login.auth_token,{...f.request,...change}),null);
 await f.sessions.revoke(f.login.session.id);assert.equal(await f.authority.authorize(f.login.auth_token,f.request),null);
});
test('parallel SSO exchanges have exactly one winner',async()=>{
 const f=await fixture(),code=await f.issue();const results=await Promise.all(Array.from({length:8},()=>f.authority.exchange(f.exchange(code))));assert.equal(results.filter(Boolean).length,1);
});
test('SSO expiry, membership changes and central logout are checked during exchange and introspection',async()=>{
 const f=await fixture(),code=await f.issue();f.setAllowed(false);assert.equal(await f.authority.exchange(f.exchange(code)),null);f.setAllowed(true);
 await f.db.collection('auth_sso_codes').updateOne({_id:crypto.createHash('sha256').update(code).digest('hex')},{$set:{expiresAt:Date.now()-1}});assert.equal(await f.authority.exchange(f.exchange(code)),null);
 const code2=await f.issue();assert.ok(await f.authority.introspect(f.credentials.id,f.credentials.secret,f.login.session.id,'hall'));
 assert.equal(await f.authority.introspect(f.credentials.id,random(),f.login.session.id,'hall'),null);
 assert.equal(await f.authority.introspect(f.credentials.id,f.credentials.secret,f.login.session.id,'other'),null);
 await f.sessions.revoke(f.login.session.id);assert.equal(await f.authority.exchange(f.exchange(code2)),null);assert.equal(await f.authority.introspect(f.credentials.id,f.credentials.secret,f.login.session.id,'hall'),null);
});
test('SSO client binds state to initiating browser, performs PKCE backchannel and checks parent revocation',async t=>{
 const db=database(),credentials=createSsoClientCredentials();let authority;
 const server=http.createServer(async(req,res)=>{
  try{let body='';for await(const chunk of req)body+=chunk;const data=JSON.parse(body);const auth=readSsoClientCredentials(Object.assign(new Request(),{headers:req.headers}));
   let result=null;if(auth)result=req.url==='/token'?await authority.exchange({clientId:auth.clientId,clientSecret:auth.clientSecret,redirectUri:data.redirect_uri,environment:data.environment,code:data.code,codeVerifier:data.code_verifier}):await authority.introspect(auth.clientId,auth.clientSecret,data.session_id,data.environment);
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
  }catch{res.statusCode=400;res.end('{}')}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const issuer=`http://127.0.0.1:${server.address().port}/`;
 const sessions=new SessionAuth({issuer,audience:'website',idAdapter:db.idAdapter,database:async()=>db,isSessionAllowed:async()=>true});
 const registration={id:credentials.id,secretHash:credentials.secretHash,redirectUris:['http://localhost:3000/callback']};
 authority=new SsoAuthority({issuer,sessions,idAdapter:db.idAdapter,database:async()=>db,allowInsecureLocalhost:true,getClient:async id=>id===registration.id?registration:null,authorize:async(s,c,e)=>e==='hall'});
 const client=new SsoClient({issuer,origin:'http://localhost:3000',allowInsecureLocalhost:true,clientId:credentials.id,clientSecret:credentials.secret,redirectUri:registration.redirectUris[0],authorizationEndpoint:issuer+'authorize',tokenEndpoint:issuer+'token',introspectionEndpoint:issuer+'introspect',idAdapter:db.idAdapter,database:async()=>db});
 const login=await sessions.create('user'),res=new Response(),begin=new URL(await client.begin(res,'hall'));
 const redirect=new URL(await authority.authorize(login.auth_token,{clientId:begin.searchParams.get('client_id'),redirectUri:begin.searchParams.get('redirect_uri'),environment:begin.searchParams.get('environment'),state:begin.searchParams.get('state'),codeChallenge:begin.searchParams.get('code_challenge'),codeChallengeMethod:begin.searchParams.get('code_challenge_method')}));
 const query=Object.fromEntries(redirect.searchParams),cookie=res.headers['Set-Cookie'][0].split(';')[0];
 const req=(q=query,c=cookie)=>Object.assign(new Request(),{query:q,headers:{cookie:c}});
 assert.equal(await client.complete(req(query,''),new Response()),null);
 assert.equal(await client.complete(req({...query,state:random()}),new Response()),null);
 assert.equal(await client.complete(req({...query,iss:'https://evil.example/'}),new Response()),null);
 const identity=await client.complete(req(),new Response());assert.equal(identity.subject,'user');assert.equal(identity.environment,'hall');
 assert.equal(await client.complete(req(),new Response()),null);
 const local=new SessionAuth({issuer:'http://localhost:3000/',audience:credentials.id,environment:'hall',idAdapter:db.idAdapter,database:async()=>db,isSessionAllowed:async s=>!!s.parent&&!!await client.introspect(s.parent.sessionId,s.environment)});
 const session=await local.create(identity.subject,{issuer:identity.issuer,sessionId:identity.authoritySessionId});assert.ok(await local.authenticate(session.auth_token));
 await sessions.revoke(login.session.id);assert.equal(await local.authenticate(session.auth_token),null);assert.equal(await local.refresh(session.refresh_token),null);
});
test('SSO client rejects unsafe endpoints, callback origins and weak credentials',()=>{
 const options={issuer:'https://id.example/',origin:'https://instance.example',clientId:'instance',clientSecret:random(),authorizationEndpoint:'https://id.example/authorize',tokenEndpoint:'https://id.example/token',introspectionEndpoint:'https://id.example/introspect',redirectUri:'https://instance.example/callback'};
 for(const change of [{tokenEndpoint:'https://evil.example/token'},{tokenEndpoint:'http://id.example/token'},{redirectUri:'https://evil.example/callback'},{redirectUri:'https://instance.example/callback#fragment'},{clientSecret:'short'},{clientId:'bad:id'}])assert.throws(()=>new SsoClient({...options,...change}));
 assert.ok(new SsoClient(options));
});
test('callback rejects expired transactions, mismatched backchannel identities and redirects',async t=>{
 const db=database(),credentials=createSsoClientCredentials();let responseBody=null,status=200;
 const server=http.createServer((req,res)=>{res.statusCode=status;res.setHeader('Location','https://evil.example');res.end(typeof responseBody==='string'?responseBody:JSON.stringify(responseBody))});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const issuer=`http://127.0.0.1:${server.address().port}/`;
 const client=new SsoClient({issuer,origin:'http://localhost:3000',allowInsecureLocalhost:true,clientId:credentials.id,clientSecret:credentials.secret,redirectUri:'http://localhost:3000/callback',authorizationEndpoint:issuer+'authorize',tokenEndpoint:issuer+'token',introspectionEndpoint:issuer+'introspect',idAdapter:db.idAdapter,database:async()=>db});
 async function callback(){const res=new Response(),url=new URL(await client.begin(res,'hall'));return Object.assign(new Request(),{query:{state:url.searchParams.get('state'),code:random(),iss:issuer},headers:{cookie:res.headers['Set-Cookie'][0].split(';')[0]}})}
 const valid={issuer,audience:credentials.id,subject:'user',environment:'hall',authoritySessionId:random(),expiresAt:Date.now()+10000};
 for(const change of [{issuer:'https://evil.example/'},{audience:'other'},{environment:'other'},{expiresAt:Date.now()-1},{subject:''},{authoritySessionId:'bad'}]){responseBody={...valid,...change};assert.equal(await client.complete(await callback(),new Response()),null)}
 responseBody=valid;const expired=await callback();await db.collection('auth_sso_transactions').updateMany({},{$set:{expiresAt:Date.now()-1}});assert.equal(await client.complete(expired,new Response()),null);
 status=302;await assert.rejects(client.complete(await callback(),new Response()),/rejected/);
 status=200;responseBody='x'.repeat(17000);await assert.rejects(client.complete(await callback(),new Response()));
});
test('SSO exchange rejects structured tenant inputs instead of accepting query operators',async()=>{
 const f=await fixture(),code=await f.issue();await assert.rejects(f.authority.exchange({...f.exchange(code),environment:{$ne:null}}),/environment/);
});
