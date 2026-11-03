"use strict"
// Generic owner-scoped versioned business records. No client SQL/schema execution,
// no implicit merge by name, no access through the experience-memory subsystem.
function fault(code,status){var e=new Error(code);e.code=code;e.httpStatus=status||400;throw e}
function ensure(app){
  app.db().newQuery("CREATE TABLE IF NOT EXISTS agent_studio_business_cases (id TEXT PRIMARY KEY,owner_uid TEXT NOT NULL,title TEXT NOT NULL,data_space TEXT NOT NULL,questions TEXT NOT NULL,created_ms INTEGER NOT NULL)").execute()
  app.db().newQuery("CREATE TABLE IF NOT EXISTS agent_studio_business_records (record_id TEXT NOT NULL,version INTEGER NOT NULL,owner_uid TEXT NOT NULL,case_id TEXT NOT NULL,schema_id TEXT NOT NULL,payload TEXT NOT NULL,source_refs TEXT NOT NULL,relation_versions TEXT NOT NULL,run_id TEXT NOT NULL,idempotency_key TEXT NOT NULL,request_hash TEXT NOT NULL,created_ms INTEGER NOT NULL,PRIMARY KEY(record_id,version),UNIQUE(owner_uid,case_id,idempotency_key))").execute()
  app.db().newQuery("CREATE INDEX IF NOT EXISTS idx_business_case_records ON agent_studio_business_records(owner_uid,case_id,record_id,version)").execute()
}
function caseGet(app,uid,id){
  if(!uid)fault("studio_login_required",401)
  var row=new DynamicModel({id:"",title:"",data_space:"",questions:"",created_ms:0})
  try{app.db().newQuery("SELECT id,title,data_space,questions,created_ms FROM agent_studio_business_cases WHERE id={:id} AND owner_uid={:uid}").bind({id:String(id),uid:uid}).one(row)}catch(_){fault("business_case_not_found",404)}
  return {case_id:String(row.id),title:String(row.title),data_space:String(row.data_space),questions:JSON.parse(String(row.questions)),created_ms:Number(row.created_ms)}
}
function caseCreate(app,uid,input){
  var schema=require(__hooks+"/modules/business_schemas.js")
  if(!uid)fault("studio_login_required",401)
  schema.object(input,["title","data_space","questions"]);schema.string(input.title,300)
  if(input.data_space!=="LIVE"&&input.data_space!=="DEMO")fault("invalid_data_space")
  if(!Array.isArray(input.questions)||input.questions.length<1||input.questions.length>20)fault("invalid_case_questions")
  var questions=input.questions.map(function(q){schema.string(q,1000);return {question_id:$security.randomString(20),question:q}})
  var id=$security.randomString(20)
  app.db().newQuery("INSERT INTO agent_studio_business_cases (id,owner_uid,title,data_space,questions,created_ms) VALUES ({:id},{:uid},{:title},{:space},{:questions},{:now})")
    .bind({id:id,uid:uid,title:input.title,space:input.data_space,questions:JSON.stringify(questions),now:new Date().getTime()}).execute()
  return caseGet(app,uid,id)
}
function decode(r){return {record_id:String(r.record_id),version:Number(r.version),schema_id:String(r.schema_id),payload:JSON.parse(String(r.payload)),source_refs:JSON.parse(String(r.source_refs)),relation_versions:JSON.parse(String(r.relation_versions)),run_id:String(r.run_id),created_ms:Number(r.created_ms)}}
function checkSources(app,uid,refs,dataSpace){
  if(!Array.isArray(refs)||refs.length>50)fault("invalid_source_refs")
  var store=require(__hooks+"/modules/tool_results.js")
  for(var i=0;i<refs.length;i++){
    var ref=refs[i]
    require(__hooks+"/modules/business_schemas.js").object(ref,ref.material_id?["material_id","segment_id","start","end","quote"]:["run_id","result_id","start","end","quote"])
    if(!Number.isInteger(ref.start)||!Number.isInteger(ref.end)||ref.start<0||ref.end<=ref.start||ref.end-ref.start>8000||typeof ref.quote!=="string")fault("invalid_evidence_locator")
    var passage=ref.material_id?require(__hooks+"/modules/materials.js").read(app,uid,String(ref.material_id),{segment_id:String(ref.segment_id||""),offset:ref.start,limit:ref.end-ref.start}):store.read(app,uid,String(ref.run_id),String(ref.result_id),{offset:ref.start,limit:ref.end-ref.start})
    if(passage.end!==ref.end||passage.text!==ref.quote)fault("evidence_anchor_mismatch",422)
    if(dataSpace==="LIVE"){
      if(ref.material_id){if(passage.data_space!=="LIVE")fault("source_data_space_mismatch",422);continue}
      var original=store.row(app,uid,String(ref.run_id),String(ref.result_id))
      if(JSON.parse(String(original.payload)).data_space!=="LIVE")fault("source_data_space_mismatch",422)
    }
  }
}
function get(app,uid,caseId,id,version,visited){
  var caseInfo=caseGet(app,uid,caseId)
  var row=new DynamicModel({record_id:"",version:0,schema_id:"",payload:"",source_refs:"",relation_versions:"",run_id:"",created_ms:0})
  var sql="SELECT record_id,version,schema_id,payload,source_refs,relation_versions,run_id,created_ms FROM agent_studio_business_records WHERE owner_uid={:uid} AND case_id={:cid} AND record_id={:id}"
  var params={uid:uid,cid:caseId,id:String(id)}
  if(version!==undefined){if(!Number.isInteger(version)||version<1)fault("invalid_record_version");sql+=" AND version={:v}";params.v=version}
  sql+=" ORDER BY version DESC LIMIT 1"
  try{app.db().newQuery(sql).bind(params).one(row)}catch(_){fault("business_record_not_found",404)}
  var result=decode(row);checkSources(app,uid,result.source_refs,caseInfo.data_space)
  if(result.run_id)require(__hooks+"/modules/tool_results.js").assertRunAccessible(app,uid,result.run_id)
  visited=visited||Object.create(null)
  var key=result.record_id+":"+result.version
  if(!visited[key]){
    if(Object.keys(visited).length>=1800)fault("business_dependency_limit",413)
    visited[key]=true
    result.relation_versions.forEach(function(pin){get(app,uid,caseId,pin.record_id,pin.version,visited)})
  }
  return result
}
function write(app,uid,caseId,runId,input){
  var schemas=require(__hooks+"/modules/business_schemas.js"),caseInfo=caseGet(app,uid,caseId)
  schemas.object(input,["record_id","expected_version","schema_id","payload","source_refs","idempotency_key"])
  schemas.string(input.idempotency_key,120)
  schemas.validate(input.schema_id,input.payload)
  if(!Number.isInteger(input.expected_version)||input.expected_version<0)fault("invalid_expected_version")
  if(input.record_id!==undefined && !/^[A-Za-z0-9]{20}$/.test(input.record_id))fault("invalid_record_id")
  if(input.expected_version>0&&!input.record_id)fault("record_id_required")
  if(runId){var run=app.findRecordById("agent_runs",runId);if(run.getString("rh_user_id")!==uid)fault("run_not_found",404)
    var config=JSON.parse(run.getString("config")||"{}");if(config.case_id!==caseId)fault("run_case_mismatch",403)
    if(config.question_id&&input.schema_id==="research.answer.v1"&&input.payload.question_id!==config.question_id)fault("run_question_mismatch",403)
    if(Array.isArray(config.question_scope_ids)&&input.schema_id==="research.answer.v1"&&config.question_scope_ids.indexOf(input.payload.question_id)<0)fault("run_question_scope_mismatch",403)}
  checkSources(app,uid,input.source_refs,caseInfo.data_space)
  var effectiveRefs=input.source_refs.slice(),links=[]
  if(input.schema_id==="research.claim.v1"){
    var entity=get(app,uid,caseId,input.payload.subject_id)
    if(entity.schema_id!=="research.entity.v1")fault("invalid_subject_reference")
    links.push({record_id:entity.record_id,version:entity.version})
    effectiveRefs=effectiveRefs.concat(entity.source_refs)
    if(input.payload.status==="SOURCE_SUPPORTED"&&!input.source_refs.length)fault("supported_claim_requires_evidence",422)
    if(input.payload.status==="SOURCE_SUPPORTED"&&entity.payload.identity_status!=="CONFIRMED")fault("claim_identity_unresolved",422)
  }
  if(input.schema_id==="research.answer.v1"){
    if(!caseInfo.questions.some(function(q){return q.question_id===input.payload.question_id}))fault("unknown_question_id")
    input.payload.claim_ids.forEach(function(id){var claim=get(app,uid,caseId,id);if(claim.schema_id!=="research.claim.v1")fault("invalid_claim_reference")
      links.push({record_id:claim.record_id,version:claim.version});effectiveRefs=effectiveRefs.concat(claim.source_refs)})
    if(input.payload.status==="ANSWERED"&&!input.payload.claim_ids.length)fault("answered_requires_claims",422)
  }
  if(input.schema_id==="research.relation.v1"){
    ;[input.payload.from_id,input.payload.to_id].forEach(function(id){var entity=get(app,uid,caseId,id)
      if(entity.schema_id!=="research.entity.v1")fault("invalid_relation_entity",422)
      if(input.payload.status==="SOURCE_SUPPORTED"&&entity.payload.identity_status!=="CONFIRMED")fault("relation_identity_unresolved",422)
      links.push({record_id:entity.record_id,version:entity.version});effectiveRefs=effectiveRefs.concat(entity.source_refs)
    })
    if(input.payload.status==="SOURCE_SUPPORTED"&&!input.source_refs.length)fault("supported_relation_requires_evidence",422)
  }
  var uniqueRefs=[],seenRefs={}
  effectiveRefs.forEach(function(ref){var key=schemas.canonical(ref);if(!seenRefs[key]){seenRefs[key]=true;uniqueRefs.push(ref)}})
  effectiveRefs=uniqueRefs
  if(effectiveRefs.length>50)fault("business_source_limit",413)
  var raw=schemas.canonical(input)
  if(raw.length>100000)fault("business_record_size_limit",413)
  var hash=$security.sha256(raw),savedId="",savedVersion=0
  app.runInTransaction(function(tx){
    if(runId)require(__hooks+"/modules/business_monitors.js").assertWrite(tx,uid,runId,input)
    var prior=arrayOf(new DynamicModel({record_id:"",version:0,request_hash:""}))
    tx.db().newQuery("SELECT record_id,version,request_hash FROM agent_studio_business_records WHERE owner_uid={:uid} AND case_id={:cid} AND idempotency_key={:key}")
      .bind({uid:uid,cid:caseId,key:input.idempotency_key}).all(prior)
    if(prior.length){if(String(prior[0].request_hash)!==hash)fault("business_idempotency_conflict",409);savedId=String(prior[0].record_id);savedVersion=Number(prior[0].version);return}
    var current=arrayOf(new DynamicModel({version:0,schema_id:"",owner_uid:"",case_id:""}))
    var id=input.record_id || $security.randomString(20)
    tx.db().newQuery("SELECT version,schema_id,owner_uid,case_id FROM agent_studio_business_records WHERE record_id={:id} ORDER BY version DESC LIMIT 1").bind({id:id}).all(current)
    if(current.length && (String(current[0].owner_uid)!==uid||String(current[0].case_id)!==caseId))fault("business_record_not_found",404)
    if((current.length?Number(current[0].version):0)!==input.expected_version)fault("business_version_conflict",409)
    if(current.length&&String(current[0].schema_id)!==input.schema_id)fault("business_schema_change_forbidden",409)
    savedVersion=input.expected_version+1;savedId=id
    tx.db().newQuery("INSERT INTO agent_studio_business_records (record_id,version,owner_uid,case_id,schema_id,payload,source_refs,relation_versions,run_id,idempotency_key,request_hash,created_ms) VALUES ({:id},{:v},{:uid},{:cid},{:schema},{:payload},{:refs},{:links},{:rid},{:key},{:hash},{:now})")
      .bind({id:id,v:savedVersion,uid:uid,cid:caseId,schema:input.schema_id,payload:JSON.stringify(input.payload),refs:JSON.stringify(effectiveRefs),links:JSON.stringify(links),rid:String(runId||""),key:input.idempotency_key,hash:hash,now:new Date().getTime()}).execute()
  })
  return get(app,uid,caseId,savedId,savedVersion)
}
function query(app,uid,caseId,input){
  var caseInfo=caseGet(app,uid,caseId)
  var schema=require(__hooks+"/modules/business_schemas.js")
  schema.object(input,["schema_id","offset","limit"])
  if(schema.names.indexOf(input.schema_id)<0)fault("business_schema_not_registered")
  var offset=input.offset===undefined?0:input.offset,limit=input.limit===undefined?30:input.limit
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>50)fault("invalid_query_range")
  var rows=arrayOf(new DynamicModel({record_id:"",version:0,schema_id:"",payload:"",source_refs:"",relation_versions:"",run_id:"",created_ms:0}))
  app.db().newQuery("SELECT r.record_id,r.version,r.schema_id,r.payload,r.source_refs,r.relation_versions,r.run_id,r.created_ms FROM agent_studio_business_records r WHERE r.owner_uid={:uid} AND r.case_id={:cid} AND r.schema_id={:schema} AND r.version=(SELECT MAX(v.version) FROM agent_studio_business_records v WHERE v.record_id=r.record_id) ORDER BY r.created_ms,r.record_id LIMIT {:limit} OFFSET {:offset}")
    .bind({uid:uid,cid:caseId,schema:input.schema_id,limit:limit,offset:offset}).all(rows)
  var items=[]
  for(var i=0;i<rows.length;i++)items.push(get(app,uid,caseId,String(rows[i].record_id),Number(rows[i].version)))
  return {items:items,offset:offset,next_offset:offset+items.length,has_more:items.length===limit}
}
function runDependencies(app,uid,caseId,records){
  var runs=[],seen=Object.create(null),queue=records.slice()
  while(queue.length){var r=queue.shift(),key=r.record_id+":"+r.version;if(seen[key])continue;seen[key]=true
    if(Object.keys(seen).length>1800)fault("business_dependency_limit",413)
    if(r.run_id&&runs.indexOf(r.run_id)<0)runs.push(r.run_id)
    r.relation_versions.forEach(function(pin){queue.push(get(app,uid,caseId,pin.record_id,pin.version))})
  }
  if(runs.length>100)fault("result_source_unavailable",403)
  return runs
}
module.exports={ensure:ensure,caseGet:caseGet,caseCreate:caseCreate,get:get,write:write,query:query,runDependencies:runDependencies}
