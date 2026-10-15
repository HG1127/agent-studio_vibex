"use strict"
// Knowledge permissions are entirely server-side. IDs are not capabilities.
// No grant gives access to model credentials or another employee's Agent.
function err(code,status){
 var e=new Error(code)
 e.code=code
 e.httpStatus=status
 throw e
}
function validBaseId(id){return /^[A-Za-z0-9]{15}$/.test(String(id||""))}
function resolve(app,actor,baseId,mode){
 var bid=String(baseId||""),uid=String(actor||"")
 if(!uid)err("studio_login_required",401)
 if(!validBaseId(bid))err("invalid_base_id",400)
 var base=new DynamicModel({rh_user_id:"",name:"",description:"",created_ms:0,updated_ms:0})
 try{
  app.db().newQuery(
    "SELECT rh_user_id,name,description,created_ms,updated_ms "+
    "FROM agent_studio_kb_bases WHERE id={:bid}"
  ).bind({bid:bid}).one(base)
 }catch(_){err("base_not_found",404)}
 var owner=String(base.rh_user_id)
 var role="owner"
 var semanticAllowed=true
 if(owner!==uid){
  var access=new DynamicModel({role:"",semantic_allowed:0})
  try{
   app.db().newQuery(
    "SELECT a.role,a.semantic_allowed FROM agent_studio_kb_access a "+
    "JOIN studio_users r ON r.id=a.recipient_uid AND r.active=1 "+
    "JOIN studio_users o ON o.id=a.owner_uid AND o.active=1 "+
    "WHERE a.base_id={:bid} AND a.owner_uid={:owner} AND a.recipient_uid={:uid}"
   ).bind({bid:bid,owner:owner,uid:uid}).one(access)
  }catch(_){err("base_not_found",404)}
  role=String(access.role)
  semanticAllowed=Number(access.semantic_allowed)===1
  if(role!=="viewer"&&role!=="editor")err("base_not_found",404)
 }
 if(mode==="owner"&&role!=="owner")err("base_not_found",404)
 if(mode==="editor"&&role!=="owner"&&role!=="editor")err("base_not_found",404)
 return {base_id:bid,owner_uid:owner,role:role,semantic_allowed:semanticAllowed,
  name:String(base.name),description:String(base.description),
  created_ms:Number(base.created_ms),updated_ms:Number(base.updated_ms)}
}
function ensureRecipient(app,owner,email){
 var query=String(email||"").trim().toLowerCase()
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query)||query.length>180)
  err("invalid_recipient_email",400)
 var recs=app.findRecordsByFilter("studio_users","email={:email} && active=true","",2,0,{email:query})
 if(recs.length!==1 || String(recs[0].id)===String(owner))
  err("recipient_not_found",404)
 return {id:String(recs[0].id),display_name:String(recs[0].getString("display_name")||"员工")}
}
function listGrants(app,owner,bid) {
 var rows=arrayOf(new DynamicModel({recipient_uid:"",role:"",semantic_allowed:0,created_ms:0,updated_ms:0,display_name:"",active:0}))
 app.db().newQuery(
  "SELECT a.recipient_uid,a.role,a.semantic_allowed,a.created_ms,a.updated_ms,"+
  "r.display_name, r.active AS active FROM agent_studio_kb_access a "+
  "JOIN studio_users r ON r.id=a.recipient_uid "+
  "WHERE a.base_id={:bid} AND a.owner_uid={:owner} "+
  "ORDER BY a.updated_ms DESC LIMIT 80"
 ).bind({bid:bid,owner:owner}).all(rows)
 var result=[]
 for(var i=0;i<rows.length;i++){
  var r=rows[i]
  result.push({recipient_id:String(r.recipient_uid),name:String(r.display_name),
   role:String(r.role),active:!!Number(r.active),
   semantic_allowed:Number(r.semantic_allowed)===1,
   created_ms:Number(r.created_ms),updated_ms:Number(r.updated_ms)})
 }
 return result
}
function listShared(app,uid){
 var rows=arrayOf(new DynamicModel({id:"",rh_user_id:"",name:"",description:"",
   created_ms:0,updated_ms:0,role:"",semantic_allowed:0,display_name:"",document_count:0,chunk_count:0}))
 app.db().newQuery(
  "SELECT b.id,b.rh_user_id,b.name,b.description,b.created_ms,b.updated_ms,"+
  "a.role,a.semantic_allowed,o.display_name,"+
  "(SELECT COUNT(*) FROM agent_studio_kb_documents d WHERE d.base_id=b.id "+
  "AND d.rh_user_id=b.rh_user_id) AS document_count,"+
  "(SELECT COUNT(*) FROM agent_studio_kb_chunks c WHERE c.base_id=b.id "+
  "AND c.rh_user_id=b.rh_user_id) AS chunk_count "+
  "FROM agent_studio_kb_access a "+
  "JOIN agent_studio_kb_bases b ON b.id=a.base_id AND b.rh_user_id=a.owner_uid "+
  "JOIN studio_users o ON o.id=a.owner_uid AND o.active=1 "+
  "WHERE a.recipient_uid={:uid} ORDER BY a.updated_ms DESC LIMIT 100"
 ).bind({uid:uid}).all(rows)
 var items=[]
 for(var i=0;i<rows.length;i++){
  var row=rows[i]
  items.push({
   id:String(row.id),name:String(row.name),description:String(row.description),
   owner_uid:String(row.rh_user_id),owner_name:String(row.display_name),
   access_role:String(row.role),semantic_allowed:Number(row.semantic_allowed)===1,
   created_ms:Number(row.created_ms),
   updated_ms:Number(row.updated_ms),document_count:Number(row.document_count),
   chunk_count:Number(row.chunk_count)
  })
 }
 return items
}
module.exports={err:err,validBaseId:validBaseId,resolve:resolve,
 ensureRecipient:ensureRecipient,listGrants:listGrants,listShared:listShared}
