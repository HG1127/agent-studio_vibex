// Safe collaborative Agent drafts with owner-controlled grants and review.
// Staff share one Agent configuration; only owner can publish approved changes.
// No model/key/KB/tool execution privileges are delegated.
onBootstrap(function(e){
 e.next()
 try{
  var statements=[
   "CREATE TABLE IF NOT EXISTS agent_studio_spec_access ("+
   "spec_id TEXT NOT NULL,owner_uid TEXT NOT NULL,member_uid TEXT NOT NULL,"+
   "role TEXT NOT NULL CHECK(role IN ('viewer','editor')),"+
   "created_ms INTEGER NOT NULL,updated_ms INTEGER NOT NULL,"+
   "PRIMARY KEY(spec_id,member_uid))",
   "CREATE INDEX IF NOT EXISTS idx_agent_collab_members ON "+
   "agent_studio_spec_access(member_uid,spec_id)",
   "CREATE TABLE IF NOT EXISTS agent_studio_spec_proposals ("+
   "id TEXT PRIMARY KEY,spec_id TEXT NOT NULL,owner_uid TEXT NOT NULL,"+
   "author_uid TEXT NOT NULL,base_hash TEXT NOT NULL,"+
   "proposed_spec_json TEXT NOT NULL,comment TEXT NOT NULL,"+
   "status TEXT NOT NULL CHECK(status IN ('pending','accepted','rejected')),"+
   "created_ms INTEGER NOT NULL,reviewed_ms INTEGER NOT NULL DEFAULT 0,"+
   "reviewer_uid TEXT NOT NULL DEFAULT '')",
   "CREATE INDEX IF NOT EXISTS idx_agent_collab_proposals ON "+
   "agent_studio_spec_proposals(spec_id,status,created_ms)",
   "CREATE TABLE IF NOT EXISTS agent_studio_spec_collab_audit ("+
   "id TEXT PRIMARY KEY,spec_id TEXT NOT NULL,owner_uid TEXT NOT NULL,"+
   "actor_uid TEXT NOT NULL,member_uid TEXT NOT NULL,proposal_id TEXT NOT NULL,"+
   "action TEXT NOT NULL,occurred_ms INTEGER NOT NULL)",
   "CREATE INDEX IF NOT EXISTS idx_agent_collab_audit_owner ON "+
   "agent_studio_spec_collab_audit(owner_uid,occurred_ms)",
   "CREATE TABLE IF NOT EXISTS agent_studio_spec_revisions ("+
   "id TEXT PRIMARY KEY,spec_id TEXT NOT NULL,owner_uid TEXT NOT NULL,"+
   "actor_uid TEXT NOT NULL,kind TEXT NOT NULL "+
   "CHECK(kind IN ('before_accept','accepted','before_restore','restored')),"+
   "proposal_id TEXT NOT NULL DEFAULT '',source_revision_id TEXT NOT NULL DEFAULT '',"+
   "spec_hash TEXT NOT NULL,safe_spec_json TEXT NOT NULL,note TEXT NOT NULL,"+
   "occurred_ms INTEGER NOT NULL)",
   "CREATE INDEX IF NOT EXISTS idx_agent_collab_revisions ON "+
   "agent_studio_spec_revisions(spec_id,owner_uid,occurred_ms)"
  ]
  for(var i=0;i<statements.length;i++)$app.db().newQuery(statements[i]).execute()
  // Backward-compatible nullable provenance. The original SQLite CHECK on
  // 'kind' remains intact; entry_type distinguishes owner edits from review.
  var col=new DynamicModel({total:0})
  $app.db().newQuery(
    "SELECT COUNT(*) AS total FROM pragma_table_info('agent_studio_spec_revisions') "+
    "WHERE name='entry_type'"
  ).one(col)
  if(!Number(col.total)){
    $app.db().newQuery(
      "ALTER TABLE agent_studio_spec_revisions "+
      "ADD COLUMN entry_type TEXT NOT NULL DEFAULT 'collab'"
    ).execute()
  }
 }catch(err){
  try{$app.logger().error("agent collaboration schema","error",String(err))}catch(_){}
 }
})

routerAdd("GET","/api/studio/agent-collab/list",function(e){
 var auth=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e)
 if(!auth)return e.json(401,{error:"studio_login_required"})
 var c=require(__hooks+"/modules/agent_collab.js")
 try{
  var uid=String(auth.id),items=[]
  var owned=[]
  try{owned=$app.findRecordsByFilter("agent_specs","rh_user_id={:uid}","-updated",100,0,{uid:uid})}
  catch(_){}
  for(var i=0;i<owned.length;i++)items.push({
   id:String(owned[i].id),name:String(owned[i].getString("name")||"Agent"),
   role:"owner",owner_name:"我",owner_uid:uid
  })
  var shared=arrayOf(new DynamicModel({spec_id:"",role:"",name:"",owner_uid:"",display_name:""}))
  $app.db().newQuery(
   "SELECT a.spec_id,a.role,a.owner_uid,s.name,o.display_name "+
   "FROM agent_studio_spec_access a "+
   "JOIN agent_specs s ON s.id=a.spec_id AND s.rh_user_id=a.owner_uid "+
   "JOIN studio_users o ON o.id=a.owner_uid AND o.active=1 "+
   "WHERE a.member_uid={:uid} ORDER BY a.updated_ms DESC LIMIT 100"
  ).bind({uid:uid}).all(shared)
  for(var j=0;j<shared.length;j++)items.push({
   id:String(shared[j].spec_id),name:String(shared[j].name),
   role:String(shared[j].role),owner_uid:String(shared[j].owner_uid),
   owner_name:String(shared[j].display_name)
  })
  return e.json(200,{ok:true,items:items})
 }catch(err){return e.json(500,{error:"collab_list_failed"})}
})

routerAdd("GET","/api/studio/agent-collab/detail",function(e){
 var auth=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e)
 if(!auth)return e.json(401,{error:"studio_login_required"})
 var helper=require(__hooks+"/modules/agent_collab.js")
 try {
  var sid=String(((e.requestInfo()||{}).query||{}).spec_id||"")
  var record=helper.resolve($app,String(auth.id),sid,"viewer")
  var safe=helper.extract(helper.decode(record.rec))
  var grants=[],proposals=[]
  if(record.role==="owner"){
   var rows=arrayOf(new DynamicModel({member_uid:"",role:"",display_name:"",active:0}))
   $app.db().newQuery(
    "SELECT a.member_uid,a.role,u.display_name,u.active "+
    "FROM agent_studio_spec_access a "+
    "JOIN studio_users u ON u.id=a.member_uid "+
    "WHERE a.spec_id={:sid} AND a.owner_uid={:owner} "+
    "ORDER BY a.updated_ms DESC LIMIT 50"
   ).bind({sid:sid,owner:record.owner}).all(rows)
   for(var i=0;i<rows.length;i++)grants.push({
    member_id:String(rows[i].member_uid),role:String(rows[i].role),
    name:String(rows[i].display_name),active:!!Number(rows[i].active)
   })
  }
  var visible=arrayOf(new DynamicModel({id:"",author_uid:"",base_hash:"",
    proposed_spec_json:"",comment:"",status:"",created_ms:0,reviewed_ms:0}))
  var sql="SELECT id,author_uid,base_hash,proposed_spec_json,comment,status,created_ms,reviewed_ms "+
    "FROM agent_studio_spec_proposals WHERE spec_id={:sid}"
  var bind={sid:sid}
  if(record.role!=="owner"){sql+=" AND author_uid={:uid}";bind.uid=String(auth.id)}
  sql+=" ORDER BY created_ms DESC LIMIT 40"
  $app.db().newQuery(sql).bind(bind).all(visible)
  for(var j=0;j<visible.length;j++){
   var proposal=visible[j],proposed={}
   try{proposed=helper.extract(JSON.parse(String(proposal.proposed_spec_json)))}catch(_){}
   proposals.push({id:String(proposal.id),author_uid:String(proposal.author_uid),
    base_hash:String(proposal.base_hash),proposed:proposed,
    comment:String(proposal.comment),status:String(proposal.status),
    created_ms:Number(proposal.created_ms),reviewed_ms:Number(proposal.reviewed_ms)})
  }
  return e.json(200,{ok:true,id:sid,name:String(record.rec.getString("name")||"Agent"),
   role:record.role,owner_uid:record.owner,current:safe,
   base_hash:helper.digest(helper.decode(record.rec)),grants:grants,proposals:proposals})
 }catch(err){
  if(err&&err.httpStatus)return e.json(err.httpStatus,{error:String(err.code||"agent_not_found")})
  return e.json(500,{error:"collab_detail_failed"})
 }
})

routerAdd("POST","/api/studio/agent-collab/grant",function(e){
 var auth=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e)
 if(!auth)return e.json(401,{error:"studio_login_required"})
 var helper=require(__hooks+"/modules/agent_collab.js")
 var b=(e.requestInfo()||{}).body||{}
 var sid=String(b.spec_id||""),action=String(b.action||"")
 if(action!=="grant"&&action!=="revoke")return e.json(400,{error:"invalid_action"})
 try{
  var result
  $app.runInTransaction(function(tx){
   var res=helper.resolve(tx,String(auth.id),sid,"owner")
   var member="",role=""
   var now=new Date().getTime()
   if(action==="grant"){
    var target=helper.userByEmail(tx,b.recipient_email,res.owner)
    member=target.id
    role=String(b.role||"")
    if(role!=="viewer"&&role!=="editor")helper.fail("invalid_access_role",400)
    var count=new DynamicModel({total:0})
    tx.db().newQuery("SELECT COUNT(*) AS total FROM agent_studio_spec_access WHERE spec_id={:sid}")
     .bind({sid:sid}).one(count)
    var exists=new DynamicModel({total:0})
    tx.db().newQuery(
     "SELECT COUNT(*) AS total FROM agent_studio_spec_access WHERE spec_id={:sid} AND member_uid={:member}"
    ).bind({sid:sid,member:member}).one(exists)
    if(Number(count.total)>=30&&!Number(exists.total))helper.fail("collab_limit",429)
    tx.db().newQuery(
     "INSERT INTO agent_studio_spec_access "+
     "(spec_id,owner_uid,member_uid,role,created_ms,updated_ms) "+
     "VALUES({:sid},{:owner},{:member},{:role},{:now},{:now}) "+
     "ON CONFLICT(spec_id,member_uid) DO UPDATE SET "+
     "role=excluded.role,updated_ms=excluded.updated_ms"
    ).bind({sid:sid,owner:res.owner,member:member,role:role,now:now}).execute()
    // Downgrading an editor to viewer also cancels their unreviewed drafts.
    // A later grant must never revive stale editing proposals.
    if(role==="viewer"){
     tx.db().newQuery(
      "UPDATE agent_studio_spec_proposals SET status='rejected',"+
      "reviewed_ms={:now},reviewer_uid={:owner} "+
      "WHERE spec_id={:sid} AND author_uid={:member} AND status='pending'"
     ).bind({now:now,owner:res.owner,sid:sid,member:member}).execute()
    }
    result={ok:true,spec_id:sid,member_id:member,role:role,name:target.name}
   }else{
    member=String(b.member_id||"")
    if(!/^[A-Za-z0-9]{15}$/.test(member))helper.fail("invalid_member_id",400)
    var removed=tx.db().newQuery(
     "DELETE FROM agent_studio_spec_access WHERE spec_id={:sid} AND "+
     "owner_uid={:owner} AND member_uid={:member}"
    ).bind({sid:sid,owner:res.owner,member:member}).execute()
    if(Number(removed.rowsAffected())!==1)helper.fail("collab_grant_not_found",404)
    // Revocation is immediate, including pending drafts that might otherwise
    // be accepted later by the original owner.
    tx.db().newQuery(
      "UPDATE agent_studio_spec_proposals SET status='rejected',"+
      "reviewed_ms={:now},reviewer_uid={:owner} "+
      "WHERE spec_id={:sid} AND author_uid={:member} AND status='pending'"
    ).bind({now:now,owner:res.owner,sid:sid,member:member}).execute()
    role="revoked"
    // Existing drafts remain available to the owner for audit, but the
    // revoked collaborator can no longer read them or approve future changes.
    result={ok:true,spec_id:sid,member_id:member,revoked:true}
   }
   helper.audit(tx,action,sid,res.owner,String(auth.id),member,"")
  })
  return e.json(200,result)
 }catch(err){
  if(err&&err.httpStatus)return e.json(err.httpStatus,{error:String(err.code||"invalid_access")})
  return e.json(500,{error:"collab_grant_failed"})
 }
})

routerAdd("POST","/api/studio/agent-collab/propose",function(e){
 var auth=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e)
 if(!auth)return e.json(401,{error:"studio_login_required"})
 var helper=require(__hooks+"/modules/agent_collab.js")
 var b=(e.requestInfo()||{}).body||{}
 var sid=String(b.spec_id||""),baseHash=String(b.base_hash||"")
 var note=String(b.comment||"").trim()
 if(!/^[0-9a-f]{64}$/i.test(baseHash)||note.length<8||note.length>600)
  return e.json(400,{error:"invalid_proposal"})
 try{
  var proposed=helper.normalize(b.proposed)
  var result
  $app.runInTransaction(function(tx){
   var res=helper.resolve(tx,String(auth.id),sid,"editor")
   if(res.role!=="editor")helper.fail("editor_required",403)
   if(helper.digest(helper.decode(res.rec))!==baseHash)
    helper.fail("collab_version_conflict",409)
   var inProgress=new DynamicModel({total:0})
   tx.db().newQuery(
    "SELECT COUNT(*) AS total FROM agent_studio_spec_proposals "+
    "WHERE spec_id={:sid} AND author_uid={:uid} AND status='pending'"
   ).bind({sid:sid,uid:String(auth.id)}).one(inProgress)
   if(Number(inProgress.total))helper.fail("collab_pending_exists",409)
   var id=$security.randomString(15),now=new Date().getTime()
   tx.db().newQuery(
    "INSERT INTO agent_studio_spec_proposals "+
    "(id,spec_id,owner_uid,author_uid,base_hash,proposed_spec_json,comment,status,created_ms) "+
    "VALUES({:id},{:sid},{:owner},{:author},{:hash},{:proposed},{:comment},'pending',{:now})"
   ).bind({id:id,sid:sid,owner:res.owner,author:String(auth.id),hash:baseHash,
    proposed:JSON.stringify(proposed),comment:note,now:now}).execute()
   helper.audit(tx,"propose",sid,res.owner,String(auth.id),String(auth.id),id)
   result={ok:true,id:id,status:"pending",spec_id:sid}
  })
  return e.json(200,result)
 }catch(err){
  if(err&&err.httpStatus)return e.json(err.httpStatus,{error:String(err.code||"invalid_proposal")})
  return e.json(500,{error:"collab_proposal_failed"})
 }
})

routerAdd("POST","/api/studio/agent-collab/review",function(e){
 var auth=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e)
 if(!auth)return e.json(401,{error:"studio_login_required"})
 var helper=require(__hooks+"/modules/agent_collab.js")
 var b=(e.requestInfo()||{}).body||{}
 var sid=String(b.spec_id||""),pid=String(b.proposal_id||"")
 var decision=String(b.decision||"")
 if(!/^[A-Za-z0-9]{15}$/.test(pid)||(decision!=="accept"&&decision!=="reject")||
    b.confirm!==true)return e.json(400,{error:"invalid_review"})
 try{
  var result
  $app.runInTransaction(function(tx){
   var res=helper.resolve(tx,String(auth.id),sid,"owner")
   var row=new DynamicModel({id:"",owner_uid:"",author_uid:"",base_hash:"",
    proposed_spec_json:"",status:""})
   try{
    tx.db().newQuery(
     "SELECT id,owner_uid,author_uid,base_hash,proposed_spec_json,status "+
     "FROM agent_studio_spec_proposals WHERE id={:id} AND spec_id={:sid}"
    ).bind({id:pid,sid:sid}).one(row)
   }catch(_){helper.fail("collab_proposal_not_found",404)}
   if(String(row.owner_uid)!==res.owner)helper.fail("collab_proposal_not_found",404)
   if(String(row.status)!=="pending")helper.fail("collab_already_reviewed",409)
   if(decision==="accept"){
    // Never accept a draft after its author was removed, disabled or
    // downgraded; the stored proposal is not a bearer capability.
    var currentlyEditor=new DynamicModel({total:0})
    tx.db().newQuery(
      "SELECT COUNT(*) AS total FROM agent_studio_spec_access a "+
      "JOIN studio_users u ON u.id=a.member_uid AND u.active=1 "+
      "WHERE a.spec_id={:sid} AND a.member_uid={:author} "+
      "AND a.owner_uid={:owner} AND a.role='editor'"
    ).bind({sid:sid,author:String(row.author_uid),owner:res.owner}).one(currentlyEditor)
    if(!Number(currentlyEditor.total))helper.fail("collab_author_revoked",409)
    if(helper.digest(helper.decode(res.rec))!==String(row.base_hash))
      helper.fail("collab_version_conflict",409)
    var proposed
    try{proposed=helper.normalize(JSON.parse(String(row.proposed_spec_json||"")))}
    catch(_){helper.fail("invalid_collab_spec",409)}
    var merged=helper.decode(res.rec)
    var history=require(__hooks+"/modules/agent_collab_history.js")
    history.record(tx,{specId:sid,ownerId:res.owner,actorId:String(auth.id),
      kind:"before_accept",spec:merged,proposalId:pid,
      note:"采纳前的 Agent 描述性字段备份"})
    for(var i=0;i<helper.FIELDS.length;i++){
     var field=helper.FIELDS[i]
     merged[field]=proposed[field]
    }
    // No changes to models, tools, KB bindings or other owner private config.
    res.rec.set("spec",merged)
    tx.save(res.rec)
    history.record(tx,{specId:sid,ownerId:res.owner,actorId:String(auth.id),
      kind:"accepted",spec:merged,proposalId:pid,
      note:"所有者审核采纳协作修改"})
   }
   tx.db().newQuery(
    "UPDATE agent_studio_spec_proposals SET status={:status},"+
    "reviewed_ms={:now},reviewer_uid={:reviewer} "+
    "WHERE id={:id} AND status='pending'"
   ).bind({status:decision==="accept"?"accepted":"rejected",now:new Date().getTime(),
    reviewer:String(auth.id),id:pid}).execute()
   helper.audit(tx,decision,sid,res.owner,String(auth.id),String(row.author_uid),pid)
   result={ok:true,spec_id:sid,proposal_id:pid,status:decision==="accept"?"accepted":"rejected"}
  })
  return e.json(200,result)
 }catch(err){
  if(err&&err.httpStatus)return e.json(err.httpStatus,{error:String(err.code||"collab_review_failed")})
  return e.json(500,{error:"collab_review_failed"})
 }
})
