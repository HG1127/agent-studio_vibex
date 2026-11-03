onBootstrap(function(e){e.next();require(__hooks+"/modules/business_artifacts.js").ensure($app);require(__hooks+"/modules/business_jobs.js").ensure($app)})

routerAdd("POST","/api/business/cases/{id}/jobs",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"})
    return e.json(200,require(__hooks+"/modules/business_jobs.js").submit($app,String(user.id),String(e.request.pathValue("id")),"",(e.requestInfo()||{}).body||{}))
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"business_job_failed"})}
})
routerAdd("GET","/api/business/jobs/{id}",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"})
    return e.json(200,require(__hooks+"/modules/business_jobs.js").status($app,String(user.id),String(e.request.pathValue("id"))))
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"business_job_failed"})}
})
routerAdd("GET","/api/business/cases/{id}/jobs",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"})
    return e.json(200,require(__hooks+"/modules/business_jobs.js").list($app,String(user.id),String(e.request.pathValue("id"))))
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"business_job_failed"})}
})
routerAdd("POST","/api/business/jobs/{id}/cancel",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"})
    return e.json(200,require(__hooks+"/modules/business_jobs.js").cancel($app,String(user.id),String(e.request.pathValue("id"))))
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"business_job_failed"})}
})
routerAdd("POST","/api/internal/worker/jobs-step",function(e){
  if($os.getenv("AGENT_STUDIO_BACKGROUND_WORKER")!=="true")return e.json(503,{error:"worker_disabled"})
  if(!require(__hooks+"/modules/studio_auth_helpers.js").trustedWorker(e))return e.json(401,{error:"unauthorized_worker"})
  try{return e.json(200,{ok:true,job:require(__hooks+"/modules/business_jobs.js").advance($app)})}
  catch(err){return e.json(500,{error:err.code||"job_worker_failed"})}
})
routerAdd("GET","/api/business/cases/{id}/fact-sets/{factId}",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"})
    return e.json(200,require(__hooks+"/modules/business_artifacts.js").get($app,String(user.id),String(e.request.pathValue("id")),String(e.request.pathValue("factId"))))
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"fact_set_read_failed"})}
})
routerAdd("POST","/api/business/cases/{id}/reports",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"})
    return e.json(200,require(__hooks+"/modules/business_artifacts.js").render($app,String(user.id),String(e.request.pathValue("id")),(e.requestInfo()||{}).body||{}))
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"report_render_failed"})}
})
routerAdd("GET","/api/business/cases/{id}/reports",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"})
    return e.json(200,require(__hooks+"/modules/business_artifacts.js").list($app,String(user.id),String(e.request.pathValue("id"))))
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"report_read_failed"})}
})
routerAdd("GET","/api/business/cases/{id}/reports/{reportId}/download",function(e){
  try{var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e);if(!user)return e.json(401,{error:"studio_login_required"})
    var report=require(__hooks+"/modules/business_artifacts.js").report($app,String(user.id),String(e.request.pathValue("id")),String(e.request.pathValue("reportId")),true)
    e.response.header().set("Content-Disposition",'attachment; filename="research-'+report.report_id+'.'+report.format+'"')
    e.response.header().set("Content-Type",report.manifest.mime_type)
    e.response.header().set("Cache-Control","no-store")
    e.response.header().set("Content-Security-Policy","default-src 'none'; style-src 'unsafe-inline'; sandbox")
    e.response.header().set("X-Content-Type-Options","nosniff")
    return e.blob(200,report.manifest.mime_type,report.manifest.encoding==="base64"?require(__hooks+"/modules/report_jobs.js").decode(report.content):report.content)
  }catch(err){return e.json(err.httpStatus||500,{error:err.code||"report_download_failed"})}
})
routerAdd("POST","/api/internal/worker/report-jobs/claim",function(e){
  if($os.getenv("AGENT_STUDIO_BACKGROUND_WORKER")!=="true")return e.json(503,{error:"worker_disabled"})
  if(!require(__hooks+"/modules/studio_auth_helpers.js").trustedWorker(e))return e.json(401,{error:"unauthorized_worker"})
  try{return e.json(200,{ok:true,job:require(__hooks+"/modules/report_jobs.js").claim($app)})}
  catch(err){return e.json(err.httpStatus||500,{error:err.code||"report_claim_failed"})}
})
routerAdd("POST","/api/internal/worker/report-jobs/complete",function(e){
  if($os.getenv("AGENT_STUDIO_BACKGROUND_WORKER")!=="true")return e.json(503,{error:"worker_disabled"})
  if(!require(__hooks+"/modules/studio_auth_helpers.js").trustedWorker(e))return e.json(401,{error:"unauthorized_worker"})
  try{return e.json(200,{ok:true,job:require(__hooks+"/modules/report_jobs.js").complete($app,(e.requestInfo()||{}).body||{})})}
  catch(err){return e.json(err.httpStatus||500,{error:err.code||"report_completion_failed"})}
})
