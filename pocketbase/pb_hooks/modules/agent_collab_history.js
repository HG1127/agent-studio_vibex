"use strict"
// Append-only safe-text revision snapshots. Never persist model credentials,
// tools, KB pointers, runtime configuration or full Agent spec JSON here.
var safe=require(__hooks+"/modules/agent_collab.js")
function record(app,params){
 var text=safe.extract(params.spec)
 var id=$security.randomString(15)
 var kind=String(params.kind||"")
 if(["before_accept","accepted","before_restore","restored"].indexOf(kind)<0)
   safe.fail("invalid_revision_kind",400)
 app.db().newQuery(
   "INSERT INTO agent_studio_spec_revisions "+
   "(id,spec_id,owner_uid,actor_uid,kind,entry_type,proposal_id,source_revision_id,"+
   "spec_hash,safe_spec_json,note,occurred_ms) "+
   "VALUES({:id},{:spec},{:owner},{:actor},{:kind},{:type},{:proposal},{:source},"+
   "{:hash},{:safe},{:note},{:now})"
 ).bind({
   id:id,spec:String(params.specId),owner:String(params.ownerId),
   actor:String(params.actorId),kind:kind,proposal:String(params.proposalId||""),
   type:String(params.entryType)==="direct"?"direct":"collab",
   source:String(params.sourceRevisionId||""),hash:safe.digest(params.spec),
   safe:JSON.stringify(text),note:String(params.note||"").slice(0,600),
   now:new Date().getTime(),
 }).execute()
 return id
}
function list(app,owner,specId){
 var rows=arrayOf(new DynamicModel({
   id:"",actor_uid:"",kind:"",entry_type:"",proposal_id:"",source_revision_id:"",
   spec_hash:"",safe_spec_json:"",note:"",occurred_ms:0,
 }))
 app.db().newQuery(
   "SELECT id,actor_uid,kind,entry_type,proposal_id,source_revision_id,spec_hash,"+
   "safe_spec_json,note,occurred_ms FROM agent_studio_spec_revisions "+
   "WHERE spec_id={:spec} AND owner_uid={:owner} ORDER BY occurred_ms DESC,rowid DESC LIMIT 80"
 ).bind({spec:String(specId),owner:String(owner)}).all(rows)
 var items=[]
 for(var i=0;i<rows.length;i++){
   var item=rows[i],text={}
   try{text=safe.extract(JSON.parse(String(item.safe_spec_json)))}catch(_){}
   items.push({
     id:String(item.id),actor_uid:String(item.actor_uid),kind:String(item.kind),
     entry_type:String(item.entry_type)==="direct"?"direct":"collab",
     proposal_id:String(item.proposal_id),source_revision_id:String(item.source_revision_id),
     spec_hash:String(item.spec_hash),safe:text,note:String(item.note),
     occurred_ms:Number(item.occurred_ms),
   })
 }
 return items
}
function find(app,owner,specId,revisionId){
 var row=new DynamicModel({id:"",safe_spec_json:"",kind:""})
 try{
   app.db().newQuery(
     "SELECT id,safe_spec_json,kind FROM agent_studio_spec_revisions "+
     "WHERE id={:revision} AND spec_id={:spec} AND owner_uid={:owner}"
   ).bind({revision:String(revisionId),spec:String(specId),owner:String(owner)}).one(row)
 }catch(_){safe.fail("collab_revision_not_found",404)}
 var obj
 try{obj=safe.normalize(JSON.parse(String(row.safe_spec_json)))}catch(_){
   safe.fail("collab_revision_invalid",409)
 }
 return {id:String(row.id),kind:String(row.kind),safe:obj}
}
module.exports={record:record,list:list,find:find}
