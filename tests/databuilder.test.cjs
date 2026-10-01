const assert = require('node:assert/strict');
const test = require('node:test');
const { DataBuilder, DataBuilderController, DataBuilderFieldType, DataBuilderValidationType,
  Field, Validates, Forms, ModelForm, Route, Router, Request, Response, Config, DBConnection,
  standardDataBuilderFields } = require('../dist');
const { dataBuilderRoute } = require('../dist/DataBuilder/DataBuilderRoute');

function req(type='users', data={}, id='new', operation='save') {
  return Object.assign(new Request(), {body:{__builder_type:type,__builder_id:id,__builder_rest_api:operation,data,payload:{site:'a'}}});
}

function database(initial=[]) {
  const records=structuredClone(initial); const calls=[];
  return {records,calls,collection(name){return {
    aggregate(pipeline){return {async toArray(){calls.push(['read',name]); return structuredClone(records.filter(row=>pipeline.every(stage=>!stage.$match || Object.entries(stage.$match).every(([key,value])=>row[key]===value))));}};},
    async insertOne(data){const id='id-'+(records.length+1); records.push({...structuredClone(data),_id:id});calls.push(['insert',name]);return {insertedId:id};},
    async updateOne(query,update){const row=records.find(r=>r._id===query._id); if(row)Object.assign(row,structuredClone(update.$set));calls.push(['update',name]);return {matchedCount:row?1:0};},
    async deleteOne(query){const index=records.findIndex(r=>r._id===query._id);if(index>=0) records.splice(index,1);calls.push(['delete',name]);return {deletedCount:index>=0?1:0};}
  };}};
}

function legacy(fields, extra={}) {return {key:'users',singular:'User',plural:'Users',schema:{version:'1',collection:'users',primaryKeyPlain:true,fields,...extra},forms:{main:{fields:Object.keys(fields).map(field=>({field}))}}};}

test('v1 conversion and frontend contract stay compatible, including custom payload and required',async()=>{
 const builder=new DataBuilder().registerType(legacy({name:{type:'string'},count:{type:'integer'},amount:{type:'currency'},when:{type:'datetime'},empty:{type:'array'},address:{type:'object'},choice:{type:'legacy',payload:{scope:'field'}}}));
 let payload;
 builder.registerFieldType('legacy',{type:'model',onSave:async(value,context)=>{payload=context; return 'selected:'+value;}});
 const input={name:'  ',count:'12x',amount:'2,50',when:'2026-10-01',address:{street:'A',extra:1},choice:'42'};
 assert.deepEqual(await builder.applyFields(builder.getType('users').schema.fields,{},input,{scope:'request',site:'a'}),{name:null,count:12,amount:2.5,when:'2026-10-01 00:00',empty:null,address:input.address,choice:'selected:42'});
 assert.deepEqual(payload,{scope:'field',site:'a'});
 const definition=await builder.loadType(req());
 assert.equal(definition.status,'success');assert.equal(definition.data.key,'users');
 assert.deepEqual(definition.data.fieldtypes,{legacy:{key:'legacy',type:'model'}});
 assert.equal(definition.data.forms.main.fields.length,7);
 const required={check:{type:'boolean',required:true},array:{type:'array',required:true},text:{type:'string',required:async()=>true}};
 assert.deepEqual(Object.keys(await builder.validateFields(database(),{},required,req('users',{check:false,array:[],text:' '}))),['check','array','text']);
});

test('legacy nested arrays await asynchronous field conversion',async()=>{
 const builder=new DataBuilder().registerFieldType('slow',{type:'string',async onSave(value){await new Promise(r=>setImmediate(r));return value.toUpperCase();}});
 const fields={items:{type:'array',schema:{name:{type:'slow'},children:{type:'array',schema:{name:{type:'slow'}}}}}};
 assert.deepEqual(await builder.applyFields(fields,{}, {items:[{name:'a',children:[{name:'b'}]}]},{}),{items:[{name:'A',children:[{name:'B'}]}]});
 assert.deepEqual(await builder.applyFields(fields,{}, {},{}),{items:[]});
});

test('every built-in uses a class; custom missing values and validators retain instance state',async()=>{
 assert.equal(standardDataBuilderFields().length,20);
 for(const field of standardDataBuilderFields()) assert.ok(field instanceof DataBuilderFieldType);
 class Code extends DataBuilderFieldType {key='code';type='string';prefix='X';missingValue(){return this.prefix+'0';}async convert(value){return this.prefix+value;}}
 class Prefix extends DataBuilderValidationType {key='prefix';async validate(value,[prefix]) {await Promise.resolve();return value.startsWith(prefix)?null:'Wrong prefix';}}
 const builder=new DataBuilder().registerFieldType(Code).registerValidationType(Prefix).registerType(legacy({code:{type:'code',validations:[['prefix','A']]}}));
 assert.deepEqual(await builder.applyFields({code:{type:'code'}},{},{},{}),{code:'X0'});
 assert.deepEqual(await builder.applyFields({code:{type:'code'}},{},{code:'A'},{}),{code:'XA'});
 assert.equal((await builder.save(database(),req('users',{code:'B'}))).errors.code,'Wrong prefix');
 assert.equal((await builder.save(database(),req('users',{code:'A'}))).status,'success');
});

test('decorators compose in either order, inheritance does not mutate parent metadata',async()=>{
 class Base {static __table='users';}
 Field({required:true})(Base.prototype,'email');Validates('email',['length',3],['max',30])(Base.prototype,'email');
 class Child extends Base {}
 Validates(['min',5])(Child.prototype,'name');Field({label:'Name'})(Child.prototype,'name');
 const builder=new DataBuilder().registerModelType('base',Base).registerModelType('child',Child);
 const base=await builder.loadType(req('base'));const child=await builder.loadType(req('child'));
 assert.deepEqual(Object.keys(base.data.schema.fields),['email']);
 assert.deepEqual(Object.keys(child.data.schema.fields),['email','name']);
 assert.deepEqual(child.data.schema.fields.name.validations,[['min',5]]);
 const errors=await builder.validateFields(database(),{},child.data.schema.fields,req('child',{email:'invalid',name:'A'}));
 assert.ok(errors.email);assert.ok(errors.name);
 const good=await builder.validateFields(database(),{},child.data.schema.fields,req('child',{email:'a@b.de',name:'Alice'}));assert.deepEqual(good,{});
 assert.ok((await builder.validateFields(database(),{},base.data.schema.fields,req('base',{email:'x'.repeat(30)+'@a.de'}))).email);
 await assert.rejects(()=>builder.validateFields(database(),{}, {name:{type:'string',validations:['typo']}},req('base',{})),/Unknown DataBuilder validation/);
});

class ProfileForm extends ModelForm {
 key='profile';

 layout(){return [this.component('project-card',{title:'Profile',children:[this.field('email'),this.field('address',{fields:[this.field('city')]}),this.field('items',{fields:[this.field('name')]})]})];}

 options(){return {onSaveRedirect:()=>'/done',allowDeletion:true};}
}

class AccessForm extends ModelForm { key='access'; layout(){return [this.field('admin')];} }

class User {static __table='users';static __schema={primaryKeyPlain:true};}

Field({required:true})(User.prototype,'email');Validates('email',['max',30])(User.prototype,'email');
Field({type:'boolean'})(User.prototype,'admin');
Field({type:'object',schema:{city:{type:'string'},internal:{type:'string'}}})(User.prototype,'address');
Field({type:'array',schema:{name:{type:'string'},cost:{type:'float'}}})(User.prototype,'items');
Forms(()=>[ProfileForm,AccessForm])(User);

test('model form aliases use forms.main and existing protocol; scope survives nested updates',async()=>{
 const builder=new DataBuilder().registerModelType('users',User);
 const db=database([{_id:'42',email:'old@a.de',admin:true,address:{city:'Old',internal:'Keep'},items:[{name:'Old',cost:50}],__builder:{version:'1'}}]);
 const definition=await builder.loadType(req('users:profile'));
 assert.equal(definition.data.key,'users:profile');
 assert.equal(definition.data.forms.main.fields[0].type,'project-card');
 assert.deepEqual(Object.keys(definition.data.schema.fields),['email','address','items']);
 assert.deepEqual(Object.keys(definition.data.schema.fields.address.schema),['city']);
 assert.deepEqual(Object.keys((await builder.loadType(req('users:access'))).data.schema.fields),['admin']);
 assert.deepEqual((await builder.loadType(req('users'))).data.forms.main.fields,definition.data.forms.main.fields);
 const detail=await builder.details(db,req('users:profile',{},'42'));
 assert.deepEqual(detail.data,{_id:'42',email:'old@a.de',address:{city:'Old'},items:[{name:'Old'}]});
 const denied=await builder.save(db,req('users:profile',{...detail.data,admin:false},'42'));
 assert.ok(denied.errors.admin);assert.ok(!db.calls.some(c=>c[0]==='update'));
 const deniedNested=await builder.save(db,req('users:profile',{...detail.data,address:{city:'New',internal:'Overwrite'}},'42'));
 assert.ok(deniedNested.errors['address.internal']);
 const result=await builder.save(db,req('users:profile',{...detail.data,email:'new@a.de',address:{city:'New'},items:[{name:'New'}]},'42'));
 assert.deepEqual(result,{status:'success',data:{_id:'42',redirect:'/done'}});
 assert.equal(db.records[0].admin,true);assert.deepEqual(db.records[0].address,{city:'New',internal:'Keep'});assert.deepEqual(db.records[0].items,[{name:'New',cost:50}]);
});

test('v1 hooks, unmapped types, uniqueness and deletion stay available',async()=>{
 const events=[];const builder=new DataBuilder().registerType(legacy({email:{type:'string',unique:async()=>false}},{beforeSave:()=>events.push('before'),afterSave:()=>events.push('after')}));
 assert.ok((await builder.save(database(),req('users',{email:'a@b.de'}))).errors.email);
 builder.registerType({...legacy({name:{type:'string'}},{beforeSave:data=>{events.push(data.extra);return {__append_data:{ok:1}}},afterSave:()=>events.push('after')}),unmapped:true});
 assert.equal((await builder.save(database(),req('users',{name:'A',extra:'legacy'}))).data.ok,1);
 assert.deepEqual(events,['legacy','after']);
 const db=database([{_id:'42',name:'A'}]);builder.registerType(legacy({name:{type:'string'}},{canDelete:()=>false}));
 await assert.rejects(()=>builder.delete(db,req('users',{},'42')),/Cannot delete/);
 builder.registerType(legacy({name:{type:'string'}},{beforeDelete:()=>events.push('delete'),deleteHandler:async()=>events.push('handler'),afterDelete:()=>events.push('deleted')}));
 assert.equal((await builder.delete(db,req('users',{},'42'))).status,'success');assert.equal(db.records.length,1);assert.deepEqual(events.slice(-3),['delete','handler','deleted']);
});

test('Route.databuilder inherits route groups, serves all v1 operations and isolates requests',async()=>{
 Config.set('application.router.basename','/site');
 Router.init({routesFunction(){Route.group({prefix:'/api',middleware:['auth']},()=>Route.databuilder('/builder',{models:{users:User},middleware:['tenant'],connection:'secondary'}));}});
 const match=Router.dissolve(Object.assign(new Request(),{url:'/site/api/builder',method:'POST'}));assert.ok(match);
 assert.deepEqual(match.options.middleware,['auth','tenant']);
 const route=match.component;
 const original=DBConnection.getDocumentStore;const db=database([{_id:'42',email:'x@y.de',address:{city:'A'},items:[]}]);const connections=[];
 DBConnection.getDocumentStore=async name=>{connections.push(name);return db;};
 try {
   const call=async(operation,data={},id='42',handler=route)=>{const res=new Response({mode:'aws-lambda'});await handler(req('users',data,id,operation),res);return res;};
   assert.equal((await call('type')).content.data.key,'users');assert.equal(connections.length,0);
   assert.equal((await call('details')).content.data.email,'x@y.de');
   assert.equal((await call('save',{email:'new@y.de',address:{city:'B'},items:[]})).content.status,'success');
   assert.equal((await call('delete')).content.status,'success');assert.equal(db.records.length,0);
   assert.equal((await call('unknown')).statusCode,404);assert.ok(connections.every(c=>c==='secondary'));
   const custom=dataBuilderRoute({types:[legacy({code:{type:'lookup',payload:{server:true}}},{newDataHandler:()=>({code:'A'})})],fieldTypes:{lookup:{type:'api-autocomplete',onSearch:async(query,req)=>[{query,...req.body.payload}]}},configure(builder,request){builder.registerType(legacy({request:{type:'string',label:request.body.payload.site}}));}});
   const [a,b]=await Promise.all(['one','two'].map(async site=>{const request=req('users',{},'new','type');request.body.payload.site=site;const response=new Response();await custom(request,response);return response.content;}));
   assert.equal(a.data.schema.fields.request.label,'one');assert.equal(b.data.schema.fields.request.label,'two');
   const aux=dataBuilderRoute({types:[legacy({code:{type:'lookup',payload:{server:true}}},{newDataHandler:()=>({code:'A'})})],fieldTypes:{lookup:{type:'api-autocomplete',onSearch:async(query,request)=>[{query,...request.body.payload}]}}});
   assert.deepEqual((await call('details-newdata',{},'new',aux)).content.data,{code:'A'});
   const search=req('users',{},'new','api-autocomplete');search.body.__builder_field='code';search.body.query='hi';const response=new Response();await aux(search,response);assert.deepEqual(response.content.data,[{query:'hi',site:'a',server:true}]);
   const controller=new DataBuilderController(new DataBuilder().registerType(legacy({code:{type:'string'}})));
   assert.equal((await call('type',{},'new',controller.restApi.bind(controller))).content.status,'success');
 }finally{DBConnection.getDocumentStore=original;}
});

test('default nested forms, numeric validation, inheritance and missing object values preserve the defined scope',async()=>{
 class Base {static __table='numbers';static __schema={primaryKeyPlain:true};}
 Field({type:'integer'})(Base.prototype,'count');
 class Child extends Base {}
 Validates(['min',5],['max',30])(Child.prototype,'count');
 Field({type:'object',schema:{value:{type:'string'}}})(Child.prototype,'details');
 const builder=new DataBuilder().registerModelType('numbers',Child);
 const definition=await builder.loadType(req('numbers'));
 assert.equal(definition.data.schema.fields.count.type,'integer');
 assert.deepEqual(definition.data.forms.main.fields[1],{field:'details',fields:[{field:'value'}]});
 for (const count of ['bad','12x','4',31,1.5]) assert.ok((await builder.save(database(),req('numbers',{count,details:{}}))).errors.count);
 assert.equal((await builder.save(database(),req('numbers',{count:'12',details:{}}))).status,'success');
 const forms=new DataBuilder().registerModelType('users',User);
 const db=database([{_id:'42',email:'a@b.de',address:{city:'Old',internal:'Keep'},items:[]}]);
 assert.equal((await forms.save(db,req('users',{email:'a@b.de',address:null,items:[]},'42'))).status,'success');
 assert.deepEqual(db.records[0].address,{city:null,internal:'Keep'});
 for(const items of ['bad',[null],[1]]) assert.ok((await forms.save(db,req('users',{email:'a@b.de',address:{},items},'42'))).errors.items);
});

test('route connection also selects the ObjectId adapter',async()=>{
 const original=DBConnection.objectId;const calls=[];
 DBConnection.objectId=async(value,connection)=>{calls.push([value,connection]);return value||'generated';};
 try{
   const builder=new DataBuilder('secondary');
   assert.deepEqual(await builder.applyFields({id:{type:'ObjectId'}},{},{},{}),{id:'generated'});
   assert.deepEqual(await builder.getAggregation({schema:{}},req('users',{},'42')),[{$match:{_id:'42'}}]);
   assert.deepEqual(calls,[[undefined,'secondary'],['42','secondary']]);
 }finally{DBConnection.objectId=original;}
});

test('nested object autocomplete resolves schema and respects the selected form',async()=>{
 class LookupForm extends ModelForm {key='lookup';layout(){return [this.field('address',{fields:[this.field('city')]})];}}
 class Places {static __table='places';}
 Field({type:'object',schema:{city:{type:'lookup',payload:{scope:'city'}},privateCode:{type:'lookup'}}})(Places.prototype,'address');
 Forms(()=>[LookupForm])(Places);
 const builder=new DataBuilder().registerModelType('places',Places).registerFieldType('lookup',{type:'api-autocomplete',onSearch:async(query,request)=>({query,...request.body.payload})});
 const request=req('places');request.body.__builder_field='address.city';request.body.query='B';
 assert.deepEqual((await builder.apiAutoComplete(request)).data,{query:'B',site:'a',scope:'city'});
 const denied=req('places');denied.body.__builder_field='address.privateCode';
 await assert.rejects(()=>builder.apiAutoComplete(denied),/Invalid autocomplete field/);
});

test('async form options and new-data handlers retain v1 metadata without exposing other form fields',async()=>{
 class Form extends ModelForm {key='main';async layout(){return [this.field('name')];}async options(){return {title:'Person',appearance:'sections',backLink:()=>'/list',allowDeletion:async()=>true,onSaveRedirect:()=>'/done'};}}
 class Person {static __table='people';__schema={newDataHandler:async()=>({name:'A',private:'B'})};static forms=()=>[Form];}
 Field()(Person.prototype,'name');Field()(Person.prototype,'private');
 const builder=new DataBuilder().registerModelType('people',Person);
 const result=await builder.loadType(req('people'));
 assert.equal(result.data.schema.collection,'people');assert.equal(result.data.forms.main.appearance,'sections');assert.equal(result.data.forms.main.backLink,'/list');assert.equal(result.data.forms.main.allowDeletion,true);assert.equal(result.data.forms.main.onSaveRedirect,undefined);
 assert.deepEqual((await builder.detailsNewData(database(),req('people'))).data,{name:'A'});
 const bad=req('people',JSON.parse('{"name":"A","__proto__":"bad"}'));
 assert.ok(Object.hasOwn((await builder.save(database(),bad)).errors,'__proto__'));
});

test('numeric model fields validate and persist the same decimal value, including nested fields and custom numeric types',async()=>{
 const {FloatFieldType}=require('../dist');
 class Percentage extends FloatFieldType {key='percentage';}
 class Numbers {static __table='numbers';static __schema={primaryKeyPlain:true};}
 Field({type:'integer',validations:[['min',1000],['max',1000]]})(Numbers.prototype,'count');
 Field({type:'percentage',validations:[['min',1.5],['max',1.5]]})(Numbers.prototype,'ratio');
 Field({type:'array',schema:{amount:{type:'currency',validations:[['min',20],['max',20]]}}})(Numbers.prototype,'rows');
 const builder=new DataBuilder().registerFieldType(Percentage).registerModelType('numbers',Numbers);
 const db=database();
 const result=await builder.save(db,req('numbers',{count:'1e3',ratio:'1,5',rows:[{amount:'2e1'}]}));
 assert.equal(result.status,'success');assert.equal(db.records[0].count,1000);assert.equal(db.records[0].ratio,1.5);assert.equal(db.records[0].rows[0].amount,20);
 for(const invalid of ['0x10','0b10','12x','Infinity','NaN',{},true]) {
   const bad=await builder.save(db,req('numbers',{count:invalid,ratio:invalid,rows:[{amount:invalid}]}));
   assert.ok(bad.errors.count);assert.ok(bad.errors.ratio);assert.ok(bad.errors['rows[0].amount']);
 }
 assert.equal(db.records.length,1);
 const limited=await builder.save(db,req('numbers',{count:'1e2',ratio:'1,6',rows:[{amount:'21'}]}));
 assert.ok(limited.errors.count);assert.ok(limited.errors.ratio);assert.ok(limited.errors['rows[0].amount']);
});

test('custom component configuration never becomes a field binding; explicit nodes work in arbitrary slots',async()=>{
 class CustomForm extends ModelForm {
   layout(){return [this.component('project-editor',{
     field:'private',
     config:{field:'not-a-schema-field',columns:[{field:'private'}]},
     customSlot:{content:[{...this.field('name'),width:'100%'},this.component('nested',{body:this.field('email')})]},
     children:[{field:'count'}],
   })];}
 }
 class Custom {static __table='custom';static forms=()=>[CustomForm];}
 for(const field of ['name','email','count','private']) Field()(Custom.prototype,field);
 const builder=new DataBuilder().registerModelType('custom',Custom);
 const definition=await builder.loadType(req('custom'));
 assert.deepEqual(Object.keys(definition.data.schema.fields).sort(),['count','email','name']);
 const json=JSON.parse(JSON.stringify(definition));
 assert.equal(json.data.forms.main.fields[0].config.field,'not-a-schema-field');
 assert.deepEqual(json.data.forms.main.fields[0].customSlot.content[0],{field:'name',width:'100%'});
 const response=await builder.save(database(),req('custom',{name:'A',email:'B',count:'C',private:'D'}));
 assert.ok(response.errors.private);
});

test('legacy adapter preserves ObjectId precedence, numeric fallback, array children and payload without processor special cases',async()=>{
 const original=DBConnection.objectId;
 DBConnection.objectId=async value=>value||'generated';
 try{
   const builder=new DataBuilder();let called=false;
   builder.registerFieldType('ObjectId',{type:'string',onSave(){called=true;return 'wrong';}});
   builder.registerFieldType('integer',{type:'integer'});
   builder.registerFieldType('array',{type:'custom',onSave:async(value,payload)=>[...value,{name:payload.add}]});
   builder.registerFieldType('slow',{type:'string',onSave:async value=>{await Promise.resolve();return value.toUpperCase();}});
   const schema={id:{type:'ObjectId'},n:{type:'integer'},items:{type:'array',schema:{name:{type:'slow'}},payload:{add:'tail'}}};
   assert.deepEqual(await builder.applyFields(schema,{}, {n:'1e3',items:[{name:'a'}]},{}),{id:'generated',n:1,items:[{name:'A'},{name:'tail'}]});
   assert.equal(called,false);
   const old=new DataBuilder();
   assert.deepEqual(await old.applyFields({integer:{type:'integer'},float:{type:'float'}},{},{integer:'1e3',float:'0x10'},{}),{integer:1,float:0});
 }finally{DBConnection.objectId=original;}
});

test('validation context has no placeholder conversion functions and frontend resolution leaves schema callbacks reusable',async()=>{
 class Inspect extends DataBuilderValidationType {key='inspect';validate(value,parameters,context){assert.equal('applyChildren' in context,false);assert.equal('objectId' in context,false);return null;}}
 const builder=new DataBuilder().registerValidationType(Inspect).registerType(legacy({name:{type:'string',validations:['inspect']},choice:{type:'option',options:async request=>[{value:request.body.payload.site}]}}));
 const request=req('users',{name:'A'});request.body.payload.site='first';
 const first=await builder.loadType(request);
 request.body.payload.site='second';const second=await builder.loadType(request);
 assert.equal(first.data.schema.fields.choice.options[0].value,'first');assert.equal(second.data.schema.fields.choice.options[0].value,'second');
 assert.equal(typeof builder.getType('users').schema.fields.choice.options,'function');
 assert.equal((await builder.save(database(),request)).status,'success');
});

test('numeric uniqueness in model forms checks the number that would be persisted',async()=>{
 class NumberRecord {static __table='numbers';static __schema={primaryKeyPlain:true};}
 Field({type:'integer',unique:{}})(NumberRecord.prototype,'number');
 const builder=new DataBuilder().registerModelType('numbers',NumberRecord);
 const db=database([{_id:'existing',number:1000}]);
 const duplicate=await builder.save(db,req('numbers',{number:'1e3'}));
 assert.ok(duplicate.errors.number);assert.equal(db.records.length,1);
 assert.equal((await builder.save(db,req('numbers',{number:'2e3'}))).status,'success');
 assert.equal(db.records[1].number,2000);
});

test('unique overrides receive the builder instance and may reject, delegate or throw',async()=>{
 class TenantBuilder extends DataBuilder {
   tenant='A';calls=[];reject=false;fail=false;

   async handleUnique(db,request,key,value,field,type){
     this.calls.push([key,value,this.tenant]);
     if(this.fail) throw new Error('policy unavailable');
     if(this.reject) return false;
     return super.handleUnique(db,request,key,value,{...field,unique:{...field.unique,match:{tenant:this.tenant}}},type);
   }
 }
 const builder=new TenantBuilder().registerType(legacy({email:{type:'string',unique:{}}}));
 const db=database([{_id:'existing',email:'same@example.com',tenant:'B'}]);
 const request=req('users',{email:'same@example.com'});
 builder.reject=true;
 assert.ok((await builder.save(db,request)).errors.email);assert.equal(db.records.length,1);
 assert.deepEqual(builder.calls,[['email','same@example.com','A']]);
 builder.reject=false;
 assert.deepEqual(await builder.validateFields(db,builder.getType('users'),builder.getType('users').schema.fields,request),{});
 builder.tenant='B';
 assert.ok((await builder.validateFields(db,builder.getType('users'),builder.getType('users').schema.fields,request)).email);
 builder.fail=true;
 await assert.rejects(()=>builder.save(db,request),/policy unavailable/);assert.equal(db.records.length,1);
});

test('save respects validation errors returned in a fresh object by a v1 subclass',async()=>{
 class CustomValidation extends DataBuilder {async validateFields(){return {email:'Project validation rejected'};}}
 const builder=new CustomValidation().registerType(legacy({email:{type:'string'}}));
 const db=database();
 assert.deepEqual(await builder.save(db,req('users',{email:'a@example.com'})),{status:'error',errors:{email:'Project validation rejected'}});
 assert.equal(db.calls.length,0);
});

test('recursive validation and unique checks pass through subclass overrides',async()=>{
 class Nested extends DataBuilder {
   paths=[];uniqueCalls=0;

   async validateFields(db,type,fields,request,errors,path){this.paths.push(path||'root');return super.validateFields(db,type,fields,request,errors,path);}

   async handleUnique(){this.uniqueCalls++;return false;}
 }
 const fields={items:{type:'array',schema:{email:{type:'string',unique:{}}}},address:{type:'object',schema:{email:{type:'string',unique:{}}}}};
 const builder=new Nested().registerType(legacy(fields));
 const result=await builder.save(database(),req('users',{items:[{email:'a@example.com'}],address:{email:'b@example.com'}}));
 assert.deepEqual(builder.paths,['root','items[0]','address']);assert.equal(builder.uniqueCalls,2);
 assert.ok(result.errors['items[0].email']);assert.ok(result.errors['address.email']);
});

test('legacy getFieldType overrides, nested conversion and frontend hooks remain active',async()=>{
 class Extended extends DataBuilder {
   paths=[];front=[];registrations=[];prefix='Project:';

   registerType(type){this.registrations.push(type.key);return super.registerType(type);}

   getFieldType(key){return key==='project' ? {key,type:'object',onSave:value=>this.prefix+value} : super.getFieldType(key);}

   async applyFields(fields,element,data,payload,path){this.paths.push(path||'root');return super.applyFields(fields,element,data,payload,path);}

   async getFieldsFrontend(fields,payload){this.front.push(Object.keys(fields));const result=await super.getFieldsFrontend(fields,payload);for(const field of Object.values(result))field.project=true;return result;}

   removeArrayIndicators(path){return super.removeArrayIndicators(path.replace('alias','items'));}
 }
 const fields={items:{type:'array',schema:{name:{type:'project'}}}};
 const builder=new Extended();
 builder.registerModelType('users',{__schema:{version:'1',fields},__forms:{main:{fields:[{field:'items',fields:[{field:'name'}]}]}}});
 assert.deepEqual(builder.registrations,['users']);
 assert.deepEqual(await builder.applyFields(fields,{}, {items:[{name:'A'}]},{}),{items:[{name:'Project:A'}]});
 assert.deepEqual(builder.paths,['root','items[0]']);
 const definition=await builder.loadType(req());
 assert.equal(definition.data.schema.fields.items.schema.name.project,true);assert.equal(builder.front.length,2);
 assert.equal((await builder.getField(req(),builder.getType('users'),'alias[0].name')).type,'project');
});

test("v1 field lookup preserves definitions, callback context and nullable built-in lookups", async () => {
    const builder = new DataBuilder();
    const definition = {
        type: "api-autocomplete",
        prefix: "Before:",
        onSave(value) { return this.prefix + value; },
        onSearch(query) { return [{ value: this.prefix + query }]; },
    };
    builder.registerFieldType("legacy", definition);
    const field = builder.getFieldType("legacy");
    assert.deepEqual(field, { ...definition, key: "legacy" });
    assert.notEqual(field, definition);
    assert.equal(field.onSave, definition.onSave);
    assert.equal(field.onSave("A"), "Before:A");
    assert.equal(builder.getFieldType("integer"), null);
    assert.equal(builder.getFieldType("unknown"), null);
    assert.equal(builder.getFieldTypeInstance("unknown"), null);
    assert.ok(builder.getFieldTypeInstance("integer") instanceof DataBuilderFieldType);

    field.prefix = "After:";
    builder.registerType(legacy({ choice: { type: "legacy" } }));
    assert.deepEqual(await builder.applyFields({ choice: { type: "legacy" } }, {}, { choice: "A" }, {}), { choice: "After:A" });
    const request = req();
    request.body.__builder_field = "choice";
    request.body.query = "B";
    assert.deepEqual((await builder.apiAutoComplete(request)).data, [{ value: "After:B" }]);
});

test("class field lookup keeps instance state and autocomplete while legacy overrides remain active", async () => {
    class Lookup extends DataBuilderFieldType {
        key = "lookup";
        type = "api-autocomplete";
        calls = 0;

        onSearch(query) {
            this.calls++;
            return [{ value: query, calls: this.calls }];
        }
    }

    class ProjectBuilder extends DataBuilder {
        getFieldType(key) {
            return key === "virtual" ? { key, type: "object", onSave: value => "Project:" + value } : super.getFieldType(key);
        }
    }

    const lookup = new Lookup();
    const builder = new ProjectBuilder().registerFieldType(lookup).registerType(legacy({ choice: { type: "lookup" } }));
    assert.equal(builder.getFieldType("lookup"), null);
    assert.equal(builder.getFieldTypeInstance("lookup"), lookup);
    const request = req();
    request.body.__builder_field = "choice";
    request.body.query = "A";
    assert.deepEqual((await builder.apiAutoComplete(request)).data, [{ value: "A", calls: 1 }]);
    assert.deepEqual((await builder.apiAutoComplete(request)).data, [{ value: "A", calls: 2 }]);
    assert.deepEqual(await builder.applyFields({ value: { type: "virtual" } }, {}, { value: "A" }, {}), { value: "Project:A" });

    builder.registerFieldType("lookup", { type: "object", onSave: value => "Legacy:" + value });
    assert.equal(builder.getFieldType("lookup").type, "object");
    assert.deepEqual(await builder.applyFields({ value: { type: "lookup" } }, {}, { value: "A" }, {}), { value: "Legacy:A" });
    builder.registerFieldType(lookup);
    assert.equal(builder.getFieldType("lookup"), null);
    assert.equal(builder.getFieldTypeInstance("lookup"), lookup);
});
