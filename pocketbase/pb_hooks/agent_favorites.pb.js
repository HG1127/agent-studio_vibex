// Persistent, employee-scoped starred Agent records (separate from AgentSpec
// revisions so starring does not trigger a stale editor CAS conflict).
onBootstrap(function(e){
  e.next()
  try{
    $app.db().newQuery(
      "CREATE TABLE IF NOT EXISTS agent_spec_favorites ("+
      "owner_uid TEXT NOT NULL, spec_id TEXT NOT NULL, created_ms INTEGER NOT NULL,"+
      "PRIMARY KEY(owner_uid,spec_id))"
    ).execute()
    $app.db().newQuery(
      "CREATE INDEX IF NOT EXISTS idx_agent_favorites_owner ON agent_spec_favorites(owner_uid,created_ms)"
    ).execute()
  }catch(err){
    try{$app.logger().error("agent favorites bootstrap", "error", String(err))}catch(_){}
  }
})

routerAdd("GET","/api/agent_specs/favorites",function(e){
  try{
    var h=(e.requestInfo()||{}).headers||{}
    var uid=String(h["x_rh_user_id"]||h["X-Rh-User-Id"]||h["x-rh-user-id"]||
      ($os.getenv("AGENT_STUDIO_ALLOW_ANON")==="true"?"local-anon":"")).trim()
    if(!uid)return e.json(401,{error:"auth_required"})
    var rows=arrayOf(new DynamicModel({spec_id:""}))
    $app.db().newQuery(
      "SELECT f.spec_id FROM agent_spec_favorites f "+
      "INNER JOIN agent_specs s ON s.id=f.spec_id AND s.rh_user_id=f.owner_uid "+
      "WHERE f.owner_uid={:owner} ORDER BY f.created_ms DESC"
    ).bind({owner:uid}).all(rows)
    return e.json(200,{ok:true,ids:rows.map(function(row){return String(row.spec_id)})})
  }catch(err){
    try{$app.logger().error("favorite list failed","error",String(err))}catch(_){}
    return e.json(500,{error:"favorites_unavailable"})
  }
})

routerAdd("POST","/api/agent_specs/{id}/favorite",function(e){
  try{
    var h=(e.requestInfo()||{}).headers||{}
    var uid=String(h["x_rh_user_id"]||h["X-Rh-User-Id"]||h["x-rh-user-id"]||
      ($os.getenv("AGENT_STUDIO_ALLOW_ANON")==="true"?"local-anon":"")).trim()
    if(!uid)return e.json(401,{error:"auth_required"})
    var id=String(e.request.pathValue("id")||"")
    if(!/^[A-Za-z0-9]{15}$/.test(id))return e.json(400,{error:"invalid_agent"})
    var body=(e.requestInfo()||{}).body||{}
    if(typeof body.favorite!=="boolean")return e.json(400,{error:"favorite_boolean_required"})
    var rec=null
    try{rec=$app.findRecordById("agent_specs",id)}catch(_){}
    if(!rec||String(rec.get("rh_user_id")||"")!==uid)
      return e.json(404,{error:"agent_not_found"})
    if(body.favorite){
      $app.db().newQuery(
        "INSERT OR IGNORE INTO agent_spec_favorites(owner_uid,spec_id,created_ms) "+
        "VALUES({:owner},{:spec},{:ts})"
      ).bind({owner:uid,spec:id,ts:Date.now()}).execute()
    }else{
      $app.db().newQuery(
        "DELETE FROM agent_spec_favorites WHERE owner_uid={:owner} AND spec_id={:spec}"
      ).bind({owner:uid,spec:id}).execute()
    }
    return e.json(200,{ok:true,spec_id:id,favorite:body.favorite})
  }catch(err){
    try{$app.logger().error("favorite update failed","error",String(err))}catch(_){}
    return e.json(500,{error:"favorite_save_failed",message:"收藏状态保存失败，请重试"})
  }
})
