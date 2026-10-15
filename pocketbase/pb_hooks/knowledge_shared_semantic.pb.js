// A viewer/editor can inspect only their own capability to query an owner's
// already-indexed embeddings. No owner model ID, URL, key or raw vector leaks.
routerAdd("GET","/api/knowledge-bases/semantic/shared-status",function(e){
  var auth=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e)
  if(!auth)return e.json(401,{error:"studio_login_required"})
  try{
    var uid=String(auth.id)
    var bid=String(((e.requestInfo()||{}).query||{}).base_id||"")
    var acl=require(__hooks+"/modules/knowledge_acl.js")
    var access=acl.resolve($app,uid,bid,"viewer")
    if(access.role==="owner")return e.json(400,{error:"shared_base_only"})
    if(!access.semantic_allowed)return e.json(200,{
      ok:true,base_id:bid,semantic_allowed:false,compatible:false,
      indexed_chunks:0,total_chunks:0,status:"owner_not_authorized",
    })
    var service=require(__hooks+"/modules/knowledge_embedding.js")
    var reader=service.getSettings($app,uid)
    if(!reader)return e.json(200,{
      ok:true,base_id:bid,semantic_allowed:true,compatible:false,
      indexed_chunks:0,total_chunks:0,status:"reader_model_missing",
    })
    var original=service.compatibleSharedModel(
      $app,uid,access.owner_uid,reader,service.gojaRuntime())
    if(!original)return e.json(200,{
      ok:true,base_id:bid,semantic_allowed:true,compatible:false,
      indexed_chunks:0,total_chunks:0,status:"provider_model_incompatible",
    })
    var index=service.status($app,access.owner_uid,bid,original)
    return e.json(200,{
      ok:true,base_id:bid,semantic_allowed:true,compatible:true,
      indexed_chunks:index.indexed_chunks,total_chunks:index.total_chunks,
      status:index.indexed_chunks===0?"not_indexed":
        index.ready?"ready":"partial",
    })
  }catch(err){
    if(err&&err.httpStatus)
      return e.json(err.httpStatus,{error:String(err.code||"base_not_found")})
    return e.json(500,{error:"shared_semantic_status_failed"})
  }
})
