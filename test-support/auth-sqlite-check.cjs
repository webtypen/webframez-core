const assert=require('node:assert/strict');
const {SQLiteDriver}=require(process.env.WEBFRAMEZ_AUTH_SQLITE_DRIVER || '@webtypen/webframez-dbdriver-sqlite');
const {SessionAuth,SsoAuthority,createSsoClientCredentials}=require('../dist');
const crypto=require('node:crypto');
(async()=>{
 const driver=new SQLiteDriver();driver.setConfig({path:':memory:',cache:false});const connection=await driver.connect();
 try {
 const db=driver.documentStore(connection);const sessions=new SessionAuth({issuer:'https://id.example/',audience:'website',idAdapter:driver.idAdapter,database:async()=>db,isSessionAllowed:async()=>true});
 const a=await sessions.create('user'),b=await sessions.create('user');
 assert.equal((await sessions.list('user')).length,2);assert.ok(await sessions.authenticate(a.auth_token));
 const refresh=await Promise.all(Array.from({length:8},()=>sessions.refresh(a.refresh_token)));
 assert.equal(refresh.filter(Boolean).length,1);assert.equal(await sessions.authenticate(refresh.find(Boolean).auth_token),null);assert.ok(await sessions.authenticate(b.auth_token));
 const credentials=createSsoClientCredentials(),verifier=crypto.randomBytes(32).toString('base64url'),redirectUri='https://instance.example/callback';
 const authority=new SsoAuthority({issuer:'https://id.example/',sessions,database:async()=>db,getClient:async()=>({id:credentials.id,secretHash:credentials.secretHash,redirectUris:[redirectUri]}),authorize:async()=>true});
 const redirect=await authority.authorize(b.auth_token,{clientId:credentials.id,redirectUri,environment:'hall',state:crypto.randomBytes(32).toString('base64url'),codeChallenge:crypto.createHash('sha256').update(verifier).digest('base64url'),codeChallengeMethod:'S256'});
 const code=new URL(redirect).searchParams.get('code');const exchanges=await Promise.all(Array.from({length:8},()=>authority.exchange({clientId:credentials.id,clientSecret:credentials.secret,redirectUri,environment:'hall',code,codeVerifier:verifier})));
 assert.equal(exchanges.filter(Boolean).length,1);
 await sessions.revokeAll('user');assert.equal(await sessions.authenticate(b.auth_token),null);
 console.log('PASS actual SQLite driver: session insert/read/list, independent devices, 8 parallel refreshes with replay revocation, 8 parallel SSO exchanges with one winner, revokeAll.');
 }finally{await driver.close(connection)}
})().catch(error=>{console.error(error);process.exitCode=1});
