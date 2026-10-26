"use strict"

// Snapshots of shared internal Agent templates are restricted to declared
// workflow *instructions*. Sensitive runtime configs and owner resources
// never cross the ownership boundary.
var BUILTIN = {
  calculate:true,summarize:true,knowledge_search:true,web_fetch:true,web_search:true,
}
function safeText(v,max) {
  return typeof v==="string" ? v.slice(0,max) : ""
}
function safeList(v) {
  if (!Array.isArray(v)) return []
  var out=[]
  for (var i=0;i<v.length && out.length<20;i++) {
    if (typeof v[i] !== "string") continue
    var item = safeText(v[i],300)
    if (item.trim()) out.push(item)
  }
  return out
}
// Preserve the *organization* of complex Agents, never their former grants.
// Invalid role topology fails closed instead of silently dropping a stage.
function sharedRoles(value) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > 8) throw Error("shared_roles_invalid")
  var known={},roles=[]
  function texts(v,required) {
    if (!Array.isArray(v) || v.length > 32 ||
        v.some(function(x){return typeof x!=="string"||x.length>1600}))
      throw Error("shared_roles_invalid")
    var out=v.filter(function(x){return x.trim().length>0}).slice()
    if (required && !out.length) throw Error("shared_roles_invalid")
    return out
  }
  for(var i=0;i<value.length;i++){
    var raw=value[i]
    if (!raw || typeof raw!=="object" || Array.isArray(raw))
      throw Error("shared_roles_invalid")
    var id=String(raw.id||"")
    if(!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(id)||known[id])
      throw Error("shared_roles_invalid")
    known[id]=true
    var name=String(raw.name||""),resp=String(raw.responsibility||"")
    if (!name.trim() || name.length>100 || !resp.trim() || resp.length>2000)
      throw Error("shared_roles_invalid")
    roles.push({id:id,name:name,responsibility:resp,
      tasks:texts(raw.tasks,true),inputs:texts(raw.inputs,false),
      deliverables:texts(raw.deliverables,true),
      depends_on:texts(raw.depends_on,false),
      // Recipient MUST grant every role tool explicitly.
      tools:[],done_criteria:texts(raw.done_criteria,true)})
  }
  var finished={},todo=roles.length
  while(todo){
    var advanced=false
    for(var j=0;j<roles.length;j++){
      var role=roles[j]
      if(finished[role.id])continue
      for(var k=0;k<role.depends_on.length;k++)
        if(role.depends_on[k]===role.id||!known[role.depends_on[k]])
          throw Error("shared_roles_invalid")
      if(role.depends_on.every(function(dep){return finished[dep]})){
        finished[role.id]=true;todo--;advanced=true
      }
    }
    if(!advanced)throw Error("shared_roles_invalid")
  }
  return roles
}
var CAPABILITY_KINDS={
  web_search:true,web_fetch:true,knowledge:true,calculate:true,text:true,
  document:true,browser:true,desktop:true,integration:true,custom:true,
}
function sharedRequirements(value,roles){
  if(value===undefined||value===null)return []
  if(!Array.isArray(value)||value.length>20)throw Error("shared_capabilities_invalid")
  var ids={},members={}
  for(var i=0;i<roles.length;i++)members[roles[i].id]=true
  return value.map(function(raw,index){
    if(!raw||typeof raw!=="object"||Array.isArray(raw))
      throw Error("shared_capabilities_invalid")
    var id=String(raw.id||"")
    var title=String(raw.title||"")
    if(!/^[a-zA-Z0-9_-]{1,60}$/.test(id)||ids[id]||!title.trim()||title.length>100)
      throw Error("shared_capabilities_invalid")
    ids[id]=true
    var rolesForNeed=raw.role_ids===undefined?[]:raw.role_ids
    if(!Array.isArray(rolesForNeed)||rolesForNeed.length>12||
       rolesForNeed.some(function(r){return typeof r!=="string"||!members[r]}))
      throw Error("shared_capabilities_invalid")
    return {id:id,title:title,purpose:safeText(raw.purpose,600),
      kind:CAPABILITY_KINDS[String(raw.kind||"")]?String(raw.kind):"custom",
      access:raw.access==="write"?"write":"read",required:raw.required!==false,
      // Employee-specific queries may include confidential names or entities.
      // Recipient recomputes safe search terms from the task after import.
      role_ids:rolesForNeed.slice(),search_terms:[],
      // Suggestions may contain owner's tool IDs and are NOT authorizations.
      suggested_tool_ids:[]}
  })
}
function sharedChecks(value){
  if(value===undefined||value===null)return []
  if(!Array.isArray(value)||value.length>12)throw Error("shared_checks_invalid")
  return value.map(function(raw){
    if(!raw||typeof raw!=="object"||Array.isArray(raw)||
        ["contains","not_contains","json_object"].indexOf(raw.type)<0)
      throw Error("shared_checks_invalid")
    var expected=safeText(raw.expected,200)
    if(raw.type!=="json_object"&&!expected.trim())throw Error("shared_checks_invalid")
    return {type:String(raw.type),expected:expected}
  })
}
function makeCopy(raw) {
  var o=raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}
  var list=safeList(o.tools)
  var tools=[]
  for(var i=0;i<list.length;i++) if (BUILTIN[list[i]] && tools.indexOf(list[i])<0) tools.push(list[i])
  // Keep tested instructions and responsibilities, not the author's
  // account-bound grants, Skill IDs, custom models or private knowledge.
  var roles=sharedRoles(o.roles)
  var requirements=sharedRequirements(o.capability_requirements,roles)
  var checks=sharedChecks(o.quality_checks)
  return {
    goal:safeText(o.goal,2000),
    task_scope:safeText(o.task_scope,2000),
    deliverables:safeList(o.deliverables),
    tools:tools,
    task_plan:safeList(o.task_plan),
    done_criteria:safeList(o.done_criteria),
    knowledge_base_ids:[],
    ...(Array.isArray(o.roles)?{roles:roles}:{}),
    ...(Array.isArray(o.capability_requirements)?{capability_requirements:requirements}:{}),
    ...(Array.isArray(o.quality_checks)?{quality_checks:checks}:{}),
    require_plan_review:true,
    require_approval:true,
  }
}
function fromRecord(record) {
  var candidates=[]
  try { candidates.push(record.get("spec")) } catch (_) {}
  try { candidates.push(record.publicExport().spec) } catch (_) {}
  try { candidates.push(record.getString("spec")) } catch (_) {}
  for(var i=0;i<candidates.length;i++) {
    try {
      var value=candidates[i]
      var parsed=typeof value==="string" ? JSON.parse(value) :
        JSON.parse(JSON.stringify(value))
      if(parsed && typeof parsed==="object" && !Array.isArray(parsed) &&
         (typeof parsed.goal==="string" || Array.isArray(parsed.tools))) {
        return makeCopy(parsed)
      }
    }catch(_){}
  }
  throw new Error("source_spec_invalid")
}
module.exports={makeCopy:makeCopy,fromRecord:fromRecord}
