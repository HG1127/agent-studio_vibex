import test from 'node:test'
import assert from 'node:assert/strict'
import {setup,posts,metadataOnlyMarker,json,R} from './helpers/original-schedules-write-stage-data.mjs'
for(const status of [401,403])test('persisted marker then actual me'+status+' before api.change clears only the never-dispatched attempt',async()=>{
 const x=await setup(()=>undefined),c=x.h.controller
 let failedMe=false;x.setPendingMe(()=>{failedMe=true;x.setMode('signed_out');return json({error:status===401?'session_required':'native_request_origin_denied'},status)})
 c.edit(c.getView().items[0]);await c.save()
 assert(failedMe);assert.equal(x.writtenMarkers.length,1);assert.equal(posts(x).length,0);assert.equal(x.apiFailures.length,0);assert.equal(x.apiAcknowledgements.length,0)
 const before=metadataOnlyMarker(x),captured=JSON.parse(x.writtenMarkers[0]),revoked=c.getView().nativeSignedOut
 await x.reLogin();const next=await x.recreate();await assert.rejects(x.h.api.receipt(captured),error=>error.status===404);await next.queryReceipt();const after404=metadataOnlyMarker(x)
 next.edit(next.getView().items[0]);await next.save()
  assert.equal(captured.employee_id,x.auth.account()?.id);assert.equal(revoked,true)
 assert.equal(before,null,'a request never dispatched must retire before relogin and before any receipt GET404')
 assert.equal(after404,null);assert.equal(posts(x).length,1,'fresh manual action emits exactly one new request');assert.notEqual(JSON.parse(posts(x)[0].body).request_id,R);next.dispose()
})
for(const [status,code]of [[401,'session_required'],[403,'native_request_origin_denied']])test('original POST complete known '+status+' refusal retires its own request before auth invalidation',async()=>{
 let reject=true;const x=await setup((_op,ctx)=>{if(reject){ctx.setMode('signed_out');return json({error:code},status)}}),c=x.h.controller
 c.edit(c.getView().items[0]);await c.save();assert.deepEqual(x.apiFailures,[{request_id:R,status,code,outcomeUnknown:false}]);assert.equal(x.apiAcknowledgements.length,0)
 const before=metadataOnlyMarker(x),revoked=c.getView().nativeSignedOut;reject=false;await x.reLogin();const next=await x.recreate();await next.queryReceipt();const after404=metadataOnlyMarker(x);next.edit(next.getView().items[0]);await next.save()
  assert.equal(revoked,true)
 assert.equal(before,null,'complete original POST refusal must retire before relogin or GET404');assert.equal(after404,null);assert.equal(posts(x).length,2);assert.notEqual(JSON.parse(posts(x)[1].body).request_id,R);next.dispose()
})
