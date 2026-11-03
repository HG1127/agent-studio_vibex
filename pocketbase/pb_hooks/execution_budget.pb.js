onBootstrap(function(e){e.next();require(__hooks+"/modules/execution_budget.js").ensure($app)})
routerAdd("GET","/api/agent-runs/{id}/budget",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"})
    return e.json(200,require(__hooks+"/modules/execution_budget.js").status($app,String(user.id),String(e.request.pathValue("id"))))
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"execution_budget_failed"})}
})
