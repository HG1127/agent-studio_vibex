"use strict"
// Opt-in research DAG profile over existing Workflow records/leases/Worker.
// Every research Agent stage uses the normal durable Agent Run execution path.
function fault(code,status){var e=new Error(code);e.code=code;e.httpStatus=status||400;throw e}
function json(record,field){return JSON.parse(record.getString(field)||"{}")||{}}
function canonical(value){return require(__hooks+"/modules/business_schemas.js").canonical(value)}
function ensure(app){
  app.db().newQuery("CREATE TABLE IF NOT EXISTS agent_studio_research_stages (id TEXT PRIMARY KEY,owner_uid TEXT NOT NULL,parent_run_id TEXT NOT NULL,node_id TEXT NOT NULL,child_run_id TEXT NOT NULL UNIQUE,spec_id TEXT NOT NULL,spec_hash TEXT NOT NULL,question_id TEXT NOT NULL,state TEXT NOT NULL,start_payload TEXT NOT NULL,payload_hash TEXT NOT NULL,artifact TEXT NOT NULL,error TEXT NOT NULL,launch_attempts INTEGER NOT NULL,last_launch_ms INTEGER NOT NULL,paused_by_parent INTEGER NOT NULL,resume_status TEXT NOT NULL,created_ms INTEGER NOT NULL,updated_ms INTEGER NOT NULL,UNIQUE(parent_run_id,node_id))").execute()
  app.db().newQuery("CREATE TABLE IF NOT EXISTS agent_studio_research_budgets (parent_run_id TEXT NOT NULL,scope_key TEXT NOT NULL,owner_uid TEXT NOT NULL,limits TEXT NOT NULL,limits_hash TEXT NOT NULL,started_ms INTEGER NOT NULL,model_intents INTEGER NOT NULL,tool_intents INTEGER NOT NULL,search_intents INTEGER NOT NULL,read_intents INTEGER NOT NULL,closing_intents INTEGER NOT NULL,updated_ms INTEGER NOT NULL,PRIMARY KEY(parent_run_id,scope_key))").execute()
}
function aggregate(input,stages){
  var copy=input===undefined?{}:JSON.parse(JSON.stringify(input)),closing=copy.closing_model_calls
  delete copy.closing_model_calls
  var limits=require(__hooks+"/modules/execution_budget.js").normalize(copy,30)
  limits.closing_model_calls=closing===undefined?Math.min(stages,limits.model_calls):closing
  if(!Number.isInteger(limits.closing_model_calls)||limits.closing_model_calls<0||limits.closing_model_calls>30||limits.closing_model_calls>limits.model_calls)fault("invalid_parent_closing_budget")
  return limits
}
function validate(app,uid,graph,input){
  var schemas=require(__hooks+"/modules/business_schemas.js"),budgets=require(__hooks+"/modules/execution_budget.js")
  schemas.object(input,["case_id","custom_model","budget","question_budgets","stages","only_missing"])
  if(input.only_missing!==undefined&&typeof input.only_missing!=="boolean")fault("invalid_research_only_missing")
  if(input.only_missing===true)fault("research_replan_source_required",409)
  var business=require(__hooks+"/modules/business_data.js").caseGet(app,uid,String(input.case_id||""))
  var nodes=graph.nodes||[],edges=graph.edges||[],byId=Object.create(null),incoming=Object.create(null),outgoing=Object.create(null),stages=[],start="",ends=[]
  if(!nodes.length||nodes.length>40||edges.length>240)fault("invalid_research_graph")
  nodes.forEach(function(node){
    var id=String(node.id||""),type=String(node.type||"")
    if(!/^[A-Za-z0-9_-]{1,64}$/.test(id)||byId[id]||["start","agent","end"].indexOf(type)<0)fault("research_dag_requires_start_agent_end")
    byId[id]=node;incoming[id]=[];outgoing[id]=[]
    if(type==="start"){if(start)fault("research_dag_single_start");start=id}
    if(type==="end")ends.push(id)
  })
  edges.forEach(function(edge){var a=String(edge.source),b=String(edge.target);if(!byId[a]||!byId[b]||a===b)fault("invalid_research_edge");incoming[b].push(a);outgoing[a].push(b)})
  if(!start||!ends.length||incoming[start].length||ends.some(function(id){return outgoing[id].length>0}))fault("invalid_research_terminals")
  var queue=[start],visited=Object.create(null),order=[]
  while(queue.length){var id=queue.shift();if(visited[id])continue;if(incoming[id].some(function(parent){return !visited[parent]}))continue;visited[id]=true;order.push(id);outgoing[id].forEach(function(target){queue.push(target)})}
  if(order.length!==nodes.length)fault("research_dag_cycle_or_unreachable")
  var reachable=Object.create(null),stack=ends.slice()
  while(stack.length){var end=stack.pop();if(reachable[end])continue;reachable[end]=true;incoming[end].forEach(function(parent){stack.push(parent)})}
  if(nodes.some(function(node){return !reachable[node.id]}))fault("research_stage_without_end")
  var overrides=input.stages||{}
  if(typeof overrides!=="object"||Array.isArray(overrides)||Object.keys(overrides).some(function(key){return !byId[key]||byId[key].type!=="agent"}))fault("invalid_research_stage_override")
  order.forEach(function(id){
    var node=byId[id];if(node.type!=="agent")return
    var data=node.data||{},override=overrides[id]||{}
    if(String(data.prompt||"{{input}}").replace(/\{\{input\}\}/g,"").indexOf("{{")>=0)fault("research_template_requires_input_and_artifact_refs")
    schemas.object(override,["question_id","max_steps","budget","acceptance","allow_partial"])
    if(override.allow_partial!==undefined&&typeof override.allow_partial!=="boolean")fault("invalid_research_allow_partial")
    var question=String(override.question_id||data.question_id||"")
    if(question&&!business.questions.some(function(q){return q.question_id===question}))fault("unknown_question_id")
    var maxSteps=override.max_steps===undefined?Number(data.max_steps||10):override.max_steps
    if(!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>30)fault("invalid_research_steps")
    var record=app.findRecordById("agent_specs",String(data.spec_id||""))
    if(record.getString("rh_user_id")!==uid)fault("research_spec_not_owned",404)
    var spec=json(record,"spec"),selection=String(data.model||""),parts=/^custom:([^:]+):(.+)$/.exec(selection)
    var model=parts?{connection_id:parts[1],model_id:parts[2]}:input.custom_model
    if(!model||typeof model.connection_id!=="string"||typeof model.model_id!=="string")fault("research_model_required")
    var modelRecord=app.findRecordById("model_connections",model.connection_id)
    if(modelRecord.getString("rh_user_id")!==uid||!modelRecord.getBool("enabled")||require(__hooks+"/modules/model_connections.js").verifiedModelIds(modelRecord).indexOf(model.model_id)<0)fault("research_model_unverified")
    var acceptance=String(override.acceptance||(question?"answer_present":"results_present"))
    if(["execution_only","results_present","answer_present","research.evidence.v1"].indexOf(acceptance)<0)fault("research_validator_not_registered")
    if(acceptance==="answer_present"&&!question)fault("research_question_required")
    stages.push({node_id:id,title:String(data.title||id),spec_id:String(record.id),spec_hash:$security.sha256(canonical(spec)),question_id:question,max_steps:maxSteps,budget:budgets.normalize(override.budget,maxSteps),custom_model:{connection_id:model.connection_id,model_id:model.model_id},prompt:String(data.prompt||"{{input}}"),acceptance:acceptance,allow_partial:override.allow_partial===true})
  })
  if(!stages.length||stages.length>30)fault("invalid_research_stage_count")
  var questionBudgets=Object.create(null),configured=input.question_budgets||{}
  if(typeof configured!=="object"||Array.isArray(configured)||Object.keys(configured).some(function(key){return !business.questions.some(function(q){return q.question_id===key})}))fault("invalid_question_budgets")
  business.questions.forEach(function(q){questionBudgets[q.question_id]=aggregate(configured[q.question_id],Math.max(1,stages.filter(function(s){return s.question_id===q.question_id}).length))})
  return {version:1,case_id:business.case_id,data_space:business.data_space,created_ms:new Date().getTime(),only_missing:input.only_missing===true,budget:aggregate(input.budget,stages.length),question_budgets:questionBudgets,stages:stages,order:order}
}
function parent(app,uid,id){
  var run=null;try{run=app.findRecordById("workflow_runs",String(id))}catch(_){}
  if(!uid||!run||run.getString("rh_user_id")!==uid)fault("research_parent_not_found",404)
  if(!app.findRecordById("studio_users",uid).getBool("active"))fault("research_owner_inactive",403)
  var graph=json(run,"graph_snapshot")
  if(!graph.research||graph.research.version!==1)fault("research_profile_required")
  require(__hooks+"/modules/business_data.js").caseGet(app,uid,graph.research.case_id)
  return {run:run,graph:graph,profile:graph.research}
}
function stageRows(app,uid,parentId){
  var rows=arrayOf(new DynamicModel({id:"",node_id:"",child_run_id:"",spec_id:"",spec_hash:"",question_id:"",state:"",start_payload:"",payload_hash:"",artifact:"",error:"",launch_attempts:0,last_launch_ms:0,paused_by_parent:0,resume_status:""}))
  app.db().newQuery("SELECT id,node_id,child_run_id,spec_id,spec_hash,question_id,state,start_payload,payload_hash,artifact,error,launch_attempts,last_launch_ms,paused_by_parent,resume_status FROM agent_studio_research_stages WHERE parent_run_id={:parent} AND owner_uid={:uid} ORDER BY created_ms,node_id").bind({parent:parentId,uid:uid}).all(rows)
  return rows
}
function assertSources(app,uid,id){
  var ctx=parent(app,uid,id)
  stageRows(app,uid,id).forEach(function(row){
    var child=null;try{child=app.findRecordById("agent_runs",String(row.child_run_id))}catch(_){}
    if(child)require(__hooks+"/modules/tool_results.js").assertRunAccessible(app,uid,String(row.child_run_id))
    else if(["launching","cancelled"].indexOf(String(row.state))<0)fault("research_child_missing",409)
    var artifact=JSON.parse(String(row.artifact)||"{}")
    ;(artifact.records||[]).forEach(function(pin){require(__hooks+"/modules/business_data.js").get(app,uid,ctx.profile.case_id,pin.record_id,pin.version)})
  })
  require(__hooks+"/modules/research_replans.js").assertReuse(app,uid,ctx)
  return ctx
}
function event(app,id,cp,node,type,content){
  cp.seq=Number(cp.seq||1)+1
  var record=new Record(app.findCollectionByNameOrId("workflow_events"))
  record.set("run_id",id);record.set("node_id",node||"");record.set("seq",cp.seq);record.set("event_type",type);record.set("content",content);app.save(record)
}
function save(app,uid,id,cp,status,result,error){
  var run=app.findRecordById("workflow_runs",id)
  if(run.getString("rh_user_id")!==uid||run.getString("status")!=="running")return false
  cp.claim_until=0;run.set("checkpoint",cp)
  if(status)run.set("status",status)
  if(result!==undefined)run.set("result",result)
  if(error!==undefined)run.set("error",error)
  run.set("done_nodes",Object.keys(cp.statuses||{}).filter(function(key){return cp.statuses[key]==="done"}).length);app.save(run);return true
}
function authorizeStart(app,uid,body){
  var rows=arrayOf(new DynamicModel({parent_run_id:"",node_id:"",child_run_id:"",spec_id:"",spec_hash:"",payload_hash:"",state:""}))
  app.db().newQuery("SELECT parent_run_id,node_id,child_run_id,spec_id,spec_hash,payload_hash,state FROM agent_studio_research_stages WHERE id={:id} AND owner_uid={:uid}").bind({id:String(body.research_stage_link_id||""),uid:uid}).all(rows)
  if(rows.length!==1)fault("research_stage_link_denied",403)
  var row=rows[0],ctx=assertSources(app,uid,String(row.parent_run_id))
  if(ctx.run.getString("status")!=="running"||String(row.state)!=="launching"&&String(row.state)!=="running"||row.child_run_id!==String(body.research_child_run_id)||row.spec_id!==String(body.spec_id))fault("research_stage_link_denied",403)
  var request={spec_id:body.spec_id,instruction:body.instruction,model:body.model,config:body.config}
  if($security.sha256(canonical(request))!==String(row.payload_hash))fault("research_stage_payload_changed",403)
  var user=app.findRecordById("studio_users",uid)
  if(!user.getBool("active"))fault("research_owner_inactive",403)
  var existing=null;try{existing=app.findRecordById("agent_runs",String(row.child_run_id))}catch(_){}
  if(existing){if(existing.getString("rh_user_id")!==uid||existing.getString("spec_id")!==String(row.spec_id)||json(existing,"config").research_stage_link_id!==String(body.research_stage_link_id))fault("research_child_identity_conflict",409)}
  else if($security.sha256(canonical(json(app.findRecordById("agent_specs",String(row.spec_id)),"spec")))!==String(row.spec_hash))fault("research_spec_revision_changed",409)
  return {id:String(body.research_stage_link_id),child_run_id:String(row.child_run_id),parent_run_id:String(row.parent_run_id),question_scope_ids:ctx.profile.replan?ctx.profile.replan.question_scope_ids:null,existing:existing}
}
function childCreated(app,uid,linkId){app.db().newQuery("UPDATE agent_studio_research_stages SET state='running',error='',updated_ms={:now} WHERE id={:id} AND owner_uid={:uid} AND state='launching'").bind({id:linkId,uid:uid,now:new Date().getTime()}).execute()}
function capture(app,uid,ctx,stage,childId){
  var rows=arrayOf(new DynamicModel({record_id:"",version:0,schema_id:""})),data=require(__hooks+"/modules/business_data.js")
  app.db().newQuery("SELECT record_id,version,schema_id FROM agent_studio_business_records WHERE owner_uid={:uid} AND case_id={:cid} AND run_id={:rid} ORDER BY record_id,version LIMIT 601").bind({uid:uid,cid:ctx.profile.case_id,rid:childId}).all(rows)
  if(rows.length>600)fault("research_artifact_record_limit",413)
  var pins=rows.map(function(row){data.get(app,uid,ctx.profile.case_id,String(row.record_id),Number(row.version));return {record_id:String(row.record_id),version:Number(row.version),schema_id:String(row.schema_id)}})
  var store=require(__hooks+"/modules/tool_results.js"),results=store.list(app,uid,childId).filter(function(item){
    var envelope=JSON.parse(String(store.row(app,uid,childId,item.result_id).payload));return !envelope.validation||envelope.validation.status!=="invalid"
  })
  return {schema_id:"research.stage_artifact.v1",stage_id:stage.node_id,child_run_id:childId,question_id:stage.question_id,question_scope_ids:ctx.profile.replan?ctx.profile.replan.question_scope_ids:stage.question_id?[stage.question_id]:[],records:pins,results:results,acceptance:stage.acceptance,free_text_quality:"unverified",captured_ms:new Date().getTime()}
}
function accepted(app,uid,ctx,stage,artifact){
  if(stage.acceptance==="execution_only")return "accepted"
  if(stage.acceptance==="results_present")return artifact.results.length?"accepted":"incomplete"
  if(stage.acceptance==="answer_present"){
    var page=require(__hooks+"/modules/business_data.js").query(app,uid,ctx.profile.case_id,{schema_id:"research.answer.v1",offset:0,limit:50})
    var answers=page.items.filter(function(record){return record.payload.question_id===stage.question_id})
    if(answers.length!==1||page.has_more)return "incomplete"
    artifact.records.push({record_id:answers[0].record_id,version:answers[0].version,schema_id:answers[0].schema_id})
    return "accepted"
  }
  var quality=require(__hooks+"/modules/business_quality.js").validate(app,uid,ctx.profile.case_id,"research.evidence.v1")
  var offset=0,more=true
  while(more&&offset<500){
    var answers=require(__hooks+"/modules/business_data.js").query(app,uid,ctx.profile.case_id,{schema_id:"research.answer.v1",offset:offset,limit:50})
    answers.items.forEach(function(answer){if(!artifact.records.some(function(pin){return pin.record_id===answer.record_id&&pin.version===answer.version}))artifact.records.push({record_id:answer.record_id,version:answer.version,schema_id:answer.schema_id})})
    offset=answers.next_offset;more=answers.has_more
  }
  if(more||artifact.records.length>600)fault("research_artifact_record_limit",413)
  artifact.business_quality=quality
  if(quality.business_quality==="passed"||quality.business_quality==="qualified_partial")return "accepted"
  if(quality.business_quality==="needs_review")return "awaiting_review"
  return "incomplete"
}
function advance(app,uid,id){
  var ctx=assertSources(app,uid,id),run=ctx.run,profile=ctx.profile,cp=json(run,"checkpoint"),byStage=Object.create(null),rows=stageRows(app,uid,id),byRow=Object.create(null)
  if(run.getString("status")!=="running")return {ok:true,run_id:id,status:run.getString("status"),stepped:false}
  if(new Date().getTime()-profile.created_ms>profile.budget.wall_ms+30000)return control(app,uid,id,"fail","execution_budget_exhausted:parent:wall_time")
  cp.statuses=cp.statuses||{};cp.outputs=cp.outputs||{};cp.research_stages=cp.research_stages||{}
  profile.stages.forEach(function(stage){byStage[stage.node_id]=stage});rows.forEach(function(row){byRow[row.node_id]=row})
  if(profile.replan)profile.replan.decisions.forEach(function(d){if(["reuse","review"].indexOf(d.action)>=0&&!byRow[d.stage_id])byRow[d.stage_id]={child_run_id:d.child_run_id}})
  var progressed=false
  for(var i=0;i<profile.order.length;i++){
    var nodeId=profile.order[i],node=ctx.graph.nodes.filter(function(item){return item.id===nodeId})[0]
    if(cp.statuses[nodeId]==="done")continue
    var dependencies=ctx.graph.edges.filter(function(edge){return edge.target===nodeId}).map(function(edge){return edge.source})
    if(dependencies.some(function(parentId){return cp.statuses[parentId]!=="done"}))continue
    if(node.type==="start"){cp.statuses[nodeId]="done";cp.outputs[nodeId]="research_case:"+profile.case_id;progressed=true;continue}
    if(node.type==="end"){
      cp.statuses[nodeId]="done";progressed=true
      if(profile.order.some(function(other){return cp.statuses[other]!=="done"}))continue
      cp.business_quality=require(__hooks+"/modules/business_quality.js").validate(app,uid,profile.case_id,"research.evidence.v1")
      var receipts=effectiveStages(app,uid,ctx).map(function(row){return {stage_id:row.stage_id,child_run_id:row.child_run_id,state:row.state}})
      event(app,id,cp,nodeId,"node_done",{title:String((node.data||{}).title||nodeId),type:"end",message:"研究阶段执行结束；业务质量单独验收",receipts:receipts})
      save(app,uid,id,cp,"succeeded",JSON.stringify({case_id:profile.case_id,stages:receipts,partial:receipts.some(function(r){return r.state==="deferred"||r.state==="partial"})||cp.business_quality.business_quality!=="passed",business_quality:cp.business_quality.business_quality,free_text_quality:"unverified"}),"")
      return {ok:true,run_id:id,status:"succeeded",stepped:true,node_id:nodeId}
    }
    var stage=byStage[nodeId],row=byRow[nodeId],now=new Date().getTime()
    var recovery=profile.replan&&profile.replan.decisions.filter(function(d){return d.stage_id===nodeId})[0]
    if(recovery&&recovery.action!=="run"){
      var receiptState=recovery.action==="defer"?"deferred":"reused"
      if(recovery.action==="review"){
        var prior=require(__hooks+"/modules/research_replans.js").receipt(app,uid,recovery.origin_parent_id,recovery.origin_stage_id)
        var reviewed=accepted(app,uid,ctx,stage,JSON.parse(JSON.stringify(prior.artifact)))
        if(reviewed==="awaiting_review"){cp.research_stages[nodeId]={child_run_id:recovery.child_run_id,status:"awaiting_review"};continue}
        if(reviewed!=="accepted")fault("research_reuse_acceptance_changed",409)
      }
      cp.statuses[nodeId]="done";cp.outputs[nodeId]=JSON.stringify({stage_id:nodeId,state:receiptState,child_run_id:recovery.child_run_id||null,reason:recovery.reason})
      cp.research_stages[nodeId]={child_run_id:recovery.child_run_id||null,status:receiptState,validation_status:receiptState==="reused"?"accepted":"deferred"}
      event(app,id,cp,nodeId,"node_done",{title:stage.title,type:"agent",stage_outcome:receiptState,child_run_id:recovery.child_run_id||null,message:receiptState==="deferred"?"未在本次问题范围内执行，保留明确缺口":"复用当前仍可读取且已通过声明验收的固定版本产物"})
      save(app,uid,id,cp);return {ok:true,run_id:id,status:"running",stepped:true,node_id:nodeId}
    }
    if(!row){
      var prompt=stage.prompt.replace(/\{\{input\}\}/g,run.getString("instruction"))
      var refs=dependencies.filter(function(parentId){return Boolean(byRow[parentId]&&byRow[parentId].child_run_id)}).map(function(parentId){return {stage_id:parentId,child_run_id:String(byRow[parentId].child_run_id)}})
      if(refs.length)prompt+="\n前驱阶段引用（请按权限读取正式记录或结果，不据摘要重建证据）："+JSON.stringify(refs)
      if(profile.replan)prompt+="\n本次仅补查授权问题："+JSON.stringify(profile.replan.question_scope_ids)+"。复用已验收记录；其他问题答案不得改写，未知和验收缺口必须保留。"
      if(profile.replan){var gaps=profile.replan.decisions.filter(function(d){return dependencies.indexOf(d.stage_id)>=0&&d.action==="defer"}).map(function(d){return {stage_id:d.stage_id,reason:d.reason}});if(gaps.length)prompt+="\n前驱尚未完成；本阶段显式允许携带这些缺口继续："+JSON.stringify(gaps)}
      if(!prompt.trim()||prompt.length>2000)fault("research_stage_input_size_limit",413)
      var spec=json(app.findRecordById("agent_specs",stage.spec_id),"spec"),tools=Object.create(null)
      ;(spec.tools||[]).forEach(function(tool){tools[String(tool)]=true})
      var payload={spec_id:stage.spec_id,instruction:prompt,model:stage.custom_model.model_id,config:{case_id:profile.case_id,question_id:stage.question_id||undefined,max_steps:stage.max_steps,execution_budget:stage.budget,custom_model:stage.custom_model,tools:tools,require_approval:true,require_plan_review:spec.require_plan_review===true,source:"research_stage"}}
      payload=JSON.parse(JSON.stringify(payload))
      var childId=$security.sha256("research-child:"+id+":"+nodeId).slice(0,15),linkId=$security.randomString(20)
      app.db().newQuery("INSERT INTO agent_studio_research_stages (id,owner_uid,parent_run_id,node_id,child_run_id,spec_id,spec_hash,question_id,state,start_payload,payload_hash,artifact,error,launch_attempts,last_launch_ms,paused_by_parent,resume_status,created_ms,updated_ms) VALUES ({:id},{:uid},{:parent},{:node},{:child},{:spec},{:specHash},{:question},'launching',{:payload},{:hash},'{}','',0,0,0,'',{:now},{:now}) ON CONFLICT(parent_run_id,node_id) DO NOTHING")
        .bind({id:linkId,uid:uid,parent:id,node:nodeId,child:childId,spec:stage.spec_id,specHash:stage.spec_hash,question:stage.question_id,payload:JSON.stringify(payload),hash:$security.sha256(canonical(payload)),now:now}).execute()
      row=stageRows(app,uid,id).filter(function(item){return item.node_id===nodeId})[0];byRow[nodeId]=row
    }
    var child=null;try{child=app.findRecordById("agent_runs",String(row.child_run_id))}catch(_){}
    if(!child){
      if(String(row.state)!=="launching")fault("research_child_missing",409)
      if(Number(row.launch_attempts)>=5)fault("research_launch_attempt_limit",409)
      if(Number(row.last_launch_ms)&&now-Number(row.last_launch_ms)<3000)continue
      var secret=String($os.getenv("AGENT_STUDIO_WORKER_TOKEN")||""),base=String($os.getenv("AGENT_STUDIO_WORKER_INTERNAL_URL")||"http://127.0.0.1:7000").replace(/\/+$/,"")
      if($os.getenv("AGENT_STUDIO_BACKGROUND_WORKER")!=="true"||secret.length<32||!/^http:\/\/127\.0\.0\.1:[0-9]{2,5}$/.test(base))fault("research_worker_not_configured",503)
      app.db().newQuery("UPDATE agent_studio_research_stages SET launch_attempts=launch_attempts+1,last_launch_ms={:now},updated_ms={:now} WHERE id={:id}").bind({id:String(row.id),now:now}).execute()
      var body=JSON.parse(String(row.start_payload));body.research_stage_link_id=String(row.id);body.research_child_run_id=String(row.child_run_id)
      var response=null
      try{response=$http.send({url:base+"/api/agent-runs/start",method:"POST",headers:{"Content-Type":"application/json","X-Agent-Studio-Worker-Token":secret,"X-Rh-User-Id":uid},body:JSON.stringify(body),timeout:10})}catch(_){save(app,uid,id,cp);return {ok:true,run_id:id,status:"running",stepped:false,launch_pending:true}}
      if(Number(response.statusCode)<200||Number(response.statusCode)>=300)fault("research_child_start_rejected",409)
      child=app.findRecordById("agent_runs",String(row.child_run_id))
      event(app,id,cp,nodeId,"node_start",{title:stage.title,type:"agent",child_run_id:String(row.child_run_id),message:"持久化阶段子运行已创建"})
      progressed=true
      cp.research_stages[nodeId]={child_run_id:String(row.child_run_id),status:child.getString("status"),question_id:stage.question_id}
      save(app,uid,id,cp);return {ok:true,run_id:id,status:"running",stepped:true,node_id:nodeId}
    }
    var childStatus=child.getString("status")
    cp.research_stages[nodeId]={child_run_id:String(row.child_run_id),status:childStatus,question_id:stage.question_id}
    if(["succeeded","failed","cancelled"].indexOf(childStatus)<0)continue
    var artifact=JSON.parse(String(row.artifact)||"{}")
    if(!artifact.schema_id)artifact=capture(app,uid,ctx,stage,String(row.child_run_id))
    var outcome=accepted(app,uid,ctx,stage,artifact)
    if(childStatus!=="succeeded"&&!stage.allow_partial)outcome="incomplete"
    artifact.acceptance_outcome=outcome;artifact.child_execution_status=childStatus
    artifact.gaps=outcome==="accepted"?[]:[{code:outcome==="awaiting_review"?"semantic_review_required":"stage_acceptance_incomplete",acceptance:stage.acceptance,child_execution_status:childStatus}]
    if(outcome==="awaiting_review"){
      app.db().newQuery("UPDATE agent_studio_research_stages SET state='awaiting_review',artifact={:artifact},updated_ms={:now} WHERE id={:id}").bind({id:String(row.id),artifact:JSON.stringify(artifact),now:now}).execute()
      cp.research_stages[nodeId].status="awaiting_review";continue
    }
    var state=outcome==="accepted"?(childStatus==="succeeded"?"done":"partial"):stage.allow_partial?"partial":"failed"
    app.db().newQuery("UPDATE agent_studio_research_stages SET state={:state},artifact={:artifact},error={:error},updated_ms={:now} WHERE id={:id}").bind({id:String(row.id),state:state,artifact:JSON.stringify(artifact),error:state==="failed"?"research_stage_acceptance_incomplete":"",now:now}).execute()
    cp.research_stages[nodeId].status=state
    if(state==="failed"){
      event(app,id,cp,nodeId,"node_failed",{title:stage.title,type:"agent",child_run_id:String(row.child_run_id),message:"阶段未通过声明的验收，已保留部分产物"})
      save(app,uid,id,cp)
      control(app,uid,id,"fail","research_stage_acceptance_incomplete")
      return {ok:true,run_id:id,status:"failed",stepped:true,node_id:nodeId}
    }
    cp.statuses[nodeId]="done";cp.outputs[nodeId]=JSON.stringify({stage_id:nodeId,child_run_id:String(row.child_run_id),artifact_schema:artifact.schema_id,state:state})
    event(app,id,cp,nodeId,"node_done",{title:stage.title,type:"agent",child_run_id:String(row.child_run_id),stage_outcome:state,artifact:artifact,message:"阶段产物已保存；自由文本质量未认证"})
    progressed=true
    // One transition/launch per tick keeps the ordinary Worker fair.
    save(app,uid,id,cp);return {ok:true,run_id:id,status:"running",stepped:true,node_id:nodeId}
  }
  save(app,uid,id,cp)
  return {ok:true,run_id:id,status:"running",stepped:progressed,waiting:!progressed}
}
// Called from the Agent reservation transaction. All scopes roll back together.
function reserveForChild(app,uid,runId,linkId,kind,closing){
  var links=arrayOf(new DynamicModel({parent_run_id:"",node_id:"",question_id:"",child_run_id:""}))
  app.db().newQuery("SELECT parent_run_id,node_id,question_id,child_run_id FROM agent_studio_research_stages WHERE id={:id} AND owner_uid={:uid}").bind({id:linkId,uid:uid}).all(links)
  if(links.length!==1||String(links[0].child_run_id)!==runId)fault("research_stage_link_denied",403)
  var link=links[0],ctx=assertSources(app,uid,String(link.parent_run_id)),now=new Date().getTime(),profile=ctx.profile
  if(ctx.run.getString("status")!=="running")fault("execution_stopped",409)
  var stage=profile.stages.filter(function(item){return item.node_id===String(link.node_id)})[0]
  if(!stage||stage.question_id!==String(link.question_id))fault("research_stage_link_denied",403)
  var scopes=[{key:"parent",limits:profile.budget,started:profile.created_ms},{key:"stage:"+stage.node_id,limits:stage.budget,started:now}]
  var chargedQuestions=stage.question_id?[stage.question_id]:profile.replan?profile.replan.question_scope_ids:[]
  chargedQuestions.forEach(function(q){scopes.push({key:"question:"+q,limits:profile.question_budgets[q],started:now})})
  var rootBudget=require(__hooks+"/modules/research_replans.js").reserveRoot(app,uid,ctx,kind,closing)
  if(rootBudget){rootBudget.scopes.forEach(function(scope){scope.root_id=rootBudget.root_id;scopes.push(scope)});chargedQuestions.forEach(function(q){scopes.push({root_id:rootBudget.root_id,key:"question:"+q,limits:rootBudget.question_limits[q],started:now})})}
  scopes.forEach(function(scope){
    var ledgerId=scope.root_id||String(link.parent_run_id)
    var serialized=JSON.stringify(scope.limits),hash=$security.sha256(serialized),rows=arrayOf(new DynamicModel({limits_hash:"",started_ms:0,model_intents:0,tool_intents:0,search_intents:0,read_intents:0,closing_intents:0}))
    app.db().newQuery("INSERT INTO agent_studio_research_budgets (parent_run_id,scope_key,owner_uid,limits,limits_hash,started_ms,model_intents,tool_intents,search_intents,read_intents,closing_intents,updated_ms) VALUES ({:parent},{:scope},{:uid},{:limits},{:hash},{:started},0,0,0,0,0,{:now}) ON CONFLICT(parent_run_id,scope_key) DO NOTHING")
      .bind({parent:ledgerId,scope:scope.key,uid:uid,limits:serialized,hash:hash,started:scope.started,now:now}).execute()
    app.db().newQuery("SELECT limits_hash,started_ms,model_intents,tool_intents,search_intents,read_intents,closing_intents FROM agent_studio_research_budgets WHERE parent_run_id={:parent} AND scope_key={:scope} AND owner_uid={:uid}").bind({parent:ledgerId,scope:scope.key,uid:uid}).all(rows)
    if(rows.length!==1||String(rows[0].limits_hash)!==hash)fault("research_budget_configuration_changed",409)
    require(__hooks+"/modules/execution_budget.js").admit(rows[0],scope.limits,kind,closing,now,scope.key)
    app.db().newQuery("UPDATE agent_studio_research_budgets SET model_intents=model_intents+{:model},tool_intents=tool_intents+{:tool},search_intents=search_intents+{:search},read_intents=read_intents+{:read},closing_intents=closing_intents+{:closing},updated_ms={:now} WHERE parent_run_id={:parent} AND scope_key={:scope} AND owner_uid={:uid}")
      .bind({model:kind==="model"?1:0,tool:kind==="model"?0:1,search:kind==="search"?1:0,read:kind==="read"?1:0,closing:kind==="model"&&closing?1:0,now:now,parent:ledgerId,scope:scope.key,uid:uid}).execute()
  })
}
function control(app,uid,id,action,reason){
  if(["pause","resume","cancel","fail"].indexOf(action)<0)fault("invalid_research_control")
  var next=action==="pause"?"paused":action==="resume"?"running":action==="fail"?"failed":"cancelled"
  app.runInTransaction(function(tx){
    var ctx=parent(tx,uid,id),current=ctx.run.getString("status")
    if(action==="resume"&&current!=="paused"||action!=="resume"&&["running","paused"].indexOf(current)<0)fault("bad_state",409)
    if(action==="resume")assertSources(tx,uid,id)
    stageRows(tx,uid,id).forEach(function(row){
      var child=null;try{child=tx.findRecordById("agent_runs",String(row.child_run_id))}catch(_){}
      if(child&&["succeeded","failed","cancelled"].indexOf(child.getString("status"))<0){
        var status=child.getString("status"),cp=json(child,"checkpoint")
        // Keep the unified executor's active lease intact. In-flight work must
        // first persist its result, then apply the cooperative stop boundary.
        var activeLease=new DynamicModel({expires_ms:0})
        try{tx.db().newQuery("SELECT expires_ms FROM agent_studio_run_leases WHERE kind='agent' AND run_id={:id}").bind({id:String(child.id)}).one(activeLease)}catch(_){}
        if(status==="running"&&Number(activeLease.expires_ms)>new Date().getTime()&&action!=="resume"){
          if(action==="pause"){
            cp.pause_requested=true
            tx.db().newQuery("UPDATE agent_studio_research_stages SET paused_by_parent=1,resume_status={:status} WHERE id={:id}").bind({id:String(row.id),status:status}).execute()
          }else cp.cancel_requested=true
          if(action==="cancel"||action==="fail")tx.db().newQuery("UPDATE agent_studio_research_stages SET state='cancelled',updated_ms={:now} WHERE id={:id}").bind({id:String(row.id),now:new Date().getTime()}).execute()
          child.set("checkpoint",cp);tx.save(child);return
        }
        if(action==="pause"){
          if(status==="paused")return
          tx.db().newQuery("UPDATE agent_studio_research_stages SET paused_by_parent=1,resume_status={:status} WHERE id={:id}").bind({id:String(row.id),status:status}).execute()
          child.set("status","paused")
        }else if(action==="resume"){
          if(!Number(row.paused_by_parent))return
          cp.pause_requested=false
          child.set("status",String(row.resume_status)||"running")
          tx.db().newQuery("UPDATE agent_studio_research_stages SET paused_by_parent=0,resume_status='' WHERE id={:id}").bind({id:String(row.id)}).execute()
        }else{child.set("status","cancelled");child.set("error","research_parent_"+next)}
        cp.claim_until=0;child.set("checkpoint",cp);tx.save(child)
      }
      if(action==="cancel"||action==="fail")tx.db().newQuery("UPDATE agent_studio_research_stages SET state='cancelled',updated_ms={:now} WHERE id={:id} AND state IN ('launching','running','awaiting_review')").bind({id:String(row.id),now:new Date().getTime()}).execute()
    })
    var cp=json(ctx.run,"checkpoint");cp.claim_until=0
    ctx.run.set("status",next);ctx.run.set("checkpoint",cp)
    if(action==="cancel"||action==="fail"){
      ctx.run.set("error",reason||"research_parent_"+next)
      ctx.run.set("result",JSON.stringify({case_id:ctx.profile.case_id,partial:true,stages:stageRows(tx,uid,id).map(function(row){return {stage_id:String(row.node_id),child_run_id:String(row.child_run_id),state:String(row.state)}}),free_text_quality:"unverified"}))
    }
    event(tx,id,cp,"","status",{message:"research_parent_"+next});ctx.run.set("checkpoint",cp);tx.save(ctx.run)
  })
  return {ok:true,run_id:id,status:next}
}
function assertChildResume(app,uid,run){
  var linkId=json(run,"config").research_stage_link_id
  if(!linkId)return
  var rows=arrayOf(new DynamicModel({parent_run_id:""}))
  app.db().newQuery("SELECT parent_run_id FROM agent_studio_research_stages WHERE id={:id} AND child_run_id={:run} AND owner_uid={:uid}").bind({id:String(linkId),run:String(run.id),uid:uid}).all(rows)
  if(rows.length!==1||assertSources(app,uid,String(rows[0].parent_run_id)).run.getString("status")!=="running")fault("research_parent_not_running",409)
}
function detail(app,uid,id){
  var ctx=assertSources(app,uid,id),usage=arrayOf(new DynamicModel({scope_key:"",limits:"",started_ms:0,model_intents:0,tool_intents:0,search_intents:0,read_intents:0,closing_intents:0}))
  app.db().newQuery("SELECT scope_key,limits,started_ms,model_intents,tool_intents,search_intents,read_intents,closing_intents FROM agent_studio_research_budgets WHERE parent_run_id={:id} AND owner_uid={:uid} ORDER BY scope_key").bind({id:id,uid:uid}).all(usage)
  return {run_id:id,status:ctx.run.getString("status"),profile:ctx.profile,recovery:require(__hooks+"/modules/research_replans.js").summary(app,uid,ctx),
    stages:effectiveStages(app,uid,ctx),
    budgets:usage.map(function(row){return {scope:String(row.scope_key),limits:JSON.parse(String(row.limits)),started_ms:Number(row.started_ms),usage:{model_intents:Number(row.model_intents),tool_intents:Number(row.tool_intents),search_intents:Number(row.search_intents),read_intents:Number(row.read_intents),closing_intents:Number(row.closing_intents)}}}),
    measurement:"request_intents_not_billing"}
}
function effectiveStages(app,uid,ctx){
  var result=stageRows(app,uid,String(ctx.run.id)).map(function(row){var status="not_created";try{status=app.findRecordById("agent_runs",String(row.child_run_id)).getString("status")}catch(_){};return {stage_id:String(row.node_id),child_run_id:String(row.child_run_id),child_status:status,state:String(row.state),artifact:JSON.parse(String(row.artifact)||"{}"),error:String(row.error)}})
  if(ctx.profile.replan){var cp=json(ctx.run,"checkpoint");ctx.profile.replan.decisions.forEach(function(d){if(d.action==="run")return
    var prior=d.action==="defer"?null:require(__hooks+"/modules/research_replans.js").receipt(app,uid,d.origin_parent_id,d.origin_stage_id)
    var state=cp.research_stages&&cp.research_stages[d.stage_id]?cp.research_stages[d.stage_id].status:d.action==="review"?"awaiting_review":d.action==="defer"?"deferred":"reuse_pending",artifact=prior?JSON.parse(JSON.stringify(prior.artifact)):{gaps:[{code:d.reason}]}
    if(state==="reused"){artifact.source_gaps=artifact.gaps;artifact.gaps=[]}
    result.push({stage_id:d.stage_id,child_run_id:d.child_run_id||"",child_status:prior?"succeeded":"not_created",state:state,artifact:artifact,source_run_id:d.origin_parent_id||null,reused:Boolean(prior)})
  })}
  return result
}
module.exports={ensure:ensure,aggregate:aggregate,validate:validate,parent:parent,stageRows:stageRows,assertSources:assertSources,authorizeStart:authorizeStart,childCreated:childCreated,advance:advance,reserveForChild:reserveForChild,control:control,assertChildResume:assertChildResume,detail:detail,accepted:accepted,effectiveStages:effectiveStages}
