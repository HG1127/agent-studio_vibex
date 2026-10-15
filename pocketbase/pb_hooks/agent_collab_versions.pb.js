// Owner-only safe-text history and rollback for one collaborative Agent.
// Restoring a descriptive revision never restores credentials, model bindings,
// tool permissions, knowledge access or active executions.
routerAdd("GET","/api/studio/agent-collab/versions",function(e){
  var auth=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e)
  if(!auth)return e.json(401,{error:"studio_login_required"})
  try{
    var sid=String(((e.requestInfo()||{}).query||{}).spec_id||"")
    var helper=require(__hooks+"/modules/agent_collab.js")
    var record=helper.resolve($app,String(auth.id),sid,"owner")
    var history=require(__hooks+"/modules/agent_collab_history.js")
    return e.json(200,{ok:true,spec_id:sid,
      current_hash:helper.digest(helper.decode(record.rec)),
      items:history.list($app,record.owner,sid)})
  }catch(err){
    if(err&&err.httpStatus)return e.json(err.httpStatus,{error:String(err.code||"agent_not_found")})
    return e.json(500,{error:"collab_versions_failed"})
  }
})

routerAdd("POST","/api/studio/agent-collab/restore",function(e){
  var auth=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e)
  if(!auth)return e.json(401,{error:"studio_login_required"})
  var body=(e.requestInfo()||{}).body||{}
  var sid=String(body.spec_id||""),rid=String(body.revision_id||"")
  var expected=String(body.expected_current_hash||"")
  var reason=String(body.reason||"").trim()
  if(!/^[A-Za-z0-9]{15}$/.test(rid)||!/^[a-f0-9]{64}$/i.test(expected)||
     reason.length<8||reason.length>500||body.confirm!==true)
    return e.json(400,{error:"invalid_restore"})
  try{
    var helper=require(__hooks+"/modules/agent_collab.js")
    var history=require(__hooks+"/modules/agent_collab_history.js")
    var result=null
    $app.runInTransaction(function(tx){
      var record=helper.resolve(tx,String(auth.id),sid,"owner")
      var current=helper.decode(record.rec)
      var hash=helper.digest(current)
      if(hash!==expected)helper.fail("collab_version_conflict",409)
      var source=history.find(tx,record.owner,sid,rid)
      var target=source.safe
      var present=helper.extract(current)
      if(JSON.stringify(present)===JSON.stringify(target))
        helper.fail("collab_no_changes",409)
      history.record(tx,{specId:sid,ownerId:record.owner,actorId:String(auth.id),
        kind:"before_restore",spec:current,sourceRevisionId:rid,
        note:"恢复前快照："+reason})
      var merged=helper.decode(record.rec)
      for(var i=0;i<helper.FIELDS.length;i++){
        var field=helper.FIELDS[i]
        merged[field]=target[field]
      }
      // Protected fields are deliberately NOT copied from saved snapshots.
      record.rec.set("spec",merged)
      tx.save(record.rec)
      // An old pending proposal must never become valid again after an ABA
      // rollback to content that happens to hash identically.
      tx.db().newQuery(
        "UPDATE agent_studio_spec_proposals SET status='rejected',"+
        "reviewed_ms={:now},reviewer_uid={:owner} "+
        "WHERE spec_id={:sid} AND owner_uid={:owner} AND status='pending'"
      ).bind({now:new Date().getTime(),owner:record.owner,sid:sid}).execute()
      var saved=history.record(tx,{specId:sid,ownerId:record.owner,
        actorId:String(auth.id),kind:"restored",spec:merged,
        sourceRevisionId:rid,note:reason})
      helper.audit(tx,"restore",sid,record.owner,String(auth.id),"",saved)
      result={ok:true,spec_id:sid,source_revision_id:rid,
        revision_id:saved,current_hash:helper.digest(merged),
        current:helper.extract(merged),pending_drafts_rejected:true}
    })
    return e.json(200,result)
  }catch(err){
    if(err&&err.httpStatus)
      return e.json(err.httpStatus,{error:String(err.code||"collab_restore_failed")})
    return e.json(500,{error:"collab_restore_failed"})
  }
})
