"use strict"
// Shared defensive utilities used only by standalone company oversight routes.
function actor(e) {
  var auth=e.auth
  if(!auth) return null
  try {
    if(String(auth.collection().name)!=="studio_users" || !auth.getBool("active"))return null
    return auth
  }catch(_){return null}
}
function jsonField(record, name) {
  try {
    var raw=String(record.getString(name)||"")
    var parsed=JSON.parse(raw)
    if(parsed && typeof parsed==="object" && !Array.isArray(parsed))return parsed
  }catch(_){}
  return {}
}
function pending(run) {
  var cp=jsonField(run,"checkpoint")
  var current=cp.pending_approval
  if(!current || typeof current!=="object" || Array.isArray(current))return null
  var step=Number(current.step_index || run.getInt("current_step") || 0)
  if(!Number.isInteger(step) || step<1 || step>1000)return null
  var tool=String(current.tool||"").slice(0,100)
  if(!tool)return null
  return {checkpoint:cp,step:step,tool:tool,input:current.input||{}}
}
function hash(run,info) {
  return String($security.sha256(JSON.stringify({
    run_id:String(run.id),owner:String(run.getString("rh_user_id")||""),
    step:info.step,tool:info.tool,input:info.input,
  })))
}
function preview(input) {
  // Strict metadata-only projection. An arbitrary employee's request body may
  // contain undisclosed trade secrets even if its field name is not "password".
  // Never forward raw argument values, paths, queries, headers or nested data.
  if(!input||typeof input!=="object"||Array.isArray(input))
    return JSON.stringify({warning:"原始参数已隐藏",field_count:0})
  var keys=[]
  for(var key in input) {
    if(!Object.prototype.hasOwnProperty.call(input,key))continue
    if(keys.length>=24)break
    var normalized=String(key).slice(0,60).replace(/[^a-zA-Z0-9_\u4e00-\u9fff-]/g,"_")
    if(/(?:password|secret|authorization|api[_-]?key|access[_-]?token|cookie|credential|private[_-]?key)/i.test(normalized))
      normalized="[保密参数]"
    keys.push(normalized)
  }
  var meth=String(input.method||input.http_method||"").toUpperCase()
  if(["GET","POST","PUT","PATCH","DELETE"].indexOf(meth)<0)meth="未提供"
  var url=String(input.url||input.endpoint||input.base_url||"")
  var matched=url.match(/^https?:\/\/([^\/?#]+)/i)
  var hostname=matched?matched[1].split("@").pop().replace(/:[0-9]{2,5}$/,"").toLowerCase():"未提供"
  if(!/^[a-z0-9.-]{2,160}$/.test(hostname))hostname="已隐藏"
  return JSON.stringify({
    notice:"所有输入字段值、URL 路径/参数及请求体已隐藏，请结合员工主动提交的审核说明判断。",
    method:meth,target_hostname:hostname,field_names:keys,
    field_count:Object.keys(input).length,
  })
}
function uid(rec){return String(rec.id)}
function isAdmin(rec){return !!rec && rec.getString("role")==="admin"}
function count(app,sql,bindings){
  var row=new DynamicModel({total:0})
  var values={}
  var names=Object.keys(bindings||{})
  for(var i=0;i<names.length;i++){
    if(sql.indexOf("{:"+names[i]+"}")>=0)values[names[i]]=bindings[names[i]]
  }
  app.db().newQuery(sql).bind(values).one(row)
  return Number(row.total||0)
}
function audit(app,entry){
  app.db().newQuery(
    "INSERT INTO agent_studio_review_audit(id,run_id,owner_uid,reviewer_uid,actor_uid,action,step_index,occurred_ms) "+
    "VALUES({:id},{:run},{:owner},{:reviewer},{:actor},{:action},{:step},{:now})"
  ).bind({
    id:$security.randomString(15),run:String(entry.run_id),owner:String(entry.owner_uid),
    reviewer:String(entry.reviewer_uid),actor:String(entry.actor_uid),
    action:String(entry.action),step:Number(entry.step||0),now:new Date().getTime(),
  }).execute()
}
module.exports={
 actor:actor,jsonField:jsonField,pending:pending,hash:hash,preview:preview,
 uid:uid,isAdmin:isAdmin,count:count,audit:audit,
}
