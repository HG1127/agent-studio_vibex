"use strict"
// Server-owned authoring registry. Requirement inference proposes dependencies;
// it never turns prose, provider hints or a tool name into a capability grant.
var catalog={
  durable_results:{title:"持久化工具结果",state:"native",limits:"PB Agent 文本/JSON，单结果 4Mi UTF-16；Workflow/PG 尚无同等能力",tools:[]},
  case_records:{title:"跨运行正式事实",state:"native",limits:"需运行时绑定 case；四类受控记录，身份治理和严格路径规则仍需扩展",tools:["business_record_write"]},
  material_text:{title:"原始材料文字提取与定位",state:"native",limits:"私有原件≤4MiB；PDF文字/DOCX/XLSX；OCR未接入，遗漏范围明确列出",tools:["business_material_read"]},
  immutable_reports:{title:"冻结事实集与报告",state:"native",limits:"HTML/Markdown 简报、完整报告和关系专题；自由文本质量未认证",tools:["business_job_submit","business_report_render"]},
  evidence_validation:{title:"服务端证据验收",state:"native",limits:"逐字引文、版本与权限检查；语义支持需人工复核",tools:[]},
  ocr:{title:"扫描材料 OCR",state:"development_required",limits:"尚无受控 OCR 适配器；连接名含 OCR 不构成支持",tools:[]},
  relation_graph:{title:"可追溯业务关系图",state:"development_required",limits:"尚无事件图、边证据与可逆身份治理视图",tools:[]},
  monitoring:{title:"外部增量监测与语义变化提醒",state:"configuration_required",limits:"已有绑定计划、精确来源、固定基线及复核后关系事件；需配置采集计划、已确认人物、来源完整性适配器和预算；非全网覆盖或严格领域推理认证",tools:["business_record_write"]},
  stage_dag:{title:"研究阶段依赖与分问题预算",state:"configuration_required",limits:"工作流研究模式已有持久子 Run、补查预览和累计预算；AgentSpec 的 task_plan 尚未自动绑定可执行 DAG",tools:[]},
  office_reports:{title:"事实集 DOCX/PDF/XLSX 报告",state:"configuration_required",limits:"已接入冻结事实集的异步文件渲染；需专用 Node Worker、项目依赖及包含原文字符的 PDF 字体；提交不等同于文件完成",tools:["business_report_render","business_job_status"]},
  strict_paths:{title:"严格人脉路线与关系准入",state:"development_required",limits:"尚无完整事件、独立来源、有效时间与路径准入验证器",tools:[]},
  scoped_grants:{title:"限范围批量工具授权",state:"native",limits:"仅登记的可信只读适配器；逐项完整请求、次数及有效期；未知 MCP 和写操作仍单次审批",tools:[]},
}
var nativeTools={calculate:1,summarize:1,knowledge_search:1,web_fetch:1,web_search:1,result_read:1,result_list:1,tool_contract_get:1,business_record_write:1,business_record_query:1,business_case_get:1,business_quality_check:1,business_job_submit:1,business_job_status:1,business_job_cancel:1,business_fact_set_get:1,business_report_render:1,business_material_list:1,business_material_read:1}
function mentioned(text,pattern){
  var regex=new RegExp(pattern,"ig"),match
  while((match=regex.exec(text))!==null){
    var prefix=text.slice(Math.max(0,match.index-16),match.index),suffix=text.slice(match.index+match[0].length,match.index+match[0].length+12)
    if(/(?:不需要|无需|不要|不做|不支持|未接入|暂不支持|暂未接入)\s*$/.test(prefix)||/^(?:功能)?(?:不需要|无需|不要)/.test(suffix))continue
    return true
  }
  return false
}
function derive(spec,originalText){
  spec=spec&&typeof spec==="object"&&!Array.isArray(spec)?spec:{}
  var text=[originalText||"",spec.goal||"",spec.task_scope||""].concat(spec.deliverables||[],spec.task_plan||[],spec.done_criteria||[]).join("\n")
  var tools=Array.isArray(spec.tools)?spec.tools:[],required=["durable_results"],seen=Object.create(null)
  seen.durable_results=true
  function add(id){if(!seen[id]){seen[id]=true;required.push(id)}}
  var rules=[
    ["case_records","结构化事实|正式事实|跨运行记录|业务记录版本|fact_set|people intelligence"],
    ["material_text","(?:读取|解析|提取|导入|上传)[^。\\n]{0,16}(?:PDF|XLSX|DOCX)|(?:PDF|XLSX|DOCX)[^。\\n]{0,10}(?:文字|解析|提取|名单|原件)|原始材料|原件定位|单元格"],
    ["immutable_reports","冻结事实集|同一事实集|fact_set|事实集报告"],
    ["evidence_validation","证据验收|逐字引文|证据检查|引文锚定"],
    ["ocr","\\bOCR\\b|识别扫描|提取扫描"],
    ["relation_graph","关系图|关系网络|人脉图谱|点边看证据"],
    ["monitoring","持续监测|持续监控|增量采集|变化提醒|语义差异"],
    ["stage_dag","阶段DAG|阶段依赖|分问题预算|按问题预算"],
    ["office_reports","(?:事实集|冻结事实)[^。\\n]{0,40}(?:DOCX|PDF|XLSX)|(?:DOCX|PDF|XLSX)[^。\\n]{0,40}(?:事实集|冻结事实)"],
    ["strict_paths","严格路线|严格人脉|关系准入|路径准入"],
    ["scoped_grants","批量授权|范围授权|限额授权|免逐次审批"],
  ]
  rules.forEach(function(rule){if(mentioned(text,rule[1]))add(rule[0])})
  tools.forEach(function(tool){if(/^business_/.test(String(tool)))add("case_records");if(tool==="business_material_read")add("material_text");if(tool==="business_report_render"||tool==="business_job_submit")add("immutable_reports")})
  if(Array.isArray(spec.capability_requirements))spec.capability_requirements.forEach(function(item){
    if(desktopRequirement(item))rules.forEach(function(rule){if(mentioned(item.title+"\n"+item.purpose,rule[1]))add(rule[0])})
  })
  if(spec.research_capability_requirements!==undefined){
    if(!Array.isArray(spec.research_capability_requirements)||spec.research_capability_requirements.length>30)add("invalid_requirements")
    else spec.research_capability_requirements.forEach(function(id){add(typeof id==="string"&&id.length<=100?id:"invalid_requirements")})
  }
  if(spec.capability_requirements!==undefined){
    if(!Array.isArray(spec.capability_requirements)||spec.capability_requirements.length>30)add("invalid_requirements")
    else spec.capability_requirements.forEach(function(id){if(!desktopRequirement(id))add(typeof id==="string"&&id.length<=100?id:"invalid_requirements")})
  }
  if(seen.immutable_reports||seen.evidence_validation){add("case_records");add("evidence_validation")}
  if(seen.stage_dag)add("case_records")
  if(seen.monitoring||seen.relation_graph||seen.strict_paths){add("case_records");add("evidence_validation")}
  if(seen.ocr){add("material_text");add("case_records")}
  if(seen.office_reports){add("immutable_reports");add("case_records");add("evidence_validation")}
  var items=required.map(function(id){
    var definition=Object.prototype.hasOwnProperty.call(catalog,id)?catalog[id]:{title:"未注册能力："+id,state:"development_required",limits:"服务端未注册，不能由提示词声明为已实现",tools:[]}
    var missing=definition.tools.filter(function(tool){return tools.indexOf(tool)<0})
    return {id:id,title:definition.title,state:definition.state==="native"&&missing.length?"configuration_required":definition.state,limits:definition.limits,required_tools:definition.tools,missing_tools:missing,inference:"rules_and_explicit_requirements"}
  })
  var business=seen.case_records||seen.material_text||seen.immutable_reports
  return {schema_id:"studio.capability_plan.v1",runtime:"pocketbase_agent",requirements:items,
    input_contract:{type:"object",required:business?["instruction","case_id"]:["instruction"],properties:{instruction:{type:"string",minLength:1},case_id:{type:"string",description:"运行前创建或绑定的本人业务任务"}}},
    task_stages:(Array.isArray(spec.task_plan)?spec.task_plan:[]).slice(0,30).map(function(title,i){return {stage_id:"plan_"+(i+1),title:String(title),execution_support:"unstructured_plan_only"}}),
    data_objects:business?["research.entity.v1","research.claim.v1","research.answer.v1","research.relation.v1"]:[],
    artifacts:seen.immutable_reports?["research.fact_set.v1","research.brief.v1:html,md,docx,pdf,xlsx","research.full.v1:html,md,docx,pdf,xlsx","research.relationships.v1:html,md,docx,pdf,xlsx"]:[],
    validators:seen.evidence_validation?[{id:"research.evidence.v1",scope:"structured_records_only",semantic_review:"human_required",free_text_quality:"unverified"}]:[],
    scope_note:"能力依赖检查，不是研究质量或生产就绪认证；模型连接在运行开始前另行验证"}
}
function compile(app,uid,spec){
  spec=spec&&typeof spec==="object"&&!Array.isArray(spec)?spec:{}
  var original=require(__hooks+"/modules/authoring_requirements.js").context(app,uid,spec)
  var plan=derive(spec,original?original.text:""),tools=Array.isArray(spec.tools)?spec.tools:[]
  plan.original_requirements=original?{state:original.complete_original?"recorded":"revision_only",request_id:original.request_id,chain_hash:original.chain_hash,entry_count:original.entry_count}:{state:"unrecorded",note:"仅检查当前方案，不能证明原始需求已完整保留"}
  plan.bindings=tools.slice(0,60).map(function(name){
    name=String(name)
    if(Object.prototype.hasOwnProperty.call(nativeTools,name))return {tool:name,state:"native",requires_approval:false}
    if(name==="local_computer"){
      var devices=arrayOf(new DynamicModel({id:""}))
      try{app.db().newQuery("SELECT id FROM studio_local_devices WHERE owner={:uid} AND revoked=0 AND seen_ms>{:cutoff} AND catalog<>'[]' LIMIT 1").bind({uid:uid,cutoff:new Date().getTime()-45000}).all(devices)}catch(_){}
      return {tool:name,state:devices.length?"connected":"configuration_required",requires_approval:true,note:"运行前仍需选择本人在线设备"}
    }
    if(name.indexOf("mkt__")===0){
      var parts=/^mkt__([A-Za-z0-9]{15})__/.exec(name),record=null
      if(parts){try{record=app.findRecordById("market_connections",parts[1])}catch(_){}}
      var fingerprint=require(__hooks+"/modules/market_tool_admission.js").marketApprovalFingerprint(record,uid,name,function(raw){return $security.sha256(raw)})
      var supported=true,scopedAdapter=""
      if(fingerprint){
        try{
          var definitions=JSON.parse(record.getString("tools")||"[]"),toolDefinition=definitions.filter(function(item){return "mkt__"+String(record.id)+"__"+item.name===name})[0]
          require(__hooks+"/modules/tool_contracts.js").external(toolDefinition.input_schema,toolDefinition.output_schema)
          scopedAdapter=require(__hooks+"/modules/tool_grants.js").adapter(record.getString("url"),toolDefinition.name)
        }catch(_){supported=false}
      }
      return {tool:name,state:fingerprint&&supported?"connected":"configuration_required",requires_approval:true,scoped_grant_adapter:scopedAdapter}
    }
    var rows=[]
    try{rows=app.findRecordsByFilter("tool_connections","rh_user_id = {:uid} && name = {:name} && enabled = true","-created",1,0,{uid:uid,name:name})}catch(_){}
    var verified=rows.length&&require(__hooks+"/modules/tool_connection_admission.js").isVerifiedExternalToolRecord(rows[0],uid,name)
    return {tool:name,state:verified?"connected":"configuration_required",requires_approval:!verified||String(rows[0].getString("method")).toUpperCase()!=="GET"}
  })
  bindLegacyDesktopMaterial(plan,spec)
  plan.knowledge_bindings=(Array.isArray(spec.knowledge_base_ids)?spec.knowledge_base_ids:[]).slice(0,10).map(function(id){
    var accessible=false
    try{require(__hooks+"/modules/knowledge_acl.js").resolve(app,uid,String(id),"viewer");accessible=true}catch(_){}
    return {base_id:String(id),state:accessible?"connected":"configuration_required"}
  })
  plan.requirements.forEach(function(item){if(item.id==="scoped_grants"&&!plan.bindings.some(function(binding){return Boolean(binding.scoped_grant_adapter)})){item.state="configuration_required";item.limits+="；当前方案尚无可用的可信适配器连接"}})
  plan.ready_for_release=plan.requirements.every(function(item){return item.state==="native"||item.state==="connected"})&&plan.bindings.concat(plan.knowledge_bindings).every(function(item){return item.state==="native"||item.state==="connected"})
  plan.spec_hash=$security.sha256(require(__hooks+"/modules/business_schemas.js").canonical(spec))
  return plan
}
// Existing employee Agents can use their reviewed external document adapter.
// Do not silently require migration to the new private business-material store.
// New research requirements and all unimplemented capabilities still fail closed.
function bindLegacyDesktopMaterial(plan,spec){
  if(spec.research_capability_requirements!==undefined||!Array.isArray(spec.capability_requirements)||
      (spec.tools||[]).some(function(name){return /^business_/.test(String(name))}))return
  var ids=[]
  spec.capability_requirements.forEach(function(requirement){
    if(!desktopRequirement(requirement)||requirement.kind!=="document"||requirement.access!=="read"||
        !mentioned(requirement.title+"\n"+requirement.purpose,"(?:读取|解析|提取)[^。\\n]{0,16}(?:PDF|XLSX|DOCX)|(?:PDF|XLSX|DOCX)[^。\\n]{0,10}(?:文字|解析|提取)"))return
    var candidates=requirement.suggested_tool_ids.filter(function(id){return (spec.tools||[]).indexOf(id)>=0})
    if(!candidates.length||!candidates.every(function(id){return plan.bindings.some(function(binding){return binding.tool===id&&binding.state==="connected"&&!binding.requires_approval})}))return
    candidates.forEach(function(id){if(ids.indexOf(id)<0)ids.push(id)})
  })
  if(!ids.length)return
  plan.requirements.forEach(function(item){
    if(item.id!=="material_text")return
    item.state="connected";item.required_tools=ids.slice();item.missing_tools=[]
    item.limits="使用已验证的外部文档适配器；输出范围和定位需按适配器契约及人工验收，未启用内置私有材料库"
    item.inference="reviewed_desktop_capability_binding"
  })
  if(!plan.requirements.some(function(item){return item.id==="case_records"||item.id==="immutable_reports"||item.id==="material_text"&&item.state!=="connected"})){
    plan.input_contract.required=["instruction"];plan.data_objects=[]
  }
}
function desktopRequirement(value){
  return Boolean(value&&typeof value==="object"&&!Array.isArray(value)&&typeof value.id==="string"&&typeof value.title==="string"&&typeof value.purpose==="string"&&typeof value.kind==="string"&&["read","write"].indexOf(value.access)>=0&&typeof value.required==="boolean"&&["role_ids","search_terms","suggested_tool_ids"].every(function(key){return Array.isArray(value[key])&&value[key].every(function(v){return typeof v==="string"})}))
}
function assignRequirements(target,ids,source){
  source=source||target
  if(source.research_capability_requirements!==undefined||Array.isArray(source.capability_requirements)&&source.capability_requirements.some(desktopRequirement))target.research_capability_requirements=ids.slice()
  else target.capability_requirements=ids.slice()
  return target
}
module.exports={derive:derive,compile:compile,nativeTools:nativeTools,desktopRequirement:desktopRequirement,assignRequirements:assignRequirements,bindLegacyDesktopMaterial:bindLegacyDesktopMaterial}
