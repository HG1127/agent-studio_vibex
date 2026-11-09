// Actual original wrapper/native hook/controller/client. No React DOM/server/provider.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createOriginalModelHookHarness} from './helpers/original-model-connections-hook-harness.mjs'
import {employee,other,id,row,json,deferred} from './helpers/original-model-connections-unit-data.mjs'
import {modelDraftProbeProtocol,modelDraftProbeMode} from '../shared/model-draft-probe-contract.ts'
const key='synthetic-original-draft-key-3030'
const result=(r,extra={})=>({protocol:modelDraftProbeProtocol,request_id:r.body.request_id,mode:modelDraftProbeMode,owner_user_id:employee,credential_source:r.body.credential.kind,connection_id:r.body.credential.connection_id??null,connection_revision:r.body.credential.expected_revision??null,ok:true,latency_ms:3,models:['discovered-provider-alpha','discovered-provider-beta'],complete:true,error_code:'',...extra})
async function harness(t,options={}){const h=await createOriginalModelHookHarness({probe:true,intercept:r=>{if(r.route.endsWith('/capabilities'))return json({mode:'native_pg18',config_writes_enabled:options.writes!==false,model_probe_enabled:options.probe!==false,original_model_connections_protocol:'native_model_connections_owner_cas_v1',...(options.marker===false?{}:{original_model_draft_probe_protocol:modelDraftProbeProtocol})});if(r.route.endsWith('/draft-probe'))return options.reply?options.reply(r):json(result(r));return undefined}});t.after(()=>h.dispose());return h}
async function add(h){await h.output.openAddForm();await h.flush();h.output.setFormBaseUrl('https://api.openai.com/v1');h.output.setFormApiKey(key);await h.flush()}
const draftRequests=h=>h.driver.writes().filter(r=>r.route.endsWith('/draft-probe')),metadataWrites=h=>h.driver.writes().filter(r=>!r.route.endsWith('/draft-probe'))
test('unsaved original Test discovers actual response IDs without name/save/model cache or persistent key',async t=>{
 const h=await harness(t);await add(h);assert.equal(h.output.formName,'');await h.output.handleTestForm();await h.flush();assert.equal(draftRequests(h).length,1);assert.equal(metadataWrites(h).length,0);assert.deepEqual(h.output.formTestResult.models,['discovered-provider-alpha','discovered-provider-beta']);assert.equal(h.output.formTestResult.discovery,true);assert.equal(h.output.formApiKey,key);assert.equal(h.storage.size,0);assert.equal(h.output.formOpen,true);assert.equal(h.output.nativePending,false)
 const body=draftRequests(h)[0].body;assert.deepEqual(Object.keys(body).sort(),['base_url','credential','protocol','provider','request_id']);assert.equal(body.credential.api_key,key);assert.deepEqual(h.output.connectionList[0].models,row().models)
})
test('discovery never saves implicitly; later explicit original Save uses complete discovery only when manual IDs empty',async t=>{
 for(const manual of ['', 'explicit-manual']){const h=await harness(t);await add(h);h.output.setFormName('Explicit original draft save');h.output.setFormManualModels(manual);await h.flush();await h.output.handleTestForm();await h.flush();assert.equal(metadataWrites(h).length,0);await h.output.handleSave();await h.flush();assert.equal(metadataWrites(h).length,1);assert.deepEqual(metadataWrites(h)[0].body.models,manual?['explicit-manual']:['discovered-provider-alpha','discovered-provider-beta']);h.dispose()}
})
test('dirty saved form with no new key sends only owner connection/revision credential reference and does not modify saved status',async t=>{
 const h=await harness(t);await h.output.startEdit(h.output.connectionList[0]);await h.flush();h.output.setFormName('Dirty original saved metadata');await h.flush();await h.output.handleTestForm();await h.flush();const body=draftRequests(h)[0].body;assert.deepEqual(body.credential,{kind:'saved',connection_id:id,expected_revision:7});assert.equal(JSON.stringify(body).includes(key),false);assert.equal(metadataWrites(h).length,0);assert.equal(h.output.connectionList[0].revision,7);assert.equal(h.output.formName,'Dirty original saved metadata');assert.equal(h.output.formOpen,true)
})
test('new key on edited form is an explicit draft credential and cannot masquerade as stored-key discovery',async t=>{
 const h=await harness(t);await h.output.startEdit(h.output.connectionList[0]);await h.flush();h.output.setFormApiKey(key);await h.flush();await h.output.handleTestForm();await h.flush();assert.deepEqual(draftRequests(h)[0].body.credential,{kind:'draft',api_key:key});assert.equal(h.storage.size,0);assert.equal(metadataWrites(h).length,0)
})
test('old owner_cas marker alone never enables draft credentials or fabricated discovery',async t=>{
 const h=await harness(t,{marker:false});await add(h);await h.output.handleTestForm();await h.flush();assert.equal(draftRequests(h).length,0);assert.equal(metadataWrites(h).length,0);assert(h.output.errorMsg.includes('尚未支持保存前测试'));assert.equal(h.output.formTestResult,null)
})
test('changed form and closed form fence a late discovery response; there is no automatic model overwrite',async t=>{
 const gate=deferred(),h=await harness(t,{reply:()=>gate.promise});await add(h);const run=h.output.handleTestForm();await h.flush();h.output.setFormManualModels('newer-manual-value');await h.flush();gate.resolve(json(result(draftRequests(h)[0])));await run;await h.flush();assert.equal(h.output.formTestResult,null);assert.equal(h.output.formManualModels,'newer-manual-value');assert.equal(metadataWrites(h).length,0)
})
test('busy focus account switch hides old draft key and ignores late result without a metadata uncertainty marker',async t=>{
 const gate=deferred(),h=await harness(t,{reply:()=>gate.promise});await add(h);const run=h.output.handleTestForm();await h.flush();h.currentEmployee=other;await h.emit('focus');assert.equal(h.output.formApiKey,'');assert.equal(h.output.connectionList.length,0);assert.equal(h.output.formOpen,false);gate.resolve(json(result(draftRequests(h)[0])));await run;await h.flush();assert.equal(h.output.formTestResult,null);assert.equal(h.storage.size,0);assert.equal(metadataWrites(h).length,0)
})
test('lost/foreign/key-echo/partial discovery responses do not publish results or write/retry metadata',async t=>{
 for(const reply of [()=>{throw Error('terminal response lost')},r=>json(result(r,{owner_user_id:other})),r=>json(result(r,{models:[key]})),r=>json(result(r,{complete:false}))]){const h=await harness(t,{reply});await add(h);await h.output.handleTestForm();await h.flush();assert.equal(h.output.formTestResult,null);assert.equal(draftRequests(h).length,1);assert.equal(metadataWrites(h).length,0);assert.equal(h.storage.size,0);assert.equal(h.output.nativePending,false);h.dispose()}
})
test('existing card saved-probe remains separately gated and uses its unchanged revision/status contract',async t=>{const h=await harness(t);await h.output.handleRetest(h.output.connectionList[0]);await h.flush();assert.equal(draftRequests(h).length,0);assert.equal(metadataWrites(h).length,1);assert(metadataWrites(h)[0].route.endsWith('/probe'));assert.equal(h.output.connectionList[0].revision,8)})
