// Owner-scoped semantic retrieval and indexing API.
// Uses the same verified user identity as the existing knowledge routes.
// Never returns raw embedding vectors or API credentials.
routerAdd("GET","/api/knowledge-bases/semantic/settings",function(e) {
  try{
    var h=(e.requestInfo()||{}).headers||{}
    var uid=String(h["x_rh_user_id"]||h["X-Rh-User-Id"]||h["x-rh-user-id"]||
      ($os.getenv("AGENT_STUDIO_ALLOW_ANON")==="true"?"local-anon":"")).trim()
    if(!uid)return e.json(401,{error:"studio_login_required"})
    var service=require(__hooks+"/modules/knowledge_embedding.js")
    var settings=service.getSettings($app,uid)
    return e.json(200,{configured:!!settings,
      connection_id:settings?settings.connection_id:"",
      model_name:settings?settings.model_name:"",
      updated_ms:settings?settings.updated_ms:0})
  }catch(_){return e.json(500,{error:"embedding_settings_failed"})}
})

routerAdd("POST","/api/knowledge-bases/semantic/settings",function(e) {
  try{
    var h=(e.requestInfo()||{}).headers||{}
    var uid=String(h["x_rh_user_id"]||h["X-Rh-User-Id"]||h["x-rh-user-id"]||
      ($os.getenv("AGENT_STUDIO_ALLOW_ANON")==="true"?"local-anon":"")).trim()
    if(!uid)return e.json(401,{error:"studio_login_required"})
    var body=(e.requestInfo()||{}).body||{}
    var service=require(__hooks+"/modules/knowledge_embedding.js")
    var action=String(body.action||"save")
    if(action==="disable")return e.json(200,service.disable($app,uid))
    if(action!=="save")return e.json(400,{error:"unknown_action"})
    var saved=service.saveSettings($app,uid,body.connection_id,body.model_name,service.gojaRuntime())
    return e.json(200,saved)
  }catch(err){
    if(err&&err.httpStatus)return e.json(err.httpStatus,{error:String(err.code||"embedding_settings_invalid")})
    try{$app.logger().error("embedding settings", "code","embedding_settings_failed")}catch(_){}
    return e.json(500,{error:"embedding_settings_failed"})
  }
})

routerAdd("GET","/api/knowledge-bases/semantic/status",function(e) {
  try{
    var h=(e.requestInfo()||{}).headers||{}
    var uid=String(h["x_rh_user_id"]||h["X-Rh-User-Id"]||h["x-rh-user-id"]||
      ($os.getenv("AGENT_STUDIO_ALLOW_ANON")==="true"?"local-anon":"")).trim()
    if(!uid)return e.json(401,{error:"studio_login_required"})
    var bid=String(((e.requestInfo()||{}).query||{}).base_id||"")
    var service=require(__hooks+"/modules/knowledge_embedding.js")
    return e.json(200,service.status($app,uid,bid,service.getSettings($app,uid)))
  }catch(err){
    if(err&&err.httpStatus)return e.json(err.httpStatus,{error:String(err.code||"invalid_base")})
    return e.json(500,{error:"embedding_status_failed"})
  }
})

routerAdd("POST","/api/knowledge-bases/semantic/index",function(e) {
  try{
    var h=(e.requestInfo()||{}).headers||{}
    var uid=String(h["x_rh_user_id"]||h["X-Rh-User-Id"]||h["x-rh-user-id"]||
      ($os.getenv("AGENT_STUDIO_ALLOW_ANON")==="true"?"local-anon":"")).trim()
    if(!uid)return e.json(401,{error:"studio_login_required"})
    var body=(e.requestInfo()||{}).body||{}
    var service=require(__hooks+"/modules/knowledge_embedding.js")
    return e.json(200,service.manualIndexBatch($app,uid,body.base_id,service.gojaRuntime(),body.batch_size))
  }catch(err){
    if(err&&err.httpStatus)return e.json(err.httpStatus,{error:String(err.code||"embedding_index_failed")})
    return e.json(500,{error:"embedding_index_failed"})
  }
})

routerAdd("POST","/api/knowledge-bases/semantic/rebuild",function(e) {
  try {
    var h=(e.requestInfo()||{}).headers||{}
    var uid=String(h["x_rh_user_id"]||h["X-Rh-User-Id"]||h["x-rh-user-id"]||
      ($os.getenv("AGENT_STUDIO_ALLOW_ANON")==="true"?"local-anon":"")).trim()
    if(!uid)return e.json(401,{error:"studio_login_required"})
    var body=(e.requestInfo()||{}).body||{}
    var service=require(__hooks+"/modules/knowledge_embedding.js")
    return e.json(200,service.rebuild($app,uid,body.base_id))
  }catch(err){
    if(err&&err.httpStatus)return e.json(err.httpStatus,{error:String(err.code||"embedding_rebuild_failed")})
    return e.json(500,{error:"embedding_rebuild_failed"})
  }
})

// Called only by the Node Worker with server-only token. This allows
// existing documents to be vectorized even when the employee closes the tab.
routerAdd("POST","/api/internal/knowledge/index-next",function(e) {
  try{
    var expected=String($os.getenv("AGENT_STUDIO_WORKER_TOKEN")||"")
    var headers=(e.requestInfo()||{}).headers||{}
    var supplied=String(headers["x_agent_studio_worker_token"]||
      headers["X-Agent-Studio-Worker-Token"]||headers["x-agent-studio-worker-token"]||"")
    if($os.getenv("AGENT_STUDIO_BACKGROUND_WORKER")!=="true" || expected.length<32)
      return e.json(503,{error:"worker_disabled"})
    var diff=expected.length^supplied.length
    for(var i=0;i<expected.length;i++){
      diff|=expected.charCodeAt(i)^(i<supplied.length?supplied.charCodeAt(i):0)
    }
    if(diff!==0)return e.json(401,{error:"unauthorized_worker"})
    var service=require(__hooks+"/modules/knowledge_embedding.js")
    return e.json(200,service.processWorker($app,service.gojaRuntime()))
  }catch(_){return e.json(500,{error:"embedding_worker_failed"})}
})
