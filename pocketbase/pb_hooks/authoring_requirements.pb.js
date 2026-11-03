onBootstrap(function(e){e.next();require(__hooks+"/modules/authoring_requirements.js").ensure($app)})
routerAdd("POST","/api/authoring/requirements",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"});return e.json(200,require(__hooks+"/modules/authoring_requirements.js").create($app,String(user.id),e.requestInfo().body||{}))}catch(err){return e.json(err.httpStatus||500,{error:err.code||"authoring_capture_failed"})}
})
routerAdd("GET","/api/authoring/requirements/{id}",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"});return e.json(200,require(__hooks+"/modules/authoring_requirements.js").get($app,String(user.id),String(e.request.pathValue("id"))))}catch(err){return e.json(err.httpStatus||500,{error:err.code||"authoring_read_failed"})}
})
routerAdd("POST","/api/authoring/preview",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"});return e.json(200,require(__hooks+"/modules/authoring_requirements.js").preview($app,String(user.id),e.requestInfo().body||{}))}catch(err){return e.json(err.httpStatus||500,{error:err.code||"authoring_preview_failed"})}
})
onRecordCreate(function(e){require(__hooks+"/modules/authoring_requirements.js").guard(e.app,e.record,null);e.next()},"agent_specs")
onRecordUpdate(function(e){var previous;try{previous=JSON.parse(e.record.original().getString("spec")||"null")}catch(_){previous=null}require(__hooks+"/modules/authoring_requirements.js").guard(e.app,e.record,previous);e.next()},"agent_specs")
