// Append-only employee-scoped links between an actual submitted feedback Run
// and the SPECIFIC accepted AgentSpec update it prompted.
// Never store raw feedback, secret model config, KB content, or API credentials.
onBootstrap(function(e){
  e.next()
  try{
    $app.db().newQuery(
      "CREATE TABLE IF NOT EXISTS agent_optimization_lineage ("+
      "id TEXT PRIMARY KEY,owner_uid TEXT NOT NULL,spec_id TEXT NOT NULL,"+
      "source_run_id TEXT NOT NULL,before_hash TEXT NOT NULL,after_hash TEXT NOT NULL,"+
      "feedback_hash TEXT NOT NULL,changed_keys_json TEXT NOT NULL,"+
      "accepted_revision_id TEXT NOT NULL DEFAULT '',created_ms INTEGER NOT NULL)"
    ).execute()
    $app.db().newQuery(
      "CREATE INDEX IF NOT EXISTS idx_optimization_lineage_owner "+
      "ON agent_optimization_lineage(owner_uid,spec_id,created_ms)"
    ).execute()
    $app.db().newQuery(
      "CREATE INDEX IF NOT EXISTS idx_optimization_lineage_source "+
      "ON agent_optimization_lineage(owner_uid,source_run_id,after_hash)"
    ).execute()
  }catch(err){
    try{$app.logger().error("optimization lineage bootstrap","error",String(err))}catch(_){}
  }
})

// Fetch only provenance already accepted and owned by this employee.
// The comparison UI matches source Run + target run config.optimization_lineage_id.
routerAdd("GET","/api/agent-specs/{id}/optimization-lineage",function(e){
  try{
    var h=(e.requestInfo()||{}).headers||{}
    var uid=String(h["x_rh_user_id"]||h["X-Rh-User-Id"]||h["x-rh-user-id"]||
      ($os.getenv("AGENT_STUDIO_ALLOW_ANON")==="true"?"local-anon":"")).trim()
    if(!uid)return e.json(401,{error:"auth_required"})
    var id=String(e.request.pathValue("id")||"")
    if(!/^[A-Za-z0-9]{15}$/.test(id))return e.json(400,{error:"invalid_spec_id"})
    var spec=null
    try{spec=$app.findRecordById("agent_specs",id)}catch(_){}
    if(!spec||String(spec.get("rh_user_id")||"")!==uid)
      return e.json(404,{error:"not_found"})
    // Compute current-version affinity server-side from the exact full spec
    // hash. The UI cannot infer this from timestamps or a cached Agent row.
    var helper=require(__hooks+"/modules/agent_collab.js")
    var currentHash=helper.digest(helper.decode(spec))
    var query=(e.requestInfo()||{}).query||{}
    var auditId=String(query.audit_id||"").trim()
    if(auditId && !/^[A-Za-z0-9]{15}$/.test(auditId))
      return e.json(400,{error:"invalid_audit_id"})
    var where=" WHERE owner_uid={:owner} AND spec_id={:spec}"
    var params={owner:uid,spec:id}
    if(auditId){where+=" AND id={:audit}";params.audit=auditId}
    var rows=arrayOf(new DynamicModel({
      id:"",source_run_id:"",before_hash:"",after_hash:"",
      feedback_hash:"",changed_keys_json:"",accepted_revision_id:"",created_ms:0,
    }))
    $app.db().newQuery(
      "SELECT id,source_run_id,before_hash,after_hash,feedback_hash,"+
      "changed_keys_json,accepted_revision_id,created_ms "+
      "FROM agent_optimization_lineage"+where+
      " ORDER BY created_ms DESC,id DESC LIMIT 80"
    ).bind(params).all(rows)
    var out=[]
    for(var i=0;i<rows.length;i++){
      var row=rows[i],keys=[]
      try{keys=JSON.parse(String(row.changed_keys_json)||"[]")}catch(_){}
      var fbUnchanged=false
      try{
        var fbRun=$app.findRecordById("agent_runs",String(row.source_run_id))
        if(fbRun && String(fbRun.get("rh_user_id")||"")===uid &&
           String(fbRun.get("spec_id")||"")===id){
          var feedback=JSON.parse(fbRun.getString("feedback")||"null")
          fbUnchanged=Boolean(feedback &&
            String($security.sha256(JSON.stringify(feedback)))===String(row.feedback_hash))
        }
      }catch(_){}
      out.push({
        id:String(row.id),source_run_id:String(row.source_run_id),
        before_hash:String(row.before_hash),after_hash:String(row.after_hash),
        feedback_hash:String(row.feedback_hash),
        feedback_unchanged:fbUnchanged,
        is_current_spec:String(row.after_hash)===currentHash,
        changed_keys:Array.isArray(keys)?keys:[],
        accepted_revision_id:String(row.accepted_revision_id),
        created_ms:Number(row.created_ms)||0,
      })
    }
    return e.json(200,{ok:true,items:out})
  }catch(err){
    try{$app.logger().error("optimization lineage get","error",String(err))}catch(_){}
    return e.json(500,{error:"optimization_history_unavailable"})
  }
})
