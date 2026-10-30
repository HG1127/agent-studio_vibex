import test from 'node:test'
import assert from 'node:assert/strict'
import {createOriginalModelHookHarness,sourceBinding} from './helpers/original-model-connections-hook-harness.mjs'
import {employee,other,id,createdId,row,json,deferred} from './helpers/original-model-connections-unit-data.mjs'
import {originalModelUncertaintyKey} from '../src/lib/originalModelConnections.ts'
async function harness(t,options={}){const h=await createOriginalModelHookHarness(options);t.after(()=>h.dispose());return h}
async function fillAdd(h){await h.output.openAddForm();await h.flush();h.output.setFormName('Actual original add callback');h.output.setFormBaseUrl('https://api.openai.com/v1');h.output.setFormApiKey('synthetic-original-form-key-0004');h.output.setFormManualModels('model-one,model-two');await h.flush()}
test('actual original wrapper selects PG once and preserves all source-bound callback/data ports',async t=>{
 const h=await harness(t);assert.equal(h.output.nativeMode,true);assert.equal(h.output.connectionList[0].revision,7);assert.equal(h.driver.writes().length,0);assert.equal(sourceBinding().length,3);assert(sourceBinding().every(v=>/^[a-f0-9]{64}$/.test(v.sha256)))
})
test('actual original add/save then edit/switch/delete callback chain uses real client contracts without testing',async t=>{
 const h=await harness(t);await fillAdd(h);await h.output.handleSave();await h.flush();assert.equal(h.driver.writes().length,1);assert.equal(h.output.formOpen,false);assert.equal(h.output.formApiKey,'')
 await h.output.startEdit(h.output.connectionList.find(v=>v.id===createdId));await h.flush();h.output.setFormName('Actual original edit callback');await h.flush();await h.output.handleSave();await h.flush();assert.equal(h.driver.writes()[1].body.expected_revision,1);assert.equal(Object.hasOwn(h.driver.writes()[1].body,'api_key'),false)
 await h.output.handleToggleEnabled(h.output.connectionList.find(v=>v.id===createdId),false);await h.flush();assert.equal(h.driver.writes()[2].body.expected_revision,2);assert.equal(h.output.connectionList.find(v=>v.id===createdId).enabled,false)
 h.output.requestDelete(createdId);await h.flush();assert.equal(h.output.pendingDeleteId,createdId);await h.output.confirmDelete();await h.flush();assert.equal(h.driver.writes()[3].body.expected_revision,3);assert.equal(h.driver.records.has(createdId),false);assert.equal(h.driver.requests.some(v=>v.route.endsWith('/probe')),false)
})
test('actual original form testing does not implicitly save unsaved credentials or a dirty saved form',async t=>{
 const h=await harness(t,{probe:true});await fillAdd(h);await h.output.handleTestForm();await h.flush();assert.equal(h.driver.writes().length,0);assert(h.output.errorMsg.includes('尚未支持保存前测试'))
 h.output.closeForm();await h.flush();await h.output.startEdit(h.output.connectionList[0]);await h.flush();h.output.setFormBaseUrl('https://other.example.test/v1');await h.flush();await h.output.handleTestForm();await h.flush();assert.equal(h.driver.writes().length,0)
})
test('actual original saved test reports configured model rows only under independent probe capability',async t=>{
 const h=await harness(t,{probe:true});await h.output.startEdit(h.output.connectionList[0]);await h.flush();await h.output.handleTestForm();await h.flush();assert.equal(h.driver.writes().length,1);assert(h.driver.writes()[0].route.endsWith('/probe'));assert.deepEqual(h.output.formTestResult.models,row().models)
})
test('actual original protocol-absent view is read-only and never sends a key',async t=>{
 const h=await harness(t,{protocol:false});assert.equal(h.output.writeBlocked,true);assert.equal(h.output.connectionList.length,1);await h.output.openAddForm();await h.flush();assert.equal(h.output.formOpen,false);await h.output.handleToggleEnabled(h.output.connectionList[0],false);await h.flush();assert.equal(h.driver.writes().length,0)
})
test('actual original open form keeps its CAS baseline when focus refresh sees a concurrent update',async t=>{
 const h=await harness(t);await h.output.startEdit(h.output.connectionList[0]);await h.flush();h.output.setFormName('Keep original local form');await h.flush();h.driver.records.set(id,row({revision:8,name:'Concurrent server edit'}));await h.emit('focus');await h.output.handleSave();await h.flush();assert.equal(h.driver.writes()[0].body.expected_revision,7);assert.equal(h.driver.records.get(id).name,'Concurrent server edit');assert.equal(h.output.formName,'Keep original local form');assert(h.output.errorMsg.includes('版本已变化'))
})
test('actual original unknown create persists only a non-secret marker; same control/reload cannot replay it',async t=>{
 const h=await harness(t,{afterWrite(){throw Error('terminal acknowledgement lost')}});await fillAdd(h);await h.output.handleSave();await h.flush();assert.equal(h.output.nativePending,true);assert.equal(h.output.formApiKey,'');assert.equal(h.output.saveActionLabel,'核对原操作结果')
 const raw=h.storage.get(originalModelUncertaintyKey(employee));assert.equal(raw.includes('synthetic-original-form-key'),false);await h.output.handleSave();await h.flush();assert.equal(h.driver.writes().length,1);assert.equal(h.output.nativePending,true)
 const stored=[...h.storage],records=[...h.driver.records.values()];h.dispose();const resumed=await harness(t,{storage:stored,rows:records});assert.equal(resumed.output.nativePending,true);await resumed.output.openAddForm();await resumed.flush();await resumed.output.handleSave();await resumed.flush();assert.equal(resumed.driver.writes().length,0)
})
test('actual original busy focus hides Alice credentials and rows before held response release',async t=>{
 const gate=deferred(),h=await harness(t,{afterWrite:()=>gate.promise});await fillAdd(h);const saving=h.output.handleSave();await h.flush();assert.equal(h.driver.writes().length,1);h.currentEmployee=other;await h.emit('focus');assert.equal(h.output.connectionList.length,0);assert.equal(h.output.formApiKey,'');assert.equal(h.output.formOpen,false);assert(h.storage.has(originalModelUncertaintyKey(employee)));assert.equal(h.storage.has(originalModelUncertaintyKey(other)),false)
 gate.resolve(json({item:h.driver.records.get(createdId)},201));await saving;await h.flush();assert.equal(h.output.connectionList.length,0);assert.equal(h.driver.writes().length,1)
})
