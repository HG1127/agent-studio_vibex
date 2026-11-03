"use strict"
// Private immutable originals and parse receipts. File IDs are locators, not
// bearer capabilities. Parsing never claims image/OCR or whole-source coverage.
function fault(code,status){var e=new Error(code);e.code=code;e.httpStatus=status||400;throw e}
function ensure(app){
  app.db().newQuery("CREATE TABLE IF NOT EXISTS agent_studio_materials (id TEXT PRIMARY KEY,owner_uid TEXT NOT NULL,case_id TEXT NOT NULL,filename TEXT NOT NULL,data_space TEXT NOT NULL,base_id TEXT NOT NULL,base64 TEXT NOT NULL,byte_count INTEGER NOT NULL,storage_hash TEXT NOT NULL,idempotency_key TEXT NOT NULL,request_hash TEXT NOT NULL,parse_receipt TEXT NOT NULL,job_id TEXT NOT NULL,created_ms INTEGER NOT NULL,UNIQUE(owner_uid,case_id,idempotency_key))").execute()
  app.db().newQuery("CREATE TABLE IF NOT EXISTS agent_studio_material_segments (material_id TEXT NOT NULL,segment_id TEXT NOT NULL,text TEXT NOT NULL,locator TEXT NOT NULL,PRIMARY KEY(material_id,segment_id))").execute()
}
function strictBase64(value){
  var alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  if(typeof value!=="string"||!value||value.length>5592408||value.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))fault("invalid_material_base64")
  var padding=value.slice(-2)==="=="?2:value.slice(-1)==="="?1:0,last=alphabet.indexOf(value.charAt(value.length-padding-1))
  if(padding===2&&(last&15)!==0||padding===1&&(last&3)!==0)fault("invalid_material_base64")
  var size=value.length/4*3-padding
  if(size<1||size>4194304)fault("material_size_limit",413)
  return size
}
function authorize(app,uid,id){
  if(!uid)fault("studio_login_required",401)
  var row=new DynamicModel({id:"",case_id:"",filename:"",data_space:"",base_id:"",byte_count:0,storage_hash:"",parse_receipt:"",job_id:"",created_ms:0})
  try{app.db().newQuery("SELECT id,case_id,filename,data_space,base_id,byte_count,storage_hash,parse_receipt,job_id,created_ms FROM agent_studio_materials WHERE id={:id} AND owner_uid={:uid}").bind({id:String(id),uid:uid}).one(row)}catch(_){fault("material_not_found",404)}
  require(__hooks+"/modules/business_data.js").caseGet(app,uid,String(row.case_id))
  if(row.base_id){try{require(__hooks+"/modules/knowledge_acl.js").resolve(app,uid,String(row.base_id),"viewer")}catch(_){fault("material_source_unavailable",403)}}
  return row
}
function get(app,uid,id){
  var r=authorize(app,uid,id),receipt=JSON.parse(String(r.parse_receipt)||"null")
  var job=new DynamicModel({status:"",error:""})
  if(r.job_id){try{app.db().newQuery("SELECT status,error FROM agent_studio_business_jobs WHERE id={:id} AND owner_uid={:uid}").bind({id:String(r.job_id),uid:uid}).one(job)}catch(_){}}
  return {material_id:String(r.id),case_id:String(r.case_id),filename:String(r.filename),data_space:String(r.data_space),byte_count:Number(r.byte_count),storage_hash:String(r.storage_hash),hash_encoding:"base64_utf8_sha256",job_id:String(r.job_id),job_status:String(job.status),job_error:String(job.error),parse:receipt,created_ms:Number(r.created_ms)}
}
function original(app,uid,id){
  var info=get(app,uid,id),row=new DynamicModel({base64:""})
  app.db().newQuery("SELECT base64 FROM agent_studio_materials WHERE id={:id} AND owner_uid={:uid}").bind({id:String(id),uid:uid}).one(row)
  if($security.sha256(String(row.base64))!==info.storage_hash)fault("material_integrity_error",500)
  return {material:info,base64:String(row.base64)}
}
function upload(app,uid,caseId,input){
  var schemas=require(__hooks+"/modules/business_schemas.js")
  schemas.object(input,["filename","base64","knowledge_base_id","idempotency_key"])
  schemas.string(input.filename,160);schemas.string(input.idempotency_key,120)
  if(/[/\\\x00-\x1f\x7f]/.test(input.filename)||!/^.+\.(pdf|docx|xlsx|txt|md|csv|tsv)$/i.test(input.filename))fault("material_format_not_supported")
  var bytes=strictBase64(input.base64),caseInfo=require(__hooks+"/modules/business_data.js").caseGet(app,uid,caseId),baseId=String(input.knowledge_base_id||"")
  if(baseId)require(__hooks+"/modules/knowledge_acl.js").resolve(app,uid,baseId,"editor")
  var hash=$security.sha256(input.base64),request=$security.sha256(schemas.canonical({filename:input.filename,storage_hash:hash,base_id:baseId})),id=""
  app.runInTransaction(function(tx){
    var old=arrayOf(new DynamicModel({id:"",request_hash:""}))
    tx.db().newQuery("SELECT id,request_hash FROM agent_studio_materials WHERE owner_uid={:uid} AND case_id={:cid} AND idempotency_key={:key}").bind({uid:uid,cid:caseId,key:input.idempotency_key}).all(old)
    if(old.length){if(String(old[0].request_hash)!==request)fault("material_idempotency_conflict",409);id=String(old[0].id);return}
    id=$security.randomString(20)
    tx.db().newQuery("INSERT INTO agent_studio_materials (id,owner_uid,case_id,filename,data_space,base_id,base64,byte_count,storage_hash,idempotency_key,request_hash,parse_receipt,job_id,created_ms) VALUES ({:id},{:uid},{:cid},{:filename},{:space},{:base},{:bytes},{:count},{:hash},{:key},{:request},'null','',{:now})")
      .bind({id:id,uid:uid,cid:caseId,filename:input.filename,space:caseInfo.data_space,base:baseId,bytes:input.base64,count:bytes,hash:hash,key:input.idempotency_key,request:request,now:new Date().getTime()}).execute()
  })
  // Retry after a process loss between original storage and enqueue returns the
  // same material and same job. Original bytes are never silently overwritten.
  var job=require(__hooks+"/modules/business_jobs.js").submit(app,uid,caseId,"",{type:"material.parse.v1",material_id:id,idempotency_key:"material.parse:"+id})
  app.db().newQuery("UPDATE agent_studio_materials SET job_id={:job} WHERE id={:id} AND owner_uid={:uid}").bind({id:id,uid:uid,job:job.job_id}).execute()
  return get(app,uid,id)
}
function list(app,uid,caseId){
  require(__hooks+"/modules/business_data.js").caseGet(app,uid,caseId)
  var rows=arrayOf(new DynamicModel({id:""})),items=[]
  app.db().newQuery("SELECT id FROM agent_studio_materials WHERE owner_uid={:uid} AND case_id={:cid} ORDER BY created_ms DESC,id LIMIT 100").bind({uid:uid,cid:caseId}).all(rows)
  rows.forEach(function(r){try{items.push(get(app,uid,String(r.id)))}catch(err){if(err.httpStatus!==403)throw err}})
  return {items:items,limit:100}
}
function read(app,uid,id,input){
  var material=get(app,uid,id)
  if(!material.parse)fault("material_not_parsed",409)
  var segment=String(input.segment_id||""),offset=input.offset===undefined?0:input.offset,limit=input.limit===undefined?4000:input.limit
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>8000)fault("invalid_material_range")
  var row=new DynamicModel({text:"",locator:""})
  try{app.db().newQuery("SELECT text,locator FROM agent_studio_material_segments WHERE material_id={:id} AND segment_id={:segment}").bind({id:String(id),segment:segment}).one(row)}catch(_){fault("material_segment_not_found",404)}
  var text=String(row.text)
  if(offset>text.length)fault("invalid_material_range")
  return {material_id:String(id),segment_id:segment,offset:offset,end:Math.min(offset+limit,text.length),total_length:text.length,text:text.slice(offset,offset+limit),locator:JSON.parse(String(row.locator)),coverage:material.parse.coverage,data_space:material.data_space,storage_hash:material.storage_hash}
}
function segments(app,uid,id,offset){
  get(app,uid,id)
  if(!Number.isInteger(offset)||offset<0)fault("invalid_material_range")
  var rows=arrayOf(new DynamicModel({segment_id:"",locator:""}))
  app.db().newQuery("SELECT segment_id,locator FROM agent_studio_material_segments WHERE material_id={:id} ORDER BY rowid LIMIT 50 OFFSET {:offset}").bind({id:String(id),offset:offset}).all(rows)
  return {items:rows.map(function(r){return {segment_id:String(r.segment_id),locator:JSON.parse(String(r.locator))}}),offset:offset,next_offset:offset+rows.length,has_more:rows.length===50}
}
function commitParsed(app,uid,id,parsed){
  var material=get(app,uid,id)
  if(material.parse)fault("material_already_parsed",409)
  if(!parsed||parsed.schema_id!=="studio.material_parse.v1"||parsed.storage_hash!==material.storage_hash||!/^[a-f0-9]{64}$/.test(parsed.binary_sha256)||!Array.isArray(parsed.segments)||parsed.segments.length>20000||JSON.stringify(parsed).length>6000000)fault("invalid_parse_receipt",422)
  var seen=Object.create(null),total=0
  parsed.segments.forEach(function(segment){
    if(!segment||typeof segment.segment_id!=="string"||!segment.segment_id||segment.segment_id.length>150||seen[segment.segment_id]||typeof segment.text!=="string"||!segment.locator||typeof segment.locator!=="object")fault("invalid_parse_segment",422)
    seen[segment.segment_id]=true;total+=segment.text.length
    if(total>200000)fault("parsed_text_limit",413)
    app.db().newQuery("INSERT INTO agent_studio_material_segments (material_id,segment_id,text,locator) VALUES ({:id},{:sid},{:text},{:locator})").bind({id:String(id),sid:segment.segment_id,text:segment.text,locator:JSON.stringify(segment.locator)}).execute()
  })
  if(!parsed.coverage||parsed.coverage.segment_count!==parsed.segments.length||parsed.coverage.text_characters!==total||!Array.isArray(parsed.coverage.omissions)||parsed.coverage.ocr_performed!==false)fault("invalid_parse_coverage",422)
  var receipt={schema_id:parsed.schema_id,binary_sha256:parsed.binary_sha256,storage_hash:parsed.storage_hash,coverage:parsed.coverage,parsed_ms:new Date().getTime()}
  app.db().newQuery("UPDATE agent_studio_materials SET parse_receipt={:receipt} WHERE id={:id} AND owner_uid={:uid} AND parse_receipt='null'").bind({id:String(id),uid:uid,receipt:JSON.stringify(receipt)}).execute()
  return {material_id:String(id),parse:receipt}
}
module.exports={ensure:ensure,strictBase64:strictBase64,authorize:authorize,get:get,original:original,upload:upload,list:list,read:read,segments:segments,commitParsed:commitParsed}
