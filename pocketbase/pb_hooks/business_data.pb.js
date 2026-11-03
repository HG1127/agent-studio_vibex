onBootstrap(function(e){e.next();require(__hooks+"/modules/business_data.js").ensure($app)})
routerAdd("POST","/api/business/cases",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"});var uid=String(user.id)
    return e.json(201,require(__hooks+"/modules/business_data.js").caseCreate($app,uid,e.requestInfo().body||{}))
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"business_write_failed"})}
})
routerAdd("GET","/api/business/cases/{id}",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"});var uid=String(user.id)
    return e.json(200,require(__hooks+"/modules/business_data.js").caseGet($app,uid,String(e.request.pathValue("id"))))
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"business_read_failed"})}
})
routerAdd("POST","/api/business/cases/{id}/records",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"});var info=e.requestInfo()||{},uid=String(user.id)
    return e.json(200,require(__hooks+"/modules/business_data.js").write($app,uid,String(e.request.pathValue("id")),"",info.body||{}))
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"business_write_failed"})}
})
routerAdd("POST","/api/business/cases/{id}/query",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"});var info=e.requestInfo()||{},uid=String(user.id)
    return e.json(200,require(__hooks+"/modules/business_data.js").query($app,uid,String(e.request.pathValue("id")),info.body||{}))
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"business_read_failed"})}
})
routerAdd("GET","/api/business/cases/{id}/records/{recordId}",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"});var info=e.requestInfo()||{},uid=String(user.id)
    return e.json(200,require(__hooks+"/modules/business_data.js").get($app,uid,String(e.request.pathValue("id")),String(e.request.pathValue("recordId")),info.query.version===undefined?undefined:Number(info.query.version)))
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"business_read_failed"})}
})
