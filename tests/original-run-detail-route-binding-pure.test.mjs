import test from 'node:test'
import assert from 'node:assert/strict'
import {createDetailRouteHarness,sourceBinding,E,B,R} from './helpers/original-run-detail-route-hook-harness.mjs'
import {originalQueuedNegativeReads} from './helpers/pg-original-run-queued-negative-reads.mjs'
const misses=h=>h.reads.filter(v=>v.status===404)
for(const kind of ['agent_single','workflow_safe','workflow_v2','agent_autonomous'])test('initial actual hook/controller resolves explicit '+kind+' once',async()=>{
 const h=await createDetailRouteHarness({kind});try{assert.equal(h.output.runDetail?.id,R);assert.equal(h.output.runDetail.native.kind,kind);assert.equal(h.reads.length,2,'one actual read plus one unchanged-source recheck');assert.deepEqual(misses(h),[]);assert.deepEqual(h.posts,[])}finally{h.dispose()}
})
test('actual wrong explicit kind has one correlated miss and no fallback or write',async()=>{
 const h=await createDetailRouteHarness({search:'run='+R+'&kind=workflow_v2'});try{assert.equal(h.output.runDetail,null);assert.equal(h.output.loadState,'not_found');assert.deepEqual(misses(h).map(v=>v.kind),['workflow_v2']);assert.equal(h.reads.length,1);assert.deepEqual(h.posts,[])}finally{h.dispose()}
})
test('actual legacy link reads four protocols exactly once, then rechecks only verified matching kind',async()=>{
 const h=await createDetailRouteHarness({search:'run='+R});try{assert.equal(h.output.runDetail?.native.kind,'agent_autonomous');assert.equal(h.reads.length,5);assert.deepEqual(misses(h).map(v=>v.kind),['agent_single','workflow_safe','workflow_v2']);assert.deepEqual(h.posts,[])}finally{h.dispose()}
})
test('actual foreign owner failure performs one explicit miss and hides the private body',async()=>{
 const h=await createDetailRouteHarness({employee:B,owner:E});try{assert.equal(h.output.runDetail,null);assert.equal(h.reads.length,1);assert.deepEqual(misses(h).map(v=>v.kind),['agent_autonomous']);assert.equal(JSON.stringify(h.output).includes('Synthetic owned instruction'),false);assert.deepEqual(h.posts,[])}finally{h.dispose()}
})
test('an explicit later route change is still read and cannot inherit prior success',async()=>{
 const h=await createDetailRouteHarness();try{assert.equal(h.reads.length,2);await h.route('run='+R+'&kind=workflow_v2');assert.equal(h.output.runDetail,null);assert.equal(h.reads.length,3);assert.deepEqual(misses(h).map(v=>v.kind),['workflow_v2']);assert.deepEqual(h.posts,[])}finally{h.dispose()}
})
test('route change during first read is consumed after that read settles',async()=>{
 const h=await createDetailRouteHarness({deferFirst:true});try{assert(h.firstEntered);await h.route('run='+R+'&kind=workflow_v2');h.firstRelease();await h.flush();assert.equal(h.output.runDetail,null);assert.deepEqual(misses(h).map(v=>v.kind),['workflow_v2']);assert.equal(h.reads.length,3);assert.deepEqual(h.posts,[])}finally{h.dispose()}
})
test('same employee focus verifies identity without duplicate target read; visibility resume revalidates',async()=>{
 const h=await createDetailRouteHarness();try{await h.emit('focus');assert.equal(h.reads.length,2);await h.visibility(true);assert.equal(h.output.runDetail,null);await h.visibility(false);assert.equal(h.reads.length,4);assert.equal(h.output.runDetail?.id,R);assert.deepEqual(h.posts,[])}finally{h.dispose()}
})
test('identity switch resumes current route once and preserves owner privacy',async()=>{
 const h=await createDetailRouteHarness();try{h.employee=B;await h.emit('focus');assert.equal(h.output.runDetail,null);assert.equal(h.reads.length,3);assert.deepEqual(misses(h).map(v=>v.kind),['agent_autonomous']);assert.deepEqual(h.posts,[])}finally{h.dispose()}
})
test('original exact negative ledger still rejects duplicates, arbitrary targets, statuses and error bodies',()=>{
 const ids=Array.from({length:8},(_,i)=>(i+1).toString(16).padStart(8,'0')+'-1111-4111-8111-111111111111'),ledger=originalQueuedNegativeReads(ids),path='/api/v2/workflow-v2-runs/'+ids[0],receipt=ledger.expect(ids[0],['workflow_v2'],'wrong_explicit_kind')
 for(const [method,p,status,body]of [['POST',path,404,{error:'workflow_run_not_found'}],['GET',path,403,{error:'workflow_run_not_found'}],['GET',path,404,{error:'unrelated'}],['GET',path+'x',404,{error:'workflow_run_not_found'}]])assert.equal(ledger.consume(method,p,status,body),null)
 assert.throws(()=>receipt.assertConsumed());assert(ledger.consume('GET',path,404,{error:'workflow_run_not_found'}));assert.equal(ledger.consume('GET',path,404,{error:'workflow_run_not_found'}),null);receipt.assertConsumed();ledger.assertEmpty();assert.throws(()=>ledger.expect(R,['workflow_v2'],'wrong_explicit_kind'))
})
test('evidence binds all four actual source files without a renderer or business runtime',()=>{assert.equal(sourceBinding().length,4);assert(sourceBinding().every(v=>/^[a-f0-9]{64}$/.test(v.sha256)))})
