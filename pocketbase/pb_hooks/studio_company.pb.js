// Standalone company oversight and strictly owner-consented per-run approval.
// Company administrators see aggregate operational metadata, NOT employee
// prompts, knowledge documents, passwords, model credentials or run outputs.
// A reviewer can act on one exact pending Agent step only after owner consent.
onBootstrap(function(e){
  e.next()
  try{
    var statements=[
      "CREATE TABLE IF NOT EXISTS agent_studio_approval_delegations ("+
        "run_id TEXT PRIMARY KEY, owner_uid TEXT NOT NULL, reviewer_uid TEXT NOT NULL,"+
        "pending_hash TEXT NOT NULL DEFAULT '',"+
        "review_note TEXT NOT NULL DEFAULT '',"+
        "expires_ms INTEGER NOT NULL, revoked_ms INTEGER NOT NULL DEFAULT 0,"+
        "created_ms INTEGER NOT NULL, updated_ms INTEGER NOT NULL)",
      "CREATE INDEX IF NOT EXISTS idx_as_delegate_review ON "+
        "agent_studio_approval_delegations(reviewer_uid,revoked_ms,expires_ms)",
      "CREATE INDEX IF NOT EXISTS idx_as_delegate_owner ON "+
        "agent_studio_approval_delegations(owner_uid,revoked_ms)",
      "CREATE TABLE IF NOT EXISTS agent_studio_review_audit ("+
        "id TEXT PRIMARY KEY,run_id TEXT NOT NULL,owner_uid TEXT NOT NULL,"+
        "reviewer_uid TEXT NOT NULL,actor_uid TEXT NOT NULL,action TEXT NOT NULL,"+
        "step_index INTEGER NOT NULL,occurred_ms INTEGER NOT NULL)",
      "CREATE INDEX IF NOT EXISTS idx_as_review_audit_owner ON "+
        "agent_studio_review_audit(owner_uid,occurred_ms)",
    ]
    for(var i=0;i<statements.length;i++)$app.db().newQuery(statements[i]).execute()
    // Additive compatibility for already-initialized development databases.
    var field=new DynamicModel({total:0})
    $app.db().newQuery("SELECT COUNT(*) AS total FROM pragma_table_info('agent_studio_approval_delegations') WHERE name='pending_hash'").one(field)
    if(!Number(field.total))$app.db().newQuery(
      "ALTER TABLE agent_studio_approval_delegations ADD COLUMN pending_hash TEXT NOT NULL DEFAULT ''"
    ).execute()
    var noteColumn=new DynamicModel({total:0})
    $app.db().newQuery("SELECT COUNT(*) AS total FROM pragma_table_info('agent_studio_approval_delegations') WHERE name='review_note'").one(noteColumn)
    if(!Number(noteColumn.total))$app.db().newQuery(
      "ALTER TABLE agent_studio_approval_delegations ADD COLUMN review_note TEXT NOT NULL DEFAULT ''"
    ).execute()
  }catch(err){
    try{$app.logger().error("studio company ops schema", "error", String(err))}catch(_){}
  }
})

// Company summary. Admin-only; no cross-employee run detail access is granted.
routerAdd("GET","/api/studio/company/overview",function(e){
  var lib=require(__hooks+"/modules/studio_company_ops.js")
  var me=lib.actor(e)
  if(!me)return e.json(401,{error:"studio_login_required"})
  if(!lib.isAdmin(me))return e.json(403,{error:"admin_required"})
  try {
    var now=new Date().getTime()
    var since=new Date(now-7*86400000).toISOString().replace("T"," ")
    var staff=$app.findRecordsByFilter("studio_users","","",200,0)
    var result=[]
    var total={employees:0,active:0,agent_running:0,workflow_running:0,
      pending_approvals:0,failed_7d:0,overdue_schedules:0,knowledge_bases:0}
    for(var i=0;i<staff.length;i++){
      var employee=staff[i],uid=String(employee.id)
      var bind={uid:uid,since:since,overdue:now-60000}
      var count=lib.count
      var agent=count($app,"SELECT COUNT(*) AS total FROM agent_runs WHERE rh_user_id={:uid} AND status='running'",bind)
      var workflow=count($app,"SELECT COUNT(*) AS total FROM workflow_runs WHERE rh_user_id={:uid} AND status='running'",bind)
      var approvals=count($app,"SELECT COUNT(*) AS total FROM agent_runs WHERE rh_user_id={:uid} AND status='awaiting_approval'",bind)+
        count($app,"SELECT COUNT(*) AS total FROM workflow_runs WHERE rh_user_id={:uid} AND status='awaiting_approval'",bind)
      var failures=count($app,"SELECT COUNT(*) AS total FROM agent_runs WHERE rh_user_id={:uid} AND status='failed' AND created>={:since}",bind)+
        count($app,"SELECT COUNT(*) AS total FROM workflow_runs WHERE rh_user_id={:uid} AND status='failed' AND created>={:since}",bind)
      var overdue=count($app,"SELECT COUNT(*) AS total FROM agent_studio_schedules WHERE rh_user_id={:uid} AND deleted=0 AND enabled=1 AND next_at_ms>0 AND next_at_ms<{:overdue}",bind)
      var knowledge=count($app,"SELECT COUNT(*) AS total FROM agent_studio_kb_bases WHERE rh_user_id={:uid}",bind)
      var active=employee.getBool("active")
      result.push({id:uid,display_name:String(employee.getString("display_name")||"员工"),
        role:String(employee.getString("role")||"employee"),active:active,
        agent_running:agent,workflow_running:workflow,pending_approvals:approvals,
        failed_7d:failures,overdue_schedules:overdue,knowledge_bases:knowledge})
      total.employees++
      if(active)total.active++
      total.agent_running+=agent
      total.workflow_running+=workflow
      total.pending_approvals+=approvals
      total.failed_7d+=failures
      total.overdue_schedules+=overdue
      total.knowledge_bases+=knowledge
    }
    var health=null
    try{health=$app.findFirstRecordByFilter("agent_worker_health","worker_name = 'main'")}catch(_){}
    var ms=health?new Date(String(health.getString("last_seen")||"")).getTime():0
    return e.json(200,{ok:true,scope:"company_metadata_only",at_ms:now,
      truncated:result.length===200,employees:result,totals:total,
      worker:{configured:$os.getenv("AGENT_STUDIO_BACKGROUND_WORKER")==="true",
        alive:ms>0&&now-ms<180000,age_ms:ms>0?Math.max(0,now-ms):null}})
  }catch(err){
    try{$app.logger().error("company overview failed","error",String(err))}catch(_){}
    if($os.getenv("AGENT_STUDIO_COMPANY_TEST_DEBUG")==="yes" && $os.getenv("NODE_ENV")==="test")
      return e.json(500,{error:"company_overview_failed",debug:String(err).slice(0,450)})
    return e.json(500,{error:"company_overview_failed"})
  }
})

// Owner's pending approval runs, available administrators, existing consents.
routerAdd("GET","/api/studio/approval-delegations",function(e){
  var lib=require(__hooks+"/modules/studio_company_ops.js")
  var me=lib.actor(e)
  if(!me)return e.json(401,{error:"studio_login_required"})
  try{
    var id=String(me.id),now=new Date().getTime()
    var admins=$app.findRecordsByFilter("studio_users","active=true && role='admin'","display_name",100,0)
    var reviewers=[]
    for(var a=0;a<admins.length;a++){
      if(admins[a].id!==id)reviewers.push({
        id:String(admins[a].id),display_name:String(admins[a].getString("display_name")||"负责人")})
    }
    var records=$app.findRecordsByFilter("agent_runs","rh_user_id = {:uid} && status = 'awaiting_approval'",
      "-updated",60,0,{uid:id})
    var runs=[]
    for(var i=0;i<records.length;i++){
      var run=records[i],pending=lib.pending(run)
      if(!pending)continue
      var grant=new DynamicModel({reviewer_uid:"",expires_ms:0,revoked_ms:0,pending_hash:""})
      var valid=false
      try{
        $app.db().newQuery(
          "SELECT reviewer_uid,expires_ms,revoked_ms,pending_hash FROM agent_studio_approval_delegations "+
          "WHERE run_id={:rid} AND owner_uid={:uid}"
        ).bind({rid:String(run.id),uid:id}).one(grant)
        valid=Number(grant.revoked_ms)===0&&Number(grant.expires_ms)>now &&
          String(grant.pending_hash)===lib.hash(run,pending)
      }catch(_){}
      runs.push({run_id:String(run.id),title:String(run.getString("spec_name")||"Agent").slice(0,110),
        step_index:pending.step,tool:pending.tool,reviewer_id:valid?String(grant.reviewer_uid):"",
        expires_ms:valid?Number(grant.expires_ms):0})
    }
    return e.json(200,{ok:true,reviewers:reviewers,pending:runs})
  }catch(_){return e.json(500,{error:"delegations_list_failed"})}
})

// Owner explicitly authorizes exactly one administrator to approve/reject one
// currently pending Agent run. No ownership, knowledge access or credentials transfer.
routerAdd("POST","/api/studio/approval-delegations",function(e){
  var lib=require(__hooks+"/modules/studio_company_ops.js")
  var me=lib.actor(e)
  if(!me)return e.json(401,{error:"studio_login_required"})
  var body=(e.requestInfo()||{}).body||{}
  var id=String(body.run_id||""),action=String(body.action||"")
  if(!/^[A-Za-z0-9]{15}$/.test(id))return e.json(400,{error:"invalid_run_id"})
  if(action!=="grant"&&action!=="revoke")return e.json(400,{error:"invalid_action"})
  var reviewerId=String(body.reviewer_id||"")
  var reason=String(body.review_note||"").trim()
  if(action==="grant"&&!/^[A-Za-z0-9]{15}$/.test(reviewerId))
    return e.json(400,{error:"invalid_reviewer"})
  if(action==="grant"&&(reason.length<8||reason.length>500))
    return e.json(400,{error:"review_note_required"})
  var hours=Number(body.expires_hours===undefined?24:body.expires_hours)
  if(action==="grant"&&(!Number.isInteger(hours)||hours<1||hours>72))
    return e.json(400,{error:"invalid_expiry"})
  try{
    var output
    $app.runInTransaction(function(tx){
      var run
      try{run=tx.findRecordById("agent_runs",id)}catch(_){}
      if(!run||String(run.getString("rh_user_id")||"")!==String(me.id))
        throw new Error("run_not_found")
      var pending=lib.pending(run)
      if(action==="grant"){
        if(String(run.getString("status"))!=="awaiting_approval"||!pending)
          throw new Error("run_not_awaiting_approval")
        if(reviewerId===String(me.id))throw new Error("invalid_reviewer")
        var reviewer
        try{reviewer=tx.findRecordById("studio_users",reviewerId)}catch(_){}
        if(!reviewer||!reviewer.getBool("active")||!lib.isAdmin(reviewer))
          throw new Error("invalid_reviewer")
        var now=new Date().getTime(),expires=now+hours*3600000
        var pendingHash=lib.hash(run,pending)
        tx.db().newQuery(
          "INSERT INTO agent_studio_approval_delegations "+
          "(run_id,owner_uid,reviewer_uid,pending_hash,review_note,expires_ms,revoked_ms,created_ms,updated_ms) "+
          "VALUES({:rid},{:owner},{:reviewer},{:hash},{:note},{:expires},0,{:now},{:now}) "+
          "ON CONFLICT(run_id) DO UPDATE SET "+
          "owner_uid=excluded.owner_uid,reviewer_uid=excluded.reviewer_uid,"+
          "pending_hash=excluded.pending_hash,review_note=excluded.review_note,"+
          "expires_ms=excluded.expires_ms,"+
          "revoked_ms=0,updated_ms=excluded.updated_ms"
        ).bind({rid:id,owner:String(me.id),reviewer:reviewerId,hash:pendingHash,note:reason,expires:expires,now:now}).execute()
        lib.audit(tx,{run_id:id,owner_uid:String(me.id),reviewer_uid:reviewerId,
          actor_uid:String(me.id),action:"grant",step:pending.step})
        output={ok:true,run_id:id,reviewer_id:reviewerId,expires_ms:expires}
      }else {
        var affected=tx.db().newQuery(
          "UPDATE agent_studio_approval_delegations SET revoked_ms={:now},updated_ms={:now} "+
          "WHERE run_id={:rid} AND owner_uid={:owner} AND revoked_ms=0"
        ).bind({rid:id,owner:String(me.id),now:new Date().getTime()}).execute()
        if(Number(affected.rowsAffected())!==1)throw new Error("delegation_not_found")
        var previous=new DynamicModel({reviewer_uid:""})
        tx.db().newQuery(
          "SELECT reviewer_uid FROM agent_studio_approval_delegations WHERE run_id={:rid}"
        ).bind({rid:id}).one(previous)
        lib.audit(tx,{run_id:id,owner_uid:String(me.id),reviewer_uid:String(previous.reviewer_uid),
          actor_uid:String(me.id),action:"revoke",step:pending?pending.step:0})
        output={ok:true,run_id:id,revoked:true}
      }
    })
    return e.json(200,output)
  }catch(err){
    var reason=String((err&&err.message)||err)
    if(reason==="run_not_found"||reason==="delegation_not_found")return e.json(404,{error:reason})
    if(reason==="invalid_reviewer")return e.json(400,{error:reason})
    if(reason==="run_not_awaiting_approval")return e.json(409,{error:reason})
    return e.json(500,{error:"delegation_action_failed"})
  }
})

// Reviewer reads consented pending steps only. Inputs are clipped/redacted;
// reviewers never receive original owner runs, prompts, knowledge or keys.
routerAdd("GET","/api/studio/manager/approvals",function(e){
  var lib=require(__hooks+"/modules/studio_company_ops.js")
  var me=lib.actor(e)
  if(!me)return e.json(401,{error:"studio_login_required"})
  if(!lib.isAdmin(me))return e.json(403,{error:"admin_required"})
  try{
    var rows=arrayOf(new DynamicModel({run_id:"",owner_uid:"",expires_ms:0,pending_hash:"",review_note:""}))
    $app.db().newQuery(
      "SELECT run_id,owner_uid,expires_ms,pending_hash,review_note FROM agent_studio_approval_delegations "+
      "WHERE reviewer_uid={:uid} AND revoked_ms=0 AND expires_ms>{:now} "+
      "ORDER BY updated_ms DESC LIMIT 80"
    ).bind({uid:String(me.id),now:new Date().getTime()}).all(rows)
    var items=[]
    for(var i=0;i<rows.length;i++){
      var rr=rows[i],run=null,owner=null
      try{run=$app.findRecordById("agent_runs",String(rr.run_id))}catch(_){}
      if(!run||String(run.getString("rh_user_id")||"")!==String(rr.owner_uid)||
          String(run.getString("status")||"")!=="awaiting_approval")continue
      var pending=lib.pending(run)
      if(!pending||String(rr.pending_hash)!==lib.hash(run,pending))continue
      try{owner=$app.findRecordById("studio_users",String(rr.owner_uid))}catch(_){}
      if(!owner||!owner.getBool("active"))continue
      items.push({run_id:String(rr.run_id),owner_name:String(owner.getString("display_name")||"员工"),
        title:String(run.getString("spec_name")||"Agent").slice(0,110),
        step_index:pending.step,tool:pending.tool,
        input_preview:lib.preview(pending.input),review_note:String(rr.review_note).slice(0,500),
        fingerprint:lib.hash(run,pending),
        expires_ms:Number(rr.expires_ms)})
    }
    return e.json(200,{ok:true,items:items})
  }catch(_){return e.json(500,{error:"manager_approvals_failed"})}
})

// Consent-gated delegated approval. A review fingerprint guards stale steps.
// Every action is transactional, one-time, and audit logged with both identities.
routerAdd("POST","/api/studio/manager/decision",function(e){
  var lib=require(__hooks+"/modules/studio_company_ops.js")
  var me=lib.actor(e)
  if(!me)return e.json(401,{error:"studio_login_required"})
  if(!lib.isAdmin(me))return e.json(403,{error:"admin_required"})
  var body=(e.requestInfo()||{}).body||{}
  var id=String(body.run_id||""),decision=String(body.decision||"")
  var fingerprint=String(body.fingerprint||""),expectedStep=Number(body.step_index)
  if(!/^[A-Za-z0-9]{15}$/.test(id)||!["approve","reject"].includes(decision)||
     !/^[a-f0-9]{64}$/i.test(fingerprint)||!Number.isInteger(expectedStep))
    return e.json(400,{error:"invalid_review_request"})
  if(body.confirm!==true)return e.json(400,{error:"review_confirmation_required"})
  try{
    var outcome
    $app.runInTransaction(function(tx){
      var reviewer=tx.findRecordById("studio_users",String(me.id))
      if(!reviewer.getBool("active")||!lib.isAdmin(reviewer))throw new Error("admin_required")
      var grant=new DynamicModel({owner_uid:"",reviewer_uid:"",expires_ms:0,revoked_ms:0,pending_hash:""})
      try{
        tx.db().newQuery(
          "SELECT owner_uid,reviewer_uid,expires_ms,revoked_ms,pending_hash FROM agent_studio_approval_delegations "+
          "WHERE run_id={:rid}"
        ).bind({rid:id}).one(grant)
      }catch(_){throw new Error("delegation_missing")}
      if(String(grant.reviewer_uid)!==String(me.id)||Number(grant.revoked_ms)!==0||
        Number(grant.expires_ms)<=new Date().getTime())throw new Error("delegation_missing")
      var owner=tx.findRecordById("studio_users",String(grant.owner_uid))
      if(!owner.getBool("active"))throw new Error("delegation_missing")
      var run=tx.findRecordById("agent_runs",id)
      if(String(run.getString("rh_user_id")||"")!==String(grant.owner_uid))
        throw new Error("delegation_missing")
      if(String(run.getString("status")||"")!=="awaiting_approval")
        throw new Error("approval_already_resolved")
      var pending=lib.pending(run)
      if(!pending || pending.step!==expectedStep ||
        String(grant.pending_hash)!==fingerprint || lib.hash(run,pending)!==fingerprint)
        throw new Error("approval_stale")
      var cp=pending.checkpoint,seq=Number(cp.seq||0)+1
      cp.seq=seq;cp.claim_until=0;cp.approval_decision=decision
      if(decision==="approve")cp.approved_step=pending.step
      run.set("status","running");run.set("checkpoint",cp)
      tx.save(run)
      var evCol=tx.findCollectionByNameOrId("run_events")
      var ev=new Record(evCol)
      ev.set("run_id",id);ev.set("step_index",pending.step);ev.set("seq",seq)
      ev.set("event_type",decision==="approve"?"approval":"observation")
      ev.set("content",{message:decision==="approve"?
        "授权负责人已批准该步骤，待执行器继续":"授权负责人拒绝该步骤",
        tool:pending.tool,decision:decision,step_index:pending.step,
        delegated:true,reviewer_uid:String(me.id),owner_uid:String(grant.owner_uid)})
      tx.save(ev)
      lib.audit(tx,{run_id:id,owner_uid:String(grant.owner_uid),reviewer_uid:String(me.id),
        actor_uid:String(me.id),action:decision,step:pending.step})
      tx.db().newQuery(
        "UPDATE agent_studio_approval_delegations SET revoked_ms={:now},updated_ms={:now} "+
        "WHERE run_id={:rid} AND reviewer_uid={:uid} AND revoked_ms=0"
      ).bind({now:new Date().getTime(),rid:id,uid:String(me.id)}).execute()
      outcome={ok:true,run_id:id,decision:decision,status:"running",
        step_index:pending.step,reviewed_by:String(me.id)}
    })
    return e.json(200,outcome)
  }catch(err){
    var reason=String((err&&err.message)||err)
    if(reason==="delegation_missing")return e.json(404,{error:reason})
    if(reason==="approval_stale"||reason==="approval_already_resolved")
      return e.json(409,{error:reason})
    if(reason==="admin_required")return e.json(403,{error:reason})
    try{$app.logger().error("manager decision error","error","manager_decision_failed")}catch(_){}
    return e.json(500,{error:"manager_decision_failed"})
  }
})
