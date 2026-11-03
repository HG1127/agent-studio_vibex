onBootstrap(function(e){e.next();require(__hooks+"/modules/business_monitors.js").ensure($app)})
routerAdd("GET","/api/business/monitor-inbox",function(e){
  try{var u=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!u)return e.json(401,{error:"studio_login_required"});return e.json(200,require(__hooks+"/modules/business_monitors.js").inbox($app,String(u.id),e.requestInfo().query||{}))}catch(err){return e.json(err.httpStatus||500,{error:err.code||"monitor_inbox_failed"})}
})
routerAdd("POST","/api/business/cases/{id}/monitors/preview",function(e){
  try{var u=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!u)return e.json(401,{error:"studio_login_required"});return e.json(200,require(__hooks+"/modules/business_monitors.js").preview($app,String(u.id),String(e.request.pathValue("id")),e.requestInfo().body||{}))}catch(err){return e.json(err.httpStatus||500,{error:err.code||"monitor_preview_failed"})}
})
routerAdd("POST","/api/business/cases/{id}/monitors",function(e){
  try{var u=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!u)return e.json(401,{error:"studio_login_required"});return e.json(200,require(__hooks+"/modules/business_monitors.js").author($app,String(u.id),String(e.request.pathValue("id")),e.requestInfo().body||{},""))}catch(err){return e.json(err.httpStatus||500,{error:err.code||"monitor_create_failed"})}
})
routerAdd("GET","/api/business/cases/{id}/monitors",function(e){
  try{var u=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!u)return e.json(401,{error:"studio_login_required"});return e.json(200,require(__hooks+"/modules/business_monitors.js").list($app,String(u.id),String(e.request.pathValue("id"))))}catch(err){return e.json(err.httpStatus||500,{error:err.code||"monitor_list_failed"})}
})
routerAdd("POST","/api/business/monitors/{id}/definition",function(e){
  try{var u=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!u)return e.json(401,{error:"studio_login_required"});var m=require(__hooks+"/modules/business_monitors.js"),current=m.get($app,String(u.id),String(e.request.pathValue("id")));return e.json(200,m.author($app,String(u.id),current.case_id,e.requestInfo().body||{},current.monitor_id))}catch(err){return e.json(err.httpStatus||500,{error:err.code||"monitor_update_failed"})}
})
routerAdd("POST","/api/business/monitors/{id}/control",function(e){
  try{var u=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!u)return e.json(401,{error:"studio_login_required"});return e.json(200,require(__hooks+"/modules/business_monitors.js").control($app,String(u.id),String(e.request.pathValue("id")),e.requestInfo().body||{}))}catch(err){return e.json(err.httpStatus||500,{error:err.code||"monitor_control_failed"})}
})
routerAdd("GET","/api/business/monitors/{id}/checks",function(e){
  try{var u=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!u)return e.json(401,{error:"studio_login_required"});return e.json(200,require(__hooks+"/modules/business_monitors.js").history($app,String(u.id),String(e.request.pathValue("id")),e.requestInfo().query||{}))}catch(err){return e.json(err.httpStatus||500,{error:err.code||"monitor_history_failed"})}
})
routerAdd("GET","/api/business/monitors/{id}",function(e){
  try{var u=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!u)return e.json(401,{error:"studio_login_required"});return e.json(200,require(__hooks+"/modules/business_monitors.js").get($app,String(u.id),String(e.request.pathValue("id"))))}catch(err){return e.json(err.httpStatus||500,{error:err.code||"monitor_read_failed"})}
})
routerAdd("GET","/api/business/monitors/{id}/checks/{checkId}",function(e){
  try{var u=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!u)return e.json(401,{error:"studio_login_required"});return e.json(200,require(__hooks+"/modules/business_monitors.js").historyItem($app,String(u.id),String(e.request.pathValue("id")),String(e.request.pathValue("checkId"))))}catch(err){return e.json(err.httpStatus||500,{error:err.code||"monitor_check_failed"})}
})
routerAdd("GET","/api/business/monitor-checks/{id}/review-preview",function(e){
  try{var u=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!u)return e.json(401,{error:"studio_login_required"});return e.json(200,require(__hooks+"/modules/business_monitors.js").reviewPreview($app,String(u.id),String(e.request.pathValue("id"))))}catch(err){return e.json(err.httpStatus||500,{error:err.code||"monitor_review_preview_failed"})}
})
routerAdd("POST","/api/business/monitor-checks/{id}/review",function(e){
  try{var u=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!u)return e.json(401,{error:"studio_login_required"});return e.json(200,require(__hooks+"/modules/business_monitors.js").review($app,String(u.id),String(e.request.pathValue("id")),e.requestInfo().body||{}))}catch(err){return e.json(err.httpStatus||500,{error:err.code||"monitor_review_failed"})}
})
routerAdd("POST","/api/business/monitor-checks/{id}/discard",function(e){
  try{var u=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!u)return e.json(401,{error:"studio_login_required"});return e.json(200,require(__hooks+"/modules/business_monitors.js").discard($app,String(u.id),String(e.request.pathValue("id")),e.requestInfo().body||{}))}catch(err){return e.json(err.httpStatus||500,{error:err.code||"monitor_discard_failed"})}
})
routerAdd("GET","/api/business/monitors/{id}/events",function(e){
  try{var u=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!u)return e.json(401,{error:"studio_login_required"});return e.json(200,require(__hooks+"/modules/business_monitors.js").events($app,String(u.id),String(e.request.pathValue("id")),e.requestInfo().query||{}))}catch(err){return e.json(err.httpStatus||500,{error:err.code||"monitor_events_failed"})}
})
routerAdd("GET","/api/business/monitors/{id}/events/{eventId}",function(e){
  try{var u=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!u)return e.json(401,{error:"studio_login_required"});return e.json(200,require(__hooks+"/modules/business_monitors.js").eventItem($app,String(u.id),String(e.request.pathValue("id")),String(e.request.pathValue("eventId"))))}catch(err){return e.json(err.httpStatus||500,{error:err.code||"monitor_event_failed"})}
})
routerAdd("POST","/api/business/monitor-events/{id}/read",function(e){
  try{var u=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!u)return e.json(401,{error:"studio_login_required"});return e.json(200,require(__hooks+"/modules/business_monitors.js").readEvent($app,String(u.id),String(e.request.pathValue("id"))))}catch(err){return e.json(err.httpStatus||500,{error:err.code||"monitor_event_read_failed"})}
})
routerAdd("POST","/api/internal/worker/monitors-step",function(e){
  if($os.getenv("AGENT_STUDIO_BACKGROUND_WORKER")!=="true")return e.json(503,{error:"worker_disabled"})
  if(!require(__hooks+"/modules/studio_auth_helpers.js").trustedWorker(e))return e.json(401,{error:"unauthorized_worker"})
  try{return e.json(200,{ok:true,monitor:require(__hooks+"/modules/business_monitors.js").advance($app)})}catch(err){return e.json(err.httpStatus||500,{error:err.code||"monitor_worker_failed"})}
})
