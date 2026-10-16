// Smithery Connect V2. Uses the vendor's managed connection lifecycle,
// not the retired server.smithery.ai/{slug}/mcp?api_key=... URL format.
// Identity is injected only by global studio_auth guard from verified JWT.
// All outgoing hosts are fixed by smithery_managed.js. No generic URL input.

routerAdd("GET", "/api/market/smithery/v2/catalog", function(e) {
  var m=require(__hooks+"/modules/smithery_managed.js")
  var uid=m.uid(e)
  if(!uid)return e.json(401,{error:"studio_login_required"})
  var apiKey=m.key(uid)
  if(!apiKey)return e.json(400,{error:"smithery_key_required",
    message:"请先保存经过验证的 Smithery API Key"})
  var query=(e.requestInfo()||{}).query||{}
  var q=String(query.q||"").trim().slice(0,100)
  var page=Math.min(100,Math.max(1,parseInt(query.page||"1",10)||1))
  var qs="/servers?page="+page+"&pageSize=24"+(q?"&q="+encodeURIComponent(q):"")
  var result=m.send("GET",qs,apiKey)
  if(!result.ok){
    var message=result.error==="invalid_token"?"Smithery Key 已失效或无权限。请移除旧 Key 并重新保存":
      result.error==="rate_limited"?"Smithery 请求过于频繁，请稍后再搜索":
      "Smithery 插件目录暂时不可用，请稍后重试"
    return e.json(502,{error:result.error,message:message})
  }
  var response=result.data||{}
  var rows=Array.isArray(response.servers)?response.servers:
    Array.isArray(response.data)?response.data:
    Array.isArray(response.items)?response.items:
    Array.isArray(response)?response:[]
  var zh={}
  try{
    var cached=$app.findRecordsByFilter("market_i18n","server_name != ''","-created",500,0)
    for(var j=0;j<cached.length;j++){
      var item=cached[j],name=String(item.getString("server_name")||"")
      if(name && !zh[name])zh[name]={title:String(item.getString("zh_title")||""),
        desc:String(item.getString("zh_desc")||"")}
    }
  }catch(_){}
  var items=[]
  for(var i=0;i<rows.length && items.length<24;i++){
    var sv=rows[i]||{}
    if(sv.server && typeof sv.server==="object")sv=sv.server
    var slug=String(sv.qualifiedName||sv.qualified_name||sv.slug||sv.name||"")
    if(!m.validServer(slug))continue
    var translated=zh[slug]||{}
    items.push({slug:slug,title:String(sv.displayName||sv.title||slug).slice(0,120),
      desc:String(sv.description||"").slice(0,500),
      zh_title:translated.title||"",zh_desc:translated.desc||"",
      verified:sv.isVerified===true||sv.verified===true,
      deployed:sv.isDeployed===true||sv.deployed===true,
      homepage:"https://smithery.ai/servers/"+slug})
  }
  var pagination=response.pagination||{}
  var totalPages=Number(pagination.totalPages||pagination.total_pages||0)
  var nextPage=totalPages>page?page+1:rows.length>=24 && totalPages===0?page+1:0
  return e.json(200,{ok:true,items:items,next_page:nextPage,page:page,
    total:Number(pagination.totalCount||pagination.total_count||0)})
})

routerAdd("GET", "/api/market/smithery/v2/namespaces", function(e) {
  var m=require(__hooks+"/modules/smithery_managed.js")
  var uid=m.uid(e)
  if(!uid)return e.json(401,{error:"studio_login_required"})
  var key=m.key(uid)
  if(!key)return e.json(400,{error:"smithery_key_required"})
  var response=m.send("GET","/namespaces",key)
  if(!response.ok)return e.json(502,{error:response.error,
    message:response.error==="invalid_token"?"Smithery Key 无效，请重新配置":
      "无法读取 Smithery 工作空间；请在 Smithery 后台确认 Namespace"})
  var data=response.data||{}
  var rows=Array.isArray(data)?data:
    Array.isArray(data.namespaces)?data.namespaces:
    Array.isArray(data.items)?data.items:
    Array.isArray(data.data)?data.data:[]
  var namespaces=[]
  for(var i=0;i<rows.length&&namespaces.length<50;i++){
    var item=rows[i]
    var n=String(typeof item==="string"?item:
      item&&typeof item==="object"?(item.name||item.namespace||item.id||""):"")
    if(m.validName(n) && namespaces.indexOf(n)<0)namespaces.push(n)
  }
  return e.json(200,{ok:true,namespaces:namespaces})
})

routerAdd("POST", "/api/market/smithery/v2/connect", function(e) {
  var m=require(__hooks+"/modules/smithery_managed.js")
  var uid=m.uid(e)
  if(!uid)return e.json(401,{error:"studio_login_required"})
  var apiKey=m.key(uid)
  if(!apiKey)return e.json(400,{error:"smithery_key_required",
    message:"请先添加有效 Smithery Key"})
  var input=(e.requestInfo()||{}).body||{}
  var ns=String(input.namespace||"").trim()
  var slug=String(input.slug||"").trim()
  if(!m.validName(ns)||!m.validServer(slug))
    return e.json(400,{error:"invalid_selection",message:"请选择合法 Smithery 工作空间与插件"})
  // Namespace is owned/available to the current user's API key. Never trust
  // an arbitrary namespace field for cross-tenant remote operations.
  var namespaceResponse=m.send("GET","/namespaces",apiKey)
  if(!namespaceResponse.ok)return e.json(502,{error:"namespace_unavailable",
    message:"无法校验当前 Smithery 工作空间权限，已停止连接"})
  var nd=namespaceResponse.data||{}
  var nsList=Array.isArray(nd)?nd:
    Array.isArray(nd.namespaces)?nd.namespaces:
    Array.isArray(nd.items)?nd.items:
    Array.isArray(nd.data)?nd.data:[]
  var owned=false
  for(var i=0;i<nsList.length;i++){
    var n=nsList[i]
    if(String(typeof n==="string"?n:n&&n.name||n&&n.namespace||n&&n.id||"")===ns){owned=true;break}
  }
  if(!owned)return e.json(403,{error:"namespace_not_owned",
    message:"该 Smithery 工作空间不属于此账号，请重新选择"})
  var title=String(input.title||slug).slice(0,120)
  // Owner-scoped deterministic prefix + random suffix. Smithery namespace
  // enforces tenancy and each local row is bound to the verified employee.
  var connId="studio-"+String(uid).slice(0,8)+"-"+new Date().getTime().toString(36)+"-"+Math.floor(Math.random()*1000000).toString(36)
  var validId=/^[a-zA-Z0-9_-]{1,60}$/.test(connId)
  if(!validId)return e.json(400,{error:"connection_id_invalid"})
  var result=m.send("PUT","/connect/"+encodeURIComponent(ns)+"/"+encodeURIComponent(connId),
    apiKey,{transport:"http",server:slug,name:title,metadata:{userId:uid}})
  if(!result.ok)return e.json(502,{
    error:result.error,message:result.error==="invalid_token"?"Smithery Key 失效，请重新保存":
      result.error==="rate_limited"?"Smithery 请求限流，请稍后重试":
      "Smithery 拒绝创建连接，请核对所选插件及账户权限"})
  var data=result.data||{}
  var current=m.status(data)
  var tools=[]
  if(current.state==="connected"){
    var listing=m.send("GET","/connect/"+encodeURIComponent(ns)+"/"+
      encodeURIComponent(connId)+"/.tools",apiKey)
    if(listing.ok)tools=m.normalizeTools((listing.data||{}).tools)
    else current.state="error"
  }
  var local=m.record(uid,slug,title,ns,connId,apiKey,current.state,tools)
  return e.json(200,{ok:true,id:String(local.id),state:current.state,
    tool_count:tools.length,setup_url:current.setup_url,
    missing:current.missing,needs_action:current.state!=="connected"||tools.length===0,
    message:current.state==="connected"&&tools.length>0?"授权与工具发现均已通过":
      current.state==="auth_required"?"需要先完成 Smithery 官方账号授权":
      current.state==="input_required"?"需要完成该插件的服务配置":
      current.state==="connected"?"已连接，但没有发现可调用的工具；请重新检查插件配置":
      "连接尚未通过，请修复授权或插件配置后重试"})
})

routerAdd("POST", "/api/market/smithery/v2/refresh", function(e) {
  var m=require(__hooks+"/modules/smithery_managed.js")
  var uid=m.uid(e)
  if(!uid)return e.json(401,{error:"studio_login_required"})
  var input=(e.requestInfo()||{}).body||{}
  var local=m.fromLocal(uid,String(input.id||""))
  if(!local)return e.json(404,{error:"connection_not_found",
    message:"当前账号无此插件连接"})
  var apiKey=m.key(uid)
  if(!apiKey)return e.json(400,{error:"smithery_key_required"})
  var pair=m.decodeProxy(local.getString("url")||"")
  if(!pair)return e.json(400,{error:"not_managed_connection",
    message:"这不是 Smithery 托管连接，请使用原有插件重探功能"})
  var response=m.send("GET","/connect/"+encodeURIComponent(pair.namespace)+"/"+
    encodeURIComponent(pair.connectionId),apiKey)
  if(!response.ok){
    local.set("enabled",false)
    local.set("last_probe_status","error")
    local.set("last_probe_msg","Smithery 连接状态暂时不可验证")
    $app.save(local)
    return e.json(502,{error:response.error,message:"Smithery 状态检查失败；该连接已暂停"})
  }
  var current=m.status(response.data||{})
  var tools=[]
  if(current.state==="connected"){
    var listed=m.send("GET","/connect/"+encodeURIComponent(pair.namespace)+"/"+
      encodeURIComponent(pair.connectionId)+"/.tools",apiKey)
    if(listed.ok)tools=m.normalizeTools((listed.data||{}).tools)
    else current.state="error"
  }
  // Refresh must also refresh the encrypted Authorization header after an
  // API Key rotation. Never leave a ready row with empty/old credentials.
  var updated=m.record(uid,String(local.getString("server_name")||""),
    String(local.getString("title")||""),pair.namespace,pair.connectionId,
    apiKey,current.state,tools,String(local.id))
  return e.json(200,{ok:true,id:String(updated.id),state:current.state,
    tool_count:tools.length,setup_url:current.setup_url,missing:current.missing,
    needs_action:current.state!=="connected"||tools.length===0,
    message:current.state==="connected"&&tools.length>0?"授权成功，工具已可用于 Agent":
      current.state==="auth_required"?"尚需在 Smithery 官网完成 OAuth 授权":
      current.state==="input_required"?"尚需补充插件配置":
      "当前插件尚不可用，请检查配置后重试"})
})
