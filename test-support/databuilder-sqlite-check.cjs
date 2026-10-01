const assert = require('node:assert/strict');
const { SQLiteDriver } = require(process.env.WEBFRAMEZ_DATABUILDER_SQLITE_DRIVER || '@webtypen/webframez-dbdriver-sqlite');
const { DataBuilder, Field, Forms, ModelForm, DBConnection, Response, Route, Router, Request, Config } = require('../dist');
(async()=>{
 const driver=new SQLiteDriver();driver.setConfig({path:':memory:',cache:false});const connection=await driver.connect();
 const originalStore=DBConnection.getDocumentStore,originalId=DBConnection.objectId;
 try{
   const db=driver.documentStore(connection);
   DBConnection.getDocumentStore=async name=>{assert.equal(name,'sqlite-test');return db;};
   DBConnection.objectId=async(value,name)=>{assert.equal(name,'sqlite-test');return driver.idAdapter.create(value);};
   class Profile extends ModelForm {key='profile';layout(){return [this.field('email'),this.field('addresses',{fields:[this.field('city')]})];}}
   class User {static __table='users';}
   Field({required:true,validations:['email']})(User.prototype,'email');
   Field({type:'boolean'})(User.prototype,'admin');
   Field({type:'array',schema:{city:{type:'string'},privateNote:{type:'string'}}})(User.prototype,'addresses');
   Forms(()=>[Profile])(User);
   Config.set('application.router.basename','');
   Router.init({routesFunction(){Route.databuilder('/builder',{connection:'sqlite-test',models:{users:User}});}});
   const route=Router.dissolve(Object.assign(new Request(),{url:'/builder',method:'POST'})).component;
   async function call(operation,data={},id='new') {
     const request=Object.assign(new Request(),{body:{__builder_rest_api:operation,__builder_type:'users:profile',__builder_id:id,data}});
     const response=new Response();await route(request,response);return response.content;
   }
   assert.equal((await call('type')).data.key,'users:profile');
   const created=await call('save',{email:'new@example.com',addresses:[{city:'Berlin'}]});assert.equal(created.status,'success');const id=created.data._id;
   await db.collection('users').updateOne({_id:id},{$set:{admin:true,addresses:[{city:'Berlin',privateNote:'Keep'}]}});
   const read=await call('details',{},id);assert.equal(read.data.email,'new@example.com');assert.equal(read.data.admin,undefined);
   assert.equal((await call('save',{...read.data,email:'changed@example.com',addresses:[{city:'Hamburg'}]},id)).status,'success');
   const stored=(await db.collection('users').aggregate([{$match:{_id:id}}]).toArray())[0];
   assert.equal(stored.admin,true);assert.deepEqual(stored.addresses,[{city:'Hamburg',privateNote:'Keep'}]);
   assert.equal((await call('delete',{},id)).status,'success');assert.equal((await db.collection('users').aggregate([]).toArray()).length,0);
   console.log('PASS actual SQLite driver: router type/insert/details/update/delete, ID adapter, form projection and preserved fields.');
 }finally{DBConnection.getDocumentStore=originalStore;DBConnection.objectId=originalId;await driver.close(connection);}
})().catch(error=>{console.error(error);process.exitCode=1;});
