onBootstrap(function(e){e.next();require(__hooks+"/modules/research_workflow.js").ensure($app);require(__hooks+"/modules/research_replans.js").ensure($app)})
routerAdd("GET","/api/workflow-runs/{id}/research",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"})
    return e.json(200,require(__hooks+"/modules/research_workflow.js").detail($app,String(user.id),String(e.request.pathValue("id"))))
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"research_detail_failed"})}
})
routerAdd("POST","/api/workflow-runs/{id}/pause",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"})
    return e.json(200,require(__hooks+"/modules/research_workflow.js").control($app,String(user.id),String(e.request.pathValue("id")),"pause"))
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"research_pause_failed"})}
})
routerAdd("POST","/api/workflow-runs/{id}/resume",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"})
    return e.json(200,require(__hooks+"/modules/research_workflow.js").control($app,String(user.id),String(e.request.pathValue("id")),"resume"))
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"research_resume_failed"})}
})
routerAdd("POST","/api/workflow-runs/{id}/replan-preview",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"})
    return e.json(200,require(__hooks+"/modules/research_replans.js").inspect($app,String(user.id),String(e.request.pathValue("id")),(e.requestInfo()||{}).body||{}))
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"research_replan_preview_failed"})}
})
routerAdd("POST","/api/workflow-runs/{id}/replan",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"})
    return e.json(200,require(__hooks+"/modules/research_replans.js").create($app,String(user.id),String(e.request.pathValue("id")),(e.requestInfo()||{}).body||{}))
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"research_replan_failed"})}
})
