"use strict"
// Durable request-intent budgets. Reserve before network effects; a crash never
// resets counters. Intents are not provider bills or token-cost measurements.
function fault(dimension){var e=new Error("execution_budget_exhausted:"+dimension);e.code="execution_budget_exhausted";e.dimension=dimension;e.httpStatus=409;throw e}
function normalize(input,maxSteps){
  var steps=Math.max(1,Math.min(30,Number(maxSteps)||10)),base={model_calls:steps*4+2,tool_calls:steps*2,search_calls:steps*2,read_calls:steps*2,wall_ms:3600000,closing_model_calls:1}
  if(input===undefined||input===null)return base
  if(typeof input!=="object"||Array.isArray(input))throw Error("invalid_execution_budget")
  var ceilings={model_calls:500,tool_calls:200,search_calls:200,read_calls:200,wall_ms:86400000,closing_model_calls:2}
  Object.keys(input).forEach(function(key){if(!Object.prototype.hasOwnProperty.call(ceilings,key)||!Number.isInteger(input[key])||input[key]<(key==="wall_ms"?1000:0)||input[key]>ceilings[key])throw Error("invalid_execution_budget");base[key]=input[key]})
  if(base.search_calls>base.tool_calls)base.search_calls=base.tool_calls
  if(base.read_calls>base.tool_calls)base.read_calls=base.tool_calls
  if(input.closing_model_calls===undefined)base.closing_model_calls=Math.min(1,base.model_calls)
  if(base.closing_model_calls>base.model_calls)throw Error("invalid_execution_budget")
  return base
}
function ensure(app){
  app.db().newQuery("CREATE TABLE IF NOT EXISTS agent_studio_execution_budgets (run_id TEXT PRIMARY KEY,owner_uid TEXT NOT NULL,limits TEXT NOT NULL,limits_hash TEXT NOT NULL,question_id TEXT NOT NULL,started_ms INTEGER NOT NULL,model_intents INTEGER NOT NULL,tool_intents INTEGER NOT NULL,search_intents INTEGER NOT NULL,read_intents INTEGER NOT NULL,closing_intents INTEGER NOT NULL,updated_ms INTEGER NOT NULL)").execute()
}
function context(app,uid,runId){
  var run=null;try{run=app.findRecordById("agent_runs",String(runId))}catch(_){}
  if(!uid||!run||run.getString("rh_user_id")!==uid){var denied=new Error("run_not_found");denied.code="run_not_found";denied.httpStatus=404;throw denied}
  var config=JSON.parse(run.getString("config")||"{}")
  return {status:run.getString("status"),stage_link_id:String(config.research_stage_link_id||""),limits:normalize(config.execution_budget,Number(run.getInt("max_steps")||10)),question_id:String(config.question_id||"")}
}
function rows(app,uid,runId){
  var result=arrayOf(new DynamicModel({limits:"",limits_hash:"",question_id:"",started_ms:0,model_intents:0,tool_intents:0,search_intents:0,read_intents:0,closing_intents:0,updated_ms:0}))
  app.db().newQuery("SELECT limits,limits_hash,question_id,started_ms,model_intents,tool_intents,search_intents,read_intents,closing_intents,updated_ms FROM agent_studio_execution_budgets WHERE run_id={:rid} AND owner_uid={:uid}").bind({rid:runId,uid:uid}).all(result)
  return result
}
function status(app,uid,runId){
  var ctx=context(app,uid,runId),found=rows(app,uid,runId),row=found[0]
  return {run_id:runId,question_id:ctx.question_id,limits:row?JSON.parse(String(row.limits)):ctx.limits,started_ms:row?Number(row.started_ms):null,
    usage:{model_intents:row?Number(row.model_intents):0,tool_intents:row?Number(row.tool_intents):0,search_intents:row?Number(row.search_intents):0,read_intents:row?Number(row.read_intents):0,closing_intents:row?Number(row.closing_intents):0},measurement:"request_intents_not_billing"}
}
function admit(row,limits,kind,closing,now,scope){
  function deny(dimension){fault(scope?scope+":"+dimension:dimension)}
  if(now-Number(row.started_ms)>limits.wall_ms+(closing?30000:0))deny("wall_time")
  if(kind==="model"){
    if(Number(row.model_intents)>=limits.model_calls||closing&&Number(row.closing_intents)>=limits.closing_model_calls||!closing&&Number(row.model_intents)-Number(row.closing_intents)>=limits.model_calls-limits.closing_model_calls)deny(closing?"closing_models":"models")
  }else{
    if(Number(row.tool_intents)>=limits.tool_calls)deny("tools")
    if(kind==="search"&&Number(row.search_intents)>=limits.search_calls)deny("search")
    if(kind==="read"&&Number(row.read_intents)>=limits.read_calls)deny("read")
  }
}
function reserve(app,uid,runId,kind,closing){
  if(["model","tool","search","read"].indexOf(kind)<0)throw Error("invalid_budget_dimension")
  app.runInTransaction(function(tx){
    var ctx=context(tx,uid,runId),limits=ctx.limits,serialized=JSON.stringify(limits),hash=$security.sha256(serialized),now=new Date().getTime()
    if(ctx.status!=="running"){var stopped=new Error("execution_stopped");stopped.code="execution_stopped";stopped.httpStatus=409;throw stopped}
    var budgetRun=tx.findRecordById("agent_runs",runId)
    if(JSON.parse(budgetRun.getString("config")||"{}").monitor_check_id)require(__hooks+"/modules/business_monitors.js").assertRun(tx,uid,budgetRun)
    if(ctx.stage_link_id)require(__hooks+"/modules/research_workflow.js").reserveForChild(tx,uid,runId,ctx.stage_link_id,kind,closing)
    tx.db().newQuery("INSERT INTO agent_studio_execution_budgets (run_id,owner_uid,limits,limits_hash,question_id,started_ms,model_intents,tool_intents,search_intents,read_intents,closing_intents,updated_ms) VALUES ({:rid},{:uid},{:limits},{:hash},{:question},{:now},0,0,0,0,0,{:now}) ON CONFLICT(run_id) DO NOTHING")
      .bind({rid:runId,uid:uid,limits:serialized,hash:hash,question:ctx.question_id,now:now}).execute()
    var row=rows(tx,uid,runId)[0]
    if(!row||String(row.limits_hash)!==hash||String(row.question_id)!==ctx.question_id)fault("configuration_changed")
    admit(row,limits,kind,closing,now,"")
    if(kind==="model"){
      tx.db().newQuery("UPDATE agent_studio_execution_budgets SET model_intents=model_intents+1,closing_intents=closing_intents+{:closing},updated_ms={:now} WHERE run_id={:rid} AND owner_uid={:uid}").bind({rid:runId,uid:uid,closing:closing?1:0,now:now}).execute()
    }else{
      tx.db().newQuery("UPDATE agent_studio_execution_budgets SET tool_intents=tool_intents+1,search_intents=search_intents+{:search},read_intents=read_intents+{:read},updated_ms={:now} WHERE run_id={:rid} AND owner_uid={:uid}").bind({rid:runId,uid:uid,search:kind==="search"?1:0,read:kind==="read"?1:0,now:now}).execute()
    }
  })
}
module.exports={ensure:ensure,normalize:normalize,status:status,reserve:reserve,admit:admit}
