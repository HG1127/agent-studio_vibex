onBootstrap(function(e) {
  e.next()
  require(__hooks + "/modules/tool_results.js").ensure($app)
})

routerAdd("GET", "/api/agent-runs/{id}/tool-results", function(e) {
  try {
    var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e)
    if(!user)return e.json(401,{error:"studio_login_required"})
    var uid=String(user.id)
    var results = require(__hooks + "/modules/tool_results.js")
    return e.json(200,{items:results.list($app,uid,String(e.request.pathValue("id")))})
  } catch(err) { return e.json(err.httpStatus || 500,{error:err.code || "result_read_failed"}) }
})

routerAdd("GET", "/api/agent-runs/{id}/tool-results/{resultId}", function(e) {
  try {
    var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e)
    if(!user)return e.json(401,{error:"studio_login_required"})
    var info = e.requestInfo() || {}, q = info.query || {},uid=String(user.id)
    var results = require(__hooks + "/modules/tool_results.js")
    var runId = String(e.request.pathValue("id")), resultId = String(e.request.pathValue("resultId"))
    if (q.view === "envelope") {
      var row = results.row($app,uid,runId,resultId)
      return e.json(200,{result_id:resultId,content_hash:String(row.content_hash),
        provenance:{run_id:runId,step_index:Number(row.step_index),tool:String(row.tool),captured_ms:Number(row.created_ms)},envelope:JSON.parse(String(row.payload))})
    }
    return e.json(200,results.read($app,uid,runId,resultId,q))
  } catch(err) { return e.json(err.httpStatus || 500,{error:err.code || "result_read_failed"}) }
})
