import test from 'node:test'
import assert from 'node:assert/strict'
import {originalHomeAgentForEditor,originalHomeEditorWrite,normalizeNativeHomeEditingContext,isOriginalHomeBuiltinTool} from '../src/lib/originalHomeAgentEditor.ts'
import {normalizeAgentDraft,saveAgentDraft,readAgentDraft,clearAgentDraft,agentDraftKey} from '../src/lib/agentEditorDraft.ts'
const id='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222',connection='33333333-3333-4333-8333-333333333333'
const spec=()=>({goal:'原页面目标',task_scope:'保持原计划',deliverables:['完整成果'],tools:['calculate'],task_plan:['第一步','第二步'],done_criteria:['原验收标准'],knowledge_base_ids:[],require_approval:true})
const authoring=(tools=['calculate'])=>({format:'agentstudio.home-authoring.v1',source:'template',template_key:'research',tool_requirements:tools})
const row=()=>({id,owner_user_id:owner,name:'原方案',revision:7,spec:spec(),authoring:authoring(),created_at:'2026-10-30T00:00:00Z',updated_at:'2026-10-30T01:00:00Z'})
const write=(visible,extra={})=>originalHomeEditorWrite({name:visible.name,spec:visible.spec,source:visible.source==='template'?'template':'create',templateKey:visible.template_key,context:visible.native_pg,...extra})

test('original template descriptive requirements persist exactly without becoming execution grants',()=>{
  const visible={name:'研究方案',spec:{...spec(),tools:[' 网络资料能力 ','报告导出','报告导出']},source:'template',template_key:'research'}
  const saved=write(visible)
  assert.deepEqual(saved.spec.tools,[]);assert.deepEqual(saved.authoring.tool_requirements,visible.spec.tools)
  assert.deepEqual(saved.spec.task_plan,visible.spec.task_plan);assert.equal(saved.spec.require_approval,true)
  assert.equal(isOriginalHomeBuiltinTool('calculate'),true);assert.equal(isOriginalHomeBuiltinTool('business_record_write'),false)
})
test('editing original descriptive fields preserves model, HTTP and MCP binding identities and revisions',()=>{
  const original=row();original.spec.tools.push('http_lookup','mcp_read')
  original.spec.model_binding={connection_id:connection,connection_revision:3,model_id:'synthetic-model'}
  original.spec.http_tools=[{name:'http_lookup',description:'只读工具',connection_id:connection,connection_revision:4}]
  original.spec.mcp_tools=[{name:'mcp_read',connection_id:connection,connection_revision:6,tool_name:'read_data',catalog_sha256:'a'.repeat(64)}]
  original.authoring=authoring(original.spec.tools)
  const visible=originalHomeAgentForEditor(original);visible.spec.task_scope='员工只修改了范围'
  const saved=write(visible)
  for(const key of ['model_binding','http_tools','mcp_tools'])assert.deepEqual(saved.spec[key],original.spec[key])
  assert.deepEqual(saved.spec.task_plan,original.spec.task_plan);assert.deepEqual(saved.authoring,original.authoring)
  assert.equal(visible.native_pg.revision,7);assert.equal(Object.isFrozen(visible.native_pg.spec.model_binding),true)
})
test('an explicitly removed bound tool is unbound without deleting another binding or model',()=>{
  const original=row();original.spec.tools.push('http_lookup','mcp_read')
  original.spec.http_tools=[{name:'http_lookup',description:'lookup',connection_id:connection,connection_revision:4}]
  original.spec.mcp_tools=[{name:'mcp_read',connection_id:connection,connection_revision:6,tool_name:'read_data',catalog_sha256:'a'.repeat(64)}]
  original.spec.model_binding={connection_id:connection,connection_revision:3,model_id:'synthetic-model'}
  const visible=originalHomeAgentForEditor(original);visible.spec.tools=visible.spec.tools.filter(t=>t!=='http_lookup')
  const saved=write(visible)
  assert.equal(saved.spec.http_tools,undefined);assert.deepEqual(saved.spec.mcp_tools,original.spec.mcp_tools);assert.deepEqual(saved.spec.model_binding,original.spec.model_binding)
})
test('missing provenance remains unknown on ordinary update, while an explicit copy has its own new source',()=>{
  const original={...row(),authoring:null},visible=originalHomeAgentForEditor(original)
  assert.equal(visible.source,'unknown');assert.equal(Object.hasOwn(write(visible),'authoring'),false)
  visible.spec.tools.push('缺少来源的自定义需求')
  assert.throws(()=>write(visible),e=>e.code==='original_home_authoring_missing')
  const copy=write(visible,{asCopy:true});assert.equal(copy.authoring.source,'create');assert.deepEqual(copy.authoring.tool_requirements,['缺少来源的自定义需求']);assert.deepEqual(copy.spec.tools,original.spec.tools)
})
test('new original UI execution requirements cannot be silently discarded into presentation metadata',()=>{
  for(const extension of [{quality_checks:[{type:'contains',expected:'必须出现'}]},{capability_requirements:['formal_business_record']},{_studio_authoring:{request_id:'x'.repeat(20)}}]){
    const visible=originalHomeAgentForEditor(row());Object.assign(visible.spec,extension)
    assert.throws(()=>write(visible),e=>e.code==='original_home_execution_contract_unavailable')
  }
  const visible=originalHomeAgentForEditor(row());visible.spec.quality_checks=[];visible.spec.capability_requirements=[]
  assert.equal(Object.hasOwn(write(visible).spec,'quality_checks'),false)
})
test('local recovery retains a frozen exact CAS context and refuses owner or credential fields',()=>{
  const context=originalHomeAgentForEditor(row()).native_pg
  const recovered=normalizeNativeHomeEditingContext(JSON.parse(JSON.stringify(context)))
  assert.equal(recovered.revision,7);assert.equal(recovered.id,id);assert.deepEqual(recovered.authoring,context.authoring)
  for(const value of [{...context,owner_user_id:owner},{...context,revision:0},{...context,spec:{...spec(),api_key:'test-only-refused'}}])assert.throws(()=>normalizeNativeHomeEditingContext(value))
})
test('oversized knowledge selection or weakened approval is refused instead of truncated or overwritten',()=>{
  const visible=originalHomeAgentForEditor(row());visible.spec.tools.push('knowledge_search');visible.spec.knowledge_base_ids=[id,owner,connection,'44444444-4444-4444-8444-444444444444']
  assert.throws(()=>write(visible));assert.equal(visible.spec.knowledge_base_ids.length,4)
  visible.spec.knowledge_base_ids=[];visible.spec.require_approval=false
  assert.throws(()=>write(visible),e=>e.code==='original_home_approval_required')
})
test('descriptor-based local inputs reject getters before invocation',()=>{
  let calls=0;const visible=originalHomeAgentForEditor(row()),tools=[]
  Object.defineProperty(tools,0,{enumerable:true,get(){calls++;return 'calculate'}});visible.spec.tools=tools
  assert.throws(()=>write(visible));assert.equal(calls,0)
  const context={...visible.native_pg};Object.defineProperty(context,'spec',{enumerable:true,get(){calls++;return spec()}})
  assert.throws(()=>normalizeNativeHomeEditingContext(context));assert.equal(calls,0)
})
const localDraft=()=>{const visible=originalHomeAgentForEditor(row());return {version:1,ownerId:owner,editedAt:Date.now(),userInput:'',spec:visible.spec,specName:visible.name,sourceMode:'template',templateKey:'research',editingRecordId:id,serverUpdated:visible.updated,backend:'native_pg',nativePg:visible.native_pg}}
test('PG local recovery keeps its exact revision and full native bindings independently of display timestamps',()=>{
  const original=row();original.spec.model_binding={connection_id:connection,connection_revision:3,model_id:'synthetic-model'}
  const draft={...localDraft(),nativePg:originalHomeAgentForEditor(original).native_pg,serverUpdated:'2026-10-30T20:00:00Z'}
  const recovered=normalizeAgentDraft(JSON.parse(JSON.stringify(draft)),owner)
  assert.equal(recovered.nativePg.revision,7);assert.deepEqual(recovered.nativePg.spec.model_binding,original.spec.model_binding)
  const legacy={...draft};delete legacy.nativePg
  assert.equal(normalizeAgentDraft(legacy,owner).nativePg,undefined)
})
test('PB and PG drafts use separate namespaces even when their verified employee UUIDs happen to match',()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage'),data=new Map()
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)}})
  try{
    const pg=localDraft(),pb={...pg,specName:'保留的旧后端草稿'};delete pb.backend;delete pb.nativePg
    assert.notEqual(agentDraftKey(owner),agentDraftKey(owner,'native_pg'))
    assert.equal(saveAgentDraft(owner,pb),true);assert.equal(saveAgentDraft(owner,pg,'native_pg'),true)
    assert.equal(readAgentDraft(owner).specName,'保留的旧后端草稿');assert.equal(readAgentDraft(owner,Date.now(),'native_pg').nativePg.revision,7)
    assert.equal(saveAgentDraft(owner,pg),false);clearAgentDraft(owner,'native_pg');assert.equal(readAgentDraft(owner,Date.now(),'native_pg'),null)
    assert.equal(readAgentDraft(owner).specName,'保留的旧后端草稿')
  }finally{if(original)Object.defineProperty(globalThis,'sessionStorage',original);else delete globalThis.sessionStorage}
})
test('a draft cannot swap record identities or erase a malformed native CAS context',()=>{
  for(const nativePg of [{...localDraft().nativePg,id:owner},{...localDraft().nativePg,revision:0},{...localDraft().nativePg,owner_user_id:owner}])assert.equal(normalizeAgentDraft({...localDraft(),nativePg},owner),null)
  const noSpec={...localDraft(),spec:null,userInput:'新需求'}
  assert.equal(normalizeAgentDraft(noSpec,owner),null)
})
test('native pending tool descriptions remain exact during recovery rather than taking the smaller PB limit',()=>{
  const draft=localDraft();draft.spec.tools=['待连接需求'.repeat(40)]
  const recovered=normalizeAgentDraft(draft,owner)
  assert.deepEqual(recovered.spec.tools,draft.spec.tools)
  const old={...draft};delete old.backend;delete old.nativePg
  assert.equal(normalizeAgentDraft(old,owner),null)
})
test('metadata-only builtin requirements never become executable merely because prose was edited',()=>{
  const original=row();original.spec.tools=[];original.authoring=authoring(['calculate'])
  const visible=originalHomeAgentForEditor(original);visible.spec.task_scope='只修改描述'
  assert.deepEqual(write(visible).spec.tools,[])
  assert.deepEqual(write(visible,{builtinSelections:['calculate']}).spec.tools,['calculate'])
})
test('only an explicit connection selection replaces a saved binding revision',()=>{
  const original=row(),name='http_read'
  original.spec.tools=[name];original.spec.http_tools=[{name,description:'原引用',connection_id:connection,connection_revision:2}];original.authoring=authoring([name])
  const visible=originalHomeAgentForEditor(original),newBinding={name,description:'新引用',connection_id:connection,connection_revision:3}
  assert.equal(write(visible).spec.http_tools[0].connection_revision,2)
  assert.equal(write(visible,{bindings:{http:[newBinding],mcp:[]}}).spec.http_tools[0].connection_revision,3)
  assert.throws(()=>write(visible,{bindings:{http:[{...newBinding,url:'https://refused.example.test'}],mcp:[]}}))
})
test('local recovery preserves unknown outcome and explicit binding intent without inventing a server acknowledgement',()=>{
  const draft=localDraft(),name='http_read',binding={name,description:'只保存引用',connection_id:connection,connection_revision:3}
  draft.spec.tools.push(name);draft.nativeBindings={http:[binding],mcp:[]};draft.nativeOutcomeUnknown=true;draft.nativeBuiltinSelections=['calculate']
  const recovered=normalizeAgentDraft(JSON.parse(JSON.stringify(draft)),owner)
  assert.equal(recovered.nativeOutcomeUnknown,true);assert.equal(recovered.nativePg.revision,7);assert.deepEqual(recovered.nativeBindings.http,[binding]);assert.deepEqual(recovered.nativeBuiltinSelections,['calculate'])
  assert.equal(normalizeAgentDraft({...draft,nativeBuiltinSelections:['business_record_write']},owner),null)
})
test('existing Native local-device intent is retained but is never reported as an always-available builtin',()=>{
  const original=row();original.spec.tools=['local_computer'];original.authoring=authoring(['local_computer'])
  const visible=originalHomeAgentForEditor(original)
  assert.equal(isOriginalHomeBuiltinTool('local_computer'),false);assert.deepEqual(write(visible).spec.tools,['local_computer'])
})

const fullProjectionRow=()=>{
  const original=row()
  original.authoring=authoring(Array.from({length:20},(_,i)=>i<2?' 重复描述需求 ':'原始需求 '+i))
  original.spec.tools=[];original.spec.http_tools=[];original.spec.mcp_tools=[]
  for(let i=0;i<10;i++){
    const http='http_read_'+i,mcp='mcp_read_'+i
    original.spec.tools.push(http,mcp)
    original.spec.http_tools.push({name:http,description:'完整只读引用'+i,connection_id:'33333333-3333-4333-8333-'+String(i+1).padStart(12,'0'),connection_revision:i+1})
    original.spec.mcp_tools.push({name:mcp,connection_id:connection,connection_revision:i+1,tool_name:'read_'+i,catalog_sha256:'a'.repeat(64)})
  }
  original.spec.model_binding={connection_id:connection,connection_revision:3,model_id:'full-model'}
  return original
}
test('twenty metadata requirements plus twenty execution names remain independently bounded and editable',()=>{
  const original=fullProjectionRow(),visible=originalHomeAgentForEditor(original)
  assert.equal(visible.spec.tools.length,40);visible.name='只改名称';visible.spec.task_scope='只改范围'
  const saved=write(visible)
  assert.deepEqual(saved.authoring,original.authoring);assert.deepEqual(saved.spec.tools,original.spec.tools)
  for(const key of['http_tools','mcp_tools','model_binding'])assert.deepEqual(saved.spec[key],original.spec[key])
  assert.equal(saved.authoring.tool_requirements.length,20)
})
test('copying the full picker projection preserves exact metadata and execution without inserting aliases',()=>{
  const original=fullProjectionRow(),visible=originalHomeAgentForEditor(original),saved=write(visible,{asCopy:true})
  assert.deepEqual(saved.authoring.tool_requirements,original.authoring.tool_requirements)
  assert.deepEqual(saved.spec.tools,original.spec.tools);assert.deepEqual(saved.spec.model_binding,original.spec.model_binding)
})
test('removing a projected binding unbinds it while keeping all twenty original requirements',()=>{
  const original=fullProjectionRow(),visible=originalHomeAgentForEditor(original)
  visible.spec.tools=visible.spec.tools.filter(name=>name!=='http_read_0')
  const saved=write(visible)
  assert.deepEqual(saved.authoring.tool_requirements,original.authoring.tool_requirements)
  assert.equal(saved.spec.http_tools.length,9);assert.equal(saved.spec.mcp_tools.length,10)
  assert(!saved.spec.tools.includes('http_read_0'));assert.deepEqual(saved.spec.model_binding,original.spec.model_binding)
})
test('a newly selected execution alias does not become a twenty-first descriptive requirement',()=>{
  const original=row();original.spec.tools=[];original.authoring=authoring(Array.from({length:20},(_,i)=>'必须保留需求'+i))
  const visible=originalHomeAgentForEditor(original),binding={name:'http_new',description:'新引用',connection_id:connection,connection_revision:4}
  visible.spec.tools.push(binding.name)
  const saved=write(visible,{bindings:{http:[binding],mcp:[]}})
  assert.deepEqual(saved.authoring.tool_requirements,original.authoring.tool_requirements)
  assert.deepEqual(saved.spec.tools,['http_new']);assert.deepEqual(saved.spec.http_tools,[binding])
})
test('a true twenty-first descriptive requirement is refused without truncating the original twenty',()=>{
  const original=row();original.spec.tools=[];original.authoring=authoring(Array.from({length:20},(_,i)=>'需求'+i))
  const visible=originalHomeAgentForEditor(original);visible.spec.tools.push('真实新需求')
  assert.throws(()=>write(visible));assert.equal(visible.spec.tools.length,21)
  assert.deepEqual(visible.native_pg.authoring.tool_requirements,original.authoring.tool_requirements)
})
test('recovery retains forty projected names and padded metadata without loosening PB tool IDs',()=>{
  const original=fullProjectionRow(),visible=originalHomeAgentForEditor(original)
  const draft={...localDraft(),spec:visible.spec,nativePg:visible.native_pg}
  const restored=normalizeAgentDraft(JSON.parse(JSON.stringify(draft)),owner)
  assert.deepEqual(restored.spec.tools,visible.spec.tools);assert.equal(restored.spec.tools.length,40)
  assert.deepEqual(restored.nativePg.authoring.tool_requirements,original.authoring.tool_requirements)
  const pb={...draft};delete pb.backend;delete pb.nativePg;assert.equal(normalizeAgentDraft(pb,owner),null)
})
test('existing local execution remains separate from a full descriptive metadata array during recovery and write',()=>{
  const original=row();original.spec.tools=['local_computer'];original.authoring=authoring(Array.from({length:20},(_,i)=>'保留原始描述'+i))
  original.spec.model_binding={connection_id:connection,connection_revision:3,model_id:'local-model'}
  const visible=originalHomeAgentForEditor(original),saved=write(visible)
  assert.deepEqual(saved.spec.tools,['local_computer']);assert.deepEqual(saved.spec.model_binding,original.spec.model_binding)
  assert.deepEqual(saved.authoring.tool_requirements,original.authoring.tool_requirements)
})
test('new builtin execution is separate from twenty new descriptive requirements without inventing a prior context',()=>{
  const requirements=Array.from({length:20},(_,i)=>'新方案原始需求'+i)
  const visible={name:'新方案',spec:{...spec(),tools:[...requirements,'calculate']},source:'create',template_key:''}
  const saved=write(visible,{builtinSelections:['calculate']})
  assert.deepEqual(saved.authoring.tool_requirements,requirements);assert.deepEqual(saved.spec.tools,['calculate'])
})
test('duplicate metadata names retain every descriptive occurrence while executable IDs stay unique',()=>{
  const original=fullProjectionRow();original.spec.mcp_tools.pop();original.spec.tools=original.spec.tools.filter(name=>name!=='mcp_read_9');original.spec.tools.unshift('calculate');original.authoring=authoring(Array(20).fill('calculate'))
  const saved=write(originalHomeAgentForEditor(original))
  assert.equal(saved.authoring.tool_requirements.length,20);assert.deepEqual(saved.authoring,original.authoring)
  assert.equal(saved.spec.tools.length,20);assert.equal(saved.spec.tools.filter(name=>name==='calculate').length,1)
  assert.deepEqual(saved.spec.http_tools,original.spec.http_tools);assert.deepEqual(saved.spec.mcp_tools,original.spec.mcp_tools)
})
