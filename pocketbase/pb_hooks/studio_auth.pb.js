// Standalone company auth. PocketBase JWT is verified by the built-in
// pbLoadAuthToken middleware before our business routes. Never trust a browser
// supplied X-Rh-User-Id (legacy owner storage field name).
onBootstrap(function(e) {
  var studio = require(__hooks + "/modules/studio_auth_helpers.js")
  e.next()
  try {
    try { $app.findCollectionByNameOrId("studio_users"); return } catch (_) {}
    $app.save(new Collection({
      type: "auth", name: "studio_users",
      listRule: null, viewRule: null, createRule: null, updateRule: null,
      deleteRule: null, manageRule: null, authRule: "active = true",
      passwordAuth: { enabled: true, identityFields: ["email"] },
      fields: [
        { name: "display_name", type: "text", required: true, max: 80 },
        { name: "role", type: "select", required: true, maxSelect: 1, values: ["admin", "employee"] },
        { name: "active", type: "bool" },
        { name: "share_enabled", type: "bool" },
      ],
    }))
  } catch(err) {
    try { $app.logger().error("standalone auth schema failed", "error", String(err)) } catch(_) {}
  }
})
// A global guard protects ALL custom business routes, including ones that were
// originally written against the hosted VibeX identity headers. Registration is
// at default priority (after the framework's verified JWT loader at -1020).
routerUse(function(e) {
  var studio = require(__hooks + "/modules/studio_auth_helpers.js")
  if (!studio.config()) return e.next()
  var path=studio.path(e)
  // Strip all untrusted identity aliases for every request.
  var headers=e.request.header
  var legacy=String(headers.get("X-Rh-User-Id")||"").trim()
  headers.del("X-Rh-User-Id")
  headers.del("X_Rh_User_Id")
  // PocketBase-native collection authentication, health, and public token-based
  // integration endpoints remain under their own built-in authorization.
  if (path.indexOf("/api/collections/")===0 || path==="/api/health" ||
      path.indexOf("/api/public/")===0 || path.indexOf("/embed/")===0)
    return e.next()
  if (path.indexOf("/api/")!==0) return e.next()
  if (path==="/api/studio/bootstrap/status" || path==="/api/studio/bootstrap")
    return e.next()
  // Never call e.requestInfo() before forwarding injected identity:
  // PocketBase caches its headers and would otherwise retain the stripped
  // owner value. Start handlers below require schedule IDs and validate links.
  var workerStart=path==="/api/agent-runs/start" ||
    path==="/api/workflow-runs/start"
  if(studio.trustedWorker(e) && (
       path.indexOf("/api/internal/worker/")===0 ||
       path.indexOf("/api/internal/schedules/")===0 ||
       path.indexOf("/api/internal/knowledge/")===0 ||
       workerStart ||
       ((path.indexOf("/api/llm/agent-engine/")===0 ||
         path.indexOf("/api/llm/workflow-engine/")===0) && path.slice(-5)==="/tick")
     )) {
    if(legacy && /^[-_a-zA-Z0-9]{1,64}$/.test(legacy))
      headers.set("X-Rh-User-Id", legacy)
    return e.next()
  }
  var user=studio.currentUser(e)
  if (!user) return e.json(401,{error:"studio_login_required",message:"请先登录 Agent Studio"})
  headers.set("X-Rh-User-Id", String(user.id))
  return e.next()
})
routerAdd("GET","/api/studio/bootstrap/status",function(e) {
  var studio = require(__hooks + "/modules/studio_auth_helpers.js")
  if(!studio.config()) return e.json(404,{error:"not_found"})
  try {
    var n=$app.findRecordsByFilter("studio_users","role = 'admin'","",1,0).length
    return e.json(200,{initialized:n>0,can_setup:n===0 && String($os.getenv("AGENT_STUDIO_BOOTSTRAP_SECRET")||"").length>=32})
  } catch (_) {return e.json(503,{error:"studio_auth_schema_not_ready"})}
})
routerAdd("POST","/api/studio/bootstrap",function(e) {
  var studio = require(__hooks + "/modules/studio_auth_helpers.js")
  if(!studio.config()) return e.json(404,{error:"not_found"})
  var secret=String($os.getenv("AGENT_STUDIO_BOOTSTRAP_SECRET")||"")
  var given=String(e.request.header.get("X-Agent-Studio-Setup-Key")||"")
  if(secret.length<32 || given.length!==secret.length) return e.json(403,{error:"setup_not_permitted"})
  var diff=0;for(var i=0;i<secret.length;i++)diff|=secret.charCodeAt(i)^given.charCodeAt(i)
  if(diff!==0) return e.json(403,{error:"setup_not_permitted"})
  var b=(e.requestInfo()||{}).body||{}
  var email=String(b.email||"").trim().toLowerCase()
  var password=String(b.password||"")
  var name=String(b.display_name||"").trim()
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>180||
     password.length<12||password.length>128||name.length<1||name.length>80)
    return e.json(400,{error:"invalid_studio_user"})
  try {
    var created=null
    $app.runInTransaction(function(tx){
      if(tx.findRecordsByFilter("studio_users","role = 'admin'","",1,0).length)
        throw new Error("already_initialized")
      var col=tx.findCollectionByNameOrId("studio_users")
      created=new Record(col)
      created.set("email",email); created.set("password",password)
      created.set("display_name",name); created.set("role","admin")
      created.set("active",true); created.set("share_enabled",true)
      tx.save(created)
    })
    return e.json(201,{ok:true,user:studio.jsonUser(created)})
  }catch(err){
    if(String(err).indexOf("already_initialized")>=0)
      return e.json(409,{error:"already_initialized"})
    return e.json(400,{error:"setup_failed"})
  }
})
routerAdd("GET","/api/studio/me",function(e) {
  var studio = require(__hooks + "/modules/studio_auth_helpers.js")
  var user=studio.currentUser(e)
  if(!user) return e.json(401,{error:"studio_login_required"})
  return e.json(200,{user:studio.jsonUser(user)})
})
routerAdd("GET","/api/studio/users",function(e) {
  var studio = require(__hooks + "/modules/studio_auth_helpers.js")
  var user=studio.currentUser(e)
  if(!user) return e.json(401,{error:"studio_login_required"})
  if(user.getString("role")!=="admin") return e.json(403,{error:"admin_required"})
  try {
    var rows=$app.findRecordsByFilter("studio_users","","",200,0)
    var items=[];for(var i=0;i<rows.length;i++)items.push(studio.jsonUser(rows[i]))
    return e.json(200,{items:items})
  }catch(_){return e.json(500,{error:"employee_list_failed"})}
})
routerAdd("POST","/api/studio/users",function(e) {
  var studio = require(__hooks + "/modules/studio_auth_helpers.js")
  var user=studio.currentUser(e)
  if(!user) return e.json(401,{error:"studio_login_required"})
  if(user.getString("role")!=="admin") return e.json(403,{error:"admin_required"})
  var b=(e.requestInfo()||{}).body||{}
  var email=String(b.email||"").trim().toLowerCase()
  var password=String(b.password||"")
  var name=String(b.display_name||"").trim()
  var role=String(b.role||"employee")
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>180||
     password.length<12||password.length>128||!name||name.length>80||
     (role!=="admin"&&role!=="employee")) return e.json(400,{error:"invalid_studio_user"})
  try {
    var rec=new Record($app.findCollectionByNameOrId("studio_users"))
    rec.set("email",email);rec.set("password",password)
    rec.set("display_name",name);rec.set("role",role)
    rec.set("active",true);rec.set("share_enabled",b.share_enabled!==false)
    $app.save(rec)
    return e.json(201,{ok:true,user:studio.jsonUser(rec)})
  }catch(_){return e.json(400,{error:"employee_create_failed"})}
})
routerAdd("PATCH","/api/studio/users/{id}",function(e) {
  var studio = require(__hooks + "/modules/studio_auth_helpers.js")
  var user=studio.currentUser(e)
  if(!user)return e.json(401,{error:"studio_login_required"})
  if(user.getString("role")!=="admin")return e.json(403,{error:"admin_required"})
  var id=String(e.request.pathValue("id")||"")
  var b=(e.requestInfo()||{}).body||{}
  try {
    var target=$app.findRecordById("studio_users",id)
    if(target.id===user.id && (b.active===false || (b.role&&b.role!=="admin")))
      return e.json(409,{error:"cannot_disable_self_admin"})
    if (b.active!==undefined) {
      if(typeof b.active!=="boolean")return e.json(400,{error:"invalid_active"})
      target.set("active",b.active)
    }
    if(b.share_enabled!==undefined){
      if(typeof b.share_enabled!=="boolean")return e.json(400,{error:"invalid_share"})
      target.set("share_enabled",b.share_enabled)
    }
    if(b.role!==undefined){
      if(b.role!=="admin"&&b.role!=="employee")return e.json(400,{error:"invalid_role"})
      target.set("role",b.role)
    }
    $app.save(target)
    return e.json(200,{ok:true,user:studio.jsonUser(target)})
  }catch(_){return e.json(404,{error:"employee_not_found"})}
})
routerAdd("POST","/api/studio/change-password",function(e) {
  var studio = require(__hooks + "/modules/studio_auth_helpers.js")
  var user=studio.currentUser(e)
  if(!user)return e.json(401,{error:"studio_login_required"})
  var b=(e.requestInfo()||{}).body||{}
  var oldPass=String(b.old_password||"")
  var newPass=String(b.new_password||"")
  if(newPass.length<12||newPass.length>128)return e.json(400,{error:"password_too_short"})
  if(!user.validatePassword(oldPass))return e.json(403,{error:"invalid_password"})
  user.set("password",newPass);$app.save(user)
  return e.json(200,{ok:true})
})
