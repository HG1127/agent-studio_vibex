"use strict"
// Private, immutable employee requirements. Model drafts carry only a locator;
// neither generated prose nor a missing field may erase the recorded request.
function fault(code,status){var e=new Error(code);e.code=code;e.httpStatus=status||400;throw e}
function canonical(value){return require(__hooks+"/modules/business_schemas.js").canonical(value)}
function ensure(app){
  app.db().newQuery("CREATE TABLE IF NOT EXISTS agent_studio_authoring_requirements (id TEXT PRIMARY KEY,owner_uid TEXT NOT NULL,parent_id TEXT NOT NULL,entry_kind TEXT NOT NULL,requirement TEXT NOT NULL,chain_hash TEXT NOT NULL,idempotency_key TEXT NOT NULL,request_hash TEXT NOT NULL,created_ms INTEGER NOT NULL,UNIQUE(owner_uid,idempotency_key))").execute()
  var fields=arrayOf(new DynamicModel({name:""}));app.db().newQuery("PRAGMA table_info(agent_studio_authoring_requirements)").all(fields)
  if(!fields.some(function(f){return String(f.name)==="entry_kind"}))app.db().newQuery("ALTER TABLE agent_studio_authoring_requirements ADD COLUMN entry_kind TEXT NOT NULL DEFAULT 'original'").execute()
}
function chain(app,uid,id){
  var rows=[],seen=Object.create(null),chars=0,current=String(id)
  while(current){
    if(!/^[A-Za-z0-9]{20}$/.test(current)||seen[current]||rows.length>=20)fault("authoring_requirement_chain_invalid",409)
    seen[current]=true;var row=new DynamicModel({id:"",owner_uid:"",parent_id:"",entry_kind:"",requirement:"",chain_hash:"",created_ms:0})
    try{app.db().newQuery("SELECT id,owner_uid,parent_id,entry_kind,requirement,chain_hash,created_ms FROM agent_studio_authoring_requirements WHERE id={:id} AND owner_uid={:uid}").bind({id:current,uid:uid}).one(row)}catch(_){fault("authoring_requirement_not_found",404)}
    chars+=String(row.requirement).length;if(chars>24000)fault("authoring_requirement_size_limit",413)
    rows.unshift({request_id:String(row.id),parent_id:String(row.parent_id),kind:String(row.entry_kind),requirement:String(row.requirement),chain_hash:String(row.chain_hash),created_ms:Number(row.created_ms)})
    current=String(row.parent_id)
  }
  var prior="";rows.forEach(function(row){var current=$security.sha256(canonical({parent_hash:prior,kind:row.kind,requirement:row.requirement})),legacy=row.kind==="original"?$security.sha256(canonical({parent_hash:prior,requirement:row.requirement})):"";if(current!==row.chain_hash&&legacy!==row.chain_hash)fault("authoring_requirement_integrity_error",500);prior=row.chain_hash})
  return rows
}
function create(app,uid,input){
  var schemas=require(__hooks+"/modules/business_schemas.js");schemas.object(input,["requirement","parent_id","idempotency_key","kind"]);schemas.string(input.requirement,12000);schemas.string(input.idempotency_key,120)
  var parent=String(input.parent_id||""),history=parent?chain(app,uid,parent):[],text=input.requirement
  if(input.parent_id!==undefined&&typeof input.parent_id!=="string")fault("invalid_authoring_parent",400)
  var kind=input.kind|| (parent?"revision":"original");if(["original","revision","legacy_revision"].indexOf(kind)<0||(parent?kind!=="revision":kind==="revision"))fault("invalid_authoring_requirement_kind",400)
  if(history.length>=20||history.reduce(function(n,row){return n+row.requirement.length},text.length)>24000)fault("authoring_requirement_size_limit",413)
  var hash=$security.sha256(canonical({parent_id:parent,kind:kind,requirement:text})),id=""
  app.runInTransaction(function(tx){
    var old=arrayOf(new DynamicModel({id:"",request_hash:""}));tx.db().newQuery("SELECT id,request_hash FROM agent_studio_authoring_requirements WHERE owner_uid={:uid} AND idempotency_key={:key}").bind({uid:uid,key:input.idempotency_key}).all(old)
    if(old.length){if(String(old[0].request_hash)!==hash)fault("authoring_idempotency_conflict",409);id=String(old[0].id);return}
    id=$security.randomString(20);tx.db().newQuery("INSERT INTO agent_studio_authoring_requirements (id,owner_uid,parent_id,entry_kind,requirement,chain_hash,idempotency_key,request_hash,created_ms) VALUES ({:id},{:uid},{:parent},{:kind},{:text},{:hash},{:key},{:request},{:now})").bind({id:id,uid:uid,parent:parent,kind:kind,text:text,hash:$security.sha256(canonical({parent_hash:history.length?history[history.length-1].chain_hash:"",kind:kind,requirement:text})),key:input.idempotency_key,request:hash,now:new Date().getTime()}).execute()
  });return get(app,uid,id)
}
function get(app,uid,id){var rows=chain(app,uid,id);if(!rows.length)fault("authoring_requirement_not_found",404);return {request_id:id,chain_hash:rows[rows.length-1].chain_hash,entries:rows}}
function reference(spec){
  if(!spec||typeof spec!=="object"||Array.isArray(spec)||spec._studio_authoring===undefined)return ""
  var value=spec._studio_authoring
  if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).length!==1||typeof value.request_id!=="string"||!/^[A-Za-z0-9]{20}$/.test(value.request_id))fault("invalid_authoring_reference",400)
  return String(value.request_id)
}
function context(app,uid,spec){
  var id=reference(spec);if(!id)return null
  var rows=chain(app,uid,id);return {request_id:id,chain_hash:rows[rows.length-1].chain_hash,entry_count:rows.length,complete_original:rows[0].kind==="original",text:rows.map(function(row){return row.requirement}).join("\n")}
}
function guard(app,record,previous){
  var uid=record.getString("rh_user_id"),spec;try{spec=JSON.parse(record.getString("spec")||"null")}catch(_){spec=null}
  var old=reference(previous),next=reference(spec)
  if(!old&&!next)return
  if(!spec||typeof spec!=="object"||Array.isArray(spec))fault("authoring_requirement_cannot_be_removed",409)
  if(!next){spec._studio_authoring={request_id:old};next=old}
  var current=chain(app,uid,next)
  if(old&&old!==next&&!current.some(function(row){return row.request_id===old})){
    // Restoring old configuration retains newer employee requirements. A
    // separate unrelated request must become a new Agent, not erase this one.
    if(!chain(app,uid,old).some(function(row){return row.request_id===next}))fault("authoring_requirement_lineage_conflict",409)
    spec._studio_authoring={request_id:old}
  }
  record.set("spec",spec)
}
function preview(app,uid,input){
  var schemas=require(__hooks+"/modules/business_schemas.js");schemas.object(input,["request_id","spec"])
  var spec=input.spec||{};if(typeof spec!=="object"||Array.isArray(spec)||JSON.stringify(spec).length>50000)fault("invalid_authoring_draft",400)
  ;["goal","task_scope"].forEach(function(key){if(spec[key]!==undefined&&(typeof spec[key]!=="string"||spec[key].length>6000))fault("invalid_authoring_draft",400)})
  ;["tools","task_plan","deliverables","done_criteria","knowledge_base_ids","research_capability_requirements"].forEach(function(key){if(spec[key]!==undefined&&(!Array.isArray(spec[key])||spec[key].length>40||spec[key].some(function(v){return typeof v!=="string"||v.length>1600})))fault("invalid_authoring_draft",400)})
  if(spec.capability_requirements!==undefined&&(!Array.isArray(spec.capability_requirements)||spec.capability_requirements.length>40||spec.capability_requirements.some(function(v){return typeof v!=="string"&&!require(__hooks+"/modules/capability_plan.js").desktopRequirement(v)})))fault("invalid_authoring_draft",400)
  spec=JSON.parse(JSON.stringify(spec));spec._studio_authoring={request_id:String(input.request_id||"")};context(app,uid,spec)
  var plan=require(__hooks+"/modules/capability_plan.js").compile(app,uid,spec)
  return {spec:spec,plan:plan,preview_hash:$security.sha256(canonical({spec:spec,plan:plan})),scope:"dependency_preview_not_business_acceptance"}
}
module.exports={ensure:ensure,create:create,get:get,context:context,guard:guard,preview:preview,reference:reference}
