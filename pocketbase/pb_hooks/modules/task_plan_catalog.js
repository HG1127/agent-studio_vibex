"use strict"
// Reads only current owner-scoped resources. Secrets stay out of planner prompts and review UI.
function collect(app, cfg, spec, owner, localDevices, sha256) {
  var allowed=Array.isArray(spec.tools)?spec.tools:[], result=[], tools=cfg.tools||{}
  var builtin={calculate:"对算术表达式求值",summarize:"整理已提供的文本",knowledge_search:"检索已绑定且有权限的知识库",web_search:"联网搜索",web_fetch:"读取指定公开网页"}
  Object.keys(builtin).forEach(function(id){if(tools[id]===true&&allowed.indexOf(id)>=0)result.push({id:id,description:builtin[id],approval_required:false,signature:sha256("builtin-v1:"+id)})})
  var conns=app.findRecordsByFilter("tool_connections","rh_user_id = {:uid} && enabled = true","-created",100,0,{uid:owner})
  var seen=Object.create(null), counts=Object.create(null)
  conns.forEach(function(rec){var name=String(rec.getString("name")||"");counts[name]=(counts[name]||0)+1})
  conns.forEach(function(rec){
    var id=String(rec.getString("name")||""),status=String(rec.getString("status")||"")
    if(!id||seen[id]||counts[id]!==1||Object.prototype.hasOwnProperty.call(builtin,id)||id==="local_computer"||id.indexOf("mkt__")===0||tools[id]!==true||allowed.indexOf(id)<0||["ok","success","connected"].indexOf(status)<0)return
    seen[id]=true
    result.push({id:id,description:String(rec.getString("description")||"").slice(0,400),approval_required:String(rec.getString("method")||"POST").toUpperCase()!=="GET",signature:sha256([rec.id,rec.getString("method"),rec.getString("url"),rec.getString("headers"),rec.getString("body_template")].join("\n"))})
  })
  var markets=app.findRecordsByFilter("market_connections","rh_user_id = {:uid} && enabled = true && last_probe_status = 'ok' && tool_count > 0","-created",50,0,{uid:owner})
  markets.forEach(function(rec){
    var entries=[];try{entries=JSON.parse(rec.getString("tools")||"[]")}catch(_){}
    if(!Array.isArray(entries))return
    entries.forEach(function(t){var id="mkt__"+rec.id+"__"+String(t.name||"");if(allowed.indexOf(id)<0||(cfg.market_tool_ids||[]).indexOf(id)<0||result.length>=80)return
      result.push({id:id,description:String(t.description||"").slice(0,400),approval_required:true,signature:sha256(localDevices.canonical([rec.id,rec.getString("url"),rec.getString("headers_sec"),t]))})
    })
  })
  if(cfg.local_device_id&&tools.local_computer===true&&allowed.indexOf("local_computer")>=0){
    var device=localDevices.device(app,cfg.local_device_id,owner),now=Date.now()
    if(Number(device.seen_ms)<=now&&now-Number(device.seen_ms)<45000){
      var rows=JSON.parse(device.catalog||"[]")
      if(Array.isArray(rows)&&rows.length)result.push({id:"local_computer",description:"本人所选电脑；每项本机调用仍需独立批准",approval_required:true,local_tools:rows.map(function(t){return t.name}),local_catalog:rows.map(function(t){return {name:t.name,description:String(t.description||"").slice(0,200),inputSchema:t.inputSchema}}),signature:sha256(device.id+":"+localDevices.canonical(rows))})
    }
  }
  return result
}
module.exports={collect:collect}
