// Smithery managed Connect adapter.
// No user-supplied outbound host: all requests target Smithery's documented
// REST API. API keys and Connect bearer tokens never go into URLs or responses.
var SMITHERY_CONNECT = (function () {
  var API_ORIGIN = "https://api.smithery.ai"
  function origin() {
    var custom = String($os.getenv("AGENT_STUDIO_SMITHERY_TEST_ORIGIN") || "")
    if (custom && $os.getenv("AGENT_STUDIO_SMITHERY_ALLOW_LOOPBACK") === "true" &&
        $os.getenv("AGENT_STUDIO_AUTH_MODE") === "standalone" &&
        /^http:\/\/127\.0\.0\.1:[1-9][0-9]{2,4}$/.test(custom))
      return custom
    return API_ORIGIN
  }
  function uid(e) {
    var h = (e.requestInfo() || {}).headers || {}
    return String(h["x_rh_user_id"] || h["X-Rh-User-Id"] ||
      ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
  }
  function key(uid2) {
    var rec = null
    try { rec = $app.findFirstRecordByFilter("smithery_keys", "rh_user_id = {:u}", {u:uid2}) } catch (_) {}
    if(!rec) return ""
    var encrypted=String(rec.getString("api_key")||"")
    var secret=String($os.getenv("AGENT_STUDIO_SECRET_KEY")||"")
    if(secret.length!==32 || encrypted.indexOf("gcm1:")!==0) return ""
    try{return String($security.decrypt(encrypted.slice(5),secret))}catch(_){return ""}
  }
  function validName(s) {
    return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,59}$/.test(String(s||""))
  }
  function validServer(s) {
    return /^@?[a-zA-Z0-9][a-zA-Z0-9_-]{0,70}(?:\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,70})?$/.test(String(s||""))
  }
  function parseResponse(res) {
    if(!res)return null
    var raw = res.raw !== undefined ? res.raw : res.body
    if(typeof raw!=="string") {
      try {
        var bytes=raw||[]
        var chars=[]
        for(var i=0;i<bytes.length;i++)chars.push(String.fromCharCode(bytes[i]&255))
        raw=chars.join("")
      } catch(_){raw=""}
    }
    try {return JSON.parse(raw)}catch(_){return null}
  }
  function send(method,path,apiKey,payload) {
    var opts={
      method:method,url:origin()+path,timeout:22,
      headers:{Authorization:"Bearer "+apiKey,Accept:"application/json"},
    }
    if(payload!==undefined){
      opts.headers["Content-Type"]="application/json"
      opts.body=JSON.stringify(payload)
    }
    var response=null
    try{response=$http.send(opts)}
    catch(_){return {ok:false,status:0,data:null,error:"service_unreachable"}}
    var status=Number(response&&response.statusCode||0)
    return {ok:status>=200&&status<300,status:status,data:parseResponse(response),
      error:status===401||status===403?"invalid_token":status===429?"rate_limited":
        status>=500?"provider_unavailable":"provider_rejected"}
  }
  function setupUrl(text) {
    var u=String(text||"").trim()
    return /^https:\/\/(?:auth\.smithery\.ai|smithery\.ai)\//i.test(u) &&
      u.indexOf("@")<0 && u.length<1200 ? u : ""
  }
  function status(data) {
    var obj=data&&data.status || {}
    var state=String(obj.state || "error").toLowerCase()
    if(["connected","auth_required","input_required","error"].indexOf(state)<0)state="error"
    return {state:state,setup_url:setupUrl(obj.setupUrl||data.setupUrl),
      message:String(obj.message||data.message||"").slice(0,240),
      missing:Array.isArray(obj.missing)?obj.missing.slice(0,10).map(function(x){return String(x).slice(0,70)}):[]}
  }
  function normalizeTools(rows) {
    if(!Array.isArray(rows))return []
    var seen={},out=[]
    for(var i=0;i<rows.length && out.length<50;i++){
      var t=rows[i]||{}
      var name=String(t.name||"").slice(0,120)
      if(!name||seen[name])continue
      seen[name]=true
      var schema=t.inputSchema&&typeof t.inputSchema==="object"?t.inputSchema:null
      out.push({name:name,description:String(t.description||"").slice(0,400),
        args_hint:"",input_schema:schema,
        read_only:t.annotations && t.annotations.readOnlyHint===true,
        destructive:t.annotations && t.annotations.destructiveHint===true})
    }
    return out
  }
  function gatewayOrigin() {
    var test=origin()
    // Smithery's REST management API and per-connection MCP gateway use
    // different official hosts. Loopback integration testing shares one stub.
    return test===API_ORIGIN?"https://smithery.run":test
  }
  function proxyUrl(ns,id) {
    return "https://smithery.run/"+encodeURIComponent(ns)+"/"+
      encodeURIComponent(id)
  }
  function proxyOriginUrl(ns,id) {
    return gatewayOrigin()+"/"+encodeURIComponent(ns)+"/"+encodeURIComponent(id)
  }
  function decodeProxy(url) {
    var raw=String(url||"")
    var prefix=gatewayOrigin()+"/"
    var match=raw.indexOf(prefix)===0
      ? raw.slice(prefix.length).match(/^([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)$/)
      : null
    // Compatibility with the earlier staging-only (incorrect) /connect/...
    // endpoint, so refresh can migrate it in place without losing local IDs.
    if(!match){
      var former=origin()+"/connect/"
      if(raw.indexOf(former)===0)
        match=raw.slice(former.length).match(/^([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/mcp$/)
    }
    if(!match||!validName(match[1])||!validName(match[2]))return null
    return {namespace:match[1],connectionId:match[2]}
  }
  function record(uid2,name,title,ns,id,apiKey,mode,tools,existingId) {
    var url=proxyOriginUrl(ns,id)
    var existing=existingId?fromLocal(uid2,existingId):null
    if(!existing){
      try{existing=$app.findFirstRecordByFilter("market_connections",
        "rh_user_id = {:u} && url = {:url}",{u:uid2,url:url})}catch(_){}
    }
    var col=$app.findCollectionByNameOrId("market_connections")
    var rec=existing||new Record(col)
    var secret=String($os.getenv("AGENT_STUDIO_SECRET_KEY")||"")
    if(secret.length!==32)throw new Error("secret_encryption_key_required")
    rec.set("rh_user_id",uid2)
    rec.set("server_name",name)
    rec.set("title",title)
    rec.set("url",url)
    rec.set("headers_sec",JSON.stringify([{k:"Authorization",
      v:"gcm1:"+$security.encrypt("Bearer "+apiKey,secret)}]))
    rec.set("headers_count",1)
    rec.set("tools",tools)
    rec.set("tool_count",tools.length)
    rec.set("enabled",mode==="connected" && tools.length>0)
    rec.set("last_probe_status",mode==="connected" && tools.length>0?"ok":mode)
    rec.set("last_probe_msg",mode==="connected"?"":(
      mode==="auth_required"?"等待完成 Smithery OAuth 授权":
      mode==="input_required"?"等待完善插件所需配置":
      mode==="connected"?"未发现可调用工具，请重试工具发现":"连接尚未验证成功"))
    $app.save(rec)
    return rec
  }
  function fromLocal(uid2,id){
    try{
      var rec=$app.findRecordById("market_connections",id)
      if(rec&&String(rec.get("rh_user_id")||"")===uid2)return rec
    }catch(_){}
    return null
  }
  return {uid:uid,key:key,send:send,validName:validName,validServer:validServer,
    parseResponse:parseResponse,normalizeTools:normalizeTools,status:status,
    record:record,fromLocal:fromLocal,proxyUrl:proxyUrl,decodeProxy:decodeProxy}
})()
module.exports=SMITHERY_CONNECT
