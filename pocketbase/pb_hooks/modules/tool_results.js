"use strict"

// Immutable business results, separate from short event/trace observations.
// Only server-owned engines may write. IDs are locators, never capabilities.
var MAX_SERIALIZED = 4 * 1024 * 1024
function fault(code, status) {
  var e = new Error(code); e.code = code; e.httpStatus = status; throw e
}
function ensure(app) {
  app.db().newQuery("CREATE TABLE IF NOT EXISTS agent_studio_tool_results (" +
    "id TEXT PRIMARY KEY, owner_uid TEXT NOT NULL, run_id TEXT NOT NULL, " +
    "step_index INTEGER NOT NULL, tool TEXT NOT NULL, payload TEXT NOT NULL, " +
    "source_scope TEXT NOT NULL, content_hash TEXT NOT NULL, created_ms INTEGER NOT NULL, " +
    "UNIQUE(run_id,step_index))").execute()
  app.db().newQuery("CREATE INDEX IF NOT EXISTS idx_tool_results_owner_run ON " +
    "agent_studio_tool_results(owner_uid,run_id,step_index)").execute()
}
function authorizeRun(app, uid, runId) {
  if (!uid) fault("studio_login_required", 401)
  var run = null
  try { run = app.findRecordById("agent_runs", String(runId)) } catch (_) {}
  if (!run || run.getString("rh_user_id") !== uid) fault("result_not_found", 404)
  return run
}
function authorizeScope(app, uid, scope, visited) {
  var materials=scope.materials||[]
  if(!Array.isArray(materials)||materials.length>400)fault("result_scope_limit",413)
  for(var mi=0;mi<materials.length;mi++){
    try{require(__hooks+"/modules/materials.js").authorize(app,uid,String(materials[mi]))}
    catch(_){fault("result_source_unavailable",403)}
  }
  var bases = scope.knowledge_base_ids || []
  if(!Array.isArray(bases) || bases.length>100)fault("result_scope_limit",413)
  for (var i = 0; i < bases.length; i++) {
    try {
      var grant = require(__hooks + "/modules/knowledge_acl.js").resolve(app, uid, bases[i], "viewer")
      if (scope.semantic_used && !grant.semantic_allowed) fault("result_source_unavailable",403)
    }
    catch (_) { fault("result_source_unavailable", 403) }
  }
  var documents = scope.documents || []
  if(!Array.isArray(documents) || documents.length>400)fault("result_scope_limit",413)
  for (var j = 0; j < documents.length; j++) {
    var found = new DynamicModel({id:""})
    try {
      app.db().newQuery("SELECT id FROM agent_studio_kb_documents WHERE id={:id} AND base_id={:bid}")
        .bind({id:documents[j].document_id,bid:documents[j].base_id}).one(found)
    } catch (_) { fault("result_source_unavailable",403) }
  }
  var dependencies=scope.dependency_runs || []
  if(!Array.isArray(dependencies) || dependencies.length>100)fault("result_source_unavailable",403)
  for(var d=0;d<dependencies.length;d++){
    try{assertRunAccessible(app,uid,String(dependencies[d]),visited)}
    catch(_){fault("result_source_unavailable",403)}
  }
}
function clean(value, sanitize, depth) {
  if (depth > 40) fault("result_nesting_limit", 422)
  if (typeof value === "string") return sanitize(value)
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map(function(v) { return clean(v, sanitize, depth + 1) })
  var out = Object.create(null)
  Object.keys(value).forEach(function(key) {
    out[sanitize(key)] = clean(value[key], sanitize, depth + 1)
  })
  return out
}
function save(app, uid, runId, step, tool, envelope, scope, sanitize) {
  authorizeRun(app, uid, runId)
  assertRunAccessible(app,uid,runId)
  authorizeScope(app, uid, scope || {})
  var before = JSON.stringify(envelope)
  if (before.length > MAX_SERIALIZED) fault("result_size_limit", 413)
  var safe = clean(envelope, sanitize, 0)
  var redacted = JSON.stringify(safe) !== before
  safe.version = 1
  safe.redacted = redacted || envelope.credential_redacted === true
  // Record explicit read coverage; a search snippet is never a full source.
  var raw = JSON.stringify(safe)
  if (raw.length > MAX_SERIALIZED) fault("result_size_limit", 413)
  var hash = $security.sha256(raw)
  var resultId = ""
  app.runInTransaction(function(tx) {
    var rows = arrayOf(new DynamicModel({id:"",content_hash:""}))
    tx.db().newQuery("SELECT id,content_hash FROM agent_studio_tool_results " +
      "WHERE owner_uid={:uid} AND run_id={:rid} AND step_index={:step}")
      .bind({uid:uid,rid:runId,step:step}).all(rows)
    if (rows.length) {
      if (String(rows[0].content_hash) !== hash) fault("result_step_conflict", 409)
      resultId = String(rows[0].id); return
    }
    resultId = $security.randomString(20)
    tx.db().newQuery("INSERT INTO agent_studio_tool_results " +
      "(id,owner_uid,run_id,step_index,tool,payload,source_scope,content_hash,created_ms) " +
      "VALUES ({:id},{:uid},{:rid},{:step},{:tool},{:payload},{:scope},{:hash},{:now})")
      .bind({id:resultId,uid:uid,rid:runId,step:step,tool:tool,payload:raw,
        scope:JSON.stringify(scope || {}),hash:hash,now:new Date().getTime()}).execute()
  })
  return {result_id:resultId,content_hash:hash,text_length:String(safe.text || "").length,
    summary:String(safe.text || "").slice(0,280),coverage:safe.coverage,redacted:safe.redacted}
}
function row(app, uid, runId, id) {
  authorizeRun(app, uid, runId)
  assertRunAccessible(app,uid,runId)
  var r = new DynamicModel({id:"",tool:"",payload:"",source_scope:"",content_hash:"",step_index:0,created_ms:0})
  try {
    app.db().newQuery("SELECT id,tool,payload,source_scope,content_hash,step_index,created_ms " +
      "FROM agent_studio_tool_results WHERE id={:id} AND owner_uid={:uid} AND run_id={:rid}")
      .bind({id:String(id),uid:uid,rid:runId}).one(r)
  } catch (_) { fault("result_not_found",404) }
  authorizeScope(app, uid, JSON.parse(String(r.source_scope)))
  return r
}
function read(app, uid, runId, id, options) {
  var o = options || {}, field = String(o.field || "text")
  if (["text","structuredContent","content","resources"].indexOf(field) < 0) fault("invalid_result_field",400)
  var offset = o.offset === undefined ? 0 : Number(o.offset)
  var limit = o.limit === undefined ? 4000 : Number(o.limit)
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 8000)
    fault("invalid_result_range",400)
  var r = row(app,uid,runId,id), envelope = JSON.parse(String(r.payload))
  if(envelope.validation&&envelope.validation.status==="invalid")fault("result_output_contract_invalid",422)
  var value = envelope[field]
  var text = field === "text" ? String(value || "") : JSON.stringify(value === undefined ? null : value)
  if (offset > text.length) fault("invalid_result_range",400)
  var end = Math.min(offset + limit,text.length)
  return {result_id:String(r.id),run_id:String(runId),step_index:Number(r.step_index),captured_ms:Number(r.created_ms),tool:String(r.tool),content_hash:String(r.content_hash),
    field:field,encoding:field === "text" ? "text" : "json_fragment",offset:offset,end:end,
    total_length:text.length,has_more:end < text.length,text:text.slice(offset,end),
    coverage:envelope.coverage,redacted:envelope.redacted}
}
function list(app, uid, runId) {
  authorizeRun(app, uid, runId)
  try{assertRunAccessible(app,uid,runId)}catch(err){if(err.httpStatus===403)return [];throw err}
  var rows = arrayOf(new DynamicModel({id:"",tool:"",step_index:0,source_scope:"",content_hash:""}))
  app.db().newQuery("SELECT id,tool,step_index,source_scope,content_hash FROM agent_studio_tool_results " +
    "WHERE owner_uid={:uid} AND run_id={:rid} ORDER BY step_index LIMIT 100")
    .bind({uid:uid,rid:runId}).all(rows)
  var items = []
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i]
    try { authorizeScope(app,uid,JSON.parse(String(r.source_scope))) }
    catch (_) { continue }
    items.push({result_id:String(r.id),tool:String(r.tool),step_index:Number(r.step_index),content_hash:String(r.content_hash)})
  }
  return items
}
function savedAttempt(app, uid, runId, step, requestHash) {
  authorizeRun(app,uid,runId)
  var rows = arrayOf(new DynamicModel({id:""}))
  app.db().newQuery("SELECT id FROM agent_studio_tool_results WHERE owner_uid={:uid} AND run_id={:rid} AND step_index={:step}")
    .bind({uid:uid,rid:runId,step:step}).all(rows)
  if (!rows.length) return null
  var r = row(app,uid,runId,String(rows[0].id))
  if (JSON.parse(String(r.source_scope)).request_hash !== requestHash) fault("result_request_conflict",409)
  var envelope = JSON.parse(String(r.payload))
  return {output:String(envelope.text || ""),toolErr:envelope.validation&&envelope.validation.status==="invalid"?String(envelope.validation.error||"tool_output_contract_invalid"):"",retryable:false,envelope:envelope,
    receipt:{result_id:String(r.id),content_hash:String(r.content_hash),text_length:String(envelope.text || "").length,
      summary:String(envelope.text || "").slice(0,280),coverage:envelope.coverage,redacted:envelope.redacted}}
}
function inheritScope(app,uid,refs) {
  var scope={knowledge_base_ids:[],documents:[],materials:[],semantic_used:false,dependency_runs:[]},seen={},seenBases={},seenDocuments={},seenMaterials=Object.create(null)
  var addMaterial=function(id){id=String(id);require(__hooks+"/modules/materials.js").authorize(app,uid,id);if(!seenMaterials[id]){seenMaterials[id]=true;scope.materials.push(id)}}
  for(var i=0;i<refs.length;i++){
    if(refs[i].material_id){addMaterial(refs[i].material_id);continue}
    var r=row(app,uid,String(refs[i].run_id),String(refs[i].result_id))
    var source=JSON.parse(String(r.source_scope))
    ;(source.materials||[]).forEach(addMaterial)
    var bases=source.knowledge_base_ids || [],documents=source.documents || []
    for(var b=0;b<bases.length;b++)if(!seenBases[bases[b]]){seenBases[bases[b]]=true;scope.knowledge_base_ids.push(bases[b])}
    for(var p=0;p<documents.length;p++){
      var docKey=String(documents[p].base_id)+":"+String(documents[p].document_id)
      if(!seenDocuments[docKey]){seenDocuments[docKey]=true;scope.documents.push(documents[p])}
    }
    scope.semantic_used=scope.semantic_used || source.semantic_used===true
    var dependencies=[String(refs[i].run_id)].concat(source.dependency_runs || [])
    for(var d=0;d<dependencies.length;d++)if(!seen[dependencies[d]]){seen[dependencies[d]]=true;scope.dependency_runs.push(dependencies[d])}
  }
  if(scope.dependency_runs.length>100)fault("result_source_unavailable",403)
  if(scope.knowledge_base_ids.length>100 || scope.documents.length>400 || scope.materials.length>400)fault("result_scope_limit",413)
  return scope
}
function assertRunAccessible(app,uid,runId,visited) {
  visited=visited || Object.create(null)
  if(visited[runId])return
  if(Object.keys(visited).length>=100)fault("result_source_unavailable",403)
  visited[runId]=true
  var run=authorizeRun(app,uid,runId),snapshot={},config={}
  try{snapshot=JSON.parse(run.getString("spec_snapshot")||"{}");config=JSON.parse(run.getString("config")||"{}")}catch(_){}
  if(!snapshot || typeof snapshot!=="object")snapshot={}
  if(!config || typeof config!=="object")config={}
  if(config.tools && config.tools.knowledge_search && Array.isArray(snapshot.knowledge_base_ids))authorizeScope(app,uid,{knowledge_base_ids:snapshot.knowledge_base_ids},visited)
  var memories=Array.isArray(config.memory_injected)?config.memory_injected:[]
  if(memories.length>3)fault("result_source_unavailable",403)
  for(var m=0;m<memories.length;m++){
    var sourceRun=String(memories[m].source_run_id || "")
    if(!sourceRun && memories[m].id){
      try{
        var memory=app.findRecordById("agent_memories",String(memories[m].id))
        if(memory.getString("rh_user_id")!==uid)fault("result_source_unavailable",403)
        sourceRun=String(memory.getString("run_id") || "")
      }catch(_){fault("result_source_unavailable",403)}
    }
    if(sourceRun){try{assertRunAccessible(app,uid,sourceRun,visited)}catch(_){fault("result_source_unavailable",403)}}
  }
  var rows=arrayOf(new DynamicModel({source_scope:""}))
  app.db().newQuery("SELECT source_scope FROM agent_studio_tool_results WHERE owner_uid={:uid} AND run_id={:rid}")
    .bind({uid:uid,rid:runId}).all(rows)
  for(var i=0;i<rows.length;i++)authorizeScope(app,uid,JSON.parse(String(rows[i].source_scope)),visited)
}
function projectRun(app,uid,run) {
  try { assertRunAccessible(app,uid,String(run.id)) }
  catch(err) {
    if(err.httpStatus!==403)throw err
    run.result="";run.checkpoint={source_access_revoked:true};run.error="source_access_revoked";
    run.evaluation=null;run.feedback=null
    run.config=null;run.spec_snapshot=null
    run.source_access_revoked=true
  }
  return run
}
function projectEvent(app,uid,event) {
  try { assertRunAccessible(app,uid,String(event.run_id)) }
  catch(err) {
    if(err.httpStatus!==403)throw err
    event.content={message:"来源权限已失效，当前不可读取该运行的派生内容。",source_access_revoked:true}
  }
  return event
}
function projectMemory(app,uid,memory) {
  if(!memory.run_id)return memory
  try{assertRunAccessible(app,uid,String(memory.run_id))}
  catch(_){memory.fact="";memory.tools_used="";memory.source_access_revoked=true}
  return memory
}
module.exports = {ensure:ensure,save:save,read:read,list:list,row:row,savedAttempt:savedAttempt,inheritScope:inheritScope,
  assertRunAccessible:assertRunAccessible,projectRun:projectRun,projectEvent:projectEvent,projectMemory:projectMemory,clean:clean,MAX_SERIALIZED:MAX_SERIALIZED}
