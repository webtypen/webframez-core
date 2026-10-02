// Deterministic contract double. Each conditional mutation runs synchronously without
// an await between selection and update, matching DocumentCollection atomic semantics.
const clone = value => value == null ? value : structuredClone(value);

function matches(row, filter) {
 return Object.entries(filter).every(([key, condition]) => {
  if(key === '$or')return condition.some(part=>matches(row,part));
  const value=row[key];
  if(condition && typeof condition==='object' && !Array.isArray(condition)) {
   return Object.entries(condition).every(([op, expected])=>op==='$gt'?value>expected:op==='$lte'?value<=expected:op==='$in'?expected.includes(value):false);
  }
  return Array.isArray(value)?value.includes(condition):value===condition;
 });
}

function database() {
 const tables=new Map();
 return {tables, idAdapter: { create: value => value == null ? require("node:crypto").randomBytes(12).toString("hex") : String(value), normalize: value => typeof value === "string" && value ? value : null, isValid: value => typeof value === "string" && !!value, equals: (a, b) => String(a) === String(b) }, collection(name){
  if(!tables.has(name))tables.set(name,new Map());const records=tables.get(name);
  function select(filter){return [...records.values()].filter(row=>matches(row,filter))}
  function update(row, change){Object.assign(row,clone(change.$set||{}));return row}
  return {
   async insertOne(row){if(records.has(row._id))throw Error('duplicate key');records.set(row._id,clone(row));return {insertedId:row._id}},
   async findOne(filter){return clone(select(filter)[0]||null)},
   find(filter){return {async toArray(){return clone(select(filter))}}},
   async findOneAndUpdate(filter,change,options){const row=select(filter)[0];if(!row)return null;const before=clone(row);update(row,change);return options?.returnDocument==='after'?clone(row):before},
   async updateOne(filter,change){const row=select(filter)[0];if(row)update(row,change);return {matchedCount:row?1:0}},
   async updateMany(filter,change){const rows=select(filter);rows.forEach(row=>update(row,change));return {matchedCount:rows.length}},
   async deleteMany(filter){for(const row of select(filter))records.delete(row._id)},
  }
 }};
}

module.exports={database};
