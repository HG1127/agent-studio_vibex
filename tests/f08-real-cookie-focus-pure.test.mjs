// Offline original-page controller + real PG client/session contracts. Terminal
// transport, identity observations and clipboard are synthetic ports only.
// No SQL, server, Worker, browser, hosted permit or full compiler is used.
import {focusOriginalInternalShareEmployee} from './helpers/pg-original-internal-share-focus.mjs'
import {EventEmitter} from 'node:events'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import {createOriginalInternalTemplatesController} from '../src/lib/originalInternalTemplates.ts'
import {createPgNativeInternalShareApi,PgNativeInternalShareError} from '../src/lib/pgNativeInternalShare.ts'
import {internalShareDigest,internalShareReviewValue,internalShareIntentValue} from '../shared/agent-internal-share-contract.ts'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),alice=id(7),bob=id(8),sharedCode='aB3'.repeat(16)
const tick=()=>new Promise(resolve=>setImmediate(resolve)),flush=async()=>{for(let i=0;i<12;i++)await tick()}
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}
async function preview(spec=id(1)){
 const snapshot={protocol:'agent_template_market_snapshot_v1',spec:{goal:'共享目标',task_scope:'公开材料',deliverables:['报告'],task_plan:['核对'],done_criteria:['有来源'],tools:['calculate'],knowledge_base_ids:[],quality_checks:[],require_approval:true,require_plan_review:true}}
 const value={protocol:'agent_internal_share_preview_v1',purpose:'internal_agent_template_share',source:{spec_id:spec,revision:4,source_sha256:'a'.repeat(64)},name:'待检查方案',snapshot,snapshot_sha256:await internalShareDigest(snapshot),owner_epoch:3,preview_hash:'a'.repeat(64),removed:{model_binding:true,http_tools:1,mcp_tools:2,knowledge_bases:3,knowledge_retrieval:true,quality_checks:1,unknown_tools:0,unknown_fields:0},review_required:true,one_time:true,expires_in_seconds:604800,authority:false}
 value.preview_hash=await internalShareDigest(internalShareReviewValue(value));return value
}
async function reply(intent,replayed=false){
 const common={protocol:'agent_internal_share_receipt_v1',action:intent.action,request_id:intent.request_id,request_sha256:await internalShareDigest(internalShareIntentValue(intent)),id:id(5)}
 const receipt=intent.action==='create'?{...common,name:'待检查方案',spec_id:intent.source.spec_id,created_ms:1000,expires_ms:604801000,one_time:true}:intent.action==='redeem'?{...common,spec_id:id(6),spec_revision:1,name:'共享副本',used_ms:2000,resource_selection_required:true,starts_run:false}:{...common,id:intent.id,revoked:true,revoked_ms:3000}
 return{protocol:'agent_internal_share_reply_v1',receipt,share_code:intent.action==='create'&&!replayed?sharedCode:null,replayed}
}
function model(options={}){
 let employee=alice,identityUnavailable=false,listError=null,recordMode='ok',recordGate=null,listGate=null,previewGate=null,caps={internal_share_available:true,internal_share_writes_enabled:true,config_writes_enabled:true},lastIntent
 const calls=[],views=[],copies=[],invites=[{id:id(5),name:'已有共享',spec_id:id(1),created_ms:1000,expires_ms:604801000,used_ms:0,revoked:false,status:'active'}]
 const data=who=>({protocol:'agent_internal_share_list_v1',ok:true,scope:'current_user',specs:[{id:who===alice?id(1):id(2),name:who===alice?'Alice方案':'Bob方案'}],invites:who===alice?invites:[]})
 const transport=async(url,init)=>{
  assert.equal(typeof url,'string');assert(url.startsWith('/__pg_native/api/v2/internal-templates'))
  assert.equal(init.credentials,'same-origin');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store')
  assert.equal(new Headers(init.headers).has('authorization'),false);assert.equal(new Headers(init.headers).has('x-rh-user-id'),false)
  const body=init.body===undefined?undefined:JSON.parse(init.body),call={url,method:init.method,body,employee};calls.push(call)
  if(init.method==='POST')assert.equal(new Headers(init.headers).get('x-agentstudio-request'),'1')
  const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}})
  if(init.method==='GET'){
   const snapshot=data(employee),gate=listGate;listGate=null
   if(gate)await gate.promise
   if(listError)return response({error:listError.code},listError.status)
   return response(snapshot)
  }
  if(url.endsWith('/confirm')){assert.deepEqual(body.intent,lastIntent);return response(await reply(body.intent,true))}
  if(body.action==='preview'){
   const value=await preview(body.id),gate=previewGate;previewGate=null;if(gate)await gate.promise
   if(options.badPreview)value.snapshot.spec.goal='tampered'
   return response(value)
  }
  lastIntent=body;const value=await reply(body),gate=recordGate;recordGate=null;if(gate)await gate.promise
  if(recordMode==='lost')throw TypeError('synthetic response disconnect')
   if(recordMode==='prefix'){
    const actual=new TextEncoder().encode(JSON.stringify(value));let sent=false
    const stream=new ReadableStream({pull(controller){if(!sent){sent=true;controller.enqueue(actual.subarray(0,1))}else controller.error(TypeError('synthetic incomplete response body'))}})
    return new Response(stream,{status:200,headers:{'content-type':'application/json','content-length':String(actual.length)}})
   }
  if(recordMode==='denied')return response({error:'agent_internal_share_review_required'},409)
  if(recordMode==='expired')return response({error:'session_required'},401)
  return response(value)
 }
 const api=createPgNativeInternalShareApi({transport}),verifyEmployee=async()=>{if(identityUnavailable)throw new PgNativeInternalShareError(503,'identity_unavailable');return employee}
 const ports={api,currentEmployee:()=>employee,verifyEmployee,capabilities:async()=>({...caps}),copyText:async value=>{copies.push(value)},now:()=>2000,onChange:value=>views.push(value)}
 const controller=createOriginalInternalTemplatesController(ports)
 return{controller,api,ports,calls,views,copies,get:()=>controller.getView(),employee:value=>{employee=value},unavailable:value=>{identityUnavailable=value},
  caps:value=>{caps=value},listError:value=>{listError=value},recordMode:value=>{recordMode=value},recordGate:value=>{recordGate=value},listGate:value=>{listGate=value},previewGate:value=>{previewGate=value},lastIntent:()=>lastIntent,
  async start(){await controller.start();await flush()},async reviewed(){await controller.handlePreview();controller.setReviewed(true)},dispose:()=>controller.dispose()}
}


// Terminal model fixtures above exercise real adapters/controllers. They are
// unit DTO DATA, not SQL receipts or a claim of browser/Native acceptance.
const hook=fs.readFileSync(new URL('../src/pages/InternalTemplates/useInternalTemplates.ts',import.meta.url),'utf8'),focusLine=hook.split('\n').find(v=>v.includes('const check=()=>'))
const focusCallback=focusLine.slice(focusLine.indexOf('const check=')+'const check='.length,focusLine.indexOf(',visible='))
function pagePort(){
 const events=new EventEmitter();let fronts=0,evaluations=0,predicate,resolve,reject
 return{events,get fronts(){return fronts},get evaluations(){return evaluations},
  waitForResponse(match,options){assert.equal(options.timeout,8000);predicate=match;return new Promise((yes,no)=>{resolve=yes;reject=no})},
  async response(employee,extra={}){const response={url:()=> 'https://localhost:17443/__pg_native/api/native-auth/me',request:()=>({method:()=> 'GET'}),status:()=>200,json:async()=>({authenticated:true,user:{id:employee}}),...extra};if(await predicate?.(response))resolve(response)},
  async bringToFront(){fronts++},async evaluate(callback){evaluations++;return callback()},
 }
}
for(const method of ['GET','POST'])test('actual focus callback replaces busy '+method+' scope before held old bytes settle, without new writes',async()=>{
 const m=model(),page=pagePort(),oldWindow=globalThis.window,windowPort=new EventTarget();globalThis.window=windowPort
 let current=alice,actual=alice,verifyCalls=0,announce=false
 m.ports.currentEmployee=()=>current
 m.ports.verifyEmployee=async()=>{verifyCalls++;current=actual;return current}
 const verifyStudioSession=async()=>{await m.ports.verifyEmployee();if(announce)await page.response(current);return 'authenticated'}
 const check=Function('verifyStudioSession','owned','controller','return '+focusCallback)(verifyStudioSession,{current:m.controller},m.controller)
 windowPort.addEventListener('focus',check)
 let held
 try{
  await m.start();assert.equal(m.get().ownSpecs[0].id,id(1))
  const gate=deferred()
  if(method==='GET'){m.listGate(gate);held=m.controller.handleRefresh()}else{await m.reviewed();m.recordGate(gate);held=m.controller.handleCreate()}
  await flush();assert.equal(m.get().busy,true)
  actual=bob;m.employee(bob);await page.bringToFront();await flush()
  // An activation call without a DOM focus event never invokes the hook.
  assert.equal(current,alice);assert.equal(m.get().ownSpecs[0].id,id(1))
  announce=true;const before=verifyCalls;const proof=await focusOriginalInternalShareEmployee(page,{origin:'https://localhost:17443',employee:bob});await flush()
  assert.equal(proof.actual_Native_employee_response_observed,true);assert(verifyCalls>before);assert.equal(current,bob);assert.equal(m.get().ownSpecs[0].id,id(2));assert.equal(m.get().created,null);assert.equal(m.get().preview,null)
  const posts=m.calls.filter(c=>c.method==='POST'&&c.body?.action!=='preview').length
  assert.equal(posts,method==='POST'?1:0)
  gate.resolve();await held;await flush();assert.equal(m.get().ownSpecs[0].id,id(2));assert.equal(m.get().created,null);assert.equal(m.get().code,'');assert.equal(m.calls.filter(c=>c.method==='POST'&&c.body?.action!=='preview').length,posts)
 }finally{windowPort.removeEventListener('focus',check);globalThis.window=oldWindow;m.dispose()}
})
test('focus observation rejects wrong owner, wrong method and unrelated origin instead of promoting a caller permit',async()=>{
 const page=pagePort(),oldWindow=globalThis.window;globalThis.window=new EventTarget()
 try{
  let settled=false;const pending=focusOriginalInternalShareEmployee(page,{origin:'https://localhost:17443',employee:bob}).then(value=>{settled=true;return value})
  await flush();await page.response(alice);await page.response(bob,{request:()=>({method:()=> 'POST'})});await page.response(bob,{url:()=> 'https://other.invalid/__pg_native/api/native-auth/me'});await flush();assert.equal(settled,false)
  await page.response(bob);assert.equal((await pending).actual_original_focus_dispatched,true);assert.equal(page.evaluations,1)
 }finally{globalThis.window=oldWindow}
})
test('the actual Native identity body is consumed once when the response arrives',async()=>{
 const page=pagePort(),oldWindow=globalThis.window;globalThis.window=new EventTarget();let reads=0
 try{
  const pending=focusOriginalInternalShareEmployee(page,{origin:'https://localhost:17443',employee:bob});void pending.catch(()=>{});await flush()
  await page.response(bob,{json:async()=>{assert.equal(++reads,1,'the actual response body must not be requested again after focus completes');return{authenticated:true,user:{id:bob}}}})
  assert.equal((await pending).actual_Native_employee_response_observed,true);assert.equal(reads,1)
 }finally{globalThis.window=oldWindow}
})
test('03b genuine story retains actual5/7 ledgers, Native8s and held GET+POST while waiting for verified focus before replacement options',()=>{
 const story=fs.readFileSync(new URL('./pg-original-internal-share-genuine.spec.mjs',import.meta.url),'utf8')
 assert(story.includes('expect(ledger.receipts-before.receipts).toBe(5)'));assert(story.includes('expect(after.receipts-before.receipts).toBe(7)'));assert(story.includes("for(const method of ['GET','POST'])"))
 const focus=story.indexOf('await focusOriginalInternalShareEmployee(page,'),oldAbsent=story.indexOf("f.sourceSpecId('alice')+'\"]')).toHaveCount(0)",focus),replacement=story.indexOf("f.sourceSpecId('bob')+'\"]')).toHaveCount(1)",focus),release=story.indexOf('gate.release();',focus)
 assert(focus>0&&oldAbsent>focus&&replacement>oldAbsent&&release>replacement)
 assert(story.includes('held_actual_responses).toBe(2)'));assert(story.includes('controlled_after_record_disconnects).toBe(1)'));assert(story.includes('for(const gate of holds)gate.release()'))
})
