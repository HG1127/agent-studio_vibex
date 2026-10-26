// Single-use, explicitly shared internal Agent template cloning.
// Requires a trusted identity gateway; a client-provided uid must never be
// considered authentication by a publicly exposed PocketBase instance.
onBootstrap(function(e) {
  e.next()
  try {
    require(__hooks + "/modules/internal_template_schema.js")
      .applyInternalTemplateMigrations($app)
  } catch (err) {
    try { $app.logger().error("internal templates migration", "err", String(err)) } catch (_) {}
  }
})

routerAdd("GET", "/api/internal/templates", function(e) {
  try {
    var h=(e.requestInfo()||{}).headers||{}
    var uid=String(h["x_rh_user_id"]||h["X-Rh-User-Id"]||h["x-rh-user-id"]||
      ($os.getenv("AGENT_STUDIO_ALLOW_ANON")==="true"?"local-anon":"")).trim()
    if (!uid) return e.json(401,{error:"rh_login_required"})
    // Standalone staff permissions live on the server-validated PocketBase user,
    // not in a RunningHub ID environment allowlist. Legacy mode is preserved
    // only for old isolated tests/rollbacks; standalone launch never uses it.
    if($os.getenv("AGENT_STUDIO_AUTH_MODE")!=="legacy") {
      if(!e.auth || !e.auth.getBool("active") || !e.auth.getBool("share_enabled"))
        return e.json(403,{error:"internal_member_required"})
    } else {
      var members=String($os.getenv("AGENT_STUDIO_INTERNAL_SHARE_USERS")||"")
      if(!members.trim()) return e.json(503,{error:"internal_sharing_not_configured"})
      var authorized=members.split(",").map(function(x){return x.trim()})
      if(uid==="local-anon" || authorized.indexOf(uid)<0)
        return e.json(403,{error:"internal_member_required"})
    }

    var own = $app.findRecordsByFilter(
      "agent_specs","rh_user_id = {:uid}","-updated",100,0,{uid:uid}
    )
    var specs=[]
    for(var i=0;i<own.length;i++) specs.push({
      id:String(own[i].id),
      name:String(own[i].getString("name") || "未命名 Agent").slice(0,120),
    })
    var rows=arrayOf(new DynamicModel({
      id:"",name:"",spec_id:"",created_ms:0,expires_ms:0,
      used_ms:0,revoked:0,
    }))
    $app.db().newQuery(
      "SELECT id,name,spec_id,created_ms,expires_ms,used_ms,revoked " +
      "FROM agent_studio_template_invites WHERE owner_uid={:uid} " +
      "ORDER BY created_ms DESC LIMIT 50"
    ).bind({uid:uid}).all(rows)
    var invites=[]
    for(var j=0;j<rows.length;j++) {
      var row=rows[j]
      invites.push({
        id:String(row.id),name:String(row.name),
        spec_id:String(row.spec_id),
        created_ms:Number(row.created_ms),
        expires_ms:Number(row.expires_ms),
        used_ms:Number(row.used_ms),
        revoked:Number(row.revoked) === 1,
      })
    }
    return e.json(200,{ok:true,scope:"current_user",specs:specs,invites:invites})
  } catch (_) { return e.json(500,{error:"internal_templates_list_failed"}) }
})

routerAdd("POST", "/api/internal/templates", function(e) {
  try {
    var h=(e.requestInfo()||{}).headers||{}
    var uid=String(h["x_rh_user_id"]||h["X-Rh-User-Id"]||h["x-rh-user-id"]||
      ($os.getenv("AGENT_STUDIO_ALLOW_ANON")==="true"?"local-anon":"")).trim()
    if(!uid)return e.json(401,{error:"rh_login_required"})
    // Standalone staff permissions live on the server-validated PocketBase user,
    // not in a RunningHub ID environment allowlist. Legacy mode is preserved
    // only for old isolated tests/rollbacks; standalone launch never uses it.
    if($os.getenv("AGENT_STUDIO_AUTH_MODE")!=="legacy") {
      if(!e.auth || !e.auth.getBool("active") || !e.auth.getBool("share_enabled"))
        return e.json(403,{error:"internal_member_required"})
    } else {
      var members=String($os.getenv("AGENT_STUDIO_INTERNAL_SHARE_USERS")||"")
      if(!members.trim()) return e.json(503,{error:"internal_sharing_not_configured"})
      var authorized=members.split(",").map(function(x){return x.trim()})
      if(uid==="local-anon" || authorized.indexOf(uid)<0)
        return e.json(403,{error:"internal_member_required"})
    }

    var body=(e.requestInfo()||{}).body||{}
    var action=String(body.action||"")
    var now=new Date().getTime()
    if (action==="preview") {
      var previewSpecId=String(body.spec_id||"")
      if(!/^[a-zA-Z0-9]{15}$/.test(previewSpecId))
        return e.json(400,{error:"invalid_spec_id"})
      var previewSource=null
      try{previewSource=$app.findRecordById("agent_specs",previewSpecId)}catch(_){}
      if(!previewSource || String(previewSource.get("rh_user_id")||"")!==uid)
        return e.json(404,{error:"spec_not_found"})
      var copiedSpec=require(__hooks + "/modules/internal_template_copy.js")
        .fromRecord(previewSource)
      return e.json(200,{
        ok:true,name:String(previewSource.getString("name")||"未命名 Agent").slice(0,120),
        preview_spec:copiedSpec,
        preview_hash:$security.sha256(JSON.stringify(copiedSpec)),
        warning:"请人工检查全部目标、角色与任务内容是否包含敏感信息。保留角色和能力要求，但不复制个人模型、知识库、Skill 绑定、外部工具与授权，接收人需重新连接并批准。",
      })
    }
    if (action==="create") {
      var specId=String(body.spec_id||"")
      if (!/^[a-zA-Z0-9]{15}$/.test(specId)) return e.json(400,{error:"invalid_spec_id"})
      var spec=null
      try { spec=$app.findRecordById("agent_specs",specId) } catch (_) {}
      if (!spec || String(spec.get("rh_user_id")||"")!==uid)
        return e.json(404,{error:"spec_not_found"})
      var sourceName=String(spec.getString("name")||"未命名 Agent").slice(0,120)
      var copied=require(__hooks + "/modules/internal_template_copy.js").fromRecord(spec)
      var snapshot=JSON.stringify(copied)
      var digest=$security.sha256(snapshot)
      if(body.confirm_safe!==true || String(body.preview_hash||"")!==digest) {
        return e.json(409,{
          error:"template_review_required",
          message:"模板内容已改变或尚未确认。请重新预览并检查敏感文本。",
        })
      }

      // Only the author can share their own Agent; no global template listing.
      var token=$security.randomString(48)
      var tokenHash="sha256:"+$security.sha256("agentstudio-template:"+token)
      var inviteId=$security.randomString(15)
      var expires=now+7*86400000
      $app.runInTransaction(function(tx) {
        var stats=new DynamicModel({total:0})
        tx.db().newQuery(
          "SELECT COUNT(*) AS total FROM agent_studio_template_invites "+
          "WHERE owner_uid={:uid} AND revoked=0 AND used_ms=0 AND expires_ms>{:now}"
        ).bind({uid:uid,now:now}).one(stats)
        if (Number(stats.total)>=25) throw new Error("share_invite_limit")
        tx.db().newQuery(
          "INSERT INTO agent_studio_template_invites("+
          "id,owner_uid,spec_id,name,token_hash,created_ms,expires_ms,snapshot_json) "+
          "VALUES({:id},{:uid},{:spec},{:name},{:hash},{:now},{:expire},{:snapshot})"
        ).bind({id:inviteId,uid:uid,spec:specId,name:sourceName,
          hash:tokenHash,now:now,expire:expires,snapshot:snapshot}).execute()
      })
      // Raw token is returned ONCE and never stored or exposed by GET.
      return e.json(200,{ok:true,id:inviteId,name:sourceName,
        share_code:token,expires_ms:expires,one_time:true})
    }
    if(action==="revoke") {
      var inviteId2=String(body.id||"")
      if(!/^[a-zA-Z0-9]{15}$/.test(inviteId2))
        return e.json(400,{error:"invalid_invite_id"})
      var change=$app.db().newQuery(
        "UPDATE agent_studio_template_invites SET revoked=1 WHERE id={:id} "+
        "AND owner_uid={:uid} AND revoked=0"
      ).bind({id:inviteId2,uid:uid}).execute()
      if(Number(change.rowsAffected())!==1)return e.json(404,{error:"invite_not_found"})
      return e.json(200,{ok:true,revoked:true})
    }
    if(action==="redeem") {
      var code=String(body.share_code||"").trim()
      if(!/^[a-zA-Z0-9]{48}$/.test(code))
        return e.json(400,{error:"invalid_share_code"})
      var hash="sha256:"+$security.sha256("agentstudio-template:"+code)
      var importId=""
      $app.runInTransaction(function(tx) {
        var rows=arrayOf(new DynamicModel({
          id:"",owner_uid:"",spec_id:"",name:"",snapshot_json:"",
        }))
        tx.db().newQuery(
          "SELECT id,owner_uid,spec_id,name,snapshot_json FROM agent_studio_template_invites " +
          "WHERE token_hash={:hash} AND used_ms=0 AND revoked=0 " +
          "AND expires_ms>{:now} AND owner_uid!={:uid} LIMIT 1"
        ).bind({hash:hash,now:now,uid:uid}).all(rows)
        if(!rows.length)throw new Error("share_code_unavailable")
        var invitation=rows[0]
        // Frozen at the time of author review, independent from later edits
        // or deletion of the source Agent spec.
        var safe=null
        try {safe=JSON.parse(String(invitation.snapshot_json||""))}catch(_){}
        if(!safe || typeof safe!=="object" ||
           safe.require_approval!==true || !Array.isArray(safe.tools) ||
           !Array.isArray(safe.knowledge_base_ids) || safe.knowledge_base_ids.length!==0 ||
           (Array.isArray(safe.roles) && safe.roles.some(function(role){return (!role || !Array.isArray(role.tools) ||
             role.tools.length>0 || (Array.isArray(role.skill_refs) && role.skill_refs.length>0))})) ||
           (Array.isArray(safe.capability_requirements) &&
             safe.capability_requirements.some(function(need){return (!need ||
               !Array.isArray(need.suggested_tool_ids) || need.suggested_tool_ids.length>0)}))) {
          throw new Error("share_code_unavailable")
        }
        var update=tx.db().newQuery(
          "UPDATE agent_studio_template_invites SET used_ms={:now},used_by={:uid} " +
          "WHERE id={:id} AND used_ms=0 AND revoked=0 AND expires_ms>{:now}"
        ).bind({now:now,uid:uid,id:String(invitation.id)}).execute()
        if(Number(update.rowsAffected())!==1)throw new Error("share_code_unavailable")
        var coll=tx.findCollectionByNameOrId("agent_specs")
        var clone=new Record(coll)
        clone.set("rh_user_id",uid)
        clone.set("name",String(invitation.name).slice(0,110)+"（内部共享副本）")
        clone.set("spec",safe)
        clone.set("source","create")
        clone.set("template_key","")
        tx.save(clone)
        importId=String(clone.id)
      })
      return e.json(200,{ok:true,spec_id:importId,
        message:"已复制到我的助手；请检查个人模型和知识库连接后再运行"})
    }
    return e.json(400,{error:"unknown_action"})
  }catch(err){
    var msg=String((err&&err.message)||err)
    if(msg==="share_code_unavailable")return e.json(404,{error:"share_code_unavailable"})
    if(msg==="share_invite_limit")return e.json(429,{error:"share_invite_limit"})
    if(msg==="source_spec_invalid")return e.json(422,{error:"source_spec_invalid"})
    try{$app.logger().error("internal template action", "err", msg)}catch(_){}
    return e.json(500,{error:"internal_template_action_failed"})
  }
})
