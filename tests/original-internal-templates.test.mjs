// Offline original-page controller + real PG client/session contracts. Terminal
// transport, identity observations and clipboard are synthetic ports only.
// No SQL, server, Worker, browser, hosted permit or full compiler is used.
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

test('original page gets actual closed list/preview DTOs through fixed Cookie client, without PB owner headers',async()=>{
 const m=model();await m.start();assert.equal(m.get().listReady,true);assert.equal(m.get().selectedId,id(1));assert.equal(m.get().invites.length,1)
 await m.reviewed();const value=m.get();assert.equal(value.preview.preview_spec.goal,'共享目标');assert.equal(value.preview.preview_spec.require_plan_review,true)
 assert.match(value.preview.warning,/2 个 MCP/);assert.equal(value.reviewed,true);assert.equal(m.calls.filter(c=>c.body?.action==='preview').length,1);m.dispose()
})
test('create requires original preview and checkbox, binds exact revision/hash and releases only genuine first reply code',async()=>{
 const m=model();await m.start();await m.controller.handleCreate();assert.equal(m.calls.some(c=>c.body?.action==='create'),false)
 await m.reviewed();await m.controller.handleCreate();const intent=m.lastIntent();assert.equal(intent.source.revision,4);assert.equal(intent.confirm_safe,true)
 assert.equal(intent.acknowledgement,'SHARE_REVIEWED_AGENT_TEMPLATE_ONCE');assert.match(intent.request_id,/^[0-9a-f-]{36}$/)
 assert.equal(m.get().created.share_code,sharedCode);assert.equal(m.get().created.expires_ms,604801000);assert.equal(m.get().preview,null)
 await m.controller.handleCopy();assert.deepEqual(m.copies,[sharedCode]);m.controller.setCreated(null);assert.equal(m.get().created,null);m.dispose()
})
test('actual snapshot hash tampering never becomes an original-page preview or a write',async()=>{
 const m=model({badPreview:true});await m.start();await m.controller.handlePreview();assert.equal(m.get().preview,null);assert(m.get().error)
 m.controller.setReviewed(true);await m.controller.handleCreate();assert.equal(m.calls.some(c=>c.body?.action==='create'),false);m.dispose()
})
test('redeem and revoke map original actions to actual intents and receipts without starting a run',async()=>{
 const m=model();await m.start();m.controller.setCode(sharedCode);await m.controller.handleRedeem();assert.equal(m.get().redeemed.spec_id,id(6));assert.match(m.get().redeemed.message,/自己的模型/)
 assert.equal(m.lastIntent().confirm,true);await m.controller.handleRevoke(id(5));assert.equal(m.lastIntent().action,'revoke');assert.equal(m.lastIntent().id,id(5));assert.match(m.get().notice,/撤销/)
 const before=m.calls.length;await m.controller.handleRevoke(id(90));assert.equal(m.calls.length,before);assert.match(m.get().error,/不可撤销/);m.dispose()
})
test('lost create ACK blocks every new intent; original refresh confirms exact original choice and cannot redisplay code',async()=>{
 const m=model();await m.start();await m.reviewed();m.recordMode('lost');await m.controller.handleCreate();const original=m.lastIntent(),writes=m.calls.filter(c=>c.body&&c.body.action!=='preview').length
 assert.equal(m.get().created,null);assert.equal(m.get().writeDisabled,true);assert.match(m.get().error,/刷新查询原操作/)
 await m.controller.handleCreate();await m.controller.handleRedeem();await m.controller.handleRevoke(id(5));assert.equal(m.calls.filter(c=>c.body&&c.body.action!=='preview').length,writes)
 m.recordMode('ok');await m.controller.handleRefresh();const confirmation=m.calls.find(c=>c.url.endsWith('/confirm'))
 assert.deepEqual(confirmation.body.intent,original);assert.equal(m.get().created,null);assert.match(m.get().notice,/无法再次显示/);assert.equal(m.get().writeDisabled,false);m.dispose()
})
test('permission/read failure is explicit and cannot be presented as a successful empty list',async()=>{
 const m=model();m.listError({status:503,code:'agent_internal_share_unavailable'});await m.start();assert.equal(m.get().listReady,false);assert.match(m.get().error,/列表读取失败/);assert.equal(m.get().writeDisabled,true)
 m.listError(null);await m.controller.handleRefresh();assert.equal(m.get().listReady,true);assert.equal(m.get().ownSpecs.length,1);m.dispose()
})
test('temporary unknown identity hides private view but retains the exact unknown intent for same-owner confirmation',async()=>{
 const m=model();await m.start();await m.reviewed();m.recordMode('lost');await m.controller.handleCreate();const original=m.lastIntent()
 m.employee(null);m.unavailable(true);m.controller.reconcile();assert.equal(m.get().ownSpecs.length,0);assert.equal(m.get().preview,null);assert.equal(m.get().writeDisabled,true)
 const suspendedViews=m.views.length;for(let i=0;i<5;i++)m.controller.reconcile();assert.equal(m.views.length,suspendedViews,'layout reconciliation must settle without an update loop')
 await m.controller.handleRefresh();assert.equal(m.calls.some(c=>c.url.endsWith('/confirm')),false);assert.match(m.get().error,/原操作结果仍未确认/)
 m.employee(alice);m.unavailable(false);m.recordMode('ok');await m.controller.handleRefresh()
 assert.deepEqual(m.calls.find(c=>c.url.endsWith('/confirm')).body.intent,original);assert.equal(m.calls.filter(c=>c.body?.action==='create').length,1);assert.equal(m.get().created,null);m.dispose()
})
test('temporary missing service capability cannot discard an unknown write and allow a new request',async()=>{
 const m=model();await m.start();await m.reviewed();m.recordMode('lost');await m.controller.handleCreate();const original=m.lastIntent()
 m.caps({internal_share_available:false});await m.start();assert.equal(m.get().writeDisabled,true);assert.match(m.get().error,/原操作结果仍未确认/)
 await m.controller.handleCreate();assert.equal(m.calls.filter(c=>c.body?.action==='create').length,1)
 m.caps({internal_share_available:true,internal_share_writes_enabled:true,config_writes_enabled:true});m.recordMode('ok');await m.start()
 assert.deepEqual(m.calls.find(c=>c.url.endsWith('/confirm')).body.intent,original);assert.equal(m.get().created,null);m.dispose()
})
test('missing service capability and read-only capability never enable mutation or pretend list success',async()=>{
 const absent=model();absent.caps({internal_share_available:false});await absent.start();assert.equal(absent.calls.length,0);assert.equal(absent.get().listReady,false);assert.match(absent.get().error,/尚未通过/);absent.dispose()
 const readOnly=model();readOnly.caps({internal_share_available:true,internal_share_writes_enabled:false,config_writes_enabled:false});await readOnly.start();assert.equal(readOnly.get().listReady,true);assert.equal(readOnly.get().writeDisabled,true)
 await readOnly.controller.handlePreview();await readOnly.controller.handleCreate();assert.equal(readOnly.calls.some(c=>c.method==='POST'),false);assert(readOnly.get().error);readOnly.dispose()
})
test('refresh rechecks changed capabilities rather than retaining a disabled write state forever',async()=>{
 const m=model();m.caps({internal_share_available:true,internal_share_writes_enabled:false,config_writes_enabled:false});await m.start();assert.equal(m.get().writeDisabled,true)
 m.caps({internal_share_available:true,internal_share_writes_enabled:true,config_writes_enabled:true});await m.controller.handleRefresh();assert.equal(m.get().writeDisabled,false);m.dispose()
})
test('known account change clears private draft/code synchronously and requires fresh Bob reads',async()=>{
 const m=model();await m.start();await m.reviewed();await m.controller.handleCreate();m.employee(bob);m.controller.reconcile()
 assert.equal(m.get().created,null);assert.equal(m.get().preview,null);assert.equal(m.get().ownSpecs.length,0);assert.equal(m.get().listReady,false)
 await m.start();assert.deepEqual(m.get().ownSpecs.map(s=>s.id),[id(2)]);assert.equal(m.get().created,null);assert.equal(m.get().code,'');m.dispose()
})
test('late Alice list or preview cannot populate a Bob account even when transport ignores abort',async()=>{
 for(const kind of ['list','preview']){
  const m=model(),gate=deferred();if(kind==='list'){m.listGate(gate);await m.controller.start();await tick()}else{await m.start();m.previewGate(gate);void m.controller.handlePreview();await tick()}
  m.employee(bob);m.controller.reconcile();await m.start();gate.resolve();await flush()
  assert.deepEqual(m.get().ownSpecs.map(s=>s.id),[id(2)]);assert.equal(m.get().preview,null);assert.equal(m.get().created,null);m.dispose()
 }
})
test('late write reply and unknown write are isolated from replacement account with no automatic record/confirm',async()=>{
 for(const lost of [false,true]){
  const m=model();await m.start();await m.reviewed();const gate=deferred();m.recordGate(gate);if(lost)m.recordMode('lost')
  const pending=m.controller.handleCreate();await tick();m.employee(bob);m.controller.reconcile();await m.start();gate.resolve();await pending;await flush()
  assert.equal(m.get().created,null);assert.equal(m.get().redeemed,null);assert.equal(m.get().preview,null);assert.equal(m.get().ownSpecs[0].id,id(2))
  assert.equal(m.calls.filter(c=>c.body?.action==='create').length,1);assert.equal(m.calls.some(c=>c.url.endsWith('/confirm')),false);m.dispose()
 }
})
test('a current identity mismatch before dispatch sends no write under replacement Cookie scope',async()=>{
 const m=model();await m.start();await m.reviewed();m.employee(bob);await m.controller.handleCreate()
 assert.equal(m.calls.some(c=>c.body?.action==='create'),false);assert.equal(m.get().preview,null);assert.match(m.get().error,/账号已变化/);m.dispose()
})
test('definite review refusal requires fresh review, and401 clears all private state without fake receipt',async()=>{
 const m=model();await m.start();await m.reviewed();m.recordMode('denied');await m.controller.handleCreate();assert.equal(m.get().preview,null);assert.equal(m.get().created,null);assert(m.get().error)
 m.recordMode('expired');await m.reviewed();await m.controller.handleCreate();assert.equal(m.get().loginRequired,true);assert.equal(m.get().created,null);assert.equal(m.get().ownSpecs.length,0);m.dispose()
})
test('unknown or fabricated setter values never install an arbitrary preview, code or receipt',async()=>{
 const m=model();await m.start();const before=m.calls.length;m.controller.setPreview({fake:true});m.controller.setCreated({share_code:sharedCode});m.controller.setRedeemed({spec_id:id(9)});m.controller.setSelectedId(id(9))
 assert.equal(m.get().preview,null);assert.equal(m.get().created,null);assert.equal(m.get().redeemed,null);assert.equal(m.calls.length,before);assert(m.get().error);m.dispose()
})
test('disposing during an in-flight request prevents every later view update and scoped action',async()=>{
 const m=model(),gate=deferred();m.listGate(gate);await m.controller.start();await tick();m.dispose();const count=m.views.length;gate.resolve();await flush();await m.controller.handleCreate();assert.equal(m.views.length,count)
})
test('verification outage while copying clears once-visible code without logging out or copying stale data',async()=>{
 const m=model();await m.start();await m.reviewed();await m.controller.handleCreate();m.unavailable(true);await m.controller.handleCopy()
 assert.equal(m.get().created,null);assert.equal(m.get().listReady,false);assert.equal(m.copies.length,0);assert.match(m.get().error,/暂时无法验证/);m.dispose()
})

test('actual PG hook recreates its controller across StrictMode setup/cleanup and routes original handlers to live scope',async()=>{
 const source=fs.readFileSync(new URL('../src/pages/InternalTemplates/useInternalTemplates.ts',import.meta.url),'utf8')
 const begin=source.indexOf('function usePgInternalTemplates()'),end=source.indexOf('// Build-time selection',begin)
 assert(begin>=0&&end>begin)
 const actual=stripTypeScriptTypes(source.slice(begin,end)),m=model(),states=[],refs=[],effects=[],layouts=[]
 let stateIndex=0,refIndex=0,result
 const window=new EventTarget(),document=new EventTarget();document.visibilityState='visible'
 const hooks={useState(initial){const i=stateIndex++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],value=>{states[i]=value}]},useRef(initial){const i=refIndex++;if(!(i in refs))refs[i]={current:initial};return refs[i]},useLayoutEffect(work){layouts.push(work)},useEffect(work){if(!effects.length)effects.push(work)}}
 const load=Function(...Object.keys(hooks),'createPgNativePilotApi','createPgNativeInternalShareApi','createOriginalInternalTemplatesController','emptyOriginalInternalTemplatesView','verifyStudioSession','getStudioAccountInfo','PgNativeInternalShareError','navigator','window','document',actual+';return usePgInternalTemplates')
 const {emptyOriginalInternalTemplatesView}=await import('../src/lib/originalInternalTemplates.ts')
 const render=load(...Object.values(hooks),()=>({getConfigCapabilities:m.ports.capabilities}),()=>m.api,createOriginalInternalTemplatesController,emptyOriginalInternalTemplatesView,async()=>{await m.ports.verifyEmployee();return 'authenticated'},()=>({id:m.ports.currentEmployee(),active:true}),PgNativeInternalShareError,{clipboard:{writeText:m.ports.copyText}},window,document)
 const update=()=>{stateIndex=0;refIndex=0;layouts.length=0;result=render();for(const work of layouts)work();return result}
 update();const firstCleanup=effects[0]();await flush();firstCleanup();const finalCleanup=effects[0]();await flush();update()
 assert.equal(result.listReady,true);await result.handlePreview();update();result.setReviewed(true);update();await result.handleCreate();update();assert.equal(result.created.share_code,sharedCode)
 m.employee(bob);update();update();assert.equal(result.created,null);window.dispatchEvent(new Event('focus'));await flush();update();assert.equal(result.ownSpecs[0].id,id(2));finalCleanup();m.dispose()
})

test('original route, JSX navigation/actions and explicit error/empty distinction remain; PG and PB hooks stay separate',()=>{
 const page=fs.readFileSync(new URL('../src/pages/InternalTemplates/InternalTemplatesPage.tsx',import.meta.url),'utf8'),hook=fs.readFileSync(new URL('../src/pages/InternalTemplates/useInternalTemplates.ts',import.meta.url),'utf8')
 for(const label of ['创建一次性内部分享码','预览实际分享内容','确认并生成分享码','我的分享记录','领取同事分享的 Agent','领取并复制到我的助手','打开我的 Agent 工作台'])assert(page.includes(label),label)
 assert(page.includes('to="/"'));assert(page.includes('useInternalTemplates()'));assert(page.includes('listReady?"还没有分享过 Agent":"共享记录尚未读取成功'))
 assert(page.includes('disabled={busy || writeDisabled || code.length!==48}'));assert(page.includes('disabled={writeDisabled}'))
 assert(!page.includes('getPocketBaseUrl'));assert(hook.includes("VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED==='true'?usePgInternalTemplates:useLegacyInternalTemplates"))
 const pg=hook.slice(hook.indexOf('function usePgInternalTemplates()'),hook.indexOf('// Build-time selection'))
 assert(!pg.includes('getPocketBaseUrl'));assert(!pg.includes('vibexAuthHeaders'));assert(pg.includes('controller.dispose()'));assert(pg.includes('verifyStudioSession()'))
})
