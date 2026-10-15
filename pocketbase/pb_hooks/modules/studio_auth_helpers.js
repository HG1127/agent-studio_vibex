// Required inside every PocketBase route callback. PocketBase JSVM evaluates
// handlers in separate VMs, so top-level helpers in .pb.js aren't shared.
function currentUser(e) {
  var rec=e.auth
  if(!rec) return null
  try {
    if(String(rec.collection().name)!=="studio_users") return null
    if(!rec.getBool("active")) return null
    return rec
  }catch(_){return null}
}
function jsonUser(rec) {
  return {
    id:String(rec.id),email:String(rec.getString("email")||""),
    display_name:String(rec.getString("display_name")||""),
    role:String(rec.getString("role")||"employee"),
    active:rec.getBool("active"),share_enabled:rec.getBool("share_enabled")
  }
}
function config() {
  // Legacy header-auth is unsafe outside the dedicated disposable CI fixtures.
  // Merely setting AUTH_MODE=legacy must NEVER expose a real standalone app.
  var legacyTest = String($os.getenv("AGENT_STUDIO_AUTH_MODE")||"") === "legacy" &&
    $os.getenv("AGENT_STUDIO_LEGACY_TEST_ONLY") === "true" &&
    $os.getenv("NODE_ENV") === "test"
  return !legacyTest
}
function path(e) {
  try{return String(e.request.url.path||"")}catch(_){return ""}
}
function trustedWorker(e) {
  var expected=String($os.getenv("AGENT_STUDIO_WORKER_TOKEN")||"")
  var supplied=String(e.request.header.get("X-Agent-Studio-Worker-Token")||"")
  if(expected.length<32 || expected.length!==supplied.length)return false
  var diff=0
  for(var i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^supplied.charCodeAt(i)
  return diff===0
}
module.exports={currentUser:currentUser,jsonUser:jsonUser,config:config,path:path,trustedWorker:trustedWorker}
