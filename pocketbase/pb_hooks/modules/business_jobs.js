"use strict"
// Trusted async handler registry. A job type is server code, never a model URL or
// script. Each bounded step commits a durable cursor and is safe to resume.
var FREEZE="research.freeze.v1"
function fault(code,status){var e=new Error(code);e.code=code;e.httpStatus=status||400;throw e}
function data(){return require(__hooks+"/modules/business_data.js")}
function artifacts(){return require(__hooks+"/modules/business_artifacts.js")}
function ensure(app){
  app.db().newQuery("CREATE TABLE IF NOT EXISTS agent_studio_business_jobs (id TEXT PRIMARY KEY,owner_uid TEXT NOT NULL,case_id TEXT NOT NULL,run_id TEXT NOT NULL,type TEXT NOT NULL,status TEXT NOT NULL,progress TEXT NOT NULL,artifact TEXT NOT NULL,error TEXT NOT NULL,idempotency_key TEXT NOT NULL,request_hash TEXT NOT NULL,lease_token TEXT NOT NULL,lease_until INTEGER NOT NULL,attempts INTEGER NOT NULL,created_ms INTEGER NOT NULL,updated_ms INTEGER NOT NULL,UNIQUE(owner_uid,case_id,idempotency_key))").execute()
  app.db().newQuery("CREATE INDEX IF NOT EXISTS idx_business_job_queue ON agent_studio_business_jobs(status,lease_until,created_ms)").execute()
  var fields=arrayOf(new DynamicModel({name:""}))
  app.db().newQuery("PRAGMA table_info(agent_studio_business_jobs)").all(fields)
  if(!fields.some(function(field){return String(field.name)==="input"}))app.db().newQuery("ALTER TABLE agent_studio_business_jobs ADD COLUMN input TEXT NOT NULL DEFAULT '{}'").execute()
  app.db().newQuery("CREATE UNIQUE INDEX IF NOT EXISTS idx_material_parse_identity ON agent_studio_business_jobs(owner_uid,case_id,input) WHERE type='material.parse.v1'").execute()
}
function raw(app,uid,id){
  if(!uid)fault("studio_login_required",401)
  var row=new DynamicModel({id:"",owner_uid:"",case_id:"",run_id:"",type:"",status:"",input:"",progress:"",artifact:"",error:"",request_hash:"",lease_token:"",lease_until:0,attempts:0,created_ms:0,updated_ms:0})
  try{app.db().newQuery("SELECT id,owner_uid,case_id,run_id,type,status,input,progress,artifact,error,request_hash,lease_token,lease_until,attempts,created_ms,updated_ms FROM agent_studio_business_jobs WHERE id={:id} AND owner_uid={:uid}").bind({id:String(id),uid:uid}).one(row)}catch(_){fault("business_job_not_found",404)}
  data().caseGet(app,uid,String(row.case_id));return row
}
function status(app,uid,id){
  var row=raw(app,uid,id),progress=JSON.parse(String(row.progress)),artifact=JSON.parse(String(row.artifact)),blocked=false
  try{
    if(row.run_id)require(__hooks+"/modules/tool_results.js").assertRunAccessible(app,uid,String(row.run_id))
    if(row.type==="material.parse.v1")require(__hooks+"/modules/materials.js").authorize(app,uid,JSON.parse(String(row.input)).material_id)
    if(row.type==="research.report.v1")artifacts().get(app,uid,String(row.case_id),JSON.parse(String(row.input)).fact_set_id)
    for(var i=0;i<progress.pins.length;i++)data().get(app,uid,String(row.case_id),progress.pins[i].record_id,progress.pins[i].version)
    if(artifact.fact_set_id)artifacts().get(app,uid,String(row.case_id),artifact.fact_set_id)
    if(artifact.report_id)artifacts().report(app,uid,String(row.case_id),artifact.report_id,false)
  }catch(_){blocked=true}
  return {job_id:String(row.id),case_id:String(row.case_id),type:String(row.type),status:blocked?"blocked":String(row.status),
    progress:{schema_index:progress.schema_index,record_count:progress.pins.length},artifact:blocked?{}:artifact,
    error:blocked?"job_source_unavailable":String(row.error),attempts:Number(row.attempts),created_ms:Number(row.created_ms),updated_ms:Number(row.updated_ms)}
}
function submit(app,uid,caseId,runId,input){
  var schemas=require(__hooks+"/modules/business_schemas.js")
  schemas.object(input,["type","idempotency_key","material_id"]);schemas.string(input.idempotency_key,120)
  if(input.type!==FREEZE&&input.type!=="material.parse.v1")fault("async_tool_not_registered")
  if(input.type===FREEZE&&input.material_id!==undefined)fault("invalid_async_input")
  if(input.type==="material.parse.v1"){
    var material=require(__hooks+"/modules/materials.js").authorize(app,uid,String(input.material_id||""))
    if(String(material.case_id)!==caseId)fault("material_case_mismatch",403)
  }
  data().caseGet(app,uid,caseId)
  if(runId){var run=app.findRecordById("agent_runs",runId);if(run.getString("rh_user_id")!==uid||JSON.parse(run.getString("config")||"{}").case_id!==caseId)fault("run_case_mismatch",403)}
  var jobInput={type:input.type,case_id:caseId,material_id:input.material_id||null}
  var hash=$security.sha256(schemas.canonical(jobInput)),id="",now=new Date().getTime()
  app.runInTransaction(function(tx){
    var old=arrayOf(new DynamicModel({id:"",request_hash:""}))
    tx.db().newQuery("SELECT id,request_hash FROM agent_studio_business_jobs WHERE owner_uid={:uid} AND case_id={:cid} AND idempotency_key={:key}").bind({uid:uid,cid:caseId,key:input.idempotency_key}).all(old)
    if(old.length){if(String(old[0].request_hash)!==hash)fault("job_idempotency_conflict",409);id=String(old[0].id);return}
    if(input.type==="material.parse.v1"){
      var existingParse=arrayOf(new DynamicModel({id:""}))
      tx.db().newQuery("SELECT id FROM agent_studio_business_jobs WHERE owner_uid={:uid} AND case_id={:cid} AND type='material.parse.v1' AND input={:input}").bind({uid:uid,cid:caseId,input:JSON.stringify(jobInput)}).all(existingParse)
      if(existingParse.length)fault("material_parse_already_submitted",409)
    }
    id=$security.randomString(20)
    tx.db().newQuery("INSERT INTO agent_studio_business_jobs (id,owner_uid,case_id,run_id,type,status,input,progress,artifact,error,idempotency_key,request_hash,lease_token,lease_until,attempts,created_ms,updated_ms) VALUES ({:id},{:uid},{:cid},{:rid},{:type},'queued',{:input},{:progress},'{}','',{:key},{:hash},'',0,0,{:now},{:now})")
      .bind({id:id,uid:uid,cid:caseId,rid:String(runId||""),type:input.type,input:JSON.stringify(jobInput),progress:JSON.stringify({schema_index:0,offset:0,pins:[]}),key:input.idempotency_key,hash:hash,now:now}).execute()
  })
  return status(app,uid,id)
}
function cancel(app,uid,id){
  raw(app,uid,id)
  app.db().newQuery("UPDATE agent_studio_business_jobs SET status='cancelled',lease_token='',lease_until=0,updated_ms={:now} WHERE id={:id} AND owner_uid={:uid} AND status IN ('queued','running')")
    .bind({now:new Date().getTime(),id:String(id),uid:uid}).execute()
  return status(app,uid,id)
}
function list(app,uid,caseId){
  data().caseGet(app,uid,caseId)
  var rows=arrayOf(new DynamicModel({id:""}))
  app.db().newQuery("SELECT id FROM agent_studio_business_jobs WHERE owner_uid={:uid} AND case_id={:cid} ORDER BY created_ms DESC,id LIMIT 20").bind({uid:uid,cid:caseId}).all(rows)
  return {items:rows.map(function(row){return status(app,uid,String(row.id))}),limit:20}
}
function advance(app){
  var now=new Date().getTime(),candidates=arrayOf(new DynamicModel({id:"",owner_uid:""}))
  app.db().newQuery("SELECT id,owner_uid FROM agent_studio_business_jobs WHERE type='research.freeze.v1' AND status IN ('queued','running') AND lease_until<={:now} ORDER BY updated_ms,id LIMIT 1").bind({now:now}).all(candidates)
  if(!candidates.length)return {idle:true}
  var id=String(candidates[0].id),uid=String(candidates[0].owner_uid),token=$security.randomString(32)
  var claimed=app.db().newQuery("UPDATE agent_studio_business_jobs SET status='running',lease_token={:token},lease_until={:until},attempts=attempts+1,updated_ms={:now} WHERE id={:id} AND status IN ('queued','running') AND lease_until<={:now}")
    .bind({id:id,token:token,until:now+120000,now:now}).execute()
  if(Number(claimed.rowsAffected())!==1)return {idle:true,busy:true}
  try{
    var row=raw(app,uid,id),caseId=String(row.case_id)
    var user=app.findRecordById("studio_users",uid)
    if(!user.getBool("active"))fault("job_owner_inactive",403)
    if(row.type!==FREEZE)fault("async_tool_not_registered")
    if(Number(row.attempts)>20||now-Number(row.created_ms)>3600000)fault("job_budget_exhausted")
    if(row.run_id)require(__hooks+"/modules/tool_results.js").assertRunAccessible(app,uid,String(row.run_id))
    var schemas=require(__hooks+"/modules/business_schemas.js").names,progress=JSON.parse(String(row.progress)),result={}
    if(progress.schema_index<schemas.length){
      var page=data().query(app,uid,caseId,{schema_id:schemas[progress.schema_index],offset:progress.offset,limit:50})
      page.items.forEach(function(record){progress.pins.push({record_id:record.record_id,version:record.version})})
      if(progress.pins.length>600)fault("fact_set_record_limit",413)
      if(page.has_more)progress.offset=page.next_offset
      else{progress.schema_index++;progress.offset=0}
    }
    var done=progress.schema_index>=schemas.length
    app.runInTransaction(function(tx){
      var live=raw(tx,uid,id)
      if(String(live.status)!=="running"||String(live.lease_token)!==token)fault("job_lease_lost",409)
      if(done)result=artifacts().freeze(tx,uid,caseId,id,progress.pins)
      tx.db().newQuery("UPDATE agent_studio_business_jobs SET status={:status},progress={:progress},artifact={:artifact},error='',lease_token='',lease_until=0,updated_ms={:now} WHERE id={:id} AND status='running' AND lease_token={:token}")
        .bind({id:id,token:token,status:done?"succeeded":"running",progress:JSON.stringify(progress),artifact:JSON.stringify(result),now:new Date().getTime()}).execute()
    })
    return {idle:false,job_id:id,status:done?"succeeded":"running"}
  }catch(err){
    app.db().newQuery("UPDATE agent_studio_business_jobs SET status='failed',error={:error},lease_token='',lease_until=0,updated_ms={:now} WHERE id={:id} AND status='running' AND lease_token={:token}")
      .bind({id:id,token:token,error:String(err.code||"async_job_failed"),now:new Date().getTime()}).execute()
    return {idle:false,job_id:id,status:"failed",error:String(err.code||"async_job_failed")}
  }
}
function claimMaterial(app){
  var now=new Date().getTime(),rows=arrayOf(new DynamicModel({id:"",owner_uid:""}))
  app.db().newQuery("SELECT id,owner_uid FROM agent_studio_business_jobs WHERE type='material.parse.v1' AND status IN ('queued','running') AND lease_until<={:now} ORDER BY updated_ms,id LIMIT 1").bind({now:now}).all(rows)
  if(!rows.length)return {idle:true}
  var id=String(rows[0].id),uid=String(rows[0].owner_uid),token=$security.randomString(32)
  var claim=app.db().newQuery("UPDATE agent_studio_business_jobs SET status='running',lease_token={:token},lease_until={:until},attempts=attempts+1,updated_ms={:now} WHERE id={:id} AND status IN ('queued','running') AND lease_until<={:now}").bind({id:id,token:token,until:now+90000,now:now}).execute()
  if(Number(claim.rowsAffected())!==1)return {idle:true}
  try{
    var row=raw(app,uid,id)
    if(!app.findRecordById("studio_users",uid).getBool("active"))fault("job_owner_inactive",403)
    if(Number(row.attempts)>3||now-Number(row.created_ms)>3600000)fault("job_budget_exhausted")
    var original=require(__hooks+"/modules/materials.js").original(app,uid,JSON.parse(String(row.input)).material_id)
    return {idle:false,job_id:id,lease_token:token,material_id:original.material.material_id,filename:original.material.filename,base64:original.base64,storage_hash:original.material.storage_hash}
  }catch(err){
    app.db().newQuery("UPDATE agent_studio_business_jobs SET status='failed',error={:error},lease_token='',lease_until=0,updated_ms={:now} WHERE id={:id} AND status='running' AND lease_token={:token}").bind({id:id,token:token,error:String(err.code||"material_claim_failed"),now:now}).execute()
    return {idle:false,failed:true,job_id:id,error:String(err.code||"material_claim_failed")}
  }
}
function completeMaterial(app,input){
  require(__hooks+"/modules/business_schemas.js").object(input,["job_id","lease_token","ok","parsed","error"])
  var found=new DynamicModel({owner_uid:""})
  try{app.db().newQuery("SELECT owner_uid FROM agent_studio_business_jobs WHERE id={:id} AND type='material.parse.v1'").bind({id:String(input.job_id)}).one(found)}catch(_){fault("business_job_not_found",404)}
  var uid=String(found.owner_uid),artifact={},error="",success=input.ok===true
  app.runInTransaction(function(tx){
    var row=raw(tx,uid,String(input.job_id)),now=new Date().getTime()
    if(row.status!=="running"||!input.lease_token||row.lease_token!==input.lease_token||Number(row.lease_until)<now)fault("job_lease_lost",409)
    if(!tx.findRecordById("studio_users",uid).getBool("active"))fault("job_owner_inactive",403)
    if(success)artifact=require(__hooks+"/modules/materials.js").commitParsed(tx,uid,JSON.parse(String(row.input)).material_id,input.parsed)
    else error=/^[a-z][a-z0-9_]{1,80}$/.test(input.error)?input.error:"material_parse_failed"
    tx.db().newQuery("UPDATE agent_studio_business_jobs SET status={:status},artifact={:artifact},error={:error},lease_token='',lease_until=0,updated_ms={:now} WHERE id={:id} AND status='running' AND lease_token={:token}")
      .bind({id:String(input.job_id),token:input.lease_token,status:success?"succeeded":"failed",artifact:JSON.stringify(artifact),error:error,now:now}).execute()
  })
  return {job_id:String(input.job_id),status:success?"succeeded":"failed"}
}
module.exports={ensure:ensure,submit:submit,status:status,cancel:cancel,advance:advance,list:list,claimMaterial:claimMaterial,completeMaterial:completeMaterial,raw:raw}
