// Real controller + actual Native DTO client over synthetic terminal Responses.
// No Cookie authority, server, SQL, credential read or provider is attested here.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createOriginalModelConnectionsController,originalModelUncertaintyKey} from '../src/lib/originalModelConnections.ts'
import {createOriginalModelConnectionsApi,OriginalModelConnectionsError} from '../src/lib/originalModelConnectionsApi.ts'
import {employee,other,id,createdId,row,terminalModelTransport,deferred,json} from './helpers/original-model-connections-unit-data.mjs'
function machine(options={}){
 const data=terminalModelTransport(options),storage=options.storage??new Map(),events=[],key=originalModelUncertaintyKey(employee);let actualEmployee=employee,verifyError=null,operation=0
 const api=createOriginalModelConnectionsApi({employeeId:employee,rootPath:'',transport:data.transport}),controller=createOriginalModelConnectionsController({api,employeeId:employee,currentEmployee:()=>actualEmployee,verifyEmployee:async()=>{if(verifyError)throw verifyError;return actualEmployee},storage:{read(){if(options.storageReadError)throw Error('terminal storage unavailable');return storage.get(key)??null},write(value){if(options.storageWriteError)throw Error('terminal storage unavailable');storage.set(key,value)},remove(){storage.delete(key)}},onChange:view=>events.push(view),requestId:()=>String(++operation).padStart(8,'0')+'-1111-4111-8111-111111111111',now:()=>Date.parse('2026-10-30T02:00:00.000Z')})
 return{...data,api,controller,storage,key,events,view:()=>controller.getView(),setEmployee(value){actualEmployee=value},setVerifyError(value){verifyError=value}}
}
async function start(options={}){const m=machine(options);await m.controller.start();return m}
async function add(m){await m.controller.openAddForm();m.controller.setFormName('Original form synthetic new');m.controller.setFormBaseUrl('https://api.openai.com/v1');m.controller.setFormApiKey('synthetic-unit-form-key-0003');m.controller.setFormManualModels('synthetic-one， synthetic-two;synthetic-one')}
const drain=()=>new Promise(resolve=>setImmediate(resolve))
test('start reads only actual owner DTOs/capabilities; missing strict marker leaves original callbacks read-only',async()=>{
 const m=machine();assert.equal(m.requests.length,0);await m.controller.start();assert.equal(m.view().connectionList.length,1);assert.equal(m.writes().length,0)
 const closed=await start({protocol:false});assert.equal(closed.view().writeBlocked,true);await closed.controller.openAddForm();assert.equal(closed.view().formOpen,false);assert.equal(closed.writes().length,0)
})
test('original add/save sends one full metadata request after durable non-secret marker and never probes',async()=>{
 let m,hadMarker=false,keyAbsent=false; m=await start({afterWrite:(request,response)=>{hadMarker=m.storage.has(m.key);keyAbsent=m.view().formApiKey==='';return response}})
 await add(m);assert.equal(m.writes().length,0);await m.controller.handleSave();assert.equal(m.writes().length,1);assert.equal(m.writes()[0].init.method,'POST');assert.equal(hadMarker,true);assert.equal(keyAbsent,true);assert.equal(m.storage.has(m.key),false);assert.equal(m.view().formOpen,false)
 assert.deepEqual(m.writes()[0].body.models,['synthetic-one','synthetic-two']);assert.equal(m.records.get(createdId).status,'untested');assert.equal(m.requests.some(v=>v.route.endsWith('/probe')),false)
})
test('original edit and enable switch preserve metadata/key tail and use the exact current revision',async()=>{
 const m=await start();await m.controller.startEdit(m.view().connectionList[0]);m.controller.setFormName('Explicit metadata edit');await m.controller.handleSave();assert.equal(m.writes()[0].body.expected_revision,7);assert.equal(Object.hasOwn(m.writes()[0].body,'api_key'),false);assert.equal(m.records.get(id).api_key_tail,'0001')
 const current=m.view().connectionList.find(v=>v.id===id);await m.controller.handleToggleEnabled(current,false);assert.equal(m.writes()[1].body.expected_revision,8);assert.equal(m.writes()[1].body.enabled,false);assert.equal(m.writes()[1].body.name,'Explicit metadata edit');assert.equal(m.records.get(id).status,'untested');assert.equal(m.view().connectionList[0].enabled,false)
})
test('background list refresh cannot rebase an open form onto a foreign concurrent revision',async()=>{
 const m=await start();await m.controller.startEdit(m.view().connectionList[0]);m.controller.setFormName('Keep employee local edit');m.records.set(id,row({revision:8,name:'Other tab edit'}));await m.controller.loadList();await m.controller.handleSave()
 assert.equal(m.writes().length,1);assert.equal(m.writes()[0].body.expected_revision,7);assert.equal(m.records.get(id).name,'Other tab edit');assert.equal(m.view().formName,'Keep employee local edit');assert.equal(m.view().formOpen,true);assert(m.view().errorMsg.includes('版本已变化'));assert.equal(m.storage.has(m.key),false)
})
test('original delete confirmation retains its selected revision across a newer list refresh',async()=>{
 const m=await start();m.controller.requestDelete(id);m.records.set(id,row({revision:8}));await m.controller.loadList();await m.controller.confirmDelete();assert.equal(m.writes()[0].body.expected_revision,7);assert(m.records.has(id));assert(m.view().errorMsg.includes('版本已变化'))
 m.controller.cancelDelete();m.controller.requestDelete(id);await m.controller.confirmDelete();assert.equal(m.writes()[1].body.expected_revision,8);assert.equal(m.records.has(id),false)
})
test('unknown create clears password, persists only owner/action/nonce and every retry reads without replay',async()=>{
 const storage=new Map(),m=await start({storage,afterWrite(){throw Error('terminal acknowledgement lost')}});await add(m);await m.controller.handleSave();assert.equal(m.writes().length,1);assert.equal(m.view().nativePending,true);assert.equal(m.view().formApiKey,'')
 const raw=storage.get(m.key);assert.equal(raw.includes('synthetic-unit-form-key'),false);assert.deepEqual(Object.keys(JSON.parse(raw)).sort(),['action','created_at','employee_id','format','id','operation_id','revision']);assert.equal(m.view().saveActionLabel,'核对原操作结果')
 await m.controller.handleSave();await m.controller.handleToggleEnabled(m.view().connectionList[0],false);assert.equal(m.writes().length,1);assert.equal(m.view().nativePending,true);assert(m.view().noticeMsg.includes('不能证明'))
 m.controller.dispose();const resumed=await start({storage,rows:[...m.records.values()]});assert.equal(resumed.view().nativePending,true);await resumed.controller.openAddForm();await resumed.controller.handleSave();assert.equal(resumed.writes().length,0);assert.equal(resumed.storage.get(m.key),raw)
})
test('unknown update and delete never infer a receipt from the resulting metadata or absence',async()=>{
 for(const operation of ['update','delete']){const m=await start({afterWrite(){throw Error('terminal acknowledgement lost')}})
  if(operation==='update'){await m.controller.startEdit(m.view().connectionList[0]);m.controller.setFormName('Unknown updated metadata');await m.controller.handleSave()}
  else{m.controller.requestDelete(id);await m.controller.confirmDelete()}
  assert.equal(m.view().nativePending,true);await m.controller.openAddForm();await m.controller.handleSave();assert.equal(m.writes().length,1);assert.equal(m.view().nativePending,true);assert(m.storage.has(m.key))
 }
})
test('busy account switch clears old rows/form/password before an ignoring-abort reply can publish',async()=>{
 const gate=deferred(),m=await start({afterWrite:()=>gate.promise});await add(m);const running=m.controller.handleSave();await drain();assert.equal(m.writes().length,1);assert.equal(m.view().isSaving,true);m.setEmployee(other);await m.controller.checkScope();assert.equal(m.view().connectionList.length,0);assert.equal(m.view().formApiKey,'');assert.equal(m.view().formOpen,false);assert.equal(m.view().writeBlocked,true);assert(m.storage.has(m.key));assert.equal(m.storage.has(originalModelUncertaintyKey(other)),false)
 gate.resolve(json({item:m.records.get(createdId)},201));await running;assert.equal(m.view().connectionList.length,0);assert.equal(m.writes().length,1)
})
test('actual expected employee409 closes scope instead of publishing a replacement account result',async()=>{
 const m=await start({intercept:request=>request.init.method==='POST'?json({error:'employee_session_changed'},409):undefined});await add(m);await m.controller.handleSave();assert.equal(m.view().connectionList.length,0);assert.equal(m.view().formApiKey,'');assert.equal(m.view().formOpen,false);assert.equal(m.view().writeBlocked,true);assert(m.view().errorMsg.includes('账号已变化'))
})
test('late metadata list cannot overwrite a completed newer mutation and edit-open respects newer user intent',async()=>{
 const gate=deferred();let hold=false;const m=await start({intercept:request=>hold&&request.init.method==='GET'&&request.route.includes('?limit=')?gate.promise:undefined});hold=true;const refreshing=m.controller.loadList();await drain();await m.controller.startEdit(m.view().connectionList[0]);m.controller.setFormName('Newer saved value');await m.controller.handleSave();gate.resolve(json({items:[row()]}));await refreshing;assert.equal(m.view().connectionList[0].name,'Newer saved value')
})
test('edits during save remain in the form and next explicit save uses the acknowledged revision',async()=>{
 const gate=deferred();let hold=true;const m=await start({afterWrite:(_req,response)=>hold?gate.promise:response});await m.controller.startEdit(m.view().connectionList[0]);m.controller.setFormName('First submitted edit');const saving=m.controller.handleSave();await drain();m.controller.setFormName('Newer unsent edit');gate.resolve(json({item:m.records.get(id)}));await saving;assert.equal(m.view().formName,'Newer unsent edit');assert.equal(m.view().formOpen,true);hold=false;await m.controller.handleSave();assert.equal(m.writes()[1].body.expected_revision,8);assert.equal(m.records.get(id).name,'Newer unsent edit')
})
test('metadata save never tests, and unsaved/dirty form test refuses without saving or using credentials',async()=>{
 const m=await start({probe:true});await add(m);await m.controller.handleTestForm();assert.equal(m.writes().length,0);assert(m.view().errorMsg.includes('尚未支持保存前测试'))
 await m.controller.handleSave();assert.equal(m.writes().length,1);assert.equal(m.requests.some(v=>v.route.endsWith('/probe')),false)
 await m.controller.startEdit(m.view().connectionList.find(v=>v.id===id));m.controller.setFormName('Dirty config');await m.controller.handleTestForm();assert.equal(m.writes().length,1)
})
test('saved unchanged probe requires its separate capability and never replaces configured model IDs',async()=>{
 const closed=await start();await closed.controller.startEdit(closed.view().connectionList[0]);await closed.controller.handleTestForm();assert.equal(closed.writes().length,0);assert(closed.view().errorMsg.includes('未开放'))
 const m=await start({probe:true});await m.controller.startEdit(m.view().connectionList[0]);await m.controller.handleTestForm();assert.equal(m.writes().length,1);assert(m.writes()[0].route.endsWith('/probe'));assert.deepEqual(m.view().formTestResult.models,row().models);assert.equal(m.view().formTestResult.ok,true);assert.equal(m.view().formManualModels,row().models.join(', '))
})
test('unverifiable identity hides data/password without clearing the Cookie or old uncertainty',async()=>{
 const m=await start();await add(m);m.setVerifyError(new OriginalModelConnectionsError(503,'original_model_identity_unavailable'));await m.controller.checkScope();assert.equal(m.view().nativeUnavailable,true);assert.equal(m.view().formApiKey,'');assert.equal(m.view().connectionList.length,0);assert.equal(m.writes().length,0)
 m.setVerifyError(null);await m.controller.checkScope();assert.equal(m.view().nativeUnavailable,false);assert.equal(m.view().connectionList.length,1)
})
test('successful write followed by identity outage preserves uncertainty and hides sensitive state',async()=>{
 let m;m=await start({afterWrite:(_request,response)=>{m.setVerifyError(Error('terminal identity unavailable'));return response}})
 await add(m);await m.controller.handleSave();assert.equal(m.writes().length,1);assert.equal(m.view().nativePending,true);assert(m.storage.has(m.key));assert.equal(m.view().nativeUnavailable,true);assert.equal(m.view().connectionList.length,0);assert.equal(m.view().formApiKey,'');assert.equal(m.view().formOpen,false)
 m.setVerifyError(null);await m.controller.checkScope();assert.equal(m.view().nativeUnavailable,false);assert.equal(m.view().nativePending,true);await m.controller.openAddForm();await m.controller.handleSave();assert.equal(m.writes().length,1)
})
test('a verified signed-out result retains its login-required mapping and hides old credentials',async()=>{
 const m=await start();await add(m);m.setVerifyError(new OriginalModelConnectionsError(401,'original_model_identity_unavailable'));await m.controller.checkScope();assert.equal(m.view().needsRhLogin,true);assert.equal(m.view().nativeUnavailable,false);assert.equal(m.view().connectionList.length,0);assert.equal(m.view().formApiKey,'');assert.equal(m.writes().length,0)
})
test('unknown write plus identity outage retains the old owner marker before later metadata recovery',async()=>{
 let m;m=await start({afterWrite:()=>{m.setVerifyError(Error('terminal identity unavailable'));throw Error('terminal write reply lost')}})
 await add(m);await m.controller.handleSave();assert.equal(m.writes().length,1);assert.equal(m.view().nativePending,true);assert.equal(m.view().nativeUnavailable,true);assert.equal(m.view().connectionList.length,0);assert.equal(m.view().formApiKey,'');assert(m.storage.has(m.key))
 m.setVerifyError(null);await m.controller.checkScope();assert.equal(m.view().nativePending,true);assert.equal(m.view().nativeUnavailable,false)
})
test('fresh client capability preflight failure clears its marker because no mutation was sent',async()=>{
 let armed=false,capReads=0;const m=await start({intercept:request=>{if(armed&&request.route.endsWith('/capabilities')&&++capReads===2)throw Error('terminal read unavailable')}})
 await add(m);armed=true;await m.controller.handleSave();assert.equal(capReads,2);assert.equal(m.writes().length,0);assert.equal(m.view().nativePending,false);assert.equal(m.storage.has(m.key),false);assert.equal(m.view().formOpen,true)
})
test('storage failure/corruption leaves real metadata readable and blocks effects without deleting prior data',async()=>{
 for(const options of [{storageReadError:true},{storageWriteError:true},{storage:new Map([[originalModelUncertaintyKey(employee),'corrupt original marker']])}]){const m=await start(options);assert.equal(m.view().connectionList.length,1);await add(m);await m.controller.handleSave();assert.equal(m.writes().length,0);assert.equal(m.view().writeBlocked,true);if(options.storage)assert.equal(m.storage.get(m.key),'corrupt original marker')}
})
test('disposal fences late available model metadata even when terminal transport ignores abort',async()=>{
 const gate=deferred(),m=await start({afterWrite:()=>gate.promise});await add(m);const saving=m.controller.handleSave();await drain();const events=m.events.length;m.controller.dispose();gate.resolve(json({item:m.records.get(createdId)},201));await saving;assert.equal(m.events.length,events);assert(m.storage.has(m.key));assert.equal(m.writes().length,1)
})
