"use strict"
// Immutable, owner-scoped fact sets and server-rendered files. A historical
// snapshot never grants continued access to a source that has since been revoked.
function fault(code,status){var e=new Error(code);e.code=code;e.httpStatus=status||400;throw e}
function ensure(app){
  app.db().newQuery("CREATE TABLE IF NOT EXISTS agent_studio_fact_sets (id TEXT PRIMARY KEY,owner_uid TEXT NOT NULL,case_id TEXT NOT NULL,payload TEXT NOT NULL,content_hash TEXT NOT NULL,created_ms INTEGER NOT NULL)").execute()
  app.db().newQuery("CREATE TABLE IF NOT EXISTS agent_studio_business_reports (id TEXT PRIMARY KEY,owner_uid TEXT NOT NULL,case_id TEXT NOT NULL,fact_set_id TEXT NOT NULL,template_id TEXT NOT NULL,format TEXT NOT NULL,content TEXT NOT NULL,content_hash TEXT NOT NULL,manifest TEXT NOT NULL,idempotency_key TEXT NOT NULL,request_hash TEXT NOT NULL,created_ms INTEGER NOT NULL,UNIQUE(owner_uid,case_id,idempotency_key))").execute()
}
function data(){return require(__hooks+"/modules/business_data.js")}
function currentManifest(app,uid,caseId){
  var schemas=require(__hooks+"/modules/business_schemas.js").names,manifest=[]
  for(var i=0;i<schemas.length;i++){
    var offset=0,more=true
    while(more){
      var page=data().query(app,uid,caseId,{schema_id:schemas[i],offset:offset,limit:50})
      for(var j=0;j<page.items.length;j++)manifest.push({record_id:page.items[j].record_id,version:page.items[j].version})
      if(manifest.length>600)fault("fact_set_record_limit",413)
      offset=page.next_offset;more=page.has_more
    }
  }
  return manifest.sort(function(a,b){return a.record_id<b.record_id?-1:a.record_id>b.record_id?1:0})
}
function freeze(app,uid,caseId,id,pins){
  // Called within the job completion transaction: current versions, quality
  // assessment, immutable payload and final job status commit together.
  var c=data().caseGet(app,uid,caseId),schemas=require(__hooks+"/modules/business_schemas.js")
  var sorted=pins.slice().sort(function(a,b){return a.record_id<b.record_id?-1:a.record_id>b.record_id?1:0})
  if(schemas.canonical(sorted)!==schemas.canonical(currentManifest(app,uid,caseId)))fault("fact_set_inputs_changed",409)
  var records=sorted.map(function(pin){return data().get(app,uid,caseId,pin.record_id,pin.version)}),references=[],seen=Object.create(null),queue=records.slice()
  records.forEach(function(record){seen[record.record_id+":"+record.version]=true})
  while(queue.length){
    var item=queue.shift()
    item.relation_versions.forEach(function(link){
      var key=link.record_id+":"+link.version
      if(seen[key])return
      seen[key]=true
      var historical=data().get(app,uid,caseId,link.record_id,link.version)
      references.push(historical);queue.push(historical)
      if(references.length>1200)fault("fact_set_relation_limit",413)
    })
  }
  var quality=require(__hooks+"/modules/business_quality.js").validate(app,uid,caseId,"research.evidence.v1")
  if(quality.business_quality==="blocked")fault("fact_set_source_unavailable",403)
  var payload={schema_id:"research.fact_set.v1",case:c,records:records,reference_records:references,quality:quality,relation_quality:require(__hooks+"/modules/business_quality.js").validate(app,uid,caseId,"research.relationships.v1"),created_ms:new Date().getTime()}
  var raw=JSON.stringify(payload)
  if(raw.length>2000000)fault("fact_set_size_limit",413)
  app.db().newQuery("INSERT INTO agent_studio_fact_sets (id,owner_uid,case_id,payload,content_hash,created_ms) VALUES ({:id},{:uid},{:cid},{:raw},{:hash},{:now})")
    .bind({id:id,uid:uid,cid:caseId,raw:raw,hash:$security.sha256(raw),now:payload.created_ms}).execute()
  return {fact_set_id:id,content_hash:$security.sha256(raw),record_count:records.length,quality:quality,data_space:c.data_space}
}
function get(app,uid,caseId,id){
  data().caseGet(app,uid,caseId)
  var row=new DynamicModel({id:"",payload:"",content_hash:"",created_ms:0})
  try{app.db().newQuery("SELECT id,payload,content_hash,created_ms FROM agent_studio_fact_sets WHERE id={:id} AND owner_uid={:uid} AND case_id={:cid}")
    .bind({id:String(id),uid:uid,cid:caseId}).one(row)}catch(_){fault("fact_set_not_found",404)}
  var payload=JSON.parse(String(row.payload))
  if($security.sha256(String(row.payload))!==String(row.content_hash))fault("fact_set_integrity_error",500)
  payload.records.concat(payload.reference_records||[]).forEach(function(record){data().get(app,uid,caseId,record.record_id,record.version)})
  return {fact_set_id:String(row.id),content_hash:String(row.content_hash),payload:payload,created_ms:Number(row.created_ms)}
}
function escape(value){return String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}
function sourceKey(ref){return JSON.stringify([ref.material_id||"",ref.segment_id||"",ref.run_id||"",ref.result_id||"",ref.start,ref.end,ref.quote])}
function excerpt(text,max,label){if(text.length<=max)return text;var end=max,code=text.charCodeAt(end-1);if(code>=0xD800&&code<=0xDBFF)end--;return text.slice(0,end)+"… ["+label+"]"}
function renderText(factSet,template){
  var p=factSet.payload,quality=template==="research.relationships.v1"?p.relation_quality||{business_quality:"unverified"}:p.quality,lines=[p.case.title,"事实集："+factSet.fact_set_id,"事实集哈希："+factSet.content_hash,"数据空间："+p.case.data_space,
    (template==="research.relationships.v1"?"关系记录质量：":"问题记录质量：")+quality.business_quality+"；自由文本报告质量：未验证。","快照时间："+new Date(p.created_ms).toISOString(),""]
  // Briefs use compact paragraphs, retaining every frozen pin, quote and scope.
  // A small three-question case can fit one page without shrinking type or
  // silently discarding citations. Larger briefs still flow onto more pages.
  var brief=template==="research.brief.v1"
  if(brief)lines=[p.case.title,"事实集："+factSet.fact_set_id,"事实集哈希："+factSet.content_hash,
    "数据空间："+p.case.data_space+" · 快照时间："+new Date(p.created_ms).toISOString(),
    "问题记录质量："+quality.business_quality+"；自由文本报告质量：未验证。",""]
  var excerpts=[],answers=p.records.filter(function(r){return r.schema_id==="research.answer.v1"})
  if(template!=="research.relationships.v1")p.case.questions.forEach(function(q){
    lines.push(q.question+"（"+q.question_id+"）")
    var matches=answers.filter(function(a){return a.payload.question_id===q.question_id})
    if(matches.length!==1){lines.push(matches.length?"存在多个答案版本对象，需复核。":"未知：尚无正式答案。","");return}
    var a=matches[0],answer=a.payload.answer
    if(template==="research.brief.v1"&&answer.length>1200){answer=excerpt(answer,1200,"摘要节选；完整内容见事实集");excerpts.push(a.record_id)}
    if(brief){
      lines.push("状态："+a.payload.status+" · "+answer,"截至："+a.payload.as_of+" · 记录："+a.record_id+" v"+a.version)
      if(a.payload.missing.length)lines.push("缺口："+a.payload.missing.join("；"))
    }else lines.push("状态："+a.payload.status,answer,"截至："+a.payload.as_of,"缺口："+(a.payload.missing.join("；")||"未声明"),"记录："+a.record_id+" v"+a.version)
    a.relation_versions.forEach(function(link){var claim=p.records.concat(p.reference_records||[]).filter(function(r){return r.record_id===link.record_id&&r.version===link.version})[0];if(claim)lines.push("依据："+claim.record_id+" v"+claim.version+" · "+claim.payload.predicate+" · "+claim.payload.object_value)})
    lines.push("")
  })
  if(template!=="research.brief.v1"){
    lines.push("对象及固定版本事实")
    p.records.concat(p.reference_records||[]).forEach(function(r){
      if(r.schema_id==="research.answer.v1"||(r.schema_id==="research.relation.v1"&&template==="research.relationships.v1"))return
      var v=r.payload,role=p.records.some(function(item){return item.record_id===r.record_id&&item.version===r.version})?"当前版本":"历史引用版本"
      if(r.schema_id==="research.entity.v1")lines.push("对象："+v.canonical_name+" · "+v.entity_type,"身份状态："+v.identity_status,"别名："+(v.aliases.join("；")||"未声明"),"身份依据："+(v.identity_basis||"未声明"))
      else if(r.schema_id==="research.claim.v1")lines.push("事实："+v.predicate+" · "+v.object_value,"主体："+v.subject_id,"状态："+v.status,"有效时间："+(v.valid_from||"未知")+" 至 "+(v.valid_to||"未声明结束"),"缺口："+(v.missing.join("；")||"未声明"))
      else if(r.schema_id==="research.relation.v1")lines.push("关系："+v.from_id+" → "+v.to_id+" · "+v.relation_type,v.description,"状态："+v.status,"有效时间："+(v.valid_from||"未知")+" 至 "+(v.valid_to||"未声明结束"),"缺口："+(v.missing.join("；")||"未声明"))
      lines.push("记录："+r.record_id+" v"+r.version+" · "+role,"")
    })
  }
  if(template==="research.relationships.v1"){
    lines.push("关系专题", "仅展示正式关系记录，不推断离职、现实引荐能力或严格人脉路径。", "关系规则验收："+(p.relation_quality?p.relation_quality.business_quality:"unverified"))
    var relations=p.records.filter(function(r){return r.schema_id==="research.relation.v1"})
    if(!relations.length)lines.push("未知：事实集中尚无正式关系记录。")
    relations.forEach(function(r){var names=r.relation_versions.map(function(pin){var item=p.records.concat(p.reference_records||[]).filter(function(e){return e.record_id===pin.record_id&&e.version===pin.version})[0];return item?item.payload.canonical_name+"（"+item.record_id+" v"+item.version+"）":pin.record_id})
      lines.push(names.join(" → ")+" · "+r.payload.relation_type,r.payload.description,"状态："+r.payload.status,"有效时间："+(r.payload.valid_from||"未知")+" 至 "+(r.payload.valid_to||"未声明结束"),"缺口："+(r.payload.missing.join("；")||"未声明"),"关系记录："+r.record_id+" v"+r.version,"")
    })
  }
  lines.push("证据定位（按冻结版本；在线访问仍需当前员工和来源权限）：")
  var seen=Object.create(null),groups=[],refs=0
  p.records.concat(p.reference_records||[]).forEach(function(record){record.source_refs.forEach(function(ref){
    var key=sourceKey(ref),group=seen[key],pin=record.record_id+" v"+record.version
    if(!group){group={ref:ref,pins:[]};seen[key]=group;groups.push(group)}
    if(group.pins.indexOf(pin)<0)group.pins.push(pin)
  })})
  groups.forEach(function(group){var ref=group.ref;refs++
    var quote=ref.quote
    if(template==="research.brief.v1"&&quote.length>300){quote=excerpt(quote,300,"引文节选");excerpts.push(ref.material_id?ref.material_id+":"+ref.segment_id:ref.result_id)}
    var locator=(ref.material_id?"材料 "+ref.material_id+" / segment "+ref.segment_id:"Run "+ref.run_id+" / result "+ref.result_id)+" / UTF-16 "+ref.start+":"+ref.end
    if(brief)lines.push(locator,"引用记录："+group.pins.join("；")+" · "+quote,"")
    else lines.push(locator,"引用记录："+group.pins.join("；"),quote,"")
  })
  if(!refs)lines.push("没有已锚定的证据，不得作为已验证研究结论。")
  return {text:lines.join("\n"),excerpted_fields:excerpts,source_count:refs}
}
function receipt(row){return {report_id:String(row.id),fact_set_id:String(row.fact_set_id),template_id:String(row.template_id),format:String(row.format),content_hash:String(row.content_hash),manifest:JSON.parse(String(row.manifest)),created_ms:Number(row.created_ms),file_ready:true}}
function render(app,uid,caseId,input){
  var schemas=require(__hooks+"/modules/business_schemas.js")
  schemas.object(input,["fact_set_id","template_id","format","idempotency_key"]);schemas.string(input.idempotency_key,120)
  if(["research.brief.v1","research.full.v1","research.relationships.v1"].indexOf(input.template_id)<0)fault("report_template_not_registered")
  if(["html","md","docx","pdf","xlsx"].indexOf(input.format)<0)fault("report_format_not_registered")
  if(["docx","pdf","xlsx"].indexOf(input.format)>=0)return require(__hooks+"/modules/report_jobs.js").submit(app,uid,caseId,input)
  var snapshot=get(app,uid,caseId,String(input.fact_set_id)),hash=$security.sha256(schemas.canonical(input)),id=""
  app.runInTransaction(function(tx){
    var queued=arrayOf(new DynamicModel({request_hash:""}))
    tx.db().newQuery("SELECT request_hash FROM agent_studio_business_jobs WHERE owner_uid={:uid} AND case_id={:cid} AND idempotency_key={:key}").bind({uid:uid,cid:caseId,key:"report:"+input.idempotency_key}).all(queued)
    if(queued.length&&String(queued[0].request_hash)!==hash)fault("report_idempotency_conflict",409)
    var old=arrayOf(new DynamicModel({id:"",request_hash:""}))
    tx.db().newQuery("SELECT id,request_hash FROM agent_studio_business_reports WHERE owner_uid={:uid} AND case_id={:cid} AND idempotency_key={:key}")
      .bind({uid:uid,cid:caseId,key:input.idempotency_key}).all(old)
    if(old.length){if(String(old[0].request_hash)!==hash)fault("report_idempotency_conflict",409);id=String(old[0].id);return}
    var rendered=renderText(snapshot,input.template_id),content=rendered.text,mime="text/markdown; charset=utf-8"
    if(input.format==="html"){
      mime="text/html; charset=utf-8"
      content='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(snapshot.payload.case.title)+'</title><style>body{max-width:860px;margin:40px auto;padding:0 20px;font:16px/1.6 system-ui}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}footer{font-size:12px;color:#555}</style><main><pre>'+escape(content)+'</pre></main><footer>Agent Studio · '+escape(snapshot.fact_set_id)+'</footer></html>'
    }
    if(content.length>2000000)fault("report_size_limit",413)
    id=$security.randomString(20)
    var manifest={schema_id:"research.report.v1",mime_type:mime,renderer:"studio.research-text.v1",fact_set_hash:snapshot.content_hash,data_space:snapshot.payload.case.data_space,
      excerpted_fields:rendered.excerpted_fields,source_count:rendered.source_count,quality_scope:input.template_id==="research.relationships.v1"?"declared_relation_records_only":"structured_question_records_only",quality_snapshot:(input.template_id==="research.relationships.v1"?snapshot.payload.relation_quality||{business_quality:"unverified"}:snapshot.payload.quality).business_quality,free_text_report_quality:"unverified"}
    tx.db().newQuery("INSERT INTO agent_studio_business_reports (id,owner_uid,case_id,fact_set_id,template_id,format,content,content_hash,manifest,idempotency_key,request_hash,created_ms) VALUES ({:id},{:uid},{:cid},{:fid},{:tid},{:format},{:content},{:hash},{:manifest},{:key},{:request},{:now})")
      .bind({id:id,uid:uid,cid:caseId,fid:snapshot.fact_set_id,tid:input.template_id,format:input.format,content:content,hash:$security.sha256(content),manifest:JSON.stringify(manifest),key:input.idempotency_key,request:hash,now:new Date().getTime()}).execute()
  })
  return report(app,uid,caseId,id,false)
}
function report(app,uid,caseId,id,withContent){
  data().caseGet(app,uid,caseId)
  var r=new DynamicModel({id:"",fact_set_id:"",template_id:"",format:"",content:"",content_hash:"",manifest:"",created_ms:0})
  try{app.db().newQuery("SELECT id,fact_set_id,template_id,format,content,content_hash,manifest,created_ms FROM agent_studio_business_reports WHERE id={:id} AND owner_uid={:uid} AND case_id={:cid}")
    .bind({id:String(id),uid:uid,cid:caseId}).one(r)}catch(_){fault("report_not_found",404)}
  get(app,uid,caseId,String(r.fact_set_id))
  if($security.sha256(String(r.content))!==String(r.content_hash))fault("report_integrity_error",500)
  var result=receipt(r);if(withContent)result.content=String(r.content);return result
}
function list(app,uid,caseId){
  data().caseGet(app,uid,caseId)
  var rows=arrayOf(new DynamicModel({id:""})),items=[]
  app.db().newQuery("SELECT id FROM agent_studio_business_reports WHERE owner_uid={:uid} AND case_id={:cid} ORDER BY created_ms DESC,id LIMIT 50").bind({uid:uid,cid:caseId}).all(rows)
  for(var i=0;i<rows.length;i++){
    try{items.push(report(app,uid,caseId,String(rows[i].id),false))}
    catch(err){if(err.httpStatus!==403)throw err}
  }
  return {items:items,limit:50}
}
function sourceRefs(app,uid,caseId){
  var refs=[],seen=Object.create(null)
  currentManifest(app,uid,caseId).forEach(function(pin){data().get(app,uid,caseId,pin.record_id,pin.version).source_refs.forEach(function(ref){var key=sourceKey(ref);if(!seen[key]){seen[key]=true;refs.push(ref)}})})
  return refs
}
function sourceRuns(app,uid,caseId){return data().runDependencies(app,uid,caseId,currentManifest(app,uid,caseId).map(function(pin){return data().get(app,uid,caseId,pin.record_id,pin.version)}))}
module.exports={ensure:ensure,freeze:freeze,get:get,currentManifest:currentManifest,sourceRefs:sourceRefs,sourceRuns:sourceRuns,render:render,report:report,list:list,renderText:renderText}
