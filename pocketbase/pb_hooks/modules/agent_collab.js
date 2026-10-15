"use strict"
// Collaborative Agent text revisions. No model credentials, KB pointers,
// external tools or execution permissions are ever delegated.
function fail(code,status) {
 var e=new Error(code);e.code=code;e.httpStatus=status;throw e
}
var FIELDS=["goal","task_scope","deliverables","task_plan","done_criteria"]
function extract(spec) {
 var data=spec&&typeof spec==="object"&&!Array.isArray(spec)?spec:{}
 var safe={
  goal:String(data.goal||"").slice(0,3000),
  task_scope:String(data.task_scope||"").slice(0,4000),
  deliverables:[],task_plan:[],done_criteria:[],
 }
 for(var i=0;i<FIELDS.length;i++){
  var key=FIELDS[i]
  if(key==="goal"||key==="task_scope")continue
  var list=Array.isArray(data[key])?data[key]:[]
  for(var j=0;j<Math.min(list.length,30);j++){
    if(typeof list[j]==="string")safe[key].push(list[j].slice(0,500))
  }
 }
 return safe
}
function normalize(input) {
 if(!input||typeof input!=="object"||Array.isArray(input))fail("invalid_collab_spec",400)
 if(typeof input.goal!=="string"||!input.goal.trim()||input.goal.length>3000)
   fail("invalid_collab_spec",400)
 for(var k=0;k<FIELDS.length;k++){
  var key=FIELDS[k]
  if(key==="goal")continue
  if(key==="task_scope") {
   if(input[key]!==undefined&&(typeof input[key]!=="string"||input[key].length>4000))
    fail("invalid_collab_spec",400)
  } else {
   if(input[key]!==undefined&&(!Array.isArray(input[key])||input[key].length>30))
    fail("invalid_collab_spec",400)
   var a=input[key]||[]
   for(var j=0;j<a.length;j++)
    if(typeof a[j]!=="string"||a[j].length>500)fail("invalid_collab_spec",400)
  }
 }
 // Refuse attempts to attach credential/model/KB/tool configuration.
 var props=Object.keys(input)
 for(var t=0;t<props.length;t++)if(FIELDS.indexOf(props[t])<0)
  fail("collab_protected_field",400)
 var spec=extract(input)
 if(spec.goal.trim().length<1)fail("invalid_collab_spec",400)
 if(JSON.stringify(spec).length>23000)fail("invalid_collab_spec",400)
 return spec
}
function decode(rec) {
 try{
  var obj=JSON.parse(String(rec.getString("spec")||""))
  return obj && typeof obj==="object" && !Array.isArray(obj)?obj:{}
 }catch(_){return {}}
}
function digest(spec) {
 // The version fence must include protected settings too: if an owner
 // changes model/tool/knowledge permissions while a draft is pending,
 // stale proposals cannot silently apply to a now-different Agent.
 // Only the hash is returned; raw private fields are never exposed.
 var value=spec&&typeof spec==="object"&&!Array.isArray(spec)?spec:{}
 return String($security.sha256(JSON.stringify(value)))
}
function resolve(app,uid,specId,minimumRole) {
 var sid=String(specId||"")
 if(!/^[A-Za-z0-9]{15}$/.test(sid))fail("invalid_spec_id",400)
 var rec
 try{rec=app.findRecordById("agent_specs",sid)}catch(_){fail("agent_not_found",404)}
 var owner=String(rec.getString("rh_user_id")||"")
 var role="owner"
 if(owner!==String(uid)) {
  var row=new DynamicModel({role:""})
  try{
   app.db().newQuery(
    "SELECT a.role FROM agent_studio_spec_access a "+
    "JOIN studio_users r ON r.id=a.member_uid AND r.active=1 "+
    "JOIN studio_users o ON o.id=a.owner_uid AND o.active=1 "+
    "WHERE a.spec_id={:spec} AND a.owner_uid={:owner} AND a.member_uid={:member}"
   ).bind({spec:sid,owner:owner,member:String(uid)}).one(row)
  }catch(_){fail("agent_not_found",404)}
  role=String(row.role)
  if(role!=="viewer"&&role!=="editor")fail("agent_not_found",404)
 }
 if(minimumRole==="owner"&&role!=="owner")fail("agent_not_found",404)
 if(minimumRole==="editor"&&role!=="owner"&&role!=="editor")fail("agent_not_found",404)
 return {rec:rec,id:sid,owner:owner,role:role}
}
function userByEmail(app,email,owner) {
 var value=String(email||"").trim().toLowerCase()
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)||value.length>180)
  fail("invalid_recipient_email",400)
 var people=app.findRecordsByFilter(
  "studio_users","email = {:email} && active = true","",2,0,{email:value})
 if(people.length!==1||String(people[0].id)===String(owner))
  fail("recipient_not_found",404)
 return {id:String(people[0].id),name:String(people[0].getString("display_name")||"员工")}
}
function audit(app,action,specId,owner,actor,member,proposalId) {
 app.db().newQuery(
  "INSERT INTO agent_studio_spec_collab_audit "+
  "(id,spec_id,owner_uid,actor_uid,member_uid,proposal_id,action,occurred_ms) "+
  "VALUES({:id},{:spec},{:owner},{:actor},{:member},{:proposal},{:action},{:now})"
 ).bind({id:$security.randomString(15),spec:specId,owner:owner,
  actor:String(actor),member:String(member||""),proposal:String(proposalId||""),
  action:action,now:new Date().getTime()}).execute()
}
module.exports={fail:fail,FIELDS:FIELDS,extract:extract,normalize:normalize,
 decode:decode,digest:digest,resolve:resolve,userByEmail:userByEmail,audit:audit}
