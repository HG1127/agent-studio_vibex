/// <reference path="../pb_data/types.d.ts" />
// Owner-only text Skills. Executable scripts, archives and arbitrary URL fetches
// are deliberately excluded. Activation requires explicit review per version.
onBootstrap(function(e){
  e.next()
  try { require(__hooks+"/modules/skill_registry.js").applySchema($app) }
  catch(err){ try{$app.logger().error("skill_registry_bootstrap", "err",String(err))}catch(_){} }
})
routerAdd("GET","/api/skills",function(e){
  var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e)
  if(!user)return e.json(401,{error:"studio_auth_required"})
  try {
    return e.json(200,{items:require(__hooks+"/modules/skill_registry.js").listSkills($app,String(user.id))})
  }catch(err){return require(__hooks+"/modules/skill_registry.js").replyError(e,err)}
},$apis.requireAuth())
routerAdd("GET","/api/skills/detail",function(e){
  var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e)
  if(!user)return e.json(401,{error:"studio_auth_required"})
  var query=(e.requestInfo()||{}).query||{}
  var id=String(query.id||""),version=Number(query.version)
  if(!/^[A-Za-z0-9]{15}$/.test(id)||!Number.isSafeInteger(version)||version<1||version>100)
    return e.json(400,{error:"invalid_skill_reference"})
  try {
    return e.json(200,require(__hooks+"/modules/skill_registry.js").versionDetail($app,String(user.id),id,version))
  }catch(_){return e.json(404,{error:"skill_not_found"})}
},$apis.requireAuth())
routerAdd("POST","/api/skills/import",function(e){
  var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e)
  if(!user)return e.json(401,{error:"studio_auth_required"})
  var body=(e.requestInfo()||{}).body||{}
  var source=String(body.source||"")
  var url=typeof body.github_url==="string"?body.github_url.trim():""
  if(Boolean(source)===Boolean(url))return e.json(400,{error:"skill_source_required"})
  try {
    var reg=require(__hooks+"/modules/skill_registry.js")
    if(url)source=reg.fromGithub(url)
    var item=reg.importSkill($app,String(user.id),source,url)
    return e.json(200,{ok:true,item:item,requires_review:true})
  }catch(err){return require(__hooks+"/modules/skill_registry.js").replyError(e,err)}
},$apis.requireAuth())
routerAdd("POST","/api/skills/approve",function(e){
  var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e)
  if(!user)return e.json(401,{error:"studio_auth_required"})
  var body=(e.requestInfo()||{}).body||{}
  if(body.confirm_review!==true)return e.json(400,{error:"skill_review_confirmation_required"})
  try {
    return e.json(200,{ok:true,item:require(__hooks+"/modules/skill_registry.js")
      .approve($app,String(user.id),String(body.id||""),Number(body.version))})
  }catch(err){return require(__hooks+"/modules/skill_registry.js").replyError(e,err)}
},$apis.requireAuth())
routerAdd("POST","/api/skills/active",function(e){
  var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e)
  if(!user)return e.json(401,{error:"studio_auth_required"})
  var body=(e.requestInfo()||{}).body||{}
  if(typeof body.active!=="boolean")return e.json(400,{error:"invalid_skill_active"})
  try {
    return e.json(200,{ok:true,item:require(__hooks+"/modules/skill_registry.js")
      .setActive($app,String(user.id),String(body.id||""),body.active)})
  }catch(err){return require(__hooks+"/modules/skill_registry.js").replyError(e,err)}
},$apis.requireAuth())
