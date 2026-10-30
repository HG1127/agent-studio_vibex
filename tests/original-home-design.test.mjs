import test from 'node:test'
import assert from 'node:assert/strict'
import {createOriginalHomeDesignController,chooseOriginalHomeDesignModel,originalHomeDesignEditorKey,originalHomeDesignStorageKey} from '../src/lib/originalHomeDesign.ts'
import {createPgNativeAgentDesignApi,agentDesignSubmitBody,PgNativeAgentDesignError} from '../src/lib/pgNativeAgentDesign.ts'
import {normalizeOriginalHomeDesignMetadata} from '../shared/original-home-design-metadata.ts'
import {originalHomeEditorWrite} from '../src/lib/originalHomeAgentEditor.ts'
import {normalizeAgentDraft} from '../src/lib/agentEditorDraft.ts'
import {employee,other,connection,specId,requestId,binding,fields,model,source,preview,receipt,resultView,caps,deferred} from './helpers/original-home-design-unit-data.mjs'

function machine(options={}){
 const calls=[],applied=[],events=[],storage=options.storage??new Map();let cached=employee,verified=employee,key='original-editor',scopeLost=0,body
 const ports={employeeId:employee,currentEmployee:()=>cached,verifyEmployee:async()=>{if(options.verifyError?.())throw Error('temporarily unavailable');cached=verified;return verified},capabilities:async()=>options.capabilities??caps,models:async()=>options.models??[model()],editorKey:()=>key,storage:{read(){if(options.readFailure)throw Error('private');return storage.get(employee)??null},write(value){calls.push({name:'store'});if(options.writeFailure)throw Error('private');storage.set(employee,value)}},onChange:value=>events.push(value),onScopeChanged(){scopeLost++},onResult:value=>{applied.push(value);return options.apply!==false},requestId:()=>requestId,now:()=>Date.parse('2026-10-30T01:00:00.000Z'),api:{
  source:async id=>{calls.push({name:'source',id});return source(options.sourceRevision??7)},
  preview:async choice=>{calls.push({name:'preview',choice});return preview(choice)},
  submit:async(value,signal,confirm=false)=>{body=value;calls.push({name:confirm?'confirm':'submit',body:structuredClone(value),signal});if(options.submit)return options.submit(value,signal,confirm);return receipt(value,{replayed:confirm})},
  view:async id=>{calls.push({name:'view',id});if(options.view)return options.view(body);return resultView(body,options.resultStatus??'available')},
 }}
 const controller=createOriginalHomeDesignController(ports)
 return{controller,calls,applied,events,storage,ports,setEmployee(value){verified=value},setKey(value){key=value},lost:()=>scopeLost}
}
const paid=m=>m.calls.filter(v=>v.name==='submit'),confirms=m=>m.calls.filter(v=>v.name==='confirm')

test('constructor/start/actual preview never submits; preview is actual nonrecorded request metadata',async()=>{
 const m=machine();assert.equal(m.calls.length,0);await m.controller.start();assert.equal(m.calls.length,0)
 await m.controller.prepareGenerate('原始要求');assert.equal(paid(m).length,0);assert.equal(m.calls.filter(v=>v.name==='preview').length,1);assert.deepEqual(m.controller.getView().preview,{purpose:'generate',instruction:'原始要求',model_name:'本人合成模型',model_id:'synthetic-model',connection_revision:2,output_token_limit:4096,byte_length:99,recorded:false})
})
test('one explicit paid submit follows durable exact intent and only original receipt reads apply the result',async()=>{
 const m=machine();await m.controller.prepareGenerate('要求');await m.controller.submit('generate','要求')
 assert.deepEqual(m.calls.map(v=>v.name),['preview','store','submit','confirm','view','store']);assert.equal(paid(m).length,1);assert.equal(confirms(m).length,1);assert.equal(m.applied.length,1);assert.equal(m.applied[0].request_id,requestId);assert.equal(m.controller.getView().pending,false);assert.equal(JSON.parse(m.storage.get(employee)).applied,true)
})
test('an unknown ACK survives disposal/reload and every recovery action confirms the exact original intent only',async()=>{
 const storage=new Map(),m=machine({storage,submit:async(body,signal,confirm)=>{if(!confirm)throw new PgNativeAgentDesignError(0,'agent_design_outcome_unknown');return receipt(body,{replayed:true})}})
 await m.controller.prepareGenerate('不可重放的要求');await m.controller.submit('generate','不可重放的要求');const original=paid(m)[0].body;assert.equal(m.controller.getView().pending,true);assert.equal(m.applied.length,0);m.controller.dispose()
 const resumed=machine({storage});await resumed.controller.start();assert.equal(paid(resumed).length,0);await resumed.controller.submit('generate','另一个新要求')
 assert.equal(paid(resumed).length,0);assert.deepEqual(confirms(resumed)[0].body,original);assert.equal(resumed.applied.length,1)
})
test('a missing original receipt never clears an uncertain intent or authorizes a paid replay',async()=>{
 const m=machine({submit:async(body,signal,confirm)=>{throw new PgNativeAgentDesignError(confirm?404:0,confirm?'agent_design_request_refused':'agent_design_outcome_unknown')}})
 await m.controller.prepareGenerate('要求');await m.controller.submit('generate','要求');await m.controller.prepareGenerate('新要求');await m.controller.queryOriginal();assert.equal(paid(m).length,1);assert.equal(confirms(m).length,2);assert.equal(m.controller.getView().pending,true)
})
for(const status of ['pending','unknown','stale','unavailable','erased'])test('actual '+status+' status remains explicit and never automatically becomes a fresh paid attempt',async()=>{
 const m=machine({resultStatus:status});await m.controller.prepareGenerate('要求');await m.controller.submit('generate','要求');assert.equal(paid(m).length,1);assert.equal(m.applied.length,0);assert.equal(m.controller.getView().pending,['pending','unknown'].includes(status));assert(m.controller.getView().error)
 await m.controller.prepareGenerate('新要求');assert.equal(paid(m).length,1);if(['pending','unknown'].includes(status))assert.equal(m.calls.filter(v=>v.name==='preview').length,1);else assert.equal(m.calls.filter(v=>v.name==='preview').length,2)
})
test('oversized requirements are refused intact before any preview or paid request',async()=>{
 const m=machine();await m.controller.prepareGenerate('x'.repeat(2001));assert.equal(m.calls.length,0);assert.equal(m.applied.length,0);assert(m.controller.getView().error.includes('2000'))
})
test('ambiguous/foreign/disabled model metadata cannot become a first-item paid selection',async()=>{
 for(const models of [[model({models:['one','two']})],[model({owner_user_id:other})],[model({enabled:false})],[model({status:'untested'})],[model({status:'error'})]]){const m=machine({models});await m.controller.prepareGenerate('要求');assert.equal(paid(m).length,0);assert.equal(m.calls.filter(v=>v.name==='preview').length,0)}
 assert.deepEqual(chooseOriginalHomeDesignModel([model({models:['one','two']})],employee,{...binding,model_id:'two'}).binding,{...binding,model_id:'two'})
 assert.throws(()=>chooseOriginalHomeDesignModel([model()],employee,{...binding,connection_revision:1}))
})
test('disabled capabilities refuse new submission while retaining an old exact confirmation',async()=>{
 const m=machine({capabilities:{...caps,agent_design_submissions_enabled:false}});await m.controller.prepareGenerate('要求');assert.equal(m.calls.length,0)
 const first=machine({submit:async()=>{throw new PgNativeAgentDesignError(0,'agent_design_outcome_unknown')}});await first.controller.prepareGenerate('要求');await first.controller.submit('generate','要求');first.controller.dispose()
 const resumed=machine({storage:first.storage,capabilities:{...caps,config_writes_enabled:false,agent_design_submissions_enabled:false}});await resumed.controller.queryOriginal();assert.equal(paid(resumed).length,0);assert.equal(resumed.applied.length,1)
})
test('unreadable/corrupt/foreign storage and a failed pre-submit write block paid effects without deleting data',async()=>{
 for(const options of [{readFailure:true},{storage:new Map([[employee,'not-json']])},{storage:new Map([[employee,'x'.repeat(64001)]])}]){const m=machine(options);await m.controller.prepareGenerate('要求');await m.controller.submit('generate','要求');assert.equal(paid(m).length,0);assert.equal(m.controller.getView().blocked,true)}
 const m=machine({writeFailure:true});await m.controller.prepareGenerate('要求');await m.controller.submit('generate','要求');assert.equal(paid(m).length,0);assert.equal(m.controller.getView().blocked,true)
})
test('busy focus verifies the replacement employee before held ACK release and clears old result scope',async()=>{
 const gate=deferred(),m=machine({submit:(body,signal,confirm)=>confirm?receipt(body,{replayed:true}):gate.promise});await m.controller.prepareGenerate('要求');const running=m.controller.submit('generate','要求');await new Promise(resolve=>setImmediate(resolve));assert.equal(paid(m).length,1)
 m.setEmployee(other);await m.controller.checkScope();assert.equal(m.lost(),1);assert.equal(m.controller.getView().preview,null);assert.equal(m.controller.getView().pending,false);assert.equal(m.controller.getView().blocked,true)
 gate.resolve(receipt(paid(m)[0].body));await running;assert.equal(m.applied.length,0);assert.equal(paid(m).length,1);assert.equal(JSON.parse(m.storage.get(employee)).employee_id,employee)
})
test('server expected-employee409 cannot become a replacement-employee result or a new paid retry',async()=>{
 const m=machine({submit:async()=>{throw new PgNativeAgentDesignError(409,'agent_design_employee_changed')}});await m.controller.prepareGenerate('要求');await m.controller.submit('generate','要求');assert.equal(m.lost(),1);assert.equal(m.applied.length,0);assert.equal(m.controller.getView().blocked,true);assert(m.storage.get(employee))
})
test('newer editor intent blocks a late available result until the original editor is explicitly restored',async()=>{
 const gate=deferred(),m=machine({view:()=>gate.promise});await m.controller.prepareGenerate('要求');const running=m.controller.submit('generate','要求');await new Promise(resolve=>setImmediate(resolve));m.setKey('newer-editor');gate.resolve(resultView(paid(m)[0].body));await running;assert.equal(m.applied.length,0);assert.equal(m.controller.getView().pending,true)
 m.setKey('original-editor');await m.controller.queryOriginal();assert.equal(m.applied.length,1);assert.equal(paid(m).length,1)
})
test('disposal fences a late actual promise even if its data port ignores abort',async()=>{
 const gate=deferred(),m=machine({view:()=>gate.promise});await m.controller.prepareGenerate('要求');const running=m.controller.submit('generate','要求');await new Promise(resolve=>setImmediate(resolve));m.controller.dispose();const count=m.events.length;gate.resolve(resultView(paid(m)[0].body));await running;assert.equal(m.applied.length,0);assert.equal(m.events.length,count);assert(m.storage.get(employee))
})
test('revision uses the actual source and exact revision; it never submits from a stale saved source',async()=>{
 const m=machine();await m.controller.prepareRevision({instruction:'修改要求',spec_id:specId,revision:7,model_binding:binding});assert.deepEqual(m.calls.map(v=>v.name),['source','preview']);assert.deepEqual(m.calls[1].choice.source,source().source);assert.equal(paid(m).length,0);await m.controller.submit('revise','修改要求');assert.equal(m.applied[0].purpose,'revise')
 const stale=machine({sourceRevision:8});await stale.controller.prepareRevision({instruction:'修改要求',spec_id:specId,revision:7});assert.deepEqual(stale.calls.map(v=>v.name),['source']);assert.equal(paid(stale).length,0)
})
test('invalid or mismatched server receipt/model scope stays uncertain without installing result data',async()=>{
 const m=machine({submit:async(body,signal,confirm)=>receipt(body,{replayed:confirm,model_binding:{...binding,connection_revision:3}})});await m.controller.prepareGenerate('要求');await m.controller.submit('generate','要求');assert.equal(m.applied.length,0);assert.equal(m.controller.getView().pending,true);assert.equal(paid(m).length,1)
})
test('temporary identity outage retains exact owner recovery and hides an old preview',async()=>{
 let offline=false;const m=machine({verifyError:()=>offline,submit:async(body,signal,confirm)=>{if(!confirm)throw new PgNativeAgentDesignError(0,'agent_design_outcome_unknown');return receipt(body,{replayed:true})}});await m.controller.prepareGenerate('要求');await m.controller.submit('generate','要求');const bytes=m.storage.get(employee);offline=true;await m.controller.checkScope();assert.equal(m.storage.get(employee),bytes);assert.equal(m.controller.getView().preview,null);assert.equal(m.controller.getView().pending,true);offline=false;await m.controller.queryOriginal();assert.equal(m.applied.length,1);assert.equal(paid(m).length,1)
})
for(const status of [401,403])test('Native'+status+' hides preview, classifies status and retains the exact recovery body',async()=>{
 let denied=true;const m=machine({submit:async(body,signal,confirm)=>{if(denied)throw new PgNativeAgentDesignError(status,status===401?'session_required':'agent_design_access_denied');return receipt(body,{replayed:confirm})}})
 await m.controller.prepareGenerate('要求');await m.controller.submit('generate','要求');assert.equal(m.controller.getView().preview,null);assert.equal(m.controller.getView().pending,true);assert.equal(m.controller.getView().loginRequired,status===401);assert(m.storage.get(employee));denied=false;await m.controller.queryOriginal();assert.equal(m.applied.length,1);assert.equal(paid(m).length,1)
})
test('Native transport sends the fixed employee condition only on writes/confirmations and preserves its409',async()=>{
 const seen=[],api=createPgNativeAgentDesignApi({expectedEmployee:employee,rootPath:'',transport:async(url,init)=>{seen.push({url,init});if(url.endsWith('/preview'))return new Response(JSON.stringify(preview(JSON.parse(init.body))),{headers:{'Content-Type':'application/json'}});return new Response('{"error":"agent_design_employee_changed"}',{status:409,headers:{'Content-Type':'application/json'}})}})
 const p=await api.preview({action:'preview',purpose:'generate',instruction:'要求',model_binding:binding,output_token_limit:4096,source:null}),body=agentDesignSubmitBody(p,requestId);assert.equal(seen[0].init.headers['X-AgentStudio-Expected-Employee'],undefined)
 await assert.rejects(api.submit(body),error=>error.status===409&&error.code==='agent_design_employee_changed');await assert.rejects(api.submit(body,undefined,true),error=>error.code==='agent_design_employee_changed');for(const call of seen.slice(1)){assert.equal(call.init.headers['X-AgentStudio-Expected-Employee'],employee);assert.equal(call.init.headers.Authorization,undefined);assert.equal(call.init.headers['X-Rh-User-Id'],undefined);assert.equal(call.init.credentials,'same-origin');assert.equal(call.init.redirect,'error')}
 assert.throws(()=>createPgNativeAgentDesignApi({expectedEmployee:'invalid'}))
})
test('model tool suggestions survive draft recovery as descriptions and require explicit builtin selection',()=>{
 const metadata=normalizeOriginalHomeDesignMetadata({request_id:requestId,tool_requirements:['calculate','网络搜索']}),spec={goal:'目标',task_scope:'范围',deliverables:['成果'],tools:['calculate','网络搜索'],task_plan:['步骤'],done_criteria:['验收'],knowledge_base_ids:[],require_approval:true,require_plan_review:true},draft={version:1,ownerId:employee,editedAt:Date.now(),backend:'native_pg',userInput:'',spec,specName:'方案',sourceMode:'create',templateKey:'',editingRecordId:'',serverUpdated:'',nativeDesign:metadata}
 const recovered=normalizeAgentDraft(draft,employee);assert.deepEqual(recovered.nativeDesign,metadata)
 const write=originalHomeEditorWrite({name:'方案',spec:recovered.spec,source:'create',templateKey:'',designMetadata:recovered.nativeDesign});assert.deepEqual(write.spec.tools,[]);assert.deepEqual(write.authoring.tool_requirements,['calculate','网络搜索']);assert.equal(write.spec.require_plan_review,true)
 const explicit=originalHomeEditorWrite({name:'方案',spec,source:'create',templateKey:'',designMetadata:metadata,builtinSelections:['calculate']});assert.deepEqual(explicit.spec.tools,['calculate']);assert.equal(normalizeAgentDraft(draft,other),null)
 let calls=0;const bad={request_id:requestId};Object.defineProperty(bad,'tool_requirements',{enumerable:true,get(){calls++;return[]}});assert.throws(()=>normalizeOriginalHomeDesignMetadata(bad));assert.equal(calls,0);assert.equal(normalizeAgentDraft({...draft,nativeDesign:{...metadata,tool_requirements:['not-in-editor']}},employee),null)
})
test('editor keys canonicalize actual descriptive/resource intent without truncation or getter execution',()=>{
 assert.equal(originalHomeDesignEditorKey({b:1,a:2}),originalHomeDesignEditorKey({a:2,b:1}));assert.notEqual(originalHomeDesignEditorKey({approval:true}),originalHomeDesignEditorKey({approval:false}));assert.equal(originalHomeDesignEditorKey({text:'x'.repeat(48000)}),'')
 let called=0;const value={};Object.defineProperty(value,'x',{enumerable:true,get(){called++;return1}});assert.equal(originalHomeDesignEditorKey(value),'');assert.equal(called,0);assert.notEqual(originalHomeDesignStorageKey(employee),originalHomeDesignStorageKey(other))
})
