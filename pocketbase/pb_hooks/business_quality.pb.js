onBootstrap(function(e){e.next();require(__hooks+"/modules/business_quality.js").ensure($app)})
routerAdd("GET","/api/business/cases/{id}/quality",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"});var info=e.requestInfo()||{},uid=String(user.id)
    return e.json(200,require(__hooks+"/modules/business_quality.js").validate($app,uid,String(e.request.pathValue("id")),String(info.query.validator || "research.evidence.v1")))
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"business_quality_failed"})}
})
routerAdd("POST","/api/business/cases/{id}/reviews",function(e){
  var studio=require(__hooks+"/modules/studio_auth_helpers.js"),user=studio.currentUser(e)
  if(!user)return e.json(401,{error:"studio_login_required"})
  try{return e.json(201,require(__hooks+"/modules/business_quality.js").review($app,String(user.id),String(e.request.pathValue("id")),e.requestInfo().body||{}))}
  catch(err){return e.json(err.httpStatus||500,{error:err.code||"business_review_failed"})}
})
