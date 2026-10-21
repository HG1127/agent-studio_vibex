// Private, paged run-history index for the desktop Agent version comparison.
// Returns only owner-scoped metadata, not task instructions, prompts or secrets.
routerAdd("GET","/api/agent-specs/{id}/run-history",function(e){
  try{
    var h=(e.requestInfo()||{}).headers||{}
    var uid=String(h["x_rh_user_id"]||h["X-Rh-User-Id"]||h["x-rh-user-id"]||
      ($os.getenv("AGENT_STUDIO_ALLOW_ANON")==="true"?"local-anon":"")).trim()
    if(!uid)return e.json(401,{error:"auth_required"})
    var spec=String(e.request.pathValue("id")||"")
    if(!/^[A-Za-z0-9]{15}$/.test(spec))return e.json(400,{error:"invalid_spec_id"})
    var rec=null
    try{rec=$app.findRecordById("agent_specs",spec)}catch(_){}
    if(!rec||String(rec.get("rh_user_id")||"")!==uid)
      return e.json(404,{error:"agent_not_found"})
    var q=(e.requestInfo()||{}).query||{}
    var page=Math.min(10000,Math.max(1,parseInt(String(q.page||"1"),10)||1))
    var perPage=Math.min(50,Math.max(1,parseInt(String(q.perPage||"25"),10)||25))
    var total=new DynamicModel({total:0})
    $app.db().newQuery(
      "SELECT COUNT(*) AS total FROM agent_runs "+
      "WHERE rh_user_id={:uid} AND spec_id={:spec}"
    ).bind({uid:uid,spec:spec}).one(total)
    var rows=arrayOf(new DynamicModel({
      id:"",spec_id:"",status:"",created:"",updated:""
    }))
    $app.db().newQuery(
      "SELECT id,spec_id,status,created,updated "+
      "FROM agent_runs WHERE rh_user_id={:uid} AND spec_id={:spec} "+
      "ORDER BY created DESC,id DESC LIMIT {:limit} OFFSET {:offset}"
    ).bind({uid:uid,spec:spec,limit:perPage,offset:(page-1)*perPage}).all(rows)
    var items=[]
    for(var i=0;i<rows.length;i++){
      var row=rows[i]
      items.push({
        id:String(row.id),spec_id:String(row.spec_id),
        status:String(row.status),created:String(row.created),
        updated:String(row.updated),
      })
    }
    return e.json(200,{ok:true,items:items,page:page,perPage:perPage,
      totalItems:Number(total.total||0),
      totalPages:Math.max(1,Math.ceil(Number(total.total||0)/perPage))})
  }catch(err){
    try{$app.logger().error("run history paging","error",String(err))}catch(_){}
    return e.json(500,{error:"run_history_unavailable"})
  }
})
