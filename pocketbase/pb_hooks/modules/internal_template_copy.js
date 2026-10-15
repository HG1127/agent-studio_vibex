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
function makeCopy(raw) {
  var o=raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}
  var list=safeList(o.tools)
  var tools=[]
  for(var i=0;i<list.length;i++) if (BUILTIN[list[i]] && tools.indexOf(list[i])<0) tools.push(list[i])
  // Never inherit secrets, external connections, KB IDs, or permission to
  // write externally without recipient review.
  return {
    goal:safeText(o.goal,2000),
    task_scope:safeText(o.task_scope,2000),
    deliverables:safeList(o.deliverables),
    tools:tools,
    task_plan:safeList(o.task_plan),
    done_criteria:safeList(o.done_criteria),
    knowledge_base_ids:[],
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
