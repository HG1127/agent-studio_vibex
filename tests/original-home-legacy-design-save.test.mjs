// Synthetic terminal data only. Actual Home callbacks and original DTO parsers
// run; this does not attest to a Native identity, SQL transaction or provider.
import test from 'node:test'
import assert from 'node:assert/strict'
import {originalHomeAgentForEditor,originalHomeEditorWrite} from '../src/lib/originalHomeAgentEditor.ts'
import {createOriginalHomeAgentApi,OriginalHomeApiError} from '../src/lib/originalHomeAgentApi.ts'
import {parseOriginalHomeAuthoring} from '../shared/original-home-authoring.ts'
import {normalizeOriginalHomeDesignMetadata} from '../shared/original-home-design-metadata.ts'
import {readAgentDraft} from '../src/lib/agentEditorDraft.ts'
import {createHomeHarness,wire,ids,employee} from './helpers/original-home-hook-harness.mjs'
import {model,source,preview,receipt,resultView,caps,binding,requestId} from './helpers/original-home-design-unit-data.mjs'
const metadata=(tools=['calculate','http_unselected','mcp_unselected'])=>({request_id:requestId,tool_requirements:tools})
function legacy(authoring=null){return wire(ids.a,{authoring,spec:{goal:'旧本人目标',task_scope:'旧范围',deliverables:['成果'],task_plan:['原步骤'],done_criteria:['原标准'],tools:['knowledge_search','http_lookup','mcp_read'],knowledge_base_ids:[ids.c],require_approval:true,require_plan_review:true,model_binding:binding,http_tools:[{name:'http_lookup',description:'原 HTTP 绑定',connection_id:ids.b,connection_revision:4}],mcp_tools:[{name:'mcp_read',connection_id:ids.b,connection_revision:6,tool_name:'read_data',catalog_sha256:'a'.repeat(64)}]}})}
const display=(row,tools)=>{const visible=originalHomeAgentForEditor(row);visible.spec.goal='员工已核对的新目标';visible.spec.tools.push(...tools);return visible}
const write=(visible,extra={})=>originalHomeEditorWrite({name:visible.name,spec:visible.spec,context:visible.native_pg,source:visible.source==='template'?'template':'create',templateKey:visible.template_key,...extra})
const assertBindings=(saved,prior)=>{for(const field of ['model_binding','http_tools','mcp_tools','knowledge_base_ids','require_approval','require_plan_review'])assert.deepEqual(saved.spec[field],prior.spec[field],field)}

test('legacy null metadata admits valid model descriptions for this manual revision, retaining existing authority and no F01 link',()=>{
 const row=legacy(),advice=metadata(),visible=display(row,advice.tool_requirements),saved=write(visible,{designMetadata:advice})
 assert.equal(visible.source,'unknown');assert.equal(visible.native_pg.authoring,null)
 assert.deepEqual(saved.spec.tools,row.spec.tools);assertBindings(saved,row)
 assert.deepEqual(saved.authoring,parseOriginalHomeAuthoring({format:'agentstudio.home-authoring.v1',source:'create',template_key:'',tool_requirements:advice.tool_requirements}))
 assert.deepEqual(Object.keys(saved.authoring).sort(),['format','source','template_key','tool_requirements']);assert.equal(Object.hasOwn(saved.authoring,'request_id'),false);assert.equal(Object.hasOwn(saved.spec,'_studio_authoring'),false)
})
test('ordinary legacy edit and no remaining advice keep unknown metadata, while an unrelated new requirement remains refused',()=>{
 const row=legacy(),visible=display(row,[])
 assert.equal(Object.hasOwn(write(visible),'authoring'),false)
 assert.equal(Object.hasOwn(write(visible,{designMetadata:metadata([])}),'authoring'),false)
 visible.spec.tools.push('人工另加但未声明的新要求')
 assert.throws(()=>write(visible),error=>error.code==='original_home_authoring_missing')
 assert.throws(()=>write(visible,{designMetadata:metadata(['其他模型建议'])}),error=>error.code==='original_home_authoring_missing')
 assert.equal(visible.native_pg.authoring,null)
})
test('existing template authoring retains its source and original descriptions alongside new model advice',()=>{
 const old={format:'agentstudio.home-authoring.v1',source:'template',template_key:'research',tool_requirements:[' 必须保留的原始要求 ','重复要求','重复要求']},row=legacy(old),advice=metadata(['calculate','新模型建议']),saved=write(display(row,advice.tool_requirements),{designMetadata:advice})
 assert.equal(saved.authoring.source,'template');assert.equal(saved.authoring.template_key,'research');assert.deepEqual(saved.authoring.tool_requirements,[...old.tool_requirements,...advice.tool_requirements]);assertBindings(saved,row);assert.deepEqual(saved.spec.tools,row.spec.tools)
})
test('a model builtin name is descriptive until explicit selection; selecting it retains the same descriptive metadata',()=>{
 const row=legacy(),visible=display(row,['calculate','未绑定的外部建议']),advice=metadata(['calculate','未绑定的外部建议'])
 const unselected=write(visible,{designMetadata:advice});assert.deepEqual(unselected.spec.tools,row.spec.tools)
 const selected=write(visible,{designMetadata:advice,builtinSelections:['calculate']});assert.deepEqual(selected.spec.tools,[...row.spec.tools,'calculate']);assert.deepEqual(selected.authoring.tool_requirements,advice.tool_requirements);assertBindings(selected,row)
 const fresh=write({...visible,native_pg:null,spec:{...visible.spec,tools:[...advice.tool_requirements],knowledge_base_ids:[]}},{context:null,designMetadata:advice,builtinSelections:['calculate']});assert.deepEqual(fresh.authoring.tool_requirements,advice.tool_requirements)
})
test('already-bound model suggestion remains executable by prior authority and is also retained as description',()=>{
 const row=legacy(),visible=display(row,['新建议']),advice=metadata(['http_lookup','新建议']),saved=write(visible,{designMetadata:advice})
 assert.deepEqual(saved.authoring.tool_requirements,['http_lookup','新建议']);assert.deepEqual(saved.spec.tools,row.spec.tools);assertBindings(saved,row)
})
test('removed advice is omitted and malformed metadata cannot bypass validation by falsy values or descriptors',()=>{
 const row=legacy(),visible=display(row,['保留建议']),saved=write(visible,{designMetadata:metadata(['保留建议','已明确移除的建议'])})
 assert.deepEqual(saved.authoring.tool_requirements,['保留建议'])
 for(const value of [false,0,'',{},metadata(Array(21).fill('超界')), {...metadata(),request_id:'not-uuid'},{...metadata(),owner_user_id:employee},{...metadata(),tool_requirements:['bad\nname']}])assert.throws(()=>write(visible,{designMetadata:value}),/invalid_original_home_design_metadata/)
 let called=0;const getter={request_id:requestId};Object.defineProperty(getter,'tool_requirements',{enumerable:true,get(){called++;return ['保留建议']}})
 assert.throws(()=>write(visible,{designMetadata:getter}));assert.equal(called,0);assert.throws(()=>normalizeOriginalHomeDesignMetadata(getter));assert.equal(called,0)
})
test('twenty actual descriptions remain bounded independently of prior execution and no true twenty-first requirement is truncated',()=>{
 const advice=metadata(Array.from({length:20},(_,i)=>'模型要求'+i)),row=legacy(),visible=display(row,advice.tool_requirements)
 assert.equal(write(visible,{designMetadata:advice}).authoring.tool_requirements.length,20);assert.deepEqual(write(visible,{designMetadata:advice}).spec.tools,row.spec.tools)
 const old={format:'agentstudio.home-authoring.v1',source:'create',template_key:'',tool_requirements:Array.from({length:20},(_,i)=>'原始要求'+i)},full=display(legacy(old),['新模型要求'])
 assert.throws(()=>write(full,{designMetadata:metadata(['新模型要求'])}));assert.equal(full.native_pg.authoring.tool_requirements.length,20);assert(full.spec.tools.includes('新模型要求'))
})

// Real browser API parser with a terminal Response transport, never a server.
function dtoPort(initial,mode='success'){
 let stored=structuredClone(initial);const requests=[]
 const api=createOriginalHomeAgentApi({employeeId:employee,rootPath:'',transport:async(route,init)=>{
  const body=init.body===undefined?null:JSON.parse(init.body);requests.push({route,init,body})
  if(init.method==='GET')return new Response(JSON.stringify({item:stored}),{headers:{'Content-Type':'application/json'}})
  assert.equal(init.method,'PATCH');assert.equal(body.expected_revision,7)
  if(mode==='conflict')return new Response('{"error":"revision_conflict"}',{status:409,headers:{'Content-Type':'application/json'}})
  stored={...stored,name:body.name,spec:{...body.spec,require_approval:true},authoring:body.authoring??stored.authoring,revision:8,updated_at:'2026-10-30T02:00:00Z'}
  if(mode==='unknown')throw Error('synthetic terminal response lost after data-port record')
  return new Response(JSON.stringify({item:mode==='foreign-response'?{...stored,owner_user_id:ids.b}:stored}),{headers:{'Content-Type':'application/json'}})
 }})
 return{api,requests,row:()=>stored,writes:()=>requests.filter(v=>v.init.method==='PATCH')}
}
async function revisedHarness(t,{authoring=null,mode='success',modelTools}={}){
 const initial=legacy(authoring),port=dtoPort(initial,mode);let paidBody
 const h=await createHomeHarness({records:[initial],designCapabilities:caps,designModels:[model({owner_user_id:employee})],api:{get:(...args)=>port.api.get(...args),update:(...args)=>port.api.update(...args)},designApi:{source:id=>({...source(),source:{...source().source,spec_id:id}}),preview:choice=>preview(choice),submit:(body,signal,confirm)=>{paidBody=body;return receipt(body,{replayed:confirm===true})},view:()=>{const value=resultView(paidBody);if(modelTools)value.result.result.tools=modelTools;return value}}})
 t.after(()=>h.dispose());await h.output.handleOpenSaved({id:ids.a});await h.flush();h.output.setReviseInput('员工明确要求修订描述并保留原绑定');await h.flush();h.output.handleRevise();await h.flush();assert.equal(h.output.nativeReviseActionLabel,'按已核对要求修改');h.output.handleRevise();await h.flush();assert.equal(h.output.spec.goal,'合成目标');assert.equal(h.output.specDirty,true)
 return{h,port,initial}
}
const paid=h=>h.calls.filter(v=>v.name==='design_submit'&&v.args[2]!==true)
test('actual original Home revision callback saves a null-authoring source through real DTO parser with original CAS and resources',async t=>{
 const{h,port,initial}=await revisedHarness(t);assert.equal(port.writes().length,0);assert.equal(paid(h).length,1)
 await h.output.handleSave();await h.flush();assert.equal(port.writes().length,1)
 const write=port.writes()[0];assert.equal(write.body.expected_revision,7);assert.equal(write.route,'/api/v2/original-ui/agent-specs/'+ids.a)
 assert.equal(write.init.headers['X-AgentStudio-Expected-Employee'],employee);assert.equal(write.init.credentials,'same-origin');assert.equal(write.init.headers.Authorization,undefined);assert.equal(write.init.headers['X-Rh-User-Id'],undefined)
 assert.deepEqual(write.body.authoring.tool_requirements,['calculate','网络搜索']);assert.deepEqual(write.body.spec.tools,initial.spec.tools)
 for(const field of ['model_binding','http_tools','mcp_tools','knowledge_base_ids','require_plan_review'])assert.deepEqual(write.body.spec[field],initial.spec[field])
 assert.equal(port.row().spec.require_approval,true);assert.equal(h.output.specDirty,false);assert.equal(h.output.savedSpecId,ids.a);assert.equal(paid(h).length,1)
 assert.equal(Object.hasOwn(write.body.authoring,'request_id'),false);assert.equal(Object.hasOwn(write.body.spec,'_studio_authoring'),false)
})
test('actual original builtin toggle alone grants new builtin execution and keeps model advice through actual update parser',async t=>{
 const{h,port,initial}=await revisedHarness(t)
 h.output.handleToggleSpecTool('calculate',false);await h.flush();h.output.handleToggleSpecTool('calculate',true);await h.flush();await h.output.handleSave();await h.flush()
 assert.deepEqual(port.writes()[0].body.spec.tools,[...initial.spec.tools,'calculate']);assert.deepEqual(port.writes()[0].body.authoring.tool_requirements,['网络搜索','calculate']);assert.equal(paid(h).length,1)
})
test('actual original revision retains an existing template metadata contract through the real update parser',async t=>{
 const old={format:'agentstudio.home-authoring.v1',source:'template',template_key:'research',tool_requirements:[' 原始 HTTP 只读要求 ','重复要求','重复要求']},{h,port}=await revisedHarness(t,{authoring:old})
 await h.output.handleSave();await h.flush();const saved=port.writes()[0].body.authoring
 assert.equal(saved.source,'template');assert.equal(saved.template_key,'research')
 assert.deepEqual(saved.tool_requirements,[...old.tool_requirements,'calculate','网络搜索']);assert.equal(h.output.specDirty,false)
})
test('actual original model-shaped unselected HTTP and MCP names stay descriptions through the real update parser',async t=>{
 const advice=['calculate','http_unselected','mcp_unselected'],{h,port,initial}=await revisedHarness(t,{modelTools:advice});await h.output.handleSave();await h.flush()
 assert.deepEqual(port.writes()[0].body.authoring.tool_requirements,advice);assert.deepEqual(port.writes()[0].body.spec.tools,initial.spec.tools)
 assert.deepEqual(port.writes()[0].body.spec.http_tools,initial.spec.http_tools);assert.deepEqual(port.writes()[0].body.spec.mcp_tools,initial.spec.mcp_tools);assert.equal(paid(h).length,1)
})
test('actual Home409 retains the revised draft and cannot be mistaken for a saved CAS acknowledgement',async t=>{
 const{h,port}=await revisedHarness(t,{mode:'conflict'});await h.output.handleSave();await h.flush()
 assert.equal(port.writes().length,1);assert.equal(h.output.saveConflict,true);assert.equal(h.output.specDirty,true);assert.equal(h.output.spec.goal,'合成目标');assert.equal(port.row().revision,7);assert.equal(paid(h).length,1)
 await h.runTimers();const draft=readAgentDraft(employee,Date.now(),'native_pg');assert.equal(draft.nativePg.revision,7);assert.deepEqual(draft.nativeDesign.tool_requirements,['calculate','网络搜索'])
})
for(const mode of ['unknown','foreign-response'])test('actual Home '+mode+' update keeps original intent and blocks automatic replay',async t=>{
 const{h,port}=await revisedHarness(t,{mode});await h.output.handleSave();await h.flush();assert.equal(port.writes().length,1);assert.equal(h.output.specDirty,true);assert.equal(h.output.spec.goal,'合成目标')
 await h.runTimers();const draft=readAgentDraft(employee,Date.now(),'native_pg');assert.equal(draft.nativeOutcomeUnknown,true);assert.equal(draft.nativePg.revision,7);assert.deepEqual(draft.nativeDesign.tool_requirements,['calculate','网络搜索'])
 await h.output.handleSave();await h.flush();assert.equal(port.writes().length,1);assert(h.output.errorMsg.includes('尚未确认'));assert.equal(paid(h).length,1)
})
test('real update DTO parser refuses malformed descriptive metadata before its terminal transport',async()=>{
 const port=dtoPort(legacy()),visible=display(legacy(),['建议']),draft=write(visible,{designMetadata:metadata(['建议'])})
 for(const authoring of [{...draft.authoring,request_id:requestId},{...draft.authoring,source:'unknown'},{...draft.authoring,tool_requirements:Array(21).fill('多出的建议')}])await assert.rejects(port.api.update(ids.a,7,{...draft,authoring}),error=>error instanceof OriginalHomeApiError&&error.status===400)
 assert.equal(port.requests.length,0)
})
