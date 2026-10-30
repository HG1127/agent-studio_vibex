// Standalone company auth. PocketBase JWT is verified by the built-in
// pbLoadAuthToken middleware before our business routes. Never trust a browser
// supplied X-Rh-User-Id (legacy owner storage field name).
onBootstrap(function(e) {
  var studio = require(__hooks + "/modules/studio_auth_helpers.js")
  e.next()
  try {
    var existing=null
    try{existing=$app.findCollectionByNameOrId("studio_users")}catch(_){}
    if(existing){
      var passwordField=existing.fields.getByName("password"),changed=false
      if(passwordField && (passwordField.min!==1 || passwordField.max!==71)){
        passwordField.min=1;passwordField.max=71;changed=true
      }
      if(!existing.fields.getByName("created")){existing.fields.add(new Field({name:"created",type:"autodate",onCreate:true}));changed=true}
      if(!existing.fields.getByName("updated")){existing.fields.add(new Field({name:"updated",type:"autodate",onCreate:true,onUpdate:true}));changed=true}
      if(changed)$app.save(existing)
      return
    }
    var collection=new Collection({
      type: "auth", name: "studio_users",
      listRule: null, viewRule: null, createRule: null, updateRule: null,
      deleteRule: null, manageRule: null, authRule: "active = true",
      passwordAuth: { enabled: true, identityFields: ["email"] },
      fields: [
        { name: "display_name", type: "text", required: true, max: 80 },
        { name: "role", type: "select", required: true, maxSelect: 1, values: ["admin", "employee"] },
        { name: "active", type: "bool" },
        { name: "share_enabled", type: "bool" },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    })
    $app.save(collection)
    collection=$app.findCollectionByNameOrId("studio_users")
    var createdPasswordField=collection.fields.getByName("password")
    if(!createdPasswordField)throw new Error("studio_password_field_missing")
    createdPasswordField.min=1;createdPasswordField.max=71
    $app.save(collection)
  } catch(err) {
    try { $app.logger().error("standalone auth schema failed", "error", String(err)) } catch(_) {}
    console.error("standalone auth schema validation: "+String(err).slice(0,600))
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
     !studio.validPassword(password)||name.length<1||name.length>80)
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
  var studio=require(__hooks+"/modules/studio_auth_helpers.js"),user=studio.currentUser(e)
  if(!user)return e.json(401,{error:"studio_login_required"})
  if(user.getString("role")!=="admin")return e.json(403,{error:"admin_required"})
  var q=(e.requestInfo()||{}).query||{}
  var page=Math.max(1,Math.min(10000,parseInt(q.page||"1",10)||1))
  var size=Math.max(1,Math.min(200,parseInt(q.perPage||"200",10)||200))
  var text=String(q.q||"").trim().toLowerCase().slice(0,180)
  var role=String(q.role||""),active=String(q.active||"")
  if(role && role!=="admin" && role!=="employee")return e.json(400,{error:"invalid_role"})
  if(active && active!=="true" && active!=="false")return e.json(400,{error:"invalid_active"})
  try{
    var where="1=1",params={}
    if(text){where+=" AND (INSTR(LOWER(display_name),{:q})>0 OR INSTR(LOWER(email),{:q})>0)";params.q=text}
    if(role){where+=" AND role={:role}";params.role=role}
    if(active){where+=" AND active={:active}";params.active=active==="true"?1:0}
    var counts=new DynamicModel({total:0})
    $app.db().newQuery("SELECT COUNT(*) AS total FROM studio_users WHERE "+where).bind(params).one(counts)
    var stats=new DynamicModel({total:0,active:0,admins:0,sharing:0})
    $app.db().newQuery("SELECT COUNT(*) AS total, COALESCE(SUM(active=1),0) AS active, COALESCE(SUM(role='admin' AND active=1),0) AS admins, COALESCE(SUM(share_enabled=1),0) AS sharing FROM studio_users").one(stats)
    var total=Number(counts.total),pages=Math.max(1,Math.ceil(total/size));page=Math.min(page,pages)
    params.limit=size;params.offset=(page-1)*size
    var ids=arrayOf(new DynamicModel({id:""}))
    $app.db().newQuery("SELECT id FROM studio_users WHERE "+where+" ORDER BY display_name COLLATE NOCASE,id LIMIT {:limit} OFFSET {:offset}").bind(params).all(ids)
    var items=[]
    for(var i=0;i<ids.length;i++)items.push(studio.jsonUser($app.findRecordById("studio_users",String(ids[i].id))))
    return e.json(200,{items:items,page:page,perPage:size,totalItems:total,totalPages:pages,summary:stats})
  }catch(_){return e.json(500,{error:"employee_list_failed"})}
})
routerAdd("POST","/api/studio/users",function(e) {
  var studio=require(__hooks+"/modules/studio_auth_helpers.js"),user=studio.currentUser(e)
  if(!user)return e.json(401,{error:"studio_login_required"})
  if(user.getString("role")!=="admin")return e.json(403,{error:"admin_required"})
  var b=(e.requestInfo()||{}).body||{}
  var email=String(b.email||"").trim().toLowerCase(),password=String(b.password||"")
  var name=String(b.display_name||"").trim(),role=String(b.role||"employee")
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>180||!name||name.length>80||!studio.validPassword(password)||(role!=="admin"&&role!=="employee"))return e.json(400,{error:"invalid_studio_user"})
  if(b.share_enabled!==undefined&&typeof b.share_enabled!=="boolean")return e.json(400,{error:"invalid_share"})
  try{
    var rec=null
    $app.runInTransaction(function(tx){
      if(tx.findRecordsByFilter("studio_users","email = {:email}","",1,0,{email:email}).length)throw new Error("email_already_used")
      rec=new Record(tx.findCollectionByNameOrId("studio_users"))
      rec.set("email",email);rec.set("password",password);rec.set("display_name",name);rec.set("role",role)
      rec.set("active",true);rec.set("share_enabled",b.share_enabled!==false)
      tx.save(rec)
    })
    return e.json(201,{ok:true,user:studio.jsonUser(rec)})
  }catch(err){return e.json(400,{error:String(err).indexOf("email_already_used")>=0?"email_already_used":"employee_create_failed"})}
})
routerAdd("PATCH","/api/studio/users/{id}",function(e) {
  var studio=require(__hooks+"/modules/studio_auth_helpers.js"),actor=studio.currentUser(e)
  if(!actor)return e.json(401,{error:"studio_login_required"})
  if(actor.getString("role")!=="admin")return e.json(403,{error:"admin_required"})
  var id=String(e.request.pathValue("id")||""),b=(e.requestInfo()||{}).body||{}
  if(!/^[A-Za-z0-9]{15}$/.test(id))return e.json(400,{error:"invalid_employee_id"})
  if(b.display_name!==undefined&&(typeof b.display_name!=="string"||!b.display_name.trim()||b.display_name.trim().length>80))return e.json(400,{error:"invalid_display_name"})
  var email=b.email===undefined?null:String(b.email).trim().toLowerCase()
  if(email!==null&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>180))return e.json(400,{error:"invalid_email"})
  if(b.role!==undefined&&b.role!=="admin"&&b.role!=="employee")return e.json(400,{error:"invalid_role"})
  if(b.active!==undefined&&typeof b.active!=="boolean")return e.json(400,{error:"invalid_active"})
  if(b.share_enabled!==undefined&&typeof b.share_enabled!=="boolean")return e.json(400,{error:"invalid_share"})
  if(b.password!==undefined)return e.json(400,{error:"use_password_reset"})
  try{
    var target=null
    $app.runInTransaction(function(tx){
      target=tx.findRecordById("studio_users",id)
      if(target.id===actor.id&&(b.active===false||(b.role&&b.role!=="admin")))throw new Error("cannot_disable_self_admin")
      if(b.expected_updated!==undefined&&String(b.expected_updated)!==String(target.get("updated")||""))throw new Error("employee_changed")
      if(email!==null&&email!==target.getString("email")){
        if(tx.findRecordsByFilter("studio_users","email = {:email} && id != {:id}","",1,0,{email:email,id:id}).length)throw new Error("email_already_used")
        target.set("email",email);target.set("verified",false)
      }
      if(b.display_name!==undefined)target.set("display_name",b.display_name.trim())
      if(b.role!==undefined)target.set("role",b.role)
      if(b.active!==undefined)target.set("active",b.active)
      if(b.share_enabled!==undefined)target.set("share_enabled",b.share_enabled)
      tx.save(target)
    })
    return e.json(200,{ok:true,user:studio.jsonUser(target)})
  }catch(err){
    var text=String(err)
    if(text.indexOf("cannot_disable_self_admin")>=0)return e.json(409,{error:"cannot_disable_self_admin"})
    if(text.indexOf("employee_changed")>=0)return e.json(409,{error:"employee_changed"})
    if(text.indexOf("email_already_used")>=0)return e.json(409,{error:"email_already_used"})
    return e.json(400,{error:"employee_update_failed"})
  }
})
routerAdd("POST","/api/studio/users/{id}/reset-password",function(e){
  var studio=require(__hooks+"/modules/studio_auth_helpers.js"),actor=studio.currentUser(e)
  if(!actor)return e.json(401,{error:"studio_login_required"})
  if(actor.getString("role")!=="admin")return e.json(403,{error:"admin_required"})
  var id=String(e.request.pathValue("id")||""),b=(e.requestInfo()||{}).body||{}
  if(id===actor.id)return e.json(409,{error:"use_own_password_change"})
  if(!/^[A-Za-z0-9]{15}$/.test(id))return e.json(400,{error:"invalid_employee_id"})
  var password=String(b.new_password||"")
  if(!studio.validPassword(password))return e.json(400,{error:"invalid_new_password"})
  if(b.confirm!==true)return e.json(400,{error:"reset_confirmation_required"})
  try{var target=$app.findRecordById("studio_users",id);target.set("password",password);$app.save(target);return e.json(200,{ok:true})}
  catch(_){return e.json(400,{error:"password_reset_failed"})}
})
routerAdd("POST","/api/studio/change-password",function(e) {
  var studio=require(__hooks+"/modules/studio_auth_helpers.js"),user=studio.currentUser(e)
  if(!user)return e.json(401,{error:"studio_login_required"})
  var b=(e.requestInfo()||{}).body||{},oldPass=String(b.old_password||""),newPass=String(b.new_password||"")
  if(!studio.validPassword(newPass))return e.json(400,{error:"invalid_new_password"})
  if(!user.validatePassword(oldPass))return e.json(403,{error:"invalid_password"})
  try{user.set("password",newPass);$app.save(user);return e.json(200,{ok:true})}
  catch(_){return e.json(400,{error:"password_change_failed"})}
})