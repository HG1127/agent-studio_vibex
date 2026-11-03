routerAdd("GET","/api/agent_specs/{id}/capability-plan",function(e){
  try{
    var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e)
    if(!user)return e.json(401,{error:"studio_login_required"})
    var record=$app.findRecordById("agent_specs",String(e.request.pathValue("id")))
    if(record.getString("rh_user_id")!==String(user.id))return e.json(404,{error:"spec_not_found"})
    var spec=JSON.parse(record.getString("spec")||"{}")
    return e.json(200,require(__hooks+"/modules/capability_plan.js").compile($app,String(user.id),spec))
  }catch(err){return e.json(err.httpStatus||404,{error:err.code||"capability_plan_unavailable"})}
})
