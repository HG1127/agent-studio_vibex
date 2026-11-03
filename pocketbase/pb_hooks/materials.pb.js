onBootstrap(function(e){e.next();require(__hooks+"/modules/materials.js").ensure($app)})
routerAdd("POST","/api/business/cases/{id}/materials",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"})
    return e.json(200,require(__hooks+"/modules/materials.js").upload($app,String(user.id),String(e.request.pathValue("id")),(e.requestInfo()||{}).body||{}))
  }catch(err){return e.json(err.httpStatus||400,{error:err.code||"material_upload_failed"})}
})
routerAdd("GET","/api/business/cases/{id}/materials",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"})
    return e.json(200,require(__hooks+"/modules/materials.js").list($app,String(user.id),String(e.request.pathValue("id"))))
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"material_read_failed"})}
})
routerAdd("GET","/api/business/materials/{id}",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"})
    return e.json(200,require(__hooks+"/modules/materials.js").get($app,String(user.id),String(e.request.pathValue("id"))))
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"material_read_failed"})}
})
routerAdd("GET","/api/business/materials/{id}/original",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"})
    e.response.header().set("Cache-Control","no-store")
    return e.json(200,require(__hooks+"/modules/materials.js").original($app,String(user.id),String(e.request.pathValue("id"))))
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"material_read_failed"})}
})
routerAdd("GET","/api/business/materials/{id}/segments",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"})
    var q=(e.requestInfo()||{}).query||{}
    return e.json(200,require(__hooks+"/modules/materials.js").segments($app,String(user.id),String(e.request.pathValue("id")),q.offset===undefined?0:Number(q.offset)))
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"material_read_failed"})}
})
routerAdd("GET","/api/business/materials/{id}/read",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"})
    var q=(e.requestInfo()||{}).query||{}
    return e.json(200,require(__hooks+"/modules/materials.js").read($app,String(user.id),String(e.request.pathValue("id")),{segment_id:String(q.segment_id||""),offset:q.offset===undefined?0:Number(q.offset),limit:q.limit===undefined?4000:Number(q.limit)}))
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"material_read_failed"})}
})
routerAdd("POST","/api/internal/worker/material-jobs/claim",function(e){
  if($os.getenv("AGENT_STUDIO_BACKGROUND_WORKER")!=="true")return e.json(503,{error:"worker_disabled"})
  if(!require(__hooks+"/modules/studio_auth_helpers.js").trustedWorker(e))return e.json(401,{error:"unauthorized_worker"})
  try{return e.json(200,{ok:true,job:require(__hooks+"/modules/business_jobs.js").claimMaterial($app)})}
  catch(err){return e.json(err.httpStatus||500,{error:err.code||"material_worker_failed"})}
})
routerAdd("POST","/api/internal/worker/material-jobs/complete",function(e){
  if($os.getenv("AGENT_STUDIO_BACKGROUND_WORKER")!=="true")return e.json(503,{error:"worker_disabled"})
  if(!require(__hooks+"/modules/studio_auth_helpers.js").trustedWorker(e))return e.json(401,{error:"unauthorized_worker"})
  try{return e.json(200,{ok:true,job:require(__hooks+"/modules/business_jobs.js").completeMaterial($app,(e.requestInfo()||{}).body||{})})}
  catch(err){return e.json(err.httpStatus||500,{error:err.code||"material_worker_failed"})}
})
