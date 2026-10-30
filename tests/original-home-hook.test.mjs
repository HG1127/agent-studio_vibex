import test from 'node:test'
import assert from 'node:assert/strict'
import {createHomeHarness,deferred,wire,ids,employee,OriginalHomeApiError,sourceBinding} from './helpers/original-home-hook-harness.mjs'
import {agentDraftKey,readAgentDraft} from '../src/lib/agentEditorDraft.ts'
import {originalHomeAgentForEditor} from '../src/lib/originalHomeAgentEditor.ts'
const preset=()=>({key:'test',defaultName:'新模板',spec:{goal:'新模板目标',task_scope:'范围',deliverables:['成果'],tools:[],task_plan:['步骤'],done_criteria:['验收'],knowledge_base_ids:[],require_approval:true}})
const storedDraft=()=>{
 const row=wire(ids.a),visible=originalHomeAgentForEditor(row)
 return{version:1,ownerId:employee,editedAt:Date.now(),backend:'native_pg',userInput:'恢复的原始需求',spec:{...visible.spec,goal:'恢复的草稿目标'},specName:'恢复草稿',sourceMode:'create',templateKey:'',editingRecordId:ids.a,serverUpdated:row.updated_at,nativePg:visible.native_pg}
}
async function harness(t,options){const h=await createHomeHarness(options);t.after(()=>h.dispose());return h}
async function open(h,id=ids.a){await h.output.handleOpenSaved({id});await h.flush()}
const saveResult=(h,id=ids.copy,revision=1)=>{const call=h.calls.filter(c=>['create','update'].includes(c.name)).at(-1),draft=call.args.at(-1);return wire(id,{name:draft.name,spec:draft.spec,authoring:draft.authoring,revision})}

test('the pure harness binds the actual frozen useHome source body',()=>{
 const bound=sourceBinding();assert.match(bound.sha256,/^[a-f0-9]{64}$/);assert.equal(bound.real_React_or_browser,false)
})
test('typing a new requirement while an Agent GET waits preserves the new input and current editor',async t=>{
 const pending=deferred(),h=await harness(t,{api:{get:()=>pending.promise}})
 const opening=h.output.handleOpenSaved({id:ids.b});h.output.setUserInput('GET 等待时新输入的需求');await h.flush()
 pending.resolve(wire(ids.b));await opening;await h.flush()
 assert.equal(h.output.userInput,'GET 等待时新输入的需求');assert.equal(h.output.spec,null);assert.equal(h.output.savedSpecId,'')
})
test('an older GET rejection cannot replace the message for a newer requirement',async t=>{
 const pending=deferred(),h=await harness(t,{api:{get:()=>pending.promise}})
 const opening=h.output.handleOpenSaved({id:ids.b});h.output.setUserInput('新需求');await h.flush();h.output.handleCreate();await h.flush()
 const message=h.output.errorMsg;assert(message.includes('需求预览接口尚未接通'))
 pending.reject(Error('old get failed'));await opening;await h.flush();assert.equal(h.output.errorMsg,message);assert.equal(h.output.userInput,'新需求')
})
test('a later chosen Agent wins over the earlier initial deep-link GET',async t=>{
 const pending=deferred(),h=await harness(t,{query:'spec='+ids.b,api:{get:id=>id===ids.b?pending.promise:wire(id)}})
 assert(h.calls.some(c=>c.name==='get'&&c.args[0]===ids.b))
 await open(h,ids.a);assert.equal(h.output.savedSpecId,ids.a)
 pending.resolve(wire(ids.b));await h.flush();assert.equal(h.output.savedSpecId,ids.a);assert.equal(h.output.specName,'Agent 1')
})
for(const kind of['template','clear','restore'])test('a newer '+kind+' invalidates a pending explicit Agent open',async t=>{
 const pending=deferred(),draft=storedDraft(),h=await harness(t,{storage:kind==='restore'?[[agentDraftKey(employee,'native_pg'),JSON.stringify(draft)]]:[],api:{get:()=>pending.promise}})
 const opening=h.output.handleOpenSaved({id:ids.b})
 if(kind==='template')h.output.handleLoadTemplate(preset());else if(kind==='clear')h.output.handleClearSpec();else h.output.restoreDraft()
 await h.flush();pending.resolve(wire(ids.b));await opening;await h.flush()
 if(kind==='template'){assert.equal(h.output.spec.goal,'新模板目标');assert.equal(h.output.savedSpecId,'')}
 else if(kind==='clear'){assert.equal(h.output.spec,null);assert.equal(h.output.savedSpecId,'')}
 else{assert.equal(h.output.spec.goal,'恢复的草稿目标');assert.equal(h.output.userInput,'恢复的原始需求');assert.equal(h.output.savedSpecId,ids.a)}
})
for(const kind of['template','clear','input'])test('a newer '+kind+' invalidates the pending initial deep-link lookup',async t=>{
 const pending=deferred(),h=await harness(t,{query:'spec='+ids.b,api:{get:()=>pending.promise}})
 if(kind==='template')h.output.handleLoadTemplate(preset());else if(kind==='clear')h.output.handleClearSpec();else h.output.setUserInput('新的输入需求')
 await h.flush();pending.resolve(wire(ids.b));await h.flush();assert.equal(h.output.savedSpecId,'')
 if(kind==='template')assert.equal(h.output.spec.goal,'新模板目标');else assert.equal(h.output.spec,null)
 if(kind==='input')assert.equal(h.output.userInput,'新的输入需求')
})
test('an old initial-list rejection cannot replace a newer requirement error',async t=>{
 const pending=deferred(),h=await harness(t,{api:{catalog:()=>pending.promise}})
 h.output.setUserInput('新输入');await h.flush();h.output.handleCreate();await h.flush();const error=h.output.errorMsg
 pending.reject(Error('old list failed'));await h.flush();assert.equal(h.output.errorMsg,error);assert.equal(h.output.userInput,'新输入')
})
test('a new requirement invalidates reads without preventing the same Agent save ACK from settling',async t=>{
 const pending=deferred(),h=await harness(t,{api:{create:()=>pending.promise}})
 h.output.handleLoadTemplate(preset());await h.flush();const saving=h.output.handleSave();await h.flush()
 h.output.setUserInput('保存期间输入的新需求');await h.flush();pending.resolve(saveResult(h));await saving;await h.flush()
 assert.equal(h.output.savedSpecId,ids.copy);assert.equal(h.output.userInput,'保存期间输入的新需求');assert.equal(h.output.specDirty,false)
 h.output.updateSpecText('goal','确认后新修改');await h.flush();await h.output.handleSave();await h.flush()
 assert.equal(h.calls.filter(c=>c.name==='create').length,1);assert.equal(h.calls.filter(c=>c.name==='update').length,1)
})
test('edits made while save waits remain dirty and use the acknowledged revision on the next save',async t=>{
 const pending=deferred(),h=await harness(t,{api:{create:()=>pending.promise}})
 h.output.handleLoadTemplate(preset());await h.flush();const saving=h.output.handleSave();await h.flush()
 h.output.updateSpecText('goal','保存期间修改目标');await h.flush();pending.resolve(saveResult(h));await saving;await h.flush()
 assert.equal(h.output.spec.goal,'保存期间修改目标');assert.equal(h.output.specDirty,true)
 await h.output.handleSave();await h.flush();const update=h.calls.find(c=>c.name==='update')
 assert.equal(update.args[1],1);assert.equal(update.args[2].spec.goal,'保存期间修改目标')
})
test('changing template while a prior save waits keeps the new scheme on success',async t=>{
 const pending=deferred(),h=await harness(t,{api:{create:()=>pending.promise}})
 h.output.handleLoadTemplate(preset());await h.flush();const saving=h.output.handleSave();await h.flush()
 h.output.handleLoadTemplate({...preset(),key:'later',defaultName:'后选模板',spec:{...preset().spec,goal:'后选模板目标'}});await h.flush()
 pending.resolve(saveResult(h));await saving;await h.flush();assert.equal(h.output.spec.goal,'后选模板目标');assert.equal(h.output.savedSpecId,'');assert.equal(h.output.specDirty,true)
})
test('unknown write ACK blocks repeated save and copy, and the recovery marker survives',async t=>{
 const h=await harness(t,{api:{create:()=>{throw new OriginalHomeApiError(0,'original_home_outcome_unknown')}}})
 h.output.handleLoadTemplate(preset());await h.flush();await h.output.handleSave();await h.flush()
 await h.output.handleSave();await h.output.handleSaveAsCopy();await h.runTimers()
 assert.equal(h.calls.filter(c=>c.name==='create').length,1)
 const draft=readAgentDraft(employee,Date.now(),'native_pg');assert.equal(draft.nativeOutcomeUnknown,true);assert.equal(draft.spec.goal,'新模板目标')
})
test('same-name metadata builtin rematch becomes dirty, persists its explicit intent and saves once',async t=>{
 const row=wire(ids.a);row.authoring.tool_requirements=['calculate'];const h=await harness(t,{records:[row]})
 await open(h);assert.equal(h.output.specDirty,false);assert.deepEqual(h.output.spec.tools,['calculate'])
 h.output.rematchAgentTools();await h.runTimers();assert.equal(h.output.specDirty,true)
 assert.deepEqual(readAgentDraft(employee,Date.now(),'native_pg').nativeBuiltinSelections,['calculate'])
 await h.output.handleSave();await h.flush();const update=h.calls.find(c=>c.name==='update')
 assert.deepEqual(update.args[2].spec.tools,['calculate']);assert.deepEqual(update.args[2].authoring.tool_requirements,['calculate'])
 assert.equal(h.output.specDirty,false);h.output.rematchAgentTools();await h.flush();assert.equal(h.output.specDirty,false)
})
const httpName='http_c'+'55555555555545558555555555555555',mcpName='mcp_t'+'a'.repeat(40),connection='55555555-5555-4555-8555-555555555555'
function resources({method='GET',readOnly=true,destructive=false}={}){
 const http={name:httpName,description:'HTTP只读引用',connection_id:connection,connection_revision:3},mcp={name:mcpName,connection_id:connection,connection_revision:4,catalog_sha256:'b'.repeat(64),tool_name:'read_data'}
 return{connectedHttp:[{name:httpName,display_name:'真实连接名称',description:'只读查询',method,status:'ok'}],verifiedMarket:[{id:mcpName,name:'read_data',label:'MCP真实名称',description:'读取资料',connectionTitle:'连接',readOnly,destructive}],knowledgeBases:[],bindings:{http:[http],mcp:[mcp]}}
}
test('same-name readonly HTTP and MCP rematch records real binding changes as dirty',async t=>{
 const row=wire(ids.a);row.authoring.tool_requirements=[httpName,mcpName];const r=resources(),h=await harness(t,{records:[row],api:{resources:()=>r}})
 await open(h);h.output.rematchAgentTools();await h.runTimers();assert.equal(h.output.specDirty,true)
 const draft=readAgentDraft(employee,Date.now(),'native_pg');assert.deepEqual(draft.nativeBindings,r.bindings)
 await h.output.handleSave();await h.flush();const update=h.calls.find(c=>c.name==='update')
 assert.deepEqual(update.args[2].spec.http_tools,r.bindings.http);assert.deepEqual(update.args[2].spec.mcp_tools,r.bindings.mcp)
 assert.deepEqual(update.args[2].authoring.tool_requirements,[httpName,mcpName])
})
test('metadata-only write connectors are not promoted by rematch as if already explicitly selected',async t=>{
 const row=wire(ids.a);row.authoring.tool_requirements=[httpName,mcpName];const r=resources({method:'POST',readOnly:false,destructive:true}),h=await harness(t,{records:[row],api:{resources:()=>r}})
 await open(h);h.output.rematchAgentTools();await h.flush();assert.equal(h.output.specDirty,false)
 h.output.updateSpecText('goal','只编辑文字');await h.flush();await h.output.handleSave();await h.flush()
 const update=h.calls.find(c=>c.name==='update');assert.deepEqual(update.args[2].spec.tools,[]);assert.equal(update.args[2].spec.http_tools,undefined);assert.equal(update.args[2].spec.mcp_tools,undefined)
 assert.deepEqual(update.args[2].authoring.tool_requirements,[httpName,mcpName])
})
test('rematch never silently replaces an existing binding revision with the refreshed resource snapshot',async t=>{
 const r=resources(),row=wire(ids.a);row.spec.tools=[httpName];row.spec.http_tools=[{...r.bindings.http[0],connection_revision:2}]
 const h=await harness(t,{records:[row],api:{resources:()=>r}});await open(h);h.output.rematchAgentTools();await h.flush()
 h.output.updateSpecText('goal','只改目标');await h.flush();await h.output.handleSave();await h.flush()
 const update=h.calls.find(c=>c.name==='update');assert.equal(update.args[2].spec.http_tools[0].connection_revision,2);assert.deepEqual(update.args[2].authoring.tool_requirements,[])
})
