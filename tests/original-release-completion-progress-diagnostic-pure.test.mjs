import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {createHash} from 'node:crypto'
const path=new URL('./helpers/pg-original-version-release-completion-backend-fixture.mjs',import.meta.url),source=fs.readFileSync(path,'utf8')
const first=source.indexOf('  const tickUntilStatus=async('),last=source.indexOf('  const assertInteractionAck=',first)
assert(first>=0&&last>first&&source.indexOf('  const tickUntilStatus=async(',first+1)===-1)
// Execute the exact actual fixture closure, without importing/starting the
// database fixture, Worker, service, dispatcher, TLS helper or browser.
const actualTick=vm.runInNewContext('(assert,request,owned,f,completionDispatch)=>{'+source.slice(first,last)+';return tickUntilStatus}',{})
const owner='11111111-1111-4111-8111-111111111111',spec='22222222-2222-4222-8222-222222222222',run='33333333-3333-4333-8333-333333333333'
function terminal({statuses=['paused'],code='workflow_v2_effect_outcome_unknown',rowPatch={},detailStatus=200,readThrows=false,tickStatus='progressed',errorDescriptor=undefined}={}){
 const reads=[],ticks=[];let index=0
 const request=async(who,path,method,body,expected)=>{
  reads.push({who,path,method,body,expected});assert.equal(who,'alice');assert.equal(method,'GET');assert.equal(body,undefined);assert.equal(expected,owner)
  if(path==='/api/v2/original-ui/agent-releases/'+spec+'/acceptance/'+run)return{status:200,body:{item:{status:statuses[Math.min(index++,statuses.length-1)]}}}
  assert.equal(path,'/api/v2/agent-autonomous-runs/'+run)
  if(readThrows)throw Error('synthetic readonly transport unavailable')
  const row={id:run,owner_user_id:owner,agent_spec_id:spec,workflow_id:null,kind:'agent',status:statuses.at(-1),last_error_code:code,...rowPatch}
  if(errorDescriptor)Object.defineProperty(row,'last_error_code',errorDescriptor)
  return{status:detailStatus,body:{execution_mode:'agent_native_v2',run:row}}
 }
 const tick=actualTick(assert,request,{alice:{id:spec}},{users:{alice:owner}},{tick:async id=>{ticks.push(id);return{run_id:id,status:tickStatus}}})
 return{tick,reads,ticks}
}
for(const status of ['awaiting_approval','awaiting_input','paused','failed','cancelled','succeeded'])test('actual progress closure refuses '+status+' before another Worker tick',async()=>{
 const t=terminal({statuses:[status]}),target=status==='awaiting_approval'?'awaiting_input':'awaiting_approval'
 await assert.rejects(t.tick(run,target),error=>{assert(error.message.startsWith('original explicit decision/reply must precede Worker progress '));assert(error.message.includes('"observed_status":"'+status+'"'));assert(error.message.includes('"owner_run_status":"'+status+'"'));assert(error.message.includes('"error_category":"effect_outcome_unknown"'));assert(error.message.includes('"has_error":true'));assert(!error.message.includes('last_error_code'));return true})
 assert.deepEqual(t.ticks,[]);assert.equal(t.reads.length,2);assert(t.reads.every(v=>v.method==='GET'))
})
for(const target of ['awaiting_approval','awaiting_input','succeeded'])test('actual progress returns only the exact '+target+' target without another tick',async()=>{
 const t=terminal({statuses:[target]});assert.equal((await t.tick(run,target)).status,target);assert.equal(t.reads.length,1);assert.deepEqual(t.ticks,[])
})
test('actual queued/running progress keeps exact six-tick bound and is never success',async()=>{
 const t=terminal({statuses:['queued','running']});await assert.rejects(t.tick(run,'succeeded'),/release_completion_actual_status_bound/);assert.equal(t.ticks.length,6);assert.equal(t.reads.length,6)
})
test('actual previous tick status is preserved as bounded failure evidence',async()=>{
 const t=terminal({statuses:['queued','paused'],tickStatus:'paused'});await assert.rejects(t.tick(run,'awaiting_input'),error=>error.message.includes('"previous_worker_status":"paused"'));assert.equal(t.ticks.length,1);assert.equal(t.reads.length,3)
})
for(const rowPatch of [{owner_user_id:'foreign-owner'},{id:'foreign-run'},{agent_spec_id:'foreign-spec'},{kind:'workflow'},{workflow_id:spec}])test('actual diagnostic refuses mismatched owner/source binding '+Object.keys(rowPatch)[0],async()=>{
 const t=terminal({rowPatch});await assert.rejects(t.tick(run,'succeeded'),error=>error.message.includes('"owner_run_status":"unconfirmed"')&&error.message.includes('"error_category":"none"')&&error.message.includes('"has_error":false'));assert.deepEqual(t.ticks,[])
})
for(const options of [{detailStatus:403},{readThrows:true}])test('actual blocked progress remains failed when diagnostic is unavailable '+JSON.stringify(Object.keys(options)),async()=>{
 const t=terminal(options);await assert.rejects(t.tick(run,'succeeded'),error=>error.message.includes('original explicit decision/reply must precede Worker progress')&&error.message.includes('"error_category":"none"')&&error.message.includes('"has_error":false'));assert.deepEqual(t.ticks,[])
})
test('unknown status is bounded and cannot be treated as success or progress',async()=>{
 const t=terminal({statuses:['private arbitrary status']});await assert.rejects(t.tick(run,'succeeded'),error=>error.message.includes('"observed_status":"unconfirmed"')&&!error.message.includes('private arbitrary status'));assert.deepEqual(t.ticks,[])
})
for(const [code,category]of [['workflow_v2_effect_outcome_unknown','effect_outcome_unknown'],['workflow_v2_retry_exhausted','retry_exhausted'],['workflow_agent_execution_disabled','agent_execution_disabled'],['workflow_agent_context_too_large','agent_context_too_large'],['workflow_agent_decision_invalid','agent_decision_invalid']])test('source-declared error code maps only to closed public category '+category,async()=>{
 const t=terminal({code});await assert.rejects(t.tick(run,'succeeded'),error=>error.message.includes('"error_category":"'+category+'"')&&error.message.includes('"has_error":true')&&!error.message.includes(code));assert.deepEqual(t.ticks,[]);assert.equal(t.reads.length,2)
})
for(const code of ['syntheticprivatelowercasevalue','private text\nsynthetic-credential','x'.repeat(100000),'__proto__','constructor'])test('unknown error becomes other plus has_error without raw text '+code.slice(0,30),async()=>{
 const t=terminal({code});await assert.rejects(t.tick(run,'succeeded'),error=>{assert(error.message.includes('"error_category":"other"'));assert(error.message.includes('"has_error":true'));assert(!error.message.includes('last_error_code'));assert(!error.message.includes(code));assert(error.message.length<600);return true});assert.deepEqual(t.ticks,[]);assert.equal(t.reads.length,2)
})
test('error getter is never evaluated, logged, or allowed to replace the original assertion',async()=>{
 let calls=0;const t=terminal({errorDescriptor:{get(){calls++;throw Error('privategettervalue')},enumerable:true,configurable:true}})
 await assert.rejects(t.tick(run,'succeeded'),error=>error.message.startsWith('original explicit decision/reply must precede Worker progress ')&&error.message.includes('"error_category":"other"')&&error.message.includes('"has_error":true')&&!error.message.includes('privategettervalue'));assert.equal(calls,0);assert.deepEqual(t.ticks,[]);assert.equal(t.reads.length,2)
})
test('non-string error DATA is opaque without coercion or getter invocation',async()=>{
 let calls=0;const code={toString(){calls++;throw Error('privatenonstringvalue')}};const t=terminal({code})
 await assert.rejects(t.tick(run,'succeeded'),error=>error.message.includes('"error_category":"other"')&&error.message.includes('"has_error":true')&&!error.message.includes('privatenonstringvalue'));assert.equal(calls,0);assert.deepEqual(t.ticks,[])
})
test('empty error DATA emits none plus has_error false',async()=>{
 const t=terminal({code:''});await assert.rejects(t.tick(run,'succeeded'),error=>error.message.includes('"error_category":"none"')&&error.message.includes('"has_error":false'));assert.deepEqual(t.ticks,[])
})
test('fixture source hash binds exact tested closure without any business runtime',()=>{assert.match(createHash('sha256').update(source).digest('hex'),/^[a-f0-9]{64}$/);assert(source.slice(first,last).includes('previousTick=await completionDispatch.tick(run)'));assert(!source.slice(first,last).includes("'POST'"))})
