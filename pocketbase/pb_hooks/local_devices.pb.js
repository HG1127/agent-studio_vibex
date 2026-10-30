// Additive, private SQLite tables. Never exposed through collection APIs.
onBootstrap(function(e) {
  e.next()
  $app.db().newQuery("CREATE TABLE IF NOT EXISTS studio_local_devices (id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL," +
    "pair_hash TEXT UNIQUE,pair_until INTEGER NOT NULL,token_hash TEXT UNIQUE,revoked INTEGER NOT NULL DEFAULT 0,seen_ms INTEGER NOT NULL DEFAULT 0,catalog TEXT NOT NULL DEFAULT '[]')").execute()
  $app.db().newQuery("CREATE TABLE IF NOT EXISTS studio_local_jobs (id TEXT PRIMARY KEY,owner TEXT NOT NULL,device_id TEXT NOT NULL,run_id TEXT NOT NULL DEFAULT ''," +
    "job_key TEXT UNIQUE NOT NULL,args_hash TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL,created_ms INTEGER NOT NULL,deadline_ms INTEGER NOT NULL," +
    "claim_hash TEXT NOT NULL DEFAULT '',result TEXT NOT NULL DEFAULT '',error TEXT NOT NULL DEFAULT '')").execute()
  $app.db().newQuery("CREATE INDEX IF NOT EXISTS studio_local_jobs_device ON studio_local_jobs(device_id,status,created_ms)").execute()
  $app.db().newQuery("CREATE TABLE IF NOT EXISTS studio_local_setup_progress (device_id TEXT PRIMARY KEY,pair_hash TEXT NOT NULL,attempt_id TEXT NOT NULL,sequence INTEGER NOT NULL,stage TEXT NOT NULL,updated_ms INTEGER NOT NULL)").execute()
  // Separate owner-authorized UI control channel. These requests never enter the Agent tool catalog/job queue.
  $app.db().newQuery("CREATE TABLE IF NOT EXISTS studio_local_controls (id TEXT PRIMARY KEY,owner TEXT NOT NULL,device_id TEXT NOT NULL,request_id TEXT UNIQUE NOT NULL,action TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL,claim_hash TEXT NOT NULL DEFAULT '',result TEXT NOT NULL DEFAULT '',error TEXT NOT NULL DEFAULT '',created_ms INTEGER NOT NULL,deadline_ms INTEGER NOT NULL)").execute()
  $app.db().newQuery("CREATE INDEX IF NOT EXISTS studio_local_controls_device ON studio_local_controls(device_id,status,created_ms)").execute()
})

routerAdd("GET", "/api/local-devices", function(e) {
  var user = require(__hooks + "/modules/studio_auth_helpers.js").currentUser(e)
  if (!user) return e.json(401, { error: "studio_login_required" })
  // Return binding state, not credentials. A paired device may not have sent
  // its first heartbeat yet; that is not an unused/expired pairing ticket.
  var rows = arrayOf(new DynamicModel({ id: "", name: "", revoked: false, seen_ms: 0, catalog: "", paired: false, pairing_expires_ms: 0, setup_stage: "", setup_seen_ms: 0 }))
  $app.db().newQuery("SELECT d.id,d.name,d.revoked,d.seen_ms,d.catalog,CASE WHEN d.token_hash IS NOT NULL AND d.revoked=0 THEN 1 ELSE 0 END AS paired," +
    "CASE WHEN d.token_hash IS NULL AND d.revoked=0 THEN d.pair_until ELSE 0 END AS pairing_expires_ms," +
    "CASE WHEN d.token_hash IS NULL AND d.revoked=0 AND p.pair_hash=d.pair_hash THEN p.stage ELSE '' END AS setup_stage," +
    "CASE WHEN d.token_hash IS NULL AND d.revoked=0 AND p.pair_hash=d.pair_hash THEN p.updated_ms ELSE 0 END AS setup_seen_ms " +
    "FROM studio_local_devices d LEFT JOIN studio_local_setup_progress p ON p.device_id=d.id WHERE d.owner={:owner} ORDER BY d.name LIMIT 100")
    .bind({ owner: user.id }).all(rows)
  return e.json(200, { items: rows })
})
routerAdd("POST", "/api/local-devices", function(e) {
  var user = require(__hooks + "/modules/studio_auth_helpers.js").currentUser(e)
  if (!user) return e.json(401, { error: "studio_login_required" })
  var name = String((e.requestInfo().body || {}).name || "我的电脑").trim().slice(0, 80)
  var id = $security.randomString(24), code = $security.randomString(48), until = Date.now() + 300000
  $app.db().newQuery("INSERT INTO studio_local_devices(id,owner,name,pair_hash,pair_until) VALUES({:id},{:owner},{:name},{:hash},{:until})")
    .bind({ id: id, owner: user.id, name: name, hash: $security.sha256(code), until: until }).execute()
  return e.json(201, { id: id, pairing_code: code, expires_ms: until })
})
// Renew only an unused own pairing; never rotate an existing live device token.
routerAdd("POST", "/api/local-devices/{id}/renew-pairing", function(e) {
  var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e)
  if(!user)return e.json(401,{error:"studio_login_required"})
  var id=e.request.pathValue("id"),code=$security.randomString(48),until=Date.now()+300000
  var result=$app.db().newQuery("UPDATE studio_local_devices SET pair_hash={:hash},pair_until={:until} WHERE id={:id} AND owner={:owner} AND revoked=0 AND token_hash IS NULL")
    .bind({hash:$security.sha256(code),until:until,id:id,owner:user.id}).execute()
  if(Number(result.rowsAffected())!==1)return e.json(409,{error:"pairing_not_renewable"})
  return e.json(200,{id:id,pairing_code:code,expires_ms:until})
})

routerAdd("POST", "/api/local-devices/{id}/revoke", function(e) {
  var user = require(__hooks + "/modules/studio_auth_helpers.js").currentUser(e)
  if (!user) return e.json(401, { error: "studio_login_required" })
  var id = e.request.pathValue("id")
  $app.runInTransaction(function(tx) {
    tx.db().newQuery("UPDATE studio_local_devices SET revoked=1,token_hash=NULL,pair_hash=NULL WHERE id={:id} AND owner={:owner}")
      .bind({ id: id, owner: user.id }).execute()
    tx.db().newQuery("UPDATE studio_local_jobs SET status='cancelled',error='device_revoked' WHERE device_id={:id} AND owner={:owner} AND status IN ('queued','running')")
      .bind({ id: id, owner: user.id }).execute()
  })
  return e.json(200, { ok: true })
})
routerAdd("POST", "/api/local-devices/{id}/jobs", function(e) {
  var user = require(__hooks + "/modules/studio_auth_helpers.js").currentUser(e)
  if (!user) return e.json(401, { error: "studio_login_required" })
  var b = e.requestInfo().body || {}
  if (b.confirm !== true) return e.json(409, { error: "local_approval_required" })
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(b.request_id || "")) return e.json(400, { error: "invalid_request_id" })
  try {
    var id = require(__hooks + "/modules/local_devices.js").enqueue($app, user.id, e.request.pathValue("id"), b, "manual:" + user.id + ":" + b.request_id, "")
    return e.json(201, { id: id })
  } catch (_) { return e.json(409, { error: "local_device_unavailable_or_tool_denied" }) }
})
// Permission-management routes are implemented in workbench_controls.pb.js.
routerAdd("GET", "/api/local-jobs/{id}", function(e) {
  var user = require(__hooks + "/modules/studio_auth_helpers.js").currentUser(e)
  if (!user) return e.json(401, { error: "studio_login_required" })
  try { return e.json(200, require(__hooks + "/modules/local_devices.js").job($app, user.id, e.request.pathValue("id"))) }
  catch (_) { return e.json(404, { error: "job_not_found" }) }
})
routerAdd("POST", "/api/local-jobs/{id}/cancel", function(e) {
  var user = require(__hooks + "/modules/studio_auth_helpers.js").currentUser(e)
  if (!user) return e.json(401, { error: "studio_login_required" })
  $app.db().newQuery("UPDATE studio_local_jobs SET status='cancelled',error='user_cancelled' WHERE id={:id} AND owner={:owner} AND status IN ('queued','running')")
    .bind({ id: e.request.pathValue("id"), owner: user.id }).execute()
  return e.json(200, { ok: true })
})

// Public namespace only bypasses employee JWT middleware. Each executor route
// below authenticates a single-use pairing secret or a revocable device token.
routerAdd("POST", "/api/public/local-executor/setup-progress/context", function(e) {
  try{return e.json(200,require(__hooks + "/modules/local_setup_progress.js").context($app,e.requestInfo().body||{}))}
  catch(error){return e.json(String(error.message)==="invalid_setup_progress"?400:401,{error:"setup_progress_unavailable"})}
})
routerAdd("POST", "/api/public/local-executor/setup-progress", function(e) {
  try{return e.json(200,require(__hooks + "/modules/local_setup_progress.js").report($app,e.requestInfo().body||{}))}
  catch(error){
    var code=String(error.message||"")
    if(code==="invalid_setup_progress")return e.json(400,{error:code})
    if(code==="setup_progress_stale_attempt")return e.json(409,{error:code})
    return e.json(401,{error:"setup_progress_unauthorized"})
  }
})

routerAdd("POST", "/api/public/local-executor/pair", function(e) {
  var b = e.requestInfo().body || {}, code = String(b.code || "")
  if (code.length !== 48) return e.json(401, { error: "pairing_denied" })
  var local = require(__hooks + "/modules/local_devices.js"), result
  try {
    $app.runInTransaction(function(tx) {
      var d = local.row(tx, "SELECT id,owner FROM studio_local_devices WHERE pair_hash={:hash} AND pair_until>{:now} AND revoked=0 AND token_hash IS NULL",
        { hash: $security.sha256(code), now: Date.now() }, { id: "", owner: "" })
      local.device(tx, d.id, d.owner)
      var token = $security.randomString(64)
      tx.db().newQuery("UPDATE studio_local_devices SET token_hash={:hash},pair_hash=NULL WHERE id={:id}").bind({ hash: $security.sha256(token), id: d.id }).execute()
      result = { device_id: d.id, token: token }
    })
    return e.json(200, result)
  } catch (_) { return e.json(401, { error: "pairing_denied" }) }
})
// UI permission controls are polled on an independent owner-scoped channel.
routerAdd("POST", "/api/public/local-executor/poll", function(e) {
  var local = require(__hooks + "/modules/local_devices.js"), d
  try { d = local.authenticate($app, e) } catch (_) { return e.json(401, { error: "device_unauthorized" }) }
  var b = e.requestInfo().body || {}, catalog
  try { catalog = local.catalog(b.tools) } catch (_) { return e.json(400, { error: "invalid_catalog" }) }
  var out = { job: null }
  $app.runInTransaction(function(tx) {
    local.device(tx, d.id, d.owner)
    tx.db().newQuery("UPDATE studio_local_devices SET seen_ms={:now},catalog={:catalog} WHERE id={:id}")
      .bind({ now: Date.now(), catalog: JSON.stringify(catalog), id: d.id }).execute()
    local.expire(tx)
    require(__hooks + '/modules/workbench_controls.js').expire(tx)
    var controls = arrayOf(new DynamicModel({id:''}))
    tx.db().newQuery("SELECT id FROM studio_local_controls WHERE device_id={:id} AND status IN ('queued','running','committing') LIMIT 1").bind({id:d.id}).all(controls)
    if(controls.length)return
    var jobs = arrayOf(new DynamicModel({ id: "", payload: "", deadline_ms: 0 }))
    tx.db().newQuery("SELECT id,payload,deadline_ms FROM studio_local_jobs WHERE device_id={:id} AND status='queued' " +
      "AND NOT EXISTS(SELECT 1 FROM studio_local_jobs busy WHERE busy.device_id={:id} AND busy.status='running') ORDER BY created_ms LIMIT 1")
      .bind({ id: d.id }).all(jobs)
    if (!jobs.length) return
    var token = $security.randomString(48)
    tx.db().newQuery("UPDATE studio_local_jobs SET status='running',claim_hash={:hash} WHERE id={:id} AND status='queued'")
      .bind({ hash: $security.sha256(token), id: jobs[0].id }).execute()
    out.job = { id: jobs[0].id, input: JSON.parse(jobs[0].payload), claim: token, deadline_ms: jobs[0].deadline_ms }
  })
  return e.json(200, out)
})
routerAdd("POST", "/api/public/local-executor/jobs/{id}/check", function(e) {
  var local = require(__hooks + "/modules/local_devices.js"), d
  try { d = local.authenticate($app, e) } catch (_) { return e.json(401, { error: "device_unauthorized" }) }
  try {
    var j = local.job($app, d.owner, e.request.pathValue("id"))
    return e.json(200, { active: j.device_id === d.id && j.status === "running" })
  } catch (_) { return e.json(404, { error: "job_not_found" }) }
})
routerAdd("POST", "/api/public/local-executor/jobs/{id}/complete", function(e) {
  var local = require(__hooks + "/modules/local_devices.js"), d
  try { d = local.authenticate($app, e) } catch (_) { return e.json(401, { error: "device_unauthorized" }) }
  var b = e.requestInfo().body || {}, changed = false
  var encoded
  try { encoded = require(__hooks + "/modules/local_result.js").encode(b.result || "") }
  catch (_) { return e.json(400, { error: "invalid_local_result" }) }
  $app.runInTransaction(function(tx) {
    local.device(tx, d.id, d.owner)
    local.expire(tx)
    var r = tx.db().newQuery("UPDATE studio_local_jobs SET status={:status},result={:result},error={:error} " +
      "WHERE id={:id} AND device_id={:device} AND owner={:owner} AND status='running' AND claim_hash={:claim}")
      .bind({ status: b.ok === true ? "succeeded" : "failed", result: encoded, error: b.ok === true ? "" : "local_execution_failed",
        id: e.request.pathValue("id"), device: d.id, owner: d.owner, claim: $security.sha256(String(b.claim || "")) }).execute()
    changed = Number(r.rowsAffected()) === 1
  })
  return e.json(changed ? 200 : 409, { ok: changed })
})
