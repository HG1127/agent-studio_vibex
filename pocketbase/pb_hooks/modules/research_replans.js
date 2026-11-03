"use strict"
// Human-authorized, append-only research execution revisions. Existing receipts
// remain immutable; all revisions spend the original root's cumulative ledger.
function fault(code,status){var e=new Error(code);e.code=code;e.httpStatus=status||409;throw e}
function workflow(){return require(__hooks+"/modules/research_workflow.js")}
function canonical(v){return require(__hooks+"/modules/business_schemas.js").canonical(v)}
function hash(v){return $security.sha256(canonical(v))}
function ensure(app){
  app.db().newQuery("CREATE TABLE IF NOT EXISTS agent_studio_research_replans (id TEXT PRIMARY KEY,root_run_id TEXT NOT NULL,source_run_id TEXT NOT NULL,run_id TEXT NOT NULL UNIQUE,owner_uid TEXT NOT NULL,request_key TEXT NOT NULL,request_hash TEXT NOT NULL,preview_hash TEXT NOT NULL,root_revision INTEGER NOT NULL,plan TEXT NOT NULL,allocations TEXT NOT NULL,created_ms INTEGER NOT NULL,UNIQUE(owner_uid,source_run_id,request_key),UNIQUE(root_run_id,root_revision))").execute()
}
function history(app,uid,root){
  var rows=arrayOf(new DynamicModel({id:"",source_run_id:"",run_id:"",root_revision:0,allocations:""}))
  app.db().newQuery("SELECT id,source_run_id,run_id,root_revision,allocations FROM agent_studio_research_replans WHERE owner_uid={:uid} AND root_run_id={:root} ORDER BY root_revision LIMIT 11").bind({uid:uid,root:root}).all(rows)
  if(rows.length>10)fault("research_revision_limit")
  return rows
}
function rootId(ctx){return ctx.profile.replan?String(ctx.profile.replan.root_run_id):String(ctx.run.id)}
function row(app,uid,root,scope){
  var rows=arrayOf(new DynamicModel({limits:"",limits_hash:"",started_ms:0,model_intents:0,tool_intents:0,search_intents:0,read_intents:0,closing_intents:0}))
  app.db().newQuery("SELECT limits,limits_hash,started_ms,model_intents,tool_intents,search_intents,read_intents,closing_intents FROM agent_studio_research_budgets WHERE parent_run_id={:root} AND scope_key={:scope} AND owner_uid={:uid}").bind({root:root,scope:scope,uid:uid}).all(rows)
  return rows[0]||null
}
function addition(input){
  var allowed={model_calls:500,tool_calls:200,search_calls:200,read_calls:200,closing_model_calls:30,wall_ms:86400000},out={model_calls:0,tool_calls:0,search_calls:0,read_calls:0,closing_model_calls:0,wall_ms:0}
  if(input===undefined)return out
  require(__hooks+"/modules/business_schemas.js").object(input,Object.keys(allowed))
  Object.keys(input).forEach(function(k){if(!Number.isInteger(input[k])||input[k]<0||input[k]>allowed[k])fault("invalid_research_additional_budget",400);out[k]=input[k]})
  return out
}
function added(base,extra){
  var out=JSON.parse(JSON.stringify(base)),ceil={model_calls:500,tool_calls:200,search_calls:200,read_calls:200,closing_model_calls:30,wall_ms:86400000}
  Object.keys(ceil).forEach(function(k){out[k]+=extra[k];if(out[k]>ceil[k])fault("research_total_budget_limit",400)})
  if(out.closing_model_calls>out.model_calls||out.search_calls>out.tool_calls||out.read_calls>out.tool_calls)fault("invalid_research_additional_budget",400)
  return out
}
function limits(app,uid,root){
  var ctx=workflow().parent(app,uid,root),out={parent:ctx.profile.budget,questions:JSON.parse(JSON.stringify(ctx.profile.question_budgets))}
  history(app,uid,root).forEach(function(r){var a=JSON.parse(String(r.allocations));out.parent=added(out.parent,a.parent);Object.keys(a.questions).forEach(function(q){out.questions[q]=added(out.questions[q],a.questions[q])})})
  return out
}
function remaining(limits,used,started,now){
  used=used||{}
  return {model_calls:Math.max(0,limits.model_calls-Number(used.model_intents||0)),tool_calls:Math.max(0,limits.tool_calls-Number(used.tool_intents||0)),search_calls:Math.max(0,limits.search_calls-Number(used.search_intents||0)),read_calls:Math.max(0,limits.read_calls-Number(used.read_intents||0)),closing_model_calls:Math.max(0,limits.closing_model_calls-Number(used.closing_intents||0)),wall_ms:Math.max(0,Number(started)+limits.wall_ms-now)}
}
function receipt(app,uid,parentId,nodeId,seen){
  seen=seen||Object.create(null);var key=parentId+":"+nodeId
  if(seen[key]||Object.keys(seen).length>=11)fault("research_reuse_lineage_limit")
  seen[key]=true
  var ctx=workflow().parent(app,uid,parentId),rows=workflow().stageRows(app,uid,parentId),found=rows.filter(function(r){return String(r.node_id)===nodeId})[0]
  if(found)return {origin_parent_id:parentId,origin_stage_id:nodeId,child_run_id:String(found.child_run_id),state:String(found.state),artifact:JSON.parse(String(found.artifact)||"{}")}
  var decision=ctx.profile.replan&&(ctx.profile.replan.decisions||[]).filter(function(d){return d.stage_id===nodeId})[0]
  if(!decision||["reuse","review"].indexOf(decision.action)<0)return null
  var prior=receipt(app,uid,decision.origin_parent_id,decision.origin_stage_id,seen)
  if(!prior||prior.child_run_id!==decision.child_run_id||hash(prior.artifact)!==decision.artifact_hash)fault("research_reuse_receipt_changed")
  var checkpoint=JSON.parse(ctx.run.getString("checkpoint")||"{}"),completed=checkpoint.research_stages&&checkpoint.research_stages[nodeId]&&checkpoint.research_stages[nodeId].status==="reused"
  prior.origin_parent_id=parentId;prior.origin_stage_id=nodeId;if(completed)prior.state="done"
  return prior
}
function assertReceipt(app,uid,caseId,r,current){
  var store=require(__hooks+"/modules/tool_results.js"),data=require(__hooks+"/modules/business_data.js"),visited=Object.create(null)
  store.assertRunAccessible(app,uid,r.child_run_id)
  function pin(p){
    var key=p.record_id+":"+p.version;if(visited[key])return;visited[key]=true
    if(Object.keys(visited).length>1200)fault("research_reuse_record_limit")
    var fixed=data.get(app,uid,caseId,p.record_id,p.version)
    if(current&&data.get(app,uid,caseId,p.record_id).version!==p.version)fault("research_reuse_record_stale")
    ;(fixed.relation_versions||[]).forEach(pin)
  }
  ;(r.artifact.records||[]).forEach(pin)
  ;(r.artifact.results||[]).forEach(function(item){var saved=store.row(app,uid,r.child_run_id,item.result_id);if(String(saved.content_hash)!==item.content_hash)fault("research_reuse_result_changed")})
}
function assertReuse(app,uid,ctx){
  if(!ctx.profile.replan)return
  var current=["running","paused"].indexOf(ctx.run.getString("status"))>=0
  ;(ctx.profile.replan.decisions||[]).forEach(function(d){if(["reuse","review"].indexOf(d.action)<0)return
    var r=receipt(app,uid,d.origin_parent_id,d.origin_stage_id)
    if(!r||r.child_run_id!==d.child_run_id||hash(r.artifact)!==d.artifact_hash)fault("research_reuse_receipt_changed",403)
    assertReceipt(app,uid,ctx.profile.case_id,r,current)
    if(current){var stage=ctx.profile.stages.filter(function(s){return s.node_id===d.stage_id})[0],state=workflow().accepted(app,uid,ctx,stage,JSON.parse(JSON.stringify(r.artifact)))
      if(d.action==="reuse"&&state!=="accepted"||d.action==="review"&&["accepted","awaiting_review"].indexOf(state)<0)fault("research_reuse_acceptance_changed")}
  })
}
function inspect(app,uid,sourceId,input){
  var w=workflow(),source=w.parent(app,uid,sourceId),root=rootId(source),base=w.parent(app,uid,root),past=history(app,uid,root),latest=past.length?String(past[past.length-1].run_id):root
  if(sourceId!==latest)fault("research_replan_requires_latest")
  if(past.length>=10)fault("research_revision_limit")
  if(["succeeded","failed","cancelled"].indexOf(source.run.getString("status"))<0)fault("research_source_not_terminal")
  var schema=require(__hooks+"/modules/business_schemas.js")
  schema.object(input,["question_ids","additional_budget","additional_question_budgets","stage_budgets"])
  var business=require(__hooks+"/modules/business_data.js").caseGet(app,uid,source.profile.case_id),data=require(__hooks+"/modules/business_data.js"),answers=[],offset=0,more=true
  while(more&&offset<500){var page=data.query(app,uid,source.profile.case_id,{schema_id:"research.answer.v1",offset:offset,limit:50});answers=answers.concat(page.items);offset=page.next_offset;more=page.has_more}
  if(more)fault("research_replan_record_limit")
  var quality=require(__hooks+"/modules/business_quality.js").validate(app,uid,source.profile.case_id,"research.evidence.v1");delete quality.checked_ms
  var missing=Object.create(null),questions=business.questions.map(function(q){var matched=answers.filter(function(a){return a.payload.question_id===q.question_id}),gap=matched.length!==1||matched[0].payload.status!=="ANSWERED"||matched[0].payload.missing.length>0
    var related=[];matched.forEach(function(a){related.push(a.record_id);(a.relation_versions||[]).forEach(function(p){related.push(p.record_id)})})
    if(quality.issues.some(function(issue){return (issue.question_id===q.question_id||related.indexOf(issue.record_id)>=0)&&["failed","incomplete"].indexOf(issue.severity)>=0}))gap=true
    missing[q.question_id]=gap;return {question_id:q.question_id,question:q.question,status:matched.length===1?matched[0].payload.status:"UNANSWERED",missing:gap,records:matched.map(function(a){return {record_id:a.record_id,version:a.version}})}
  })
  var selected=input.question_ids===undefined?questions.filter(function(q){return q.missing}).map(function(q){return q.question_id}):input.question_ids
  if(input.question_ids!==undefined&&Array.isArray(selected)&&!selected.length)fault("invalid_research_replan_questions",400)
  if(!Array.isArray(selected)||selected.length>20||selected.some(function(q,i){return typeof q!=="string"||selected.indexOf(q)!==i||!business.questions.some(function(item){return item.question_id===q})}))fault("invalid_research_replan_questions",400)
  var alloc={parent:addition(input.additional_budget),questions:Object.create(null)},qextra=input.additional_question_budgets||{},stageBudgets=input.stage_budgets||{}
  schema.object(qextra,business.questions.map(function(q){return q.question_id}));schema.object(stageBudgets,source.profile.stages.map(function(s){return s.node_id}))
  Object.keys(qextra).forEach(function(q){if(selected.indexOf(q)<0)fault("research_budget_outside_question_scope",400);alloc.questions[q]=addition(qextra[q])})
  var effective=limits(app,uid,root),next={parent:added(effective.parent,alloc.parent),questions:JSON.parse(JSON.stringify(effective.questions))}
  Object.keys(alloc.questions).forEach(function(q){next.questions[q]=added(next.questions[q],alloc.questions[q])})
  var now=new Date().getTime(),rootUsed=row(app,uid,root,"parent"),available=remaining(next.parent,rootUsed,base.profile.created_ms,now),qavailable=Object.create(null),decisions=[],byDecision=Object.create(null),blocked=[]
  questions.forEach(function(q){var used=row(app,uid,root,"question:"+q.question_id);qavailable[q.question_id]=remaining(next.questions[q.question_id],used,used?Number(used.started_ms):now,now)})
  source.profile.order.forEach(function(nodeId){var stage=source.profile.stages.filter(function(s){return s.node_id===nodeId})[0];if(!stage)return
    var r=receipt(app,uid,sourceId,nodeId),valid=false,acceptance="incomplete",reason="stage_unfinished",changed=source.graph.edges.some(function(e){return e.target===nodeId&&byDecision[e.source]&&byDecision[e.source].action!=="reuse"})
    if(r&&r.artifact.schema_id){try{assertReceipt(app,uid,source.profile.case_id,r,true);var child=app.findRecordById("agent_runs",r.child_run_id)
      if(child.getString("status")==="succeeded"){acceptance=w.accepted(app,uid,source,stage,JSON.parse(JSON.stringify(r.artifact)));valid=acceptance==="accepted"&&r.state==="done";reason=valid?"accepted_receipt":acceptance==="awaiting_review"?"semantic_review_required":"stage_acceptance_incomplete"}
    }catch(err){reason=String(err.code||"source_or_version_unavailable")}}
    var selectedStage=!stage.question_id||selected.indexOf(stage.question_id)>=0,needsQuestion=stage.question_id&&missing[stage.question_id]&&selectedStage
    if(r&&(r.artifact.records||[]).some(function(pin){return answers.some(function(a){return a.record_id===pin.record_id&&selected.indexOf(a.payload.question_id)>=0&&missing[a.payload.question_id]})}))needsQuestion=true
    if(r&&(r.artifact.question_scope_ids||[]).some(function(q){return selected.indexOf(q)>=0&&missing[q]}))needsQuestion=true
    var action=valid&&!changed&&!needsQuestion?"reuse":!selectedStage?"defer":acceptance==="awaiting_review"&&!changed?"review":"run"
    if(action==="reuse"&&stage.question_id&&missing[stage.question_id]){action="defer";reason="unselected_question_gap"}
    if(action==="defer")reason=changed?"upstream_changed_outside_question_scope":"outside_question_scope"
    if(action==="run"){
      var spec=app.findRecordById("agent_specs",stage.spec_id),model=app.findRecordById("model_connections",stage.custom_model.connection_id)
      if(spec.getString("rh_user_id")!==uid||hash(JSON.parse(spec.getString("spec")||"{}"))!==stage.spec_hash)blocked.push({stage_id:nodeId,code:"research_spec_revision_changed"})
      if(model.getString("rh_user_id")!==uid||require(__hooks+"/modules/model_connections.js").verifiedModelIds(model).indexOf(stage.custom_model.model_id)<0)blocked.push({stage_id:nodeId,code:"research_model_unverified"})
      if(r){var uncertain=new DynamicModel({count:0});app.db().newQuery("SELECT COUNT(*) AS count FROM agent_studio_side_effects WHERE run_id={:id} AND status IN ('started','unknown')").bind({id:r.child_run_id}).one(uncertain);if(Number(uncertain.count))blocked.push({stage_id:nodeId,code:"research_write_reconciliation_required"})}
    }
    if((action==="run"||action==="review")&&!stage.allow_partial&&source.graph.edges.some(function(e){return e.target===nodeId&&byDecision[e.source]&&byDecision[e.source].action==="defer"}))blocked.push({stage_id:nodeId,code:"research_dependency_outside_scope"})
    var decision={stage_id:nodeId,title:stage.title,question_id:stage.question_id,action:action,reason:needsQuestion?"question_has_gaps":changed?"upstream_changed":reason}
    if(r&&(action==="reuse"||action==="review")){decision.origin_parent_id=r.origin_parent_id;decision.origin_stage_id=r.origin_stage_id;decision.child_run_id=r.child_run_id;decision.artifact_hash=hash(r.artifact)}
    decisions.push(decision);byDecision[nodeId]=decision
  })
  var normalizedStageBudgets=Object.create(null)
  Object.keys(stageBudgets).forEach(function(id){if(byDecision[id].action!=="run")fault("research_budget_for_unexecuted_stage",400);var definition=source.profile.stages.filter(function(s){return s.node_id===id})[0];normalizedStageBudgets[id]=require(__hooks+"/modules/execution_budget.js").normalize(stageBudgets[id],definition.max_steps)})
  var work=decisions.filter(function(d){return d.action==="run"}),reviews=decisions.filter(function(d){return d.action==="review"})
  if(!work.length&&!reviews.length)blocked.push({code:"research_no_missing_work"})
  if(available.wall_ms<1000)blocked.push({code:"research_wall_budget_required"})
  if(work.length&&available.model_calls<=available.closing_model_calls)blocked.push({code:"research_model_budget_required"})
  work.forEach(function(d){var charged=d.question_id?[d.question_id]:selected;charged.forEach(function(q){if(qavailable[q].wall_ms<1000)blocked.push({stage_id:d.stage_id,code:"research_question_wall_budget_required"});if(qavailable[q].model_calls<=qavailable[q].closing_model_calls)blocked.push({stage_id:d.stage_id,code:"research_question_budget_required"})})})
  var preview={version:1,source_run_id:sourceId,root_run_id:root,root_revision:past.length,case_id:source.profile.case_id,question_ids:selected,questions:questions,decisions:decisions,blocked:blocked,can_start:!blocked.length,additional:alloc,root_limits:next,root_usage:rootUsed?{model_intents:Number(rootUsed.model_intents),tool_intents:Number(rootUsed.tool_intents),search_intents:Number(rootUsed.search_intents),read_intents:Number(rootUsed.read_intents),closing_intents:Number(rootUsed.closing_intents)}:{model_intents:0,tool_intents:0,search_intents:0,read_intents:0,closing_intents:0},remaining:available,question_remaining:qavailable,stage_budgets:normalizedStageBudgets,quality:quality,source_status:source.run.getString("status")}
  var fingerprint=JSON.parse(JSON.stringify(preview));delete fingerprint.remaining.wall_ms;Object.keys(fingerprint.question_remaining).forEach(function(q){delete fingerprint.question_remaining[q].wall_ms})
  preview.preview_hash=hash(fingerprint)
  return preview
}
function persistLimits(app,uid,root,scope,limit,started){
  var old=row(app,uid,root,scope),now=new Date().getTime(),serialized=JSON.stringify(limit)
  if(old)app.db().newQuery("UPDATE agent_studio_research_budgets SET limits={:limits},limits_hash={:hash},updated_ms={:now} WHERE parent_run_id={:root} AND scope_key={:scope} AND owner_uid={:uid}").bind({limits:serialized,hash:$security.sha256(serialized),now:now,root:root,scope:scope,uid:uid}).execute()
  else app.db().newQuery("INSERT INTO agent_studio_research_budgets (parent_run_id,scope_key,owner_uid,limits,limits_hash,started_ms,model_intents,tool_intents,search_intents,read_intents,closing_intents,updated_ms) VALUES ({:root},{:scope},{:uid},{:limits},{:hash},{:started},0,0,0,0,0,{:now})").bind({root:root,scope:scope,uid:uid,limits:serialized,hash:$security.sha256(serialized),started:started,now:now}).execute()
}
function create(app,uid,id,body){
  require(__hooks+"/modules/business_schemas.js").object(body,["idempotency_key","preview_hash","request"])
  if(typeof body.idempotency_key!=="string"||!/^[A-Za-z0-9_-]{8,100}$/.test(body.idempotency_key)||typeof body.preview_hash!=="string")fault("invalid_research_replan_request",400)
  if(body.request!==undefined&&(!body.request||typeof body.request!=="object"||Array.isArray(body.request)))fault("invalid_research_replan_request",400)
  var requestHash=hash({preview_hash:body.preview_hash,request:body.request}),result
  app.runInTransaction(function(tx){
    var source=workflow().parent(tx,uid,id),prior=arrayOf(new DynamicModel({run_id:"",request_hash:""}))
    tx.db().newQuery("SELECT run_id,request_hash FROM agent_studio_research_replans WHERE owner_uid={:uid} AND source_run_id={:source} AND request_key={:key}").bind({uid:uid,source:id,key:body.idempotency_key}).all(prior)
    if(prior.length){if(String(prior[0].request_hash)!==requestHash)fault("research_replan_idempotency_conflict");workflow().assertSources(tx,uid,String(prior[0].run_id));result={ok:true,run_id:String(prior[0].run_id),deduplicated:true};return}
    var plan=inspect(tx,uid,id,body.request||{})
    if(plan.preview_hash!==body.preview_hash)fault("research_replan_preview_stale")
    if(!plan.can_start)fault(plan.blocked[0].code)
    var now=new Date().getTime(),runId=$security.sha256("research-replan:"+uid+":"+id+":"+body.idempotency_key).slice(0,15),profile=JSON.parse(JSON.stringify(source.profile)),root=workflow().parent(tx,uid,plan.root_run_id)
    persistLimits(tx,uid,plan.root_run_id,"parent",plan.root_limits.parent,root.profile.created_ms)
    Object.keys(plan.root_limits.questions).forEach(function(q){persistLimits(tx,uid,plan.root_run_id,"question:"+q,plan.root_limits.questions[q],now)})
    profile.created_ms=now;profile.only_missing=true;profile.budget=plan.remaining;profile.question_budgets=plan.question_remaining
    Object.keys(profile.question_budgets).forEach(function(q){profile.question_budgets[q].wall_ms=Math.max(1000,profile.question_budgets[q].wall_ms)})
    profile.stages.forEach(function(stage){if(plan.stage_budgets[stage.node_id])stage.budget=require(__hooks+"/modules/execution_budget.js").normalize(plan.stage_budgets[stage.node_id],stage.max_steps)})
    var auditId=$security.randomString(20);profile.replan={root_run_id:plan.root_run_id,source_run_id:id,revision:plan.root_revision+1,audit_id:auditId,question_scope_ids:plan.question_ids,decisions:plan.decisions}
    var graph={nodes:source.graph.nodes,edges:source.graph.edges,research:profile},run=new Record(tx.findCollectionByNameOrId("workflow_runs"))
    run.set("id",runId);run.set("rh_user_id",uid);run.set("workflow_id",source.run.getString("workflow_id"));run.set("workflow_name",source.run.getString("workflow_name"));run.set("instruction",source.run.getString("instruction"));run.set("status","running");run.set("graph_snapshot",graph);run.set("checkpoint",{queue:[],statuses:{},outputs:{},seq:1,claim_until:0,research_stages:{}});run.set("done_nodes",0);run.set("total_nodes",graph.nodes.length);tx.save(run)
    tx.db().newQuery("INSERT INTO agent_studio_research_replans (id,root_run_id,source_run_id,run_id,owner_uid,request_key,request_hash,preview_hash,root_revision,plan,allocations,created_ms) VALUES ({:id},{:root},{:source},{:run},{:uid},{:key},{:hash},{:preview},{:revision},{:plan},{:allocations},{:now})").bind({id:auditId,root:plan.root_run_id,source:id,run:runId,uid:uid,key:body.idempotency_key,hash:requestHash,preview:body.preview_hash,revision:plan.root_revision+1,plan:JSON.stringify(plan),allocations:JSON.stringify(plan.additional),now:now}).execute()
    var ev=new Record(tx.findCollectionByNameOrId("workflow_events"));ev.set("run_id",runId);ev.set("seq",1);ev.set("event_type","status");ev.set("content",{message:"已按人工确认的补查预览创建新执行版本；原运行和文件保持原版本",source_run_id:id,root_run_id:plan.root_run_id,revision:plan.root_revision+1,decisions:plan.decisions});tx.save(ev)
    result={ok:true,run_id:runId,source_run_id:id,root_run_id:plan.root_run_id,revision:plan.root_revision+1}
  })
  return result
}
function reserveRoot(app,uid,ctx,kind,closing){
  if(!ctx.profile.replan)return
  var root=ctx.profile.replan.root_run_id,past=history(app,uid,root)
  if(!past.length||String(past[past.length-1].run_id)!==String(ctx.run.id))fault("execution_stopped")
  var effective=limits(app,uid,root),base=workflow().parent(app,uid,root),scopes=[{key:"parent",limits:effective.parent,started:base.profile.created_ms}]
  return {root_id:root,scopes:scopes,question_limits:effective.questions}
}
function summary(app,uid,ctx){var root=rootId(ctx),used=row(app,uid,root,"parent"),effective=limits(app,uid,root),past=history(app,uid,root);return {root_run_id:root,revision:ctx.profile.replan?ctx.profile.replan.revision:0,latest_run_id:past.length?String(past[past.length-1].run_id):root,source_run_id:ctx.profile.replan?ctx.profile.replan.source_run_id:null,limits:effective.parent,usage:{model_intents:used?Number(used.model_intents):0,tool_intents:used?Number(used.tool_intents):0,closing_intents:used?Number(used.closing_intents):0}}}
module.exports={ensure:ensure,inspect:inspect,create:create,receipt:receipt,assertReuse:assertReuse,assertReceipt:assertReceipt,rootId:rootId,limits:limits,row:row,reserveRoot:reserveRoot,summary:summary}
