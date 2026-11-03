onBootstrap(function(e){e.next();require(__hooks+"/modules/tool_grants.js").ensure($app)})
routerAdd("GET","/api/agent-runs/{id}/tool-grants",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"})
    return e.json(200,require(__hooks+"/modules/tool_grants.js").list($app,String(user.id),String(e.request.pathValue("id"))))
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"tool_grant_failed"})}
})
routerAdd("POST","/api/agent-runs/{id}/tool-grants",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"})
    return e.json(200,require(__hooks+"/modules/tool_grants.js").create($app,String(user.id),String(e.request.pathValue("id")),(e.requestInfo()||{}).body||{}))
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"tool_grant_failed"})}
})
routerAdd("POST","/api/agent-runs/{id}/tool-grants/{grantId}/revoke",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"})
    return e.json(200,require(__hooks+"/modules/tool_grants.js").revoke($app,String(user.id),String(e.request.pathValue("id")),String(e.request.pathValue("grantId"))))
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"tool_grant_failed"})}
})
