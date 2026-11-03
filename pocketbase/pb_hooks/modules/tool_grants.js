"use strict"
// Execution grants, not source-read ACLs. No provider hint or caller-supplied
// effect classification can register an adapter. Initial production adapter:
// https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md
function fault(code,status){var e=new Error(code);e.code=code;e.httpStatus=status||400;throw e}
function ensure(app){
  app.db().newQuery("CREATE TABLE IF NOT EXISTS agent_studio_tool_grants (id TEXT PRIMARY KEY,owner_uid TEXT NOT NULL,run_id TEXT NOT NULL,tool TEXT NOT NULL,adapter_id TEXT NOT NULL,config_hash TEXT NOT NULL,inputs TEXT NOT NULL,input_hashes TEXT NOT NULL,max_calls INTEGER NOT NULL,used_calls INTEGER NOT NULL,expires_ms INTEGER NOT NULL,revoked_ms INTEGER NOT NULL,actor_uid TEXT NOT NULL,idempotency_key TEXT NOT NULL,request_hash TEXT NOT NULL,created_ms INTEGER NOT NULL,UNIQUE(owner_uid,run_id,idempotency_key))").execute()
  app.db().newQuery("CREATE TABLE IF NOT EXISTS agent_studio_tool_grant_uses (run_id TEXT NOT NULL,step_index INTEGER NOT NULL,grant_id TEXT NOT NULL,owner_uid TEXT NOT NULL,tool TEXT NOT NULL,input_hash TEXT NOT NULL,config_hash TEXT NOT NULL,created_ms INTEGER NOT NULL,PRIMARY KEY(run_id,step_index))").execute()
}
function adapter(url,tool){
  if(tool==="search_repositories"&&/^https:\/\/api\.githubcopilot\.com\/mcp\/(?:readonly|x\/(?:repos|all)\/readonly)\/?$/.test(url))return "github.repositories.search.read.v1"
  // Disposable integration adapter: three explicit test-only switches and an
  // exact loopback endpoint. Offline production preflight rejects these flags.
  var origin=String($os.getenv("AGENT_STUDIO_CAPABILITY_TEST_ORIGIN")||"")
  if($os.getenv("NODE_ENV")==="test"&&$os.getenv("AGENT_STUDIO_CAPABILITY_TEST_ONLY")==="true"&&$os.getenv("AGENT_STUDIO_AUTH_MODE")==="standalone"&&/^http:\/\/127\.0\.0\.1:[1-9][0-9]{2,4}$/.test(origin)&&url===origin+"/readonly-mcp"&&tool==="fixture_lookup")return "test.fixture.lookup.read.v1"
  return ""
}
function ownedRun(app,uid,id){
  var run=null
  if(!uid)fault("studio_login_required",401)
  try{run=app.findRecordById("agent_runs",String(id))}catch(_){}
  if(!run||run.getString("rh_user_id")!==uid)fault("run_not_found",404)
  return run
}
function descriptor(app,uid,runId,tool){
  var run=ownedRun(app,uid,runId),config=JSON.parse(run.getString("config")||"{}"),parts=/^mkt__([A-Za-z0-9]{15})__(.+)$/.exec(tool)
  if(!parts||!Array.isArray(config.market_tool_ids)||config.market_tool_ids.indexOf(tool)<0)return null
  var rec=null;try{rec=app.findRecordById("market_connections",parts[1])}catch(_){}
  var fingerprint=require(__hooks+"/modules/market_tool_admission.js").marketApprovalFingerprint(rec,uid,tool,function(raw){return $security.sha256(raw)})
  if(!fingerprint)return null
  var id=adapter(String(rec.getString("url")),parts[2])
  if(!id)return null
  var rows=JSON.parse(rec.getString("tools")||"[]"),definition=null
  rows.forEach(function(row){if(row.name===parts[2])definition=row})
  var contract=require(__hooks+"/modules/tool_contracts.js").external(definition.input_schema,definition.output_schema)
  return {tool:tool,title:String(rec.getString("title")||parts[2]),adapter_id:id,config_hash:fingerprint,effect:"trusted_read_only",amount_limit_minor:0,input_schema:contract.input_schema,contract:contract}
}
function list(app,uid,runId){
  var run=ownedRun(app,uid,runId),config=JSON.parse(run.getString("config")||"{}"),eligible=[]
  require(__hooks+"/modules/tool_results.js").assertRunAccessible(app,uid,runId)
  ;(config.market_tool_ids||[]).forEach(function(tool){try{var entry=descriptor(app,uid,runId,String(tool));if(entry){delete entry.contract;eligible.push(entry)}}catch(_){}})
  var rows=arrayOf(new DynamicModel({id:"",tool:"",adapter_id:"",config_hash:"",inputs:"",max_calls:0,used_calls:0,expires_ms:0,revoked_ms:0,created_ms:0}))
  app.db().newQuery("SELECT id,tool,adapter_id,config_hash,inputs,max_calls,used_calls,expires_ms,revoked_ms,created_ms FROM agent_studio_tool_grants WHERE owner_uid={:uid} AND run_id={:rid} ORDER BY created_ms DESC,id LIMIT 50").bind({uid:uid,rid:runId}).all(rows)
  var now=new Date().getTime(),checkpoint=JSON.parse(run.getString("checkpoint")||"{}"),pending=checkpoint.pending_approval
  if(!pending||!eligible.some(function(entry){return entry.tool===pending.tool}))pending=null
  return {eligible_tools:eligible,pending_request:pending?{tool:pending.tool,input:pending.input}:null,items:rows.map(function(row){
    var state=Number(row.revoked_ms)?"revoked":Number(row.expires_ms)<=now?"expired":!eligible.some(function(entry){return entry.tool===String(row.tool)&&entry.config_hash===String(row.config_hash)})?"configuration_changed":Number(row.used_calls)>=Number(row.max_calls)?"exhausted":"active"
    return {grant_id:String(row.id),tool:String(row.tool),adapter_id:String(row.adapter_id),config_hash:String(row.config_hash),state:state,allowed_inputs:JSON.parse(String(row.inputs)),max_calls:Number(row.max_calls),reserved_calls:Number(row.used_calls),expires_ms:Number(row.expires_ms),revoked_ms:Number(row.revoked_ms),created_ms:Number(row.created_ms),amount_limit_minor:0}
  }),now_ms:now}
}
function create(app,uid,runId,input){
  var schemas=require(__hooks+"/modules/business_schemas.js")
  schemas.object(input,["tool","config_hash","allowed_inputs","max_calls","expires_in_minutes","amount_limit_minor","idempotency_key"]);schemas.string(input.idempotency_key,120)
  var run=ownedRun(app,uid,runId)
  if(["running","awaiting_approval"].indexOf(run.getString("status"))<0)fault("grant_run_not_active",409)
  require(__hooks+"/modules/tool_results.js").assertRunAccessible(app,uid,runId)
  var entry=descriptor(app,uid,runId,String(input.tool||""))
  if(!entry)fault("grant_adapter_not_trusted",403)
  if(entry.config_hash!==input.config_hash)fault("grant_connection_changed",409)
  if(!Array.isArray(input.allowed_inputs)||input.allowed_inputs.length<1||input.allowed_inputs.length>20||JSON.stringify(input.allowed_inputs).length>65536)fault("invalid_grant_scope")
  if(!Number.isInteger(input.max_calls)||input.max_calls<1||input.max_calls>20||!Number.isInteger(input.expires_in_minutes)||input.expires_in_minutes<1||input.expires_in_minutes>60||input.amount_limit_minor!==0)fault("invalid_grant_budget")
  var hashes=input.allowed_inputs.map(function(args){
    // Exact reviewed requests form the resource scope; no user DSL is treated as
    // a policy parser. Provider input constraints are checked in addition.
    require(__hooks+"/modules/tool_contracts.js").checkInput(entry.contract,args)
    if(!args||typeof args!=="object"||Array.isArray(args)||typeof args.query!=="string"||!args.query.trim()||args.query.length>1000)fault("invalid_grant_request")
    return $security.sha256(schemas.canonical(args))
  })
  var request=$security.sha256(schemas.canonical(input)),id="",now=new Date().getTime()
  app.runInTransaction(function(tx){
    var old=arrayOf(new DynamicModel({id:"",request_hash:""}))
    tx.db().newQuery("SELECT id,request_hash FROM agent_studio_tool_grants WHERE owner_uid={:uid} AND run_id={:rid} AND idempotency_key={:key}").bind({uid:uid,rid:runId,key:input.idempotency_key}).all(old)
    if(old.length){if(String(old[0].request_hash)!==request)fault("grant_idempotency_conflict",409);id=String(old[0].id);return}
    id=$security.randomString(20)
    tx.db().newQuery("INSERT INTO agent_studio_tool_grants (id,owner_uid,run_id,tool,adapter_id,config_hash,inputs,input_hashes,max_calls,used_calls,expires_ms,revoked_ms,actor_uid,idempotency_key,request_hash,created_ms) VALUES ({:id},{:uid},{:rid},{:tool},{:adapter},{:config},{:inputs},{:hashes},{:max},0,{:expires},0,{:uid},{:key},{:request},{:now})")
      .bind({id:id,uid:uid,rid:runId,tool:entry.tool,adapter:entry.adapter_id,config:entry.config_hash,inputs:JSON.stringify(input.allowed_inputs),hashes:JSON.stringify(hashes),max:input.max_calls,expires:now+input.expires_in_minutes*60000,key:input.idempotency_key,request:request,now:now}).execute()
  })
  return {grant_id:id}
}
function revoke(app,uid,runId,id){
  ownedRun(app,uid,runId)
  var changed=app.db().newQuery("UPDATE agent_studio_tool_grants SET revoked_ms={:now} WHERE id={:id} AND run_id={:rid} AND owner_uid={:uid} AND revoked_ms=0").bind({id:String(id),rid:runId,uid:uid,now:new Date().getTime()}).execute()
  return {revoked:Number(changed.rowsAffected())===1}
}
function consume(app,uid,runId,step,tool,args){
  var entry=descriptor(app,uid,runId,tool)
  if(!entry)return null
  var hash=$security.sha256(require(__hooks+"/modules/business_schemas.js").canonical(args)),receipt=null,now=new Date().getTime()
  app.runInTransaction(function(tx){
    var previous=arrayOf(new DynamicModel({grant_id:"",input_hash:"",config_hash:""}))
    tx.db().newQuery("SELECT grant_id,input_hash,config_hash FROM agent_studio_tool_grant_uses WHERE run_id={:rid} AND step_index={:step}").bind({rid:runId,step:step}).all(previous)
    if(previous.length){
      if(String(previous[0].input_hash)===hash&&String(previous[0].config_hash)===entry.config_hash){var recovered={grant_id:String(previous[0].grant_id),config_hash:entry.config_hash,input_hash:hash,run_id:runId,step_index:step,tool:tool};if(valid(tx,uid,recovered))receipt=recovered}
      return
    }
    var rows=arrayOf(new DynamicModel({id:"",input_hashes:""}))
    tx.db().newQuery("SELECT id,input_hashes FROM agent_studio_tool_grants WHERE owner_uid={:uid} AND run_id={:rid} AND tool={:tool} AND config_hash={:config} AND revoked_ms=0 AND expires_ms>{:now} AND used_calls<max_calls ORDER BY created_ms,id LIMIT 50").bind({uid:uid,rid:runId,tool:tool,config:entry.config_hash,now:now}).all(rows)
    for(var i=0;i<rows.length;i++){
      if(JSON.parse(String(rows[i].input_hashes)).indexOf(hash)<0)continue
      var id=String(rows[i].id),reserved=tx.db().newQuery("UPDATE agent_studio_tool_grants SET used_calls=used_calls+1 WHERE id={:id} AND used_calls<max_calls AND revoked_ms=0 AND expires_ms>{:now}").bind({id:id,now:now}).execute()
      if(Number(reserved.rowsAffected())!==1)continue
      tx.db().newQuery("INSERT INTO agent_studio_tool_grant_uses (run_id,step_index,grant_id,owner_uid,tool,input_hash,config_hash,created_ms) VALUES ({:rid},{:step},{:id},{:uid},{:tool},{:hash},{:config},{:now})").bind({rid:runId,step:step,id:id,uid:uid,tool:tool,hash:hash,config:entry.config_hash,now:now}).execute()
      receipt={grant_id:id,config_hash:entry.config_hash,input_hash:hash,run_id:runId,step_index:step,tool:tool};break
    }
  })
  return receipt
}
function valid(app,uid,receipt){
  var rows=arrayOf(new DynamicModel({id:""}))
  app.db().newQuery("SELECT g.id FROM agent_studio_tool_grants g JOIN agent_studio_tool_grant_uses u ON u.grant_id=g.id WHERE g.id={:id} AND g.owner_uid={:uid} AND g.run_id={:rid} AND g.tool={:tool} AND g.config_hash={:config} AND g.revoked_ms=0 AND g.expires_ms>{:now} AND u.owner_uid={:uid} AND u.run_id={:rid} AND u.step_index={:step} AND u.input_hash={:hash} AND u.config_hash={:config}")
    .bind({id:receipt.grant_id,uid:uid,rid:receipt.run_id,tool:receipt.tool,config:receipt.config_hash,step:receipt.step_index,hash:receipt.input_hash,now:new Date().getTime()}).all(rows)
  return rows.length===1
}
module.exports={ensure:ensure,adapter:adapter,descriptor:descriptor,list:list,create:create,revoke:revoke,consume:consume,valid:valid}
