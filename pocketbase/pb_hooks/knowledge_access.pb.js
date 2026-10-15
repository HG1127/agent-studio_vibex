// Explicit, owner-controlled internal knowledge sharing.
// JWT is verified by global studio_auth guard before using the trusted owner ID.
routerAdd("GET","/api/knowledge-bases/access",function(e){
  var h=(e.requestInfo()||{}).headers||{}
  var uid=String(h["x_rh_user_id"]||h["X-Rh-User-Id"]||h["x-rh-user-id"]||"").trim()
  if(!uid)return e.json(401,{error:"studio_login_required"})
  var bid=String(((e.requestInfo()||{}).query||{}).base_id||"")
  try{
    var acl=require(__hooks+"/modules/knowledge_acl.js")
    acl.resolve($app,uid,bid,"owner")
    var grants=acl.listGrants($app,uid,bid)
    return e.json(200,{ok:true,base_id:bid,grants:grants})
  }catch(err){
    if(err&&err.httpStatus)return e.json(err.httpStatus,{error:String(err.code||"base_not_found")})
    return e.json(500,{error:"access_list_failed"})
  }
})

routerAdd("POST","/api/knowledge-bases/access",function(e){
  var h=(e.requestInfo()||{}).headers||{}
  var uid=String(h["x_rh_user_id"]||h["X-Rh-User-Id"]||h["x-rh-user-id"]||"").trim()
  if(!uid)return e.json(401,{error:"studio_login_required"})
  var body=(e.requestInfo()||{}).body||{}
  var bid=String(body.base_id||"")
  var action=String(body.action||"")
  if(action!=="grant"&&action!=="revoke"&&action!=="semantic")return e.json(400,{error:"invalid_action"})
  try{
    var acl=require(__hooks+"/modules/knowledge_acl.js")
    var answer=null
    $app.runInTransaction(function(tx){
      acl.resolve(tx,uid,bid,"owner")
      var person=null,now=new Date().getTime(),role=""
      var semanticAllowed=body.semantic_allowed===true?1:0
      if(action==="grant"){
        person=acl.ensureRecipient(tx,uid,body.recipient_email)
        role=String(body.role||"")
        if(role!=="viewer"&&role!=="editor")acl.err("invalid_access_role",400)
        var count=new DynamicModel({total:0})
        tx.db().newQuery(
          "SELECT COUNT(*) AS total FROM agent_studio_kb_access WHERE base_id={:bid}"
        ).bind({bid:bid}).one(count)
        var already=new DynamicModel({total:0})
        tx.db().newQuery(
          "SELECT COUNT(*) AS total FROM agent_studio_kb_access "+
          "WHERE base_id={:bid} AND recipient_uid={:target}"
        ).bind({bid:bid,target:person.id}).one(already)
        if(Number(count.total)>=50&&!Number(already.total))
          acl.err("knowledge_share_limit",429)
        tx.db().newQuery(
          "INSERT INTO agent_studio_kb_access"+
          "(base_id,owner_uid,recipient_uid,role,semantic_allowed,created_ms,updated_ms) "+
          "VALUES({:bid},{:uid},{:target},{:role},{:semantic},{:now},{:now}) "+
          "ON CONFLICT(base_id,recipient_uid) DO UPDATE SET "+
          "owner_uid=excluded.owner_uid,role=excluded.role,"+
          "semantic_allowed=excluded.semantic_allowed,updated_ms=excluded.updated_ms"
        ).bind({bid:bid,uid:uid,target:person.id,role:role,semantic:semanticAllowed,now:now}).execute()
        answer={ok:true,base_id:bid,recipient_id:person.id,
          recipient_name:person.display_name,role:role,semantic_allowed:semanticAllowed===1}
      }else{
        var recipient=String(body.recipient_id||"")
        if(!/^[A-Za-z0-9]{15}$/.test(recipient))acl.err("invalid_recipient_id",400)
        if(action==="semantic"){
          if(typeof body.enabled!=="boolean")acl.err("invalid_semantic_choice",400)
          var change=tx.db().newQuery(
            "UPDATE agent_studio_kb_access SET semantic_allowed={:allowed},updated_ms={:now} "+
            "WHERE base_id={:bid} AND owner_uid={:uid} AND recipient_uid={:target}"
          ).bind({allowed:body.enabled?1:0,now:now,bid:bid,uid:uid,target:recipient}).execute()
          if(Number(change.rowsAffected())!==1)acl.err("recipient_not_found",404)
          person={id:recipient};role=body.enabled?"semantic_enabled":"semantic_disabled"
          answer={ok:true,base_id:bid,recipient_id:recipient,semantic_allowed:body.enabled}
        }else{
        var removed=tx.db().newQuery(
          "DELETE FROM agent_studio_kb_access "+
          "WHERE base_id={:bid} AND owner_uid={:uid} AND recipient_uid={:target}"
        ).bind({bid:bid,uid:uid,target:recipient}).execute()
        if(Number(removed.rowsAffected())!==1)acl.err("recipient_not_found",404)
        person={id:recipient}
        role="revoked"
        answer={ok:true,base_id:bid,recipient_id:recipient,revoked:true}
        }
      }
      tx.db().newQuery(
        "INSERT INTO agent_studio_kb_access_events "+
        "(id,base_id,owner_uid,recipient_uid,action,role,occurred_ms) "+
        "VALUES({:id},{:bid},{:uid},{:target},{:action},{:role},{:now})"
      ).bind({id:$security.randomString(15),bid:bid,uid:uid,
        target:person.id,action:action,role:role,now:now}).execute()
    })
    return e.json(200,answer)
  }catch(err){
    if(err&&err.httpStatus)return e.json(err.httpStatus,{error:String(err.code||"access_denied")})
    return e.json(500,{error:"access_change_failed"})
  }
})
