// Owner-only permission controls. Never registered as an Agent/MCP tool.
var PROTOCOL = 'permissions-v2'
var REV = /^[a-f0-9]{24}$/
var ID = /^[A-Za-z0-9]{24}$/
function local() { return require(__hooks + '/modules/local_devices.js') }
function fail(code) { throw Error(code) }
function exact(obj, keys) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) fail('invalid_control_request')
  Object.keys(obj).forEach(function(k) { if (keys.indexOf(k) < 0) fail('invalid_control_request') })
}
function capabilities(value, readOnly) {
  if(value===undefined)return {edit:false,move:false,delete:false,open:false}
  exact(value,['edit','move','delete','open'])
  if(Object.keys(value).length!==4||['edit','move','delete','open'].some(function(k){return typeof value[k]!=='boolean'})||readOnly&&(value.edit||value.move||value.delete))fail('invalid_file_capabilities')
  return {edit:value.edit,move:value.move,delete:value.delete,open:value.open}
}
function origins(values) {
  if (!Array.isArray(values) || values.length > 12) fail('invalid_origins')
  var seen = {}, out = []
  values.forEach(function(value) {
    // PocketBase's JSVM is not a browser; don't depend on the global URL class.
    if (typeof value !== 'string' || value.length > 500) fail('invalid_origin')
    var m = /^(https?):\/\/([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:]+\])(?::([0-9]{1,5}))?$/.exec(value)
    if (!m || m[3] && (Number(m[3]) < 1 || Number(m[3]) > 65535 || String(Number(m[3])) !== m[3]) || m[3] === (m && m[1] === 'https' ? '443' : '80')) fail('invalid_origin')
    if (!seen[value]) { seen[value] = true; out.push(value) }
  })
  return out
}
function sanitizeSummary(value) {
  exact(value, ['protocol','version','revision','applied_revision','sites','grants','state'])
  if (value.protocol !== PROTOCOL || !/^[0-9a-z.-]{1,40}$/.test(value.version || '') || !REV.test(value.revision || '') || value.applied_revision !== '' && !REV.test(value.applied_revision || '') || ['online','applying','needs-check'].indexOf(value.state) < 0) fail('invalid_control_summary')
  if (!Array.isArray(value.grants) || value.grants.length > 20) fail('invalid_control_summary')
  var seen = {}
  var grants = value.grants.map(function(g) {
    exact(g,['id','label','kind','read_only','capabilities'])
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(g.id || '') || seen[g.id] || typeof g.label !== 'string' || !g.label || g.label.length > 180 || /[\x00-\x1f]/.test(g.label) || ['file','folder'].indexOf(g.kind) < 0 || typeof g.read_only !== 'boolean' || g.kind === 'file' && !g.read_only) fail('invalid_control_summary')
    seen[g.id] = true
    return {id:g.id,label:g.label,kind:g.kind,read_only:g.read_only,capabilities:capabilities(g.capabilities,g.read_only||g.kind==='file')}
  })
  return {protocol:PROTOCOL,version:value.version,revision:value.revision,applied_revision:value.applied_revision,sites:origins(value.sites),grants:grants,state:value.state}
}
function expire(app) {
  app.db().newQuery("UPDATE studio_local_controls SET status=CASE WHEN status='committing' THEN 'unknown' ELSE 'expired' END,error='control_expired' WHERE status IN ('queued','running','committing') AND deadline_ms<{:now}").bind({now:Date.now()}).execute()
}
function getState(app, deviceId, owner) {
  local().device(app,deviceId,owner)
  var rows = arrayOf(new DynamicModel({info:'',seen_ms:0}))
  app.db().newQuery('SELECT info,seen_ms FROM studio_local_control_state WHERE device_id={:id} AND owner={:owner}').bind({id:deviceId,owner:owner}).all(rows)
  if (!rows.length) return {available:false,reason:'connector_update_required'}
  var info = sanitizeSummary(JSON.parse(rows[0].info))
  info.available = Date.now() - Number(rows[0].seen_ms) < 45000
  info.seen_ms = Number(rows[0].seen_ms)
  info.device_id = deviceId
  return info
}
function report(app, d, raw) {
  var value = sanitizeSummary(raw)
  app.db().newQuery('INSERT INTO studio_local_control_state(device_id,owner,info,seen_ms) VALUES({:id},{:owner},{:info},{:now}) ON CONFLICT(device_id) DO UPDATE SET info=excluded.info,seen_ms=excluded.seen_ms WHERE owner=excluded.owner').bind({id:d.id,owner:d.owner,info:JSON.stringify(value),now:Date.now()}).execute()
  return value
}
function row(app,id,owner) {
  if (!ID.test(id)) fail('control_not_found')
  return local().row(app,'SELECT id,device_id,action,payload,status,result,error,claim_hash,deadline_ms,created_ms FROM studio_local_controls WHERE id={:id} AND owner={:owner}',{id:id,owner:owner},{id:'',device_id:'',action:'',payload:'',status:'',result:'',error:'',claim_hash:'',deadline_ms:0,created_ms:0})
}
function publicRow(r) { return {id:r.id,device_id:r.device_id,action:r.action,status:r.status,result:r.result,error:r.error,deadline_ms:Number(r.deadline_ms),created_ms:Number(r.created_ms)} }
function enqueue(app, owner, deviceId, b) {
  var fields = { 'sites-save':['origins'], 'file-pick':['kind'], 'grant-save':['grant_id','read_only','capabilities'], 'grant-edit':['root_id','read_only','remove','capabilities'] }
  if (!Object.prototype.hasOwnProperty.call(fields,b.action || '')) fail('invalid_control_request')
  exact(b,['action','request_id','permission_revision','confirm'].concat(fields[b.action]))
  if (!ID.test(deviceId) || !/^[a-zA-Z0-9-]{16,80}$/.test(b.request_id || '') || !REV.test(b.permission_revision || '') || b.confirm !== true) fail('invalid_control_request')
  var payload = {permission_revision:b.permission_revision}
  if (b.action === 'sites-save') payload.origins = origins(b.origins)
  else if (b.action === 'file-pick') { if (['file','folder'].indexOf(b.kind) < 0) fail('invalid_control_request'); payload.kind = b.kind }
  else if (b.action === 'grant-save') { if (!REV.test(b.grant_id || '') || typeof b.read_only !== 'boolean') fail('invalid_control_request'); payload.grant_id=b.grant_id;payload.read_only=b.read_only;if(b.capabilities!==undefined)payload.capabilities=capabilities(b.capabilities,b.read_only) }
  else { if (!/^[A-Za-z0-9_-]{1,80}$/.test(b.root_id || '') || (b.remove===true ? b.read_only!==undefined||b.capabilities!==undefined : typeof b.read_only!=='boolean' || b.remove!==undefined)) fail('invalid_control_request');payload.root_id=b.root_id;if(b.remove===true)payload.remove=true;else {payload.read_only=b.read_only;if(b.capabilities!==undefined)payload.capabilities=capabilities(b.capabilities,b.read_only)} }
  var result
  app.runInTransaction(function(tx) {
    local().device(tx,deviceId,owner);expire(tx)
    var key=owner+':'+b.request_id, encoded=local().canonical(payload)
    var old=arrayOf(new DynamicModel({id:'',device_id:'',action:'',payload:''}))
    tx.db().newQuery('SELECT id,device_id,action,payload FROM studio_local_controls WHERE request_id={:key}').bind({key:key}).all(old)
    if(old.length){if(old[0].device_id!==deviceId||old[0].action!==b.action||old[0].payload!==encoded)fail('request_identity_conflict');result={id:old[0].id};return}
    var meta=getState(tx,deviceId,owner)
    if (!meta.available) fail('connector_update_or_offline')
    if (meta.revision!==b.permission_revision || meta.applied_revision!==meta.revision) fail('permission_revision_changed')
    if(b.action==='grant-edit'){
      var grant=meta.grants.filter(function(g){return g.id===b.root_id})[0]
      if(!grant)fail('invalid_control_request')
      if(b.remove!==true){
        if(grant.kind==='file'&&!b.read_only)fail('invalid_control_request')
        if(b.capabilities===undefined&&(grant.capabilities.edit||grant.capabilities.move||grant.capabilities.delete||grant.capabilities.open))fail('file_capabilities_required')
      }
    }
    var busy=arrayOf(new DynamicModel({id:''}))
    tx.db().newQuery("SELECT id FROM studio_local_jobs WHERE device_id={:id} AND status='running' AND deadline_ms>{:now} UNION ALL SELECT id FROM studio_local_controls WHERE device_id={:id} AND status IN ('queued','running','committing') LIMIT 1").bind({id:deviceId,now:Date.now()}).all(busy)
    if(busy.length)fail('device_busy')
    var id=$security.randomString(24)
    tx.db().newQuery("INSERT INTO studio_local_controls(id,owner,device_id,request_id,action,payload,status,created_ms,deadline_ms) VALUES({:id},{:owner},{:device},{:request},{:action},{:payload},'queued',{:now},{:deadline})").bind({id:id,owner:owner,device:deviceId,request:key,action:b.action,payload:encoded,now:Date.now(),deadline:Date.now()+240000}).execute()
    result={id:id}
  });return result
}
function poll(app,d,body) {
  exact(body,['summary','heartbeat_only']);var out={control:null}
  app.runInTransaction(function(tx){
    local().device(tx,d.id,d.owner);expire(tx);var info=report(tx,d,body.summary)
    // A validated control heartbeat also keeps the device online during a native dialog.
    if(info.state==='online'&&info.applied_revision===info.revision)tx.db().newQuery('UPDATE studio_local_devices SET seen_ms={:now} WHERE id={:id} AND owner={:owner} AND revoked=0').bind({now:Date.now(),id:d.id,owner:d.owner}).execute()
    if(body.heartbeat_only===true)return
    var jobs=arrayOf(new DynamicModel({id:''}))
    tx.db().newQuery("SELECT id FROM studio_local_jobs WHERE device_id={:id} AND status='running' AND deadline_ms>{:now} UNION ALL SELECT id FROM studio_local_controls WHERE device_id={:id} AND status IN ('running','committing') LIMIT 1").bind({id:d.id,now:Date.now()}).all(jobs)
    if(jobs.length)return
    var rows=arrayOf(new DynamicModel({id:'',action:'',payload:'',deadline_ms:0}))
    tx.db().newQuery("SELECT id,action,payload,deadline_ms FROM studio_local_controls WHERE device_id={:id} AND owner={:owner} AND status='queued' ORDER BY created_ms LIMIT 1").bind({id:d.id,owner:d.owner}).all(rows)
    if(!rows.length)return
    var claim=$security.randomString(48)
    tx.db().newQuery("UPDATE studio_local_controls SET status='running',claim_hash={:claim} WHERE id={:id} AND status='queued'").bind({claim:$security.sha256(claim),id:rows[0].id}).execute()
    out.control={id:rows[0].id,action:rows[0].action,payload:JSON.parse(rows[0].payload),claim:claim,deadline_ms:Number(rows[0].deadline_ms)}
  });return out
}
function claimed(app,d,b) {
  var r=row(app,b.id,d.owner)
  if(r.device_id!==d.id||typeof b.claim!=='string'||b.claim.length!==48||r.claim_hash!==$security.sha256(b.claim))fail('control_claim_denied')
  return r
}
function check(app,d,b) {
  local().device(app,d.id,d.owner);expire(app);var r=claimed(app,d,b)
  return {active:r.status==='running'&&Number(r.deadline_ms)>Date.now(),status:r.status}
}
function commit(app,d,b) {
  var out
  app.runInTransaction(function(tx){local().device(tx,d.id,d.owner);expire(tx);var r=claimed(tx,d,b)
    if(r.status!=='running'||Number(r.deadline_ms)<=Date.now())fail('control_no_longer_active')
    var meta=getState(tx,d.id,d.owner)
    if(meta.revision!==JSON.parse(r.payload).permission_revision)fail('permission_revision_changed')
    tx.db().newQuery("UPDATE studio_local_controls SET status='committing',deadline_ms={:deadline} WHERE id={:id} AND status='running'").bind({id:r.id,deadline:Date.now()+30000}).execute();out={ok:true}
  });return out
}
function complete(app,d,b) {
  exact(b,['id','claim','ok','cancelled','result'])
  if(typeof b.ok!=='boolean'||typeof b.result!=='string'||b.result.length>12000||b.cancelled!==undefined&&typeof b.cancelled!=='boolean'||b.ok&&b.cancelled===true)fail('invalid_control_result')
  var out
  app.runInTransaction(function(tx){local().device(tx,d.id,d.owner);expire(tx);var r=claimed(tx,d,b)
    var status=b.cancelled===true?'cancelled':b.ok?'succeeded':'failed'
    var error=b.ok||b.cancelled===true?'':'local_confirmation_failed'
    if(['succeeded','failed','cancelled'].indexOf(r.status)>=0){
      if(r.status!==status||r.result!==b.result||r.error!==error)fail('control_result_conflict')
      out={ok:true};return
    }
    if(r.status==='unknown'){
      // A late receipt proves a saved version or exact unchanged scope; it never reruns authorization.
      if(b.cancelled===true||r.action==='file-pick')fail('control_no_longer_active')
      var saved;try{saved=JSON.parse(b.result)}catch(_){fail('invalid_control_result')}
      if(!saved||!REV.test(saved.revision||''))fail('invalid_control_result')
      var originalRevision=JSON.parse(r.payload).permission_revision
      var savedNew=b.ok&&saved.saved===true&&saved.revision!==originalRevision
      var unchanged=!b.ok&&saved.saved===false&&saved.revision===originalRevision
      if(!savedNew&&!unchanged)fail('invalid_control_result')
      var meta=getState(tx,d.id,d.owner)
      if(!meta.available||meta.revision!==saved.revision||unchanged&&(meta.applied_revision!==originalRevision||meta.state!=='online'))fail('control_saved_revision_unverified')
    }else{
      if(['running','committing'].indexOf(r.status)<0)fail('control_no_longer_active')
      if(b.ok&&r.action!=='file-pick'&&r.status!=='committing')fail('control_commit_required')
    }
    tx.db().newQuery('UPDATE studio_local_controls SET status={:status},result={:result},error={:error} WHERE id={:id}').bind({id:r.id,status:status,result:b.result,error:error}).execute();out={ok:true}
  });return out
}
function cancel(app,owner,id) {
  var out
  app.runInTransaction(function(tx){expire(tx);var r=row(tx,id,owner);local().device(tx,r.device_id,owner)
    if(r.status==='committing'||r.status==='unknown')fail('control_already_applying')
    if(r.status==='queued'||r.status==='running')tx.db().newQuery("UPDATE studio_local_controls SET status='cancelled',error='user_cancelled' WHERE id={:id}").bind({id:id}).execute()
    out=publicRow(row(tx,id,owner))
  });return out
}
module.exports={origins:origins,getState:getState,enqueue:enqueue,poll:poll,check:check,commit:commit,complete:complete,cancel:cancel,expire:expire,row:row,publicRow:publicRow}
