import test from 'node:test'
import assert from 'node:assert/strict'
import {createHomeHarness,wire,ids,employee,OriginalHomeApiError} from './helpers/original-home-hook-harness.mjs'
import {model,source,preview,receipt,resultView,caps,deferred,binding} from './helpers/original-home-design-unit-data.mjs'
import {readAgentDraft,agentDraftKey} from '../src/lib/agentEditorDraft.ts'
import {originalHomeDesignStorageKey} from '../src/lib/originalHomeDesign.ts'
import {originalHomeAgentForEditor} from '../src/lib/originalHomeAgentEditor.ts'
function design(options={}){let body;return{designCapabilities:caps,designModels:[model({owner_user_id:employee})],designApi:{source:id=>({...source(),source:{...source().source,spec_id:id}}),preview:choice=>preview(choice),submit:(value,signal,confirm=false)=>{body=value;if(options.submit)return options.submit(value,signal,confirm);return receipt(value,{replayed:confirm})},view:()=>options.view?options.view(body):resultView(body)},...options}}
async function harness(t,options={}){const h=await createHomeHarness(design(options));t.after(()=>h.dispose());return h}
const paid=h=>h.calls.filter(v=>v.name==='design_submit'&&v.args[2]!==true)
async function prepare(h,text='我需要一个计算助手'){h.output.setUserInput(text);await h.flush();h.output.handleCreate();await h.flush();assert(h.output.nativeDesignComposer.preview)}
async function generate(h){h.output.handleCreate();await h.flush()}
const preset=()=>({key:'test',defaultName:'原模板',spec:{goal:'原模板目标',task_scope:'范围',deliverables:['成果'],tools:[],task_plan:['步骤'],done_criteria:['验收'],knowledge_base_ids:[],require_approval:true}})

test('actual original Home create controls preview then submit once and save descriptive tools through existing070/071',async t=>{
 const h=await harness(t);await prepare(h);assert.equal(paid(h).length,0);assert.equal(h.output.spec,null)
 await generate(h);assert.equal(paid(h).length,1);assert.equal(h.output.spec.goal,'合成目标');assert.equal(h.output.spec.require_approval,true);assert.equal(h.output.spec.require_plan_review,true);assert.equal(h.output.specDirty,true);assert.equal(h.output.spec._studio_authoring,undefined)
 assert.equal(readAgentDraft(employee,Date.now(),'native_pg').spec.goal,'合成目标','local recovery exists before the450ms autosave timer')
 await h.output.handleSave();await h.flush();const save=h.calls.find(v=>v.name==='create');assert(save);assert.deepEqual(save.args[0].spec.tools,[]);assert.deepEqual(save.args[0].authoring.tool_requirements,['calculate','网络搜索']);assert.equal(save.args[0].spec.require_plan_review,true);assert.equal(h.output.savedSpecId,ids.copy);assert.equal(h.output.specDirty,false)
 assert.deepEqual(h.calls.find(v=>v.name==='design_factory').args[0],{expectedEmployee:employee})
})
test('actual original generation preserves a different requirement typed while the old result waits',async t=>{
 const gate=deferred(),h=await harness(t,{view:()=>gate.promise});await prepare(h,'旧要求');h.output.handleCreate();await h.flush();h.output.setUserInput('等待时输入的新要求');await h.flush();gate.resolve(resultView(paid(h)[0].args[0]));await h.flush();assert.equal(h.output.spec.goal,'合成目标');assert.equal(h.output.userInput,'等待时输入的新要求');assert.equal(paid(h).length,1)
})
test('actual editor changes fence a held generated result and preserve its original recovery intent',async t=>{
 const gate=deferred(),h=await harness(t,{view:()=>gate.promise});h.output.handleLoadTemplate(preset());await h.flush();await prepare(h);h.output.handleCreate();await h.flush();h.output.updateSpecText('goal','生成等待时人工编辑');await h.flush();gate.resolve(resultView(paid(h)[0].args[0]));await h.flush();assert.equal(h.output.spec.goal,'生成等待时人工编辑');assert.equal(h.output.nativeDesignComposer.pending,true);assert.equal(paid(h).length,1)
})
test('actual original reload restores draft choice before exact unknown request recovery without a second paid call',async t=>{
 const first=await harness(t,{submit:(body,signal,confirm)=>{if(!confirm)throw new OriginalHomeApiError(0,'lost_ack');return receipt(body,{replayed:true})}});await prepare(first,'恢复原要求');await generate(first);await first.runTimers();assert.equal(paid(first).length,1);assert.equal(first.output.nativeDesignComposer.pending,true);const stored=[...first.storage];first.dispose()
 const resumed=await harness(t,{storage:stored});assert(resumed.output.pendingDraft);resumed.output.restoreDraft();await resumed.flush();resumed.output.handleCreate();await resumed.flush();assert.equal(paid(resumed).length,0);assert.equal(resumed.output.spec.goal,'合成目标');assert.equal(resumed.output.nativeDesignComposer.pending,false);assert.equal(resumed.output.specDirty,true)
})
test('actual clean saved revision previews the real source first, then retains protected bindings and approvals',async t=>{
 const row=wire(ids.a);row.spec.model_binding=binding;row.spec.tools=['calculate','knowledge_search'];row.spec.knowledge_base_ids=[ids.c];row.spec.require_plan_review=true
 const h=await harness(t,{records:[row]});await h.output.handleOpenSaved({id:ids.a});await h.flush();h.output.setReviseInput('修改描述');await h.flush();h.output.handleRevise();await h.flush();assert.equal(paid(h).length,0);assert.equal(h.output.nativeReviseActionLabel,'按已核对要求修改');assert(h.output.nativeReviseNotice.includes('本人合成模型'))
 h.output.handleRevise();await h.flush();assert.equal(paid(h).length,1);assert.equal(h.output.spec.goal,'合成目标');assert.deepEqual(h.output.spec.knowledge_base_ids,[ids.c]);assert.equal(h.output.spec.require_plan_review,true);assert.equal(h.output.spec.require_approval,true)
 await h.output.handleSave();await h.flush();const save=h.calls.find(v=>v.name==='update');assert(save);assert.deepEqual(save.args[2].spec.model_binding,binding);assert.deepEqual(save.args[2].spec.knowledge_base_ids,[ids.c]);assert.deepEqual(save.args[2].spec.tools,['calculate','knowledge_search']);assert.equal(save.args[1],7)
})
test('actual unsaved source revision keeps the draft and never silently saves or submits it',async t=>{
 const h=await harness(t);h.output.handleLoadTemplate(preset());await h.flush();h.output.setReviseInput('修改当前未保存草稿');await h.flush();h.output.handleRevise();await h.flush();assert.equal(paid(h).length,0);assert.equal(h.calls.filter(v=>v.name==='design_source'||v.name==='create').length,0);assert.equal(h.output.spec.goal,'原模板目标');assert(h.output.errorMsg.includes('只接受已保存'))
})
test('actual busy focus clears old Home state before held ACK release and retains only old-owner recovery storage',async t=>{
 const gate=deferred(),h=await harness(t,{submit:(body,signal,confirm)=>confirm?receipt(body,{replayed:true}):gate.promise});await prepare(h);h.output.handleCreate();await h.flush();assert.equal(paid(h).length,1);h.currentEmployee=ids.b;await h.emit('focus');assert.equal(h.output.spec,null);assert.deepEqual(h.output.savedList,[]);assert.equal(h.output.nativeDesignComposer.preview,null);assert.equal(h.output.nativeDesignComposer.blocked,true);assert.equal(h.output.userInput,'')
 assert(h.storage.has(originalHomeDesignStorageKey(employee)));assert.equal(h.storage.has(originalHomeDesignStorageKey(ids.b)),false);gate.resolve(receipt(paid(h)[0].args[0]));await h.flush();assert.equal(h.output.spec,null);assert.equal(paid(h).length,1)
})
test('actual generated metadata recovery does not turn an AI builtin name into execution until explicit selection',async t=>{
 const h=await harness(t);await prepare(h);await generate(h);await h.runTimers();const draft=readAgentDraft(employee,Date.now(),'native_pg');assert(draft.nativeDesign);assert.deepEqual(draft.nativeDesign.tool_requirements,['calculate','网络搜索']);const entries=[...h.storage];h.dispose()
 const resumed=await harness(t,{storage:entries});resumed.output.restoreDraft();await resumed.flush();await resumed.output.handleSave();await resumed.flush();const first=resumed.calls.find(v=>v.name==='create');assert.deepEqual(first.args[0].spec.tools,[])
 resumed.output.handleToggleSpecTool('calculate',false);await resumed.flush();resumed.output.handleToggleSpecTool('calculate',true);await resumed.flush();await resumed.output.handleSave();await resumed.flush();const update=resumed.calls.find(v=>v.name==='update');assert.deepEqual(update.args[2].spec.tools,['calculate'])
 assert(!resumed.storage.has(agentDraftKey(employee,'pocketbase')))
})
test('known account switch also hides an unchosen old-owner recovery notice while preserving its own private storage',async t=>{
 const visible=originalHomeAgentForEditor(wire(ids.a)),draft={version:1,ownerId:employee,editedAt:Date.now(),backend:'native_pg',userInput:'原员工未提交需求',spec:visible.spec,specName:'原员工私人草稿',sourceMode:'create',templateKey:'',editingRecordId:ids.a,serverUpdated:visible.updated,nativePg:visible.native_pg},key=agentDraftKey(employee,'native_pg'),h=await harness(t,{storage:[[key,JSON.stringify(draft)]]})
 assert(h.output.pendingDraft);h.currentEmployee=ids.b;await h.emit('focus');assert.equal(h.output.pendingDraft,null);assert.equal(h.output.savedSpecId,'');assert.equal(h.output.draftRestoreNotice,'');assert.deepEqual(h.output.knowledgeBases,[]);assert.deepEqual(h.output.connectedTools,[]);assert.equal(JSON.parse(h.storage.get(key)).specName,'原员工私人草稿');assert.equal(paid(h).length,0)
})
test('a failed synchronous local result backup keeps the paid result recoverable without installing or resubmitting it',async t=>{
 const h=await harness(t);await prepare(h);const original=sessionStorage.setItem,draftKey=agentDraftKey(employee,'native_pg');sessionStorage.setItem=(key,value)=>{if(key===draftKey)throw Error('synthetic storage outage');return original(key,value)}
 try{await generate(h);assert.equal(h.output.spec,null);assert.equal(h.output.nativeDesignComposer.pending,true);assert.equal(h.output.draftPersistError,true);assert.equal(paid(h).length,1)}finally{sessionStorage.setItem=original}
 h.output.handleCreate();await h.flush();assert.equal(h.output.spec.goal,'合成目标');assert.equal(paid(h).length,1);assert(readAgentDraft(employee,Date.now(),'native_pg'))
})
