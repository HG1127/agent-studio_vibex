// Actual controller and terminal data ports only; no provider, SQL or browser.
import test from 'node:test'
import assert from 'node:assert/strict'
import {OriginalVersionReleaseError} from '../shared/original-version-release-contract.ts'
import {E,OTHER,S,B,model,workspace,harness,deferred} from './helpers/original-version-release-terminal-data.mjs'
const bindings=h=>h.controller.getView().customModels.map(v=>JSON.parse(v.value)),changes=h=>h.calls.filter(v=>v[0]==='change')
async function waitForRead(count,expected=2){for(let i=0;i<8&&count()<expected;i++)await new Promise(r=>setImmediate(r));assert.equal(count(),expected,'Refresh must actually read model inventory')}
test('refresh reads current model revisions without silently rebinding previously confirmed acceptance',async()=>{
 const h=harness(),c=h.controller;await c.start(S);const original=h.view.testModel;c.setTestInstruction('UNSENT TASK');c.setVersionNote('UNSENT NOTE');c.setNativeAcceptanceConfirmed(true)
 await c.handleRefreshNative();assert.equal(h.view.testModel,original);assert.equal(h.view.nativeAcceptanceConfirmed,true)
 h.data.models={items:[{...model(),revision:3}],complete:true};await c.handleRefreshNative()
 assert.deepEqual(bindings(h).map(v=>v.connection_revision),[3]);assert.equal(h.view.testModel,'');assert.equal(h.view.isCustomTestModel,false);assert.equal(h.view.nativeAcceptanceConfirmed,false);assert.equal(h.view.testInstruction,'UNSENT TASK');assert.equal(h.view.versionNote,'UNSENT NOTE')
 await c.handleRunTest();assert.equal(changes(h).length,0)
 c.setTestModel(h.view.customModels[0].value);c.setNativeAcceptanceConfirmed(true);await c.handleRunTest();assert.equal(changes(h)[0][1].model_binding.connection_revision,3)
})
test('disabled or untested refreshed model cannot remain an available acceptance selection',async()=>{
 for(const change of [{enabled:false},{status:'untested'}]){const h=harness(),c=h.controller;await c.start(S);c.setTestInstruction('TASK');c.setNativeAcceptanceConfirmed(true);h.data.models={items:[{...model(),...change}],complete:true};await c.handleRefreshNative();assert.deepEqual(h.view.customModels,[]);assert.equal(h.view.testModel,'');c.setNativeAcceptanceConfirmed(true);await c.handleRunTest();assert.equal(changes(h).length,0)}
})
test('unavailable model refresh removes stale choices but preserves readable history and local inputs',async()=>{
 let reads=0;const h=harness({ports:{models:async()=>{if(++reads>1)throw Error('terminal unavailable');return{items:[model()],complete:true}}}}),c=h.controller;await c.start(S);c.setVersionNote('KEEP NOTE');c.setTestInstruction('KEEP TASK');c.setNativeAcceptanceConfirmed(true);await c.handleRefreshNative()
 assert.deepEqual(h.view.customModels,[]);assert.equal(h.view.isCustomTestModel,false);assert.equal(h.view.nativeAcceptanceConfirmed,false);assert.equal(h.view.versionList.length,1);assert.equal(h.view.versionNote,'KEEP NOTE');assert.equal(h.view.testInstruction,'KEEP TASK');assert(h.view.errorMsg.includes('模型清单'));assert.equal(changes(h).length,0)
})
test('partial list does not claim a missing original model is absent or choose another model automatically',async()=>{
 const h=harness(),c=h.controller;await c.start(S);const original=h.view.testModel;c.setNativeAcceptanceConfirmed(true);h.data.models={items:[{...model(),id:'40000000-0000-4000-8000-000000000002'}],complete:false};await c.handleRefreshNative()
 assert.equal(h.view.testModel,original);assert.equal(h.view.isCustomTestModel,false);assert.equal(h.view.nativeAcceptanceConfirmed,false);assert(h.view.nativeNotice.includes('模型列表为部分'));assert.equal(changes(h).length,0)
})
test('same employee recovery rereads model inventory before restoring input and requires fresh consent',async()=>{
 let current=E;const h=harness({ports:{currentEmployee:()=>current,verifyEmployee:async()=>{if(current===null)throw new OriginalVersionReleaseError(503,'original_release_identity_unavailable');return current}}}),c=h.controller;await c.start(S);c.setVersionNote('PRIVATE NOTE');c.setNativeAcceptanceConfirmed(true);current=null;await c.checkScope();assert.equal(c.getView().versionNote,'');h.data.models={items:[{...model(),revision:3}],complete:true};current=E;await c.checkScope()
 assert.equal(h.view.versionNote,'PRIVATE NOTE');assert.deepEqual(bindings(h).map(v=>v.connection_revision),[3]);assert.equal(h.view.nativeAcceptanceConfirmed,false);assert.equal(h.view.testModel,'')
})
test('late earlier model refresh cannot replace a newer verified inventory',async()=>{
 let reads=0;const gate=deferred(),h=harness({ports:{models:async()=>{reads++;return reads===1?{items:[model()],complete:true}:reads===2?gate.promise:{items:[{...model(),revision:4}],complete:true}}}}),c=h.controller;await c.start(S);const older=c.handleRefreshNative();await waitForRead(()=>reads);await c.handleRefreshNative();assert.deepEqual(bindings(h).map(v=>v.connection_revision),[4]);gate.resolve({items:[{...model(),revision:3}],complete:true});await older;assert.deepEqual(bindings(h).map(v=>v.connection_revision),[4])
})
test('late model response after verified employee replacement cannot restore private choices',async()=>{
 let reads=0;const gate=deferred(),h=harness({ports:{models:async()=>++reads===1?{items:[model()],complete:true}:gate.promise}}),c=h.controller;await c.start(S);const reading=c.handleRefreshNative();await waitForRead(()=>reads);h.switchEmployee(OTHER);await c.checkScope();gate.resolve({items:[{...model(),name:'LATE PRIVATE MODEL',revision:3}],complete:true});await reading;assert.deepEqual(c.getView().customModels,[]);assert(!JSON.stringify(c.getView()).includes('LATE PRIVATE MODEL'));assert.equal(changes(h).length,0)
})
test('source refresh revokes old acceptance and review confirmation while preserving unsubmitted text',async()=>{
 const h=harness(),c=h.controller;await c.start(S);c.setTestInstruction('KEEP TASK');c.setVersionNote('KEEP NOTE');c.setNativeAcceptanceConfirmed(true);await c.requestRestore(h.view.versionList[0]);c.setNativeRestoreReason('REVIEWED RESTORE REASON');c.setNativeConfirmChecked(true);h.data.workspace=workspace({spec_revision:4,source_sha256:B});await c.handleRefreshNative()
 assert.equal(h.view.nativeAcceptanceConfirmed,false);assert.equal(h.view.nativeConfirmChecked,false);assert.equal(h.view.confirmAction,null);assert.equal(h.view.testInstruction,'KEEP TASK');assert.equal(h.view.versionNote,'KEEP NOTE');assert.equal(changes(h).length,0)
})
test('late initial inventory after verified same-owner recovery cannot republish the old catalog',async()=>{
 let current=E,reads=0;const gate=deferred(),seen=[]
 const h=harness({ports:{currentEmployee:()=>current,verifyEmployee:async()=>{if(current===null)throw new OriginalVersionReleaseError(503,'original_release_identity_unavailable');return current},models:async()=>++reads===1?gate.promise:{items:[{...model(),revision:3}],complete:true},onChange:value=>seen.push(value)}}),c=h.controller
 const starting=c.start(S);await waitForRead(()=>reads,1);current=null;await c.checkScope();h.data.workspace=workspace({name:'Fresh current Agent',spec_revision:4,source_sha256:B});current=E;await c.checkScope();assert.equal(c.getView().selectedSpec.name,'Fresh current Agent');const after=seen.length
 gate.resolve({items:[model()],complete:true});await starting
 assert.equal(c.getView().selectedSpec.name,'Fresh current Agent');assert.deepEqual(bindings(h).map(v=>v.connection_revision),[3]);assert(seen.slice(after).every(v=>v.selectedSpec?.name!=='Original assistant'),'old initialization cannot temporarily display stale catalog after recovery')
})
