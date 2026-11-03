"use strict"
// Office rendering runs in the dedicated Node Worker. Models can select a
// registered template/format, never supply scripts, HTML, paths or file bytes.
var TYPE="research.report.v1"
var MIME={docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",pdf:"application/pdf",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}
function fault(code,status){var e=new Error(code);e.code=code;e.httpStatus=status||400;throw e}
function artifacts(){return require(__hooks+"/modules/business_artifacts.js")}
function jobs(){return require(__hooks+"/modules/business_jobs.js")}
function pending(app,uid,id){var result=jobs().status(app,uid,id);result.file_ready=false;if(result.status==="succeeded"&&result.artifact.report_id)return artifacts().report(app,uid,result.case_id,result.artifact.report_id,false);return result}
function submit(app,uid,caseId,input){
  var snapshot=artifacts().get(app,uid,caseId,String(input.fact_set_id)),schemas=require(__hooks+"/modules/business_schemas.js"),hash=$security.sha256(schemas.canonical(input)),id="",now=new Date().getTime()
  app.runInTransaction(function(tx){
    var reports=arrayOf(new DynamicModel({id:"",request_hash:""})),old=arrayOf(new DynamicModel({id:"",request_hash:""}))
    tx.db().newQuery("SELECT id,request_hash FROM agent_studio_business_reports WHERE owner_uid={:uid} AND case_id={:cid} AND idempotency_key={:key}").bind({uid:uid,cid:caseId,key:input.idempotency_key}).all(reports)
    if(reports.length){if(String(reports[0].request_hash)!==hash)fault("report_idempotency_conflict",409);id=String(reports[0].id);return}
    tx.db().newQuery("SELECT id,request_hash FROM agent_studio_business_jobs WHERE owner_uid={:uid} AND case_id={:cid} AND idempotency_key={:key}").bind({uid:uid,cid:caseId,key:"report:"+input.idempotency_key}).all(old)
    if(old.length){if(String(old[0].request_hash)!==hash)fault("report_idempotency_conflict",409);id=String(old[0].id);return}
    var document=artifacts().renderText(snapshot,input.template_id)
    id=$security.randomString(20)
    var jobInput={fact_set_id:snapshot.fact_set_id,fact_set_hash:snapshot.content_hash,template_id:input.template_id,format:input.format,idempotency_key:input.idempotency_key,document_hash:$security.sha256(document.text)}
    tx.db().newQuery("INSERT INTO agent_studio_business_jobs (id,owner_uid,case_id,run_id,type,status,input,progress,artifact,error,idempotency_key,request_hash,lease_token,lease_until,attempts,created_ms,updated_ms) VALUES ({:id},{:uid},{:cid},'',{:type},'queued',{:input},'{\"schema_index\":0,\"pins\":[]}','{}','',{:key},{:hash},'',0,0,{:now},{:now})")
      .bind({id:id,uid:uid,cid:caseId,type:TYPE,input:JSON.stringify(jobInput),key:"report:"+input.idempotency_key,hash:hash,now:now}).execute()
  })
  // Older synchronous formats have no job row; office report IDs equal job IDs.
  try{return artifacts().report(app,uid,caseId,id,false)}catch(err){if(err.httpStatus!==404)throw err}
  return pending(app,uid,id)
}
function snapshotFor(app,uid,row){
  if(!app.findRecordById("studio_users",uid).getBool("active"))fault("job_owner_inactive",403)
  var input=JSON.parse(String(row.input)),snapshot=artifacts().get(app,uid,String(row.case_id),input.fact_set_id)
  if(snapshot.content_hash!==input.fact_set_hash)fault("fact_set_integrity_error",500)
  var document=artifacts().renderText(snapshot,input.template_id)
  if($security.sha256(document.text)!==input.document_hash)fault("report_content_model_changed",409)
  return {snapshot:snapshot,document:document,document_hash:input.document_hash,template_id:input.template_id,format:input.format}
}
function claim(app){
  var now=new Date().getTime(),rows=arrayOf(new DynamicModel({id:"",owner_uid:""}))
  app.db().newQuery("SELECT id,owner_uid FROM agent_studio_business_jobs WHERE type={:type} AND status IN ('queued','running') AND lease_until<={:now} ORDER BY updated_ms,id LIMIT 1").bind({type:TYPE,now:now}).all(rows)
  if(!rows.length)return {idle:true}
  var id=String(rows[0].id),uid=String(rows[0].owner_uid),token=$security.randomString(32)
  var changed=app.db().newQuery("UPDATE agent_studio_business_jobs SET status='running',lease_token={:token},lease_until={:until},attempts=attempts+1,updated_ms={:now} WHERE id={:id} AND status IN ('queued','running') AND lease_until<={:now}").bind({id:id,token:token,until:now+180000,now:now}).execute()
  if(Number(changed.rowsAffected())!==1)return {idle:true}
  try{
    var row=jobs().raw(app,uid,id)
    if(Number(row.attempts)>3||now-Number(row.created_ms)>3600000)fault("job_budget_exhausted")
    var model=snapshotFor(app,uid,row);model.job_id=id;model.lease_token=token;model.idle=false;return model
  }catch(err){
    app.db().newQuery("UPDATE agent_studio_business_jobs SET status='failed',error={:error},lease_token='',lease_until=0,updated_ms={:now} WHERE id={:id} AND status='running' AND lease_token={:token}").bind({id:id,token:token,error:String(err.code||"report_claim_failed"),now:now}).execute()
    return {idle:false,failed:true,job_id:id,error:String(err.code||"report_claim_failed")}
  }
}
function base64Size(value){
  var alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  if(typeof value!=="string"||!value||value.length>16777216||value.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))fault("invalid_report_base64")
  var padding=value.slice(-2)==="=="?2:value.slice(-1)==="="?1:0,last=alphabet.indexOf(value.charAt(value.length-padding-1))
  if(padding===2&&(last&15)!==0||padding===1&&(last&3)!==0)fault("invalid_report_base64")
  return value.length/4*3-padding
}
function decode(value){
  base64Size(value)
  var alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",bytes=[],bits=0,count=0
  for(var i=0;i<value.length&&value.charAt(i)!=="=";i++){bits=(bits<<6)|alphabet.indexOf(value.charAt(i));count+=6;if(count>=8){count-=8;bytes.push((bits>>>count)&255)}}
  return bytes
}
function complete(app,input){
  var schemas=require(__hooks+"/modules/business_schemas.js");schemas.object(input,["job_id","lease_token","ok","file","error"])
  var found=new DynamicModel({owner_uid:""})
  try{app.db().newQuery("SELECT owner_uid FROM agent_studio_business_jobs WHERE id={:id} AND type={:type}").bind({id:String(input.job_id),type:TYPE}).one(found)}catch(_){fault("business_job_not_found",404)}
  var uid=String(found.owner_uid),success=input.ok===true
  if(input.ok!==true&&input.ok!==false)fault("invalid_report_completion")
  app.runInTransaction(function(tx){
    var row=jobs().raw(tx,uid,String(input.job_id)),now=new Date().getTime()
    if(row.status!=="running"||!input.lease_token||row.lease_token!==input.lease_token||Number(row.lease_until)<now)fault("job_lease_lost",409)
    var model=snapshotFor(tx,uid,row),saved=JSON.parse(String(row.input)),artifact={},error=""
    if(success){
      var file=input.file;schemas.object(file,["base64","byte_count","binary_sha256","mime_type","renderer","details"])
      var size=base64Size(file.base64)
      if(size!==file.byte_count||size<5||size>12582912||file.mime_type!==MIME[saved.format]||file.renderer!=="studio.research-office.v1"||!/^[a-f0-9]{64}$/.test(file.binary_sha256))fault("invalid_report_file")
      if(saved.format==="pdf"?file.base64.indexOf("JVBERi0")!==0:file.base64.indexOf("UEsDB")!==0)fault("invalid_report_signature")
      if(!file.details||typeof file.details!=="object"||Array.isArray(file.details)||JSON.stringify(file.details).length>16000)fault("invalid_report_manifest")
      var quality=saved.template_id==="research.relationships.v1"?model.snapshot.payload.relation_quality:model.snapshot.payload.quality
      var manifest={schema_id:"research.report.v1",mime_type:file.mime_type,renderer:file.renderer,encoding:"base64",hash_encoding:"base64_utf8_sha256",binary_sha256:file.binary_sha256,byte_count:size,document_hash:saved.document_hash,fact_set_hash:model.snapshot.content_hash,data_space:model.snapshot.payload.case.data_space,excerpted_fields:model.document.excerpted_fields,source_count:model.document.source_count,quality_scope:saved.template_id==="research.relationships.v1"?"declared_relation_records_only":"structured_question_records_only",quality_snapshot:quality?quality.business_quality:"unverified",free_text_report_quality:"unverified",details:file.details}
      tx.db().newQuery("INSERT INTO agent_studio_business_reports (id,owner_uid,case_id,fact_set_id,template_id,format,content,content_hash,manifest,idempotency_key,request_hash,created_ms) VALUES ({:id},{:uid},{:cid},{:fid},{:tid},{:format},{:content},{:hash},{:manifest},{:key},{:request},{:now})")
        .bind({id:String(row.id),uid:uid,cid:String(row.case_id),fid:saved.fact_set_id,tid:saved.template_id,format:saved.format,content:file.base64,hash:$security.sha256(file.base64),manifest:JSON.stringify(manifest),key:saved.idempotency_key,request:String(row.request_hash),now:now}).execute()
      artifact={report_id:String(row.id),fact_set_id:saved.fact_set_id,file_ready:true,binary_sha256:file.binary_sha256}
    }else error=/^[a-z][a-z0-9_]{1,80}$/.test(input.error)?input.error:"report_render_failed"
    tx.db().newQuery("UPDATE agent_studio_business_jobs SET status={:status},artifact={:artifact},error={:error},lease_token='',lease_until=0,updated_ms={:now} WHERE id={:id} AND status='running' AND lease_token={:token}")
      .bind({id:String(row.id),token:input.lease_token,status:success?"succeeded":"failed",artifact:JSON.stringify(artifact),error:error,now:now}).execute()
  })
  return {job_id:String(input.job_id),status:success?"succeeded":"failed"}
}
module.exports={submit:submit,claim:claim,complete:complete,decode:decode,base64Size:base64Size}
