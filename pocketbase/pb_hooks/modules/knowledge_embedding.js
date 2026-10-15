"use strict"

// Genuine OpenAI-compatible Embeddings: tenant-scoped, incremental, persisted.
// This code runs in PocketBase Goja and also accepts a mocked HTTP transport.
// No client receives the API key or the raw embedding vectors.
var models = require(__hooks + "/modules/model_connections.js")
var wire = require(__hooks + "/modules/model_wire.js")

function fail(code, status) {
  var error = new Error(code)
  error.code = code
  error.httpStatus = status || 422
  throw error
}

function getSettings(app, owner) {
  var row = new DynamicModel({ connection_id:"", model_name:"", updated_ms:0 })
  try {
    app.db().newQuery("SELECT connection_id,model_name,updated_ms FROM agent_studio_kb_embedding_settings " +
      "WHERE rh_user_id={:uid}").bind({uid:String(owner)}).one(row)
    return { connection_id:String(row.connection_id), model_name:String(row.model_name),
      updated_ms:Number(row.updated_ms) }
  } catch (_) { return null }
}

function assertBase(app, owner, baseId) {
  var bid=String(baseId || "")
  if(!/^[a-zA-Z0-9]{15}$/.test(bid))fail("invalid_base_id",400)
  var row=new DynamicModel({total:0})
  app.db().newQuery("SELECT COUNT(*) AS total FROM agent_studio_kb_bases " +
    "WHERE rh_user_id={:uid} AND id={:bid}").bind({uid:String(owner),bid:bid}).one(row)
  if(!Number(row.total))fail("base_not_found",404)
  return bid
}

function runtimeUrl(baseUrl, runtime) {
  var url=String(baseUrl||"").replace(/\/+$/,"")
  // An approved Embedding destination is required; don't let an employee
  // configure the embedding feature to fetch internal metadata/other services.
  var match=url.match(/^https:\/\/([a-z0-9][a-z0-9.-]*)(?::443)?(\/[a-z0-9._~!$&'()*+,;=:@%\/-]*)?$/i)
  if(match) {
    var host=String(match[1]).toLowerCase()
    if(host==="localhost" || host.endsWith(".localhost") ||
      host.endsWith(".local") || host.endsWith(".internal") ||
      /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.indexOf("..")>=0)
      fail("embedding_endpoint_unapproved",422)
    var configured=String(runtime.envGet("AGENT_STUDIO_EMBEDDING_ALLOWED_HOSTS") || "api.openai.com")
      .toLowerCase().split(",")
    var accepted=false
    for(var i=0;i<configured.length;i++){
      if(configured[i].trim()===host)accepted=true
    }
    if(!accepted)fail("embedding_endpoint_unapproved",422)
    return url
  }
  var local=url.match(/^http:\/\/(127\.0\.0\.1|localhost):([0-9]{2,5})(\/[a-z0-9._~!$&'()*+,;=:@%\/-]*)?$/i)
  if(local && runtime.envGet("AGENT_STUDIO_EMBEDDING_ALLOW_LOOPBACK")==="true") {
    // Server operator must explicitly approve this loopback port. A user
    // must not be allowed to target arbitrary internal HTTP services.
    var ports=String(runtime.envGet("AGENT_STUDIO_EMBEDDING_LOOPBACK_PORTS")||"").split(",")
    for(var j=0;j<ports.length;j++)
      if(ports[j].trim()===String(Number(local[2])))return url
  }
  fail("embedding_endpoint_unapproved",422)
}

function connection(app,owner,setting,runtime) {
  var secret={
    secretKey:String(runtime.envGet("AGENT_STUDIO_SECRET_KEY")||""),
    decrypt:runtime.decrypt,
  }
  var connection=models.lookup(app,owner,setting.connection_id,setting.model_name,secret)
  if(!connection.ok)fail(connection.error || "embedding_connection_invalid",422)
  if(connection.provider!=="openai")fail("embedding_openai_compatible_required",422)
  if(!/^[a-zA-Z0-9_.:\/-]{2,128}$/.test(setting.model_name))
    fail("embedding_model_invalid",422)
  connection.baseUrl=runtimeUrl(connection.baseUrl,runtime)
  return connection
}

// Reuse a sharer's EXISTING indexed vectors. Query embeddings are always
// billed to the searching employee and generated with the employee's own
// connection. Exact model ID + approved provider URL must match to prevent
// dimension/model mixing. No owner key or document is sent to the reader model.
function compatibleSharedModel(app,reader,owner,readerSettings,runtime) {
  if(!readerSettings)return null
  var source=getSettings(app,owner)
  if(!source || source.model_name!==readerSettings.model_name)return null
  try{
    var recipient=connection(app,reader,readerSettings,runtime)
    var original=connection(app,owner,source,runtime)
    return recipient.baseUrl===original.baseUrl?source:null
  }catch(_){return null}
}

function unitVector(values) {
  if(!Array.isArray(values) || values.length<2 || values.length>3072)
    fail("embedding_dimensions_invalid",502)
  var sum=0,arr=[]
  for(var i=0;i<values.length;i++){
    var n=Number(values[i])
    if(typeof values[i]!=="number" || !Number.isFinite(n) || Math.abs(n)>100000)
      fail("embedding_values_invalid",502)
    arr.push(n);sum+=n*n
  }
  if(!Number.isFinite(sum) || sum<1e-16)fail("embedding_zero_vector",502)
  var size=Math.sqrt(sum)
  for(var j=0;j<arr.length;j++) arr[j]=Math.round(arr[j]/size*1e7)/1e7
  return arr
}

function embed(app,owner,settings,input,runtime) {
  if(!Array.isArray(input)||input.length<1||input.length>12)fail("embedding_batch_invalid",400)
  for(var i=0;i<input.length;i++){
    if(typeof input[i]!=="string"||!input[i].trim()||input[i].length>1600)
      fail("embedding_input_invalid",400)
  }
  var conn=connection(app,owner,settings,runtime)
  var response
  try{
    response=runtime.http.send({
      method:"POST",url:conn.baseUrl+"/embeddings",
      headers:{ "Content-Type":"application/json",Authorization:"Bearer "+conn.apiKey },
      body:JSON.stringify({model:settings.model_name,input:input,encoding_format:"float"}),
      timeout:18,
    })
  }catch(_){fail("embedding_provider_unreachable",502)}
  var status=Number((response||{}).statusCode||0)
  if(status===401||status===403)fail("embedding_provider_rejected_key",502)
  if(status===429)fail("embedding_provider_rate_limited",503)
  if(status<200||status>=300)fail("embedding_provider_failed",502)
  var raw=(response||{}).body||""
  if(raw && raw.length!==undefined && raw.length>1500000)
    fail("embedding_response_too_large",502)
  var result
  try{result=JSON.parse(wire.bytesToStr(response))}catch(_){fail("embedding_response_invalid",502)}
  if(!result || !Array.isArray(result.data)||result.data.length!==input.length)
    fail("embedding_response_invalid",502)
  var output=new Array(input.length), dims=0
  for(var j=0;j<result.data.length;j++){
    var entry=result.data[j]||{}
    var idx=Number(entry.index)
    if(!Number.isInteger(idx)||idx<0||idx>=input.length||output[idx])
      fail("embedding_response_invalid",502)
    output[idx]=unitVector(entry.embedding)
    if(dims&&output[idx].length!==dims)fail("embedding_dimensions_mismatch",502)
    dims=output[idx].length
  }
  for(var k=0;k<output.length;k++)if(!output[k])fail("embedding_response_invalid",502)
  return output
}

function status(app,owner,baseId,settings) {
  var bid=assertBase(app,owner,baseId)
  var row=new DynamicModel({total:0,indexed:0})
  var model=settings ? settings.model_name : ""
  var connectionId=settings ? settings.connection_id : ""
  app.db().newQuery(
    "SELECT COUNT(*) AS total, COUNT(v.chunk_id) AS indexed " +
    "FROM agent_studio_kb_chunks c LEFT JOIN agent_studio_kb_vectors v " +
    "ON v.chunk_id=c.id AND v.rh_user_id=c.rh_user_id AND v.base_id=c.base_id " +
    "AND v.connection_id={:connection} AND v.model_name={:model} " +
    "WHERE c.rh_user_id={:uid} AND c.base_id={:bid}"
  ).bind({connection:connectionId,model:model,uid:owner,bid:bid}).one(row)
  var total=Number(row.total), indexed=Number(row.indexed)
  var queue = new DynamicModel({attempts:0,last_error:"",next_attempt_ms:0,lease_until_ms:0})
  var queued=false
  try{
    app.db().newQuery("SELECT attempts,last_error,next_attempt_ms,lease_until_ms " +
      "FROM agent_studio_kb_embedding_queue WHERE rh_user_id={:uid} AND base_id={:bid}")
      .bind({uid:owner,bid:bid}).one(queue)
    queued=true
  }catch(_){}
  return {
    base_id:bid,configured:!!settings,model_name:settings?settings.model_name:"",
    total_chunks:total,indexed_chunks:indexed,pending_chunks:Math.max(0,total-indexed),
    ready:!!settings&&total===indexed,queued:queued,
    indexing:queued&&Number(queue.lease_until_ms)>new Date().getTime(),
    retries:queued?Number(queue.attempts):0,
    last_error:queued?String(queue.last_error||""):"",
    retry_at_ms:queued?Number(queue.next_attempt_ms):0,
  }
}

function enqueue(app,owner,baseId) {
  app.db().newQuery(
    "INSERT INTO agent_studio_kb_embedding_queue(rh_user_id,base_id,updated_ms) " +
    "VALUES({:uid},{:bid},{:now}) ON CONFLICT(rh_user_id,base_id) DO UPDATE SET " +
    "attempts=0,next_attempt_ms=0,last_error='',updated_ms=excluded.updated_ms"
  ).bind({uid:owner,bid:baseId,now:new Date().getTime()}).execute()
}

function saveSettings(app,owner,connectionId,modelName,runtime) {
  var setting={connection_id:String(connectionId||""),model_name:String(modelName||"").trim()}
  if(!/^[a-zA-Z0-9]{15}$/.test(setting.connection_id))fail("invalid_connection_id",400)
  connection(app,owner,setting,runtime)
  var previous=getSettings(app,owner)
  var changed=!previous||previous.connection_id!==setting.connection_id||
    previous.model_name!==setting.model_name
  if(!changed)return {ok:true,changed:false,settings:setting}
  app.runInTransaction(function(tx) {
    tx.db().newQuery(
      "INSERT INTO agent_studio_kb_embedding_settings(rh_user_id,connection_id,model_name,updated_ms) " +
      "VALUES({:uid},{:cid},{:model},{:now}) ON CONFLICT(rh_user_id) DO UPDATE SET " +
      "connection_id=excluded.connection_id,model_name=excluded.model_name,updated_ms=excluded.updated_ms"
    ).bind({uid:owner,cid:setting.connection_id,model:setting.model_name,now:new Date().getTime()}).execute()
    tx.db().newQuery("DELETE FROM agent_studio_kb_vectors WHERE rh_user_id={:uid}")
      .bind({uid:owner}).execute()
    tx.db().newQuery("DELETE FROM agent_studio_kb_embedding_queue WHERE rh_user_id={:uid}")
      .bind({uid:owner}).execute()
    tx.db().newQuery(
      "INSERT INTO agent_studio_kb_embedding_queue(rh_user_id,base_id,updated_ms) " +
      "SELECT rh_user_id,id,{:now} FROM agent_studio_kb_bases WHERE rh_user_id={:uid}"
    ).bind({now:new Date().getTime(),uid:owner}).execute()
  })
  return {ok:true,changed:true,settings:setting}
}

function disable(app,owner) {
  app.runInTransaction(function(tx) {
    tx.db().newQuery("DELETE FROM agent_studio_kb_embedding_settings WHERE rh_user_id={:uid}")
      .bind({uid:owner}).execute()
    tx.db().newQuery("DELETE FROM agent_studio_kb_vectors WHERE rh_user_id={:uid}")
      .bind({uid:owner}).execute()
    tx.db().newQuery("DELETE FROM agent_studio_kb_embedding_queue WHERE rh_user_id={:uid}")
      .bind({uid:owner}).execute()
  })
  return {ok:true,configured:false}
}

function rebuild(app,owner,baseId) {
  var bid=assertBase(app,owner,baseId)
  var config=getSettings(app,owner)
  if(!config)fail("embedding_not_configured",409)
  app.runInTransaction(function(tx){
    tx.db().newQuery("DELETE FROM agent_studio_kb_vectors " +
      "WHERE rh_user_id={:uid} AND base_id={:bid}")
      .bind({uid:owner,bid:bid}).execute()
    tx.db().newQuery("DELETE FROM agent_studio_kb_embedding_queue " +
      "WHERE rh_user_id={:uid} AND base_id={:bid}")
      .bind({uid:owner,bid:bid}).execute()
    enqueue(tx,owner,bid)
  })
  return {ok:true,progress:status(app,owner,bid,config)}
}

function indexBatch(app,owner,baseId,runtime,requestedLimit) {
  var uid=String(owner||"")
  var bid=assertBase(app,uid,baseId)
  var settings=getSettings(app,uid)
  if(!settings)fail("embedding_not_configured",409)
  var limit=requestedLimit===undefined?8:Number(requestedLimit)
  if(!Number.isInteger(limit)||limit<1||limit>12)fail("embedding_batch_invalid",400)
  var rows=arrayOf(new DynamicModel({chunk_id:"",document_id:"",text_content:""}))
  app.db().newQuery(
    "SELECT c.id AS chunk_id,c.document_id,c.text_content FROM agent_studio_kb_chunks c " +
    "JOIN agent_studio_kb_documents d ON d.id=c.document_id AND d.rh_user_id=c.rh_user_id " +
    "AND d.base_id=c.base_id WHERE c.rh_user_id={:uid} AND c.base_id={:bid} AND NOT EXISTS(" +
    "SELECT 1 FROM agent_studio_kb_vectors v WHERE v.chunk_id=c.id AND v.rh_user_id=c.rh_user_id " +
    "AND v.connection_id={:cid} AND v.model_name={:model}) " +
    "ORDER BY d.created_ms,c.chunk_index LIMIT "+limit
  ).bind({uid:uid,bid:bid,cid:settings.connection_id,model:settings.model_name}).all(rows)
  if(!rows.length){
    // Empty bases and already indexed bases must NOT be scheduled forever.
    // Returning idle without removing their queue entry would busy-loop the
    // Worker, even if no Embedding call was needed.
    var emptyProgress=status(app,uid,bid,settings)
    if(emptyProgress.pending_chunks===0){
      app.db().newQuery(
        "DELETE FROM agent_studio_kb_embedding_queue WHERE rh_user_id={:uid} AND base_id={:bid}"
      ).bind({uid:uid,bid:bid}).execute()
      emptyProgress=status(app,uid,bid,settings)
    }
    return {ok:true,indexed_batch:0,progress:emptyProgress}
  }
  var inputs=[]
  for(var i=0;i<rows.length;i++)inputs.push(String(rows[i].text_content))
  var vectors=embed(app,uid,settings,inputs,runtime)
  app.runInTransaction(function(tx){
    var current=getSettings(tx,uid)
    if(!current||current.connection_id!==settings.connection_id||
       current.model_name!==settings.model_name) fail("embedding_config_changed",409)
    for(var j=0;j<rows.length;j++){
      // Ingest/deletion may have happened during HTTP: do not resurrect missing chunks.
      var exists=new DynamicModel({total:0})
      tx.db().newQuery("SELECT COUNT(*) AS total FROM agent_studio_kb_chunks " +
        "WHERE id={:id} AND rh_user_id={:uid} AND base_id={:bid} AND document_id={:did}")
        .bind({id:String(rows[j].chunk_id),uid:uid,bid:bid,did:String(rows[j].document_id)}).one(exists)
      if(!Number(exists.total))continue
      tx.db().newQuery(
        "INSERT INTO agent_studio_kb_vectors(chunk_id,rh_user_id,base_id,document_id,connection_id," +
        "model_name,dimensions,vector_json,indexed_ms) " +
        "VALUES({:id},{:uid},{:bid},{:did},{:cid},{:model},{:dim},{:vector},{:now}) " +
        "ON CONFLICT(chunk_id) DO UPDATE SET connection_id=excluded.connection_id," +
        "model_name=excluded.model_name,dimensions=excluded.dimensions,vector_json=excluded.vector_json," +
        "indexed_ms=excluded.indexed_ms"
      ).bind({id:String(rows[j].chunk_id),uid:uid,bid:bid,did:String(rows[j].document_id),
        cid:settings.connection_id,model:settings.model_name,
        dim:vectors[j].length,vector:JSON.stringify(vectors[j]),now:new Date().getTime()}).execute()
    }
  })
  var progress=status(app,uid,bid,settings)
  if(progress.pending_chunks===0){
    app.db().newQuery("DELETE FROM agent_studio_kb_embedding_queue WHERE rh_user_id={:uid} AND base_id={:bid}")
      .bind({uid:uid,bid:bid}).execute()
  }
  return {ok:true,indexed_batch:vectors.length,progress:progress}
}

// Manual indexing and background Worker share the same per-base SQL lease.
// This blocks concurrent Embedding requests against identical pending chunks,
// preventing duplicate paid API calls from double-clicks or Worker overlap.
function manualIndexBatch(app,owner,baseId,runtime,requestedLimit) {
  var uid=String(owner||"")
  var bid=assertBase(app,uid,baseId)
  var settings=getSettings(app,uid)
  if(!settings)fail("embedding_not_configured",409)
  var progress=status(app,uid,bid,settings)
  if(progress.pending_chunks===0){
    return {ok:true,indexed_batch:0,progress:progress}
  }
  if(!progress.queued)enqueue(app,uid,bid)
  var now=new Date().getTime()
  var result=app.db().newQuery(
    "UPDATE agent_studio_kb_embedding_queue SET lease_until_ms={:expiry} " +
    "WHERE rh_user_id={:uid} AND base_id={:bid} AND lease_until_ms<={:now}"
  ).bind({expiry:now+90000,uid:uid,bid:bid,now:now}).execute()
  if(Number(result.rowsAffected())!==1)fail("embedding_index_busy",409)
  try{
    return indexBatch(app,uid,bid,runtime,requestedLimit)
  }finally{
    // A completed indexBatch deletes its empty queue; this UPDATE is a no-op
    // in that case. Otherwise make remaining chunks available immediately.
    app.db().newQuery(
      "UPDATE agent_studio_kb_embedding_queue SET lease_until_ms=0 " +
      "WHERE rh_user_id={:uid} AND base_id={:bid}"
    ).bind({uid:uid,bid:bid}).execute()
  }
}

function processWorker(app,runtime) {
  var now=new Date().getTime()
  var row=new DynamicModel({rh_user_id:"",base_id:"",attempts:0})
  try{
    app.db().newQuery(
      "SELECT q.rh_user_id,q.base_id,q.attempts FROM agent_studio_kb_embedding_queue q " +
      "JOIN agent_studio_kb_embedding_settings s ON s.rh_user_id=q.rh_user_id " +
      "JOIN agent_studio_kb_bases b ON b.id=q.base_id AND b.rh_user_id=q.rh_user_id " +
      "WHERE q.lease_until_ms<={:now} AND q.next_attempt_ms<={:now} " +
      "ORDER BY q.updated_ms,q.base_id LIMIT 1"
    ).bind({now:now}).one(row)
  }catch(_){return {ok:true,idle:true}}
  var owner=String(row.rh_user_id),bid=String(row.base_id)
  // Atomically claim a short lease. A restarted worker may safely retry:
  // indexing upserts by chunk_id and never sends external side effects.
  var claimed=app.db().newQuery(
    "UPDATE agent_studio_kb_embedding_queue SET lease_until_ms={:expiry} " +
    "WHERE rh_user_id={:uid} AND base_id={:bid} AND lease_until_ms<={:now} AND next_attempt_ms<={:now}"
  ).bind({expiry:now+90000,uid:owner,bid:bid,now:now}).execute()
  if(Number(claimed.rowsAffected())!==1)return {ok:true,idle:true}
  try {
    var response=indexBatch(app,owner,bid,runtime,8)
    if(response.progress.pending_chunks>0){
      app.db().newQuery("UPDATE agent_studio_kb_embedding_queue SET lease_until_ms=0," +
        "attempts=0,next_attempt_ms=0,last_error='',updated_ms={:now} " +
        "WHERE rh_user_id={:uid} AND base_id={:bid}")
        .bind({uid:owner,bid:bid,now:new Date().getTime()}).execute()
    }
    return {ok:true,idle:false,indexed_batch:response.indexed_batch,
      pending_chunks:response.progress.pending_chunks}
  }catch(err){
    var code=String((err&&err.code)||"embedding_index_failed").slice(0,80)
    var attempts=Math.min(12,Number(row.attempts||0)+1)
    var delay=Math.min(600000,5000*Math.pow(2,Math.min(attempts,7)))
    app.db().newQuery("UPDATE agent_studio_kb_embedding_queue SET lease_until_ms=0," +
      "attempts={:attempts},next_attempt_ms={:next},last_error={:error},updated_ms={:now} " +
      "WHERE rh_user_id={:uid} AND base_id={:bid}")
      .bind({attempts:attempts,next:new Date().getTime()+delay,error:code,
        now:new Date().getTime(),uid:owner,bid:bid}).execute()
    return {ok:true,idle:false,indexed_batch:0,failed:true,error:code}
  }
}

// Called only inside a PocketBase request callback, never from the browser.
function gojaRuntime() {
  return {
    http:$http,
    envGet:function(key){return $os.getenv(key)},
    decrypt:function(payload,key){return $security.decrypt(payload,key)},
  }
}

module.exports={
  fail:fail,getSettings:getSettings,assertBase:assertBase,runtimeUrl:runtimeUrl,
  compatibleSharedModel:compatibleSharedModel,
  unitVector:unitVector,embed:embed,status:status,enqueue:enqueue,
  saveSettings:saveSettings,disable:disable,rebuild:rebuild,indexBatch:indexBatch,manualIndexBatch:manualIndexBatch,processWorker:processWorker,
  gojaRuntime:gojaRuntime,
}
