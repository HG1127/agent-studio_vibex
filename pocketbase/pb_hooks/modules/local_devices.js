// Server-owned device routing. No caller-provided user id is accepted.
function now() { return new Date().getTime() }
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]"
  return "{" + Object.keys(value).sort().map(function(key) { return JSON.stringify(key) + ":" + canonical(value[key]) }).join(",") + "}"
}
function row(app, sql, params, shape) {
  var value = new DynamicModel(shape)
  app.db().newQuery(sql).bind(params || {}).one(value)
  return value
}
function device(app, id, owner) {
  var d = row(app, "SELECT id,owner,name,revoked,seen_ms,catalog FROM studio_local_devices WHERE id={:id} AND owner={:owner}",
    { id: id, owner: owner }, { id: "", owner: "", name: "", revoked: false, seen_ms: 0, catalog: "" })
  if (d.revoked) throw Error("device_revoked")
  var user = app.findRecordById("studio_users", owner)
  if (!user.getBool("active")) throw Error("employee_inactive")
  return d
}
function authenticate(app, e) {
  var token = String(e.request.header.get("X-Studio-Device-Token") || "")
  if (token.length < 40 || token.length > 100) throw Error("device_unauthorized")
  var d = row(app, "SELECT id,owner FROM studio_local_devices WHERE token_hash={:hash} AND revoked=0",
    { hash: $security.sha256(token) }, { id: "", owner: "" })
  return device(app, d.id, d.owner)
}
function catalog(raw) {
  if (!Array.isArray(raw) || raw.length > 50) throw Error("invalid_catalog")
  var seen = {}, out = []
  for (var i = 0; i < raw.length; i++) {
    var t = raw[i]
    if (!t || !/^[a-zA-Z0-9_.-]{1,100}$/.test(t.name) || seen[t.name]) throw Error("invalid_tool")
    seen[t.name] = true
    var schema = t.inputSchema || { type: "object" }
    if (JSON.stringify(schema).length > 10000) throw Error("schema_too_large")
    out.push({ name: t.name, description: String(t.description || "").slice(0, 600), inputSchema: schema })
  }
  if (JSON.stringify(out).length > 60000) throw Error("catalog_too_large")
  return out
}
// File action validation is enforced on the server as well as the executor.
// No user-provided schema can authorize a permission-management tool.
function fileArguments(name,args,schema) {
  var fields={stat:['path'],list:['path'],read:['path'],write:['path','text'],update:['path','text','expected_sha256'],mkdir:['path'],copy:['path','destination'],move:['path','destination','expected_sha256'],trash:['path','expected_sha256'],trash_list:[],restore:['trash_id'],open:['path'],reveal:['path']}
  var action=name.slice(6)
  if(!Object.prototype.hasOwnProperty.call(fields,action))throw Error('device_tool_denied')
  var allowed=['root'].concat(fields[action])
  if(Object.keys(args).length!==allowed.length||Object.keys(args).some(function(k){return allowed.indexOf(k)<0})||allowed.some(function(k){return typeof args[k]!=='string'}))throw Error('invalid_arguments')
  var enums=schema&&schema.properties&&schema.properties.root&&schema.properties.root['enum']; /* Goja-safe property access */
  if(!Array.isArray(enums)||enums.indexOf(args.root)<0)throw Error('device_tool_denied')
  ;['path','destination'].forEach(function(k){
    if(args[k]===undefined)return
    if(!args[k]||args[k].length>1000||(args[k].charAt(0)==='/'||args[k].charAt(0)==='\\')||/[:\x00-\x1f\x7f]/.test(args[k])||args[k].replace(/\\/g,'/').split('/').some(function(p){return p==='..'||p!=='.'&&(p.slice(-1)==='.'||p.slice(-1)===' '||/^(?:\.agent-studio(?:-trash)?|\.env.*|\.git|\.ssh|\.aws|\.azure|\.gnupg|\.codex|\.config|\.local|\.local-device-credentials\.json|pb_data|node_modules|credentials.*|.*\.(?:db(?:-wal|-shm)?|sqlite\d*(?:-wal|-shm)?|pem|key|pfx|p12)|con(?:\..*)?|prn(?:\..*)?|aux(?:\..*)?|nul(?:\..*)?|com[0-9](?:\..*)?|lpt[0-9](?:\..*)?)$/i.test(p))}))throw Error('invalid_arguments')
  })
  if(args.expected_sha256!==undefined&&!/^[a-f0-9]{64}$/.test(args.expected_sha256)||args.trash_id!==undefined&&!/^[a-f0-9]{32}$/.test(args.trash_id))throw Error('invalid_arguments')
  if(action==='open'&&!/\.(?:txt|md|csv|tsv|json|log|pdf|png|jpg|jpeg|gif|bmp|webp|docx|xlsx|pptx|odt|ods|odp)$/i.test(args.path)||['open','reveal'].indexOf(action)>=0&&/[",]/.test(args.path))throw Error('invalid_arguments')
  if(args.text!==undefined){var bytes=encodeURIComponent(args.text).replace(/%[A-Fa-f0-9]{2}|./g,'x').length;if(bytes>(action==='update'?65536:16000))throw Error('input_too_large')}
}
function enqueue(app, owner, deviceId, input, key, runId) {
  var d = device(app, deviceId, owner)
  if (now() - Number(d.seen_ms) > 45000) throw Error("device_offline")
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("invalid_input")
  var tools = JSON.parse(d.catalog || "[]"), found = false, revision = "", schema = {}
  for (var i = 0; i < tools.length; i++) if (tools[i].name === input.tool) { found = true;schema=tools[i].inputSchema||{}; revision = String(schema["x-studio-permission-revision"] || "") }
  if (!found) throw Error("device_tool_denied")
  var args = input.arguments || {}
  if (typeof args !== "object" || Array.isArray(args)) throw Error("invalid_arguments")
  if(input.tool.indexOf('files.')===0)fileArguments(input.tool,args,schema)
  // Scope version comes from the authenticated device catalog, never caller input.
  var envelope = { tool: input.tool, arguments: args }
  if(revision){if(!/^[a-f0-9]{24}$/.test(revision))throw Error("invalid_permission_revision");envelope.permission_revision=revision}
  var payload = canonical(envelope)
  if (payload.length > (input.tool==='files.update'?400000:24000)) throw Error("input_too_large")
  var hash = $security.sha256(payload), id = $security.randomString(24)
  app.db().newQuery("INSERT INTO studio_local_jobs(id,owner,device_id,run_id,job_key,args_hash,payload,status,created_ms,deadline_ms) " +
    "VALUES({:id},{:owner},{:device},{:run},{:key},{:hash},{:payload},'queued',{:now},{:deadline}) ON CONFLICT(job_key) DO NOTHING")
    .bind({ id: id, owner: owner, device: deviceId, run: runId || "", key: key, hash: hash, payload: payload, now: now(), deadline: now() + 120000 }).execute()
  var job = row(app, "SELECT id,owner,device_id,args_hash FROM studio_local_jobs WHERE job_key={:key}", { key: key },
    { id: "", owner: "", device_id: "", args_hash: "" })
  if (job.owner !== owner || job.device_id !== deviceId || job.args_hash !== hash) throw Error("job_identity_conflict")
  return job.id
}
function expire(app) {
  app.db().newQuery("UPDATE studio_local_jobs SET status=CASE WHEN status='running' THEN 'unknown' ELSE 'expired' END,error='execution_deadline' " +
    "WHERE status IN ('queued','running') AND deadline_ms < {:now}").bind({ now: now() }).execute()
  app.db().newQuery("UPDATE studio_local_jobs SET status='cancelled',error='run_stopped' WHERE status IN ('queued','running') " +
    "AND run_id<>'' AND NOT EXISTS(SELECT 1 FROM agent_runs r WHERE r.id=run_id AND r.rh_user_id=owner AND r.status='running')").execute()
}
function job(app, owner, id) {
  expire(app)
  var found = row(app, "SELECT id,device_id,run_id,status,result,error,payload,created_ms FROM studio_local_jobs WHERE id={:id} AND owner={:owner}",
    { id: id, owner: owner }, { id: "", device_id: "", run_id: "", status: "", result: "", error: "", payload: "", created_ms: 0 })
  var result = require(__hooks + "/modules/local_result.js").decode(found.result)
  return { id: found.id, device_id: found.device_id, run_id: found.run_id, status: found.status, result: result.text,
    images: result.images, error: found.error, payload: found.payload, created_ms: found.created_ms }
}
module.exports = { canonical: canonical, now: now, row: row, device: device, authenticate: authenticate, catalog: catalog, enqueue: enqueue, expire: expire, job: job }
