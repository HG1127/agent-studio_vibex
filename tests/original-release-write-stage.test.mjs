import test from 'node:test'
import assert from 'node:assert/strict'
import {setup,posts,json,marker,Q,O} from './helpers/original-release-write-stage-data.mjs'
for(const status of [401,403])test('Release pending persisted then actual me'+status+' before api.change has zero POST and retires before GET404',async()=>{
 const x=await setup(),c=x.controller;let failed=false;x.setPendingMe(()=>{failed=true;x.setMode('signed_out');return json({error:'session_required'},status)});c.setVersionNote('PRIVATE NOTE MUST NEVER PERSIST');await c.handleSaveVersion()
 assert(failed);assert.equal(x.writtenMarkers.length,1);assert.equal(posts(x).length,0);assert.equal(x.apiFailures.length,0);const before=x.stored,captured=JSON.parse(x.writtenMarkers[0]);assert(!x.writtenMarkers[0].includes('PRIVATE'));assert.equal(c.getView().nativeBlocked,true)
 await x.reLogin();const next=await x.fresh();await assert.rejects(x.actualApi.query(captured),error=>error.status===404);await next.handleQueryNative();const after404=x.stored;await next.handleSaveVersion()
 assert.equal(before,null,'never-dispatched marker must retire before re-login and GET404');assert.equal(after404,null);assert.equal(posts(x).length,1);assert.equal(JSON.parse(posts(x)[0].body).request_id,O);next.dispose()
})
for(const status of [401,403])test('Release API capabilities'+status+' after pending but before actual POST retires by not-dispatched evidence',async()=>{
 const x=await setup(),c=x.controller;x.setPendingCap(()=>{x.setMode('signed_out');return json({error:'session_required'},status)});await c.handleSaveVersion();assert.equal(x.apiFailures.length,1);assert.equal(posts(x).length,0);assert.equal(x.writtenMarkers.length,1);const before=x.stored;await x.reLogin();const next=await x.fresh();await next.handleQueryNative();await next.handleSaveVersion();assert.equal(before,null,'actual API preflight never dispatched the POST');assert.equal(posts(x).length,1);next.dispose()
})
for(const [status,code]of [[401,'session_required'],[403,'native_request_origin_denied']])test('Release complete original POST '+status+' refusal is preserved before follow-up identity failure changes epoch',async()=>{
 let reject=true;const x=await setup({change:async(_op,{setMode})=>{if(reject){setMode('signed_out');return json({error:code},status)}}}),c=x.controller;await c.handleSaveVersion();assert.equal(posts(x).length,1);assert.equal(x.apiFailures[0].error.status,status);assert.equal(x.apiFailures[0].error.outcomeUnknown,false);assert.equal(x.apiAcknowledgements.length,0);const before=x.stored;reject=false;await x.reLogin();const next=await x.fresh();await next.handleQueryNative();await next.handleSaveVersion();assert.equal(before,null,'full original POST refusal must retire before follow-up me failure invalidates');assert.equal(posts(x).length,2);assert.notEqual(JSON.parse(posts(x)[1].body).request_id,Q);next.dispose()
})
for(const action of ['acceptance','publish','restore','delete_draft'])test('Release actual original '+action+' UI action retains exact CAS and retires only its complete POST refusal',async()=>{
 const x=await setup({change:async(_op,{setMode})=>{setMode('signed_out');return json({error:'session_required'},401)}}),c=x.controller
 if(action==='acceptance'){c.setTestInstruction('PRIVATE ACCEPTANCE INPUT');c.setNativeAcceptanceConfirmed(true);await c.handleRunTest()}
 else{const row=c.getView().versionList[0];if(action==='publish')await c.requestPublish(row);else if(action==='restore'){await c.requestRestore(row);c.setNativeRestoreReason('Reviewed original configuration restore')}else await c.requestDelete(row);c.setNativeConfirmChecked(true);await c.handleConfirm()}
 assert.equal(posts(x).length,1);const op=JSON.parse(posts(x)[0].body);assert.equal(op.action,action)
 if(action!=='delete_draft'){assert.equal(op.expected_spec_revision,3);assert.equal(op.source_sha256,'a'.repeat(64))}
 if(action!=='acceptance'){assert.equal(op.expected_version_revision,1);assert.equal(op.version_sha256,'d'.repeat(64))}
 if(action==='publish')assert.equal(op.expected_release_revision,2)
 if(action==='acceptance')assert.equal(op.model_binding.connection_revision,2)
 assert.equal(x.writtenMarkers.length,1);assert(!x.writtenMarkers[0].includes('PRIVATE'));assert(!x.writtenMarkers[0].includes('Reviewed original'));assert.equal(x.apiFailures.length,1);assert.equal(x.stored,null);c.dispose()
})
