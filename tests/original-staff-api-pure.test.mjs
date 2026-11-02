import test from 'node:test'
import assert from 'node:assert/strict'
import {createOriginalStaffApi,parseOriginalStaffPending,OriginalStaffApiError} from '../src/lib/originalStaffApi.ts'
import {parseOriginalStaffMutation,originalStaffProtocol} from '../shared/original-staff-contract.mjs'
import {parseLocalTransportJson} from '../shared/native-local-device-contract.mjs'
import {originalStaffFingerprint} from '../services/pg-api/src/original-staff-operations.mjs'
const owner='11111111-1111-4111-8111-111111111111',target='22222222-2222-4222-8222-222222222222',created='2026-11-03T00:00:00.123456Z',updated='2026-11-03T00:00:00.123457Z',password='Synthetic Staff Password 123!',profile={id:target,display_name:'Employee',email:'employee@example.com',role:'employee',active:true,share_enabled:false,revision:1,governance_revision:1,created,updated:created},form={display_name:'员工甲😀',email:profile.email,role:'employee',active:true,share_enabled:false},json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8'}}),settle=()=>new Promise(resolve=>setImmediate(resolve))
function fixture(options={}){
 const calls=[],markers=[];let live=true,receipt=null,writes=true,creates=true
 const transport=async(route,init)=>{
  calls.push({route,init});const altered=options.intercept?.(route,init);if(altered!==undefined)return await altered
  const u=new URL(route,'https://staff.invalid'),path=u.pathname.replace('/api/native-auth/original-staff','')
  if(path==='/meta')return json({protocol:originalStaffProtocol,available:true,writes,create:creates})
  if(path.startsWith('/requests/'))return receipt?json(receipt):json({error:'employee_receipt_not_found'},404)
  const action=init.method==='PATCH'?'update':path.endsWith('/reset-password')?'reset':'create',before=action==='create'?null:profile,raw=parseLocalTransportJson(init.body,8192),choice=parseOriginalStaffMutation(action,before?.id??null,raw),permission=action==='update'&&(choice.role!==before.role||choice.active!==before.active||choice.share_enabled!==before.share_enabled),revoke=action==='reset'||action==='update'&&(choice.role!==before.role||choice.active!==before.active||choice.email!==before.email)
  const user=action==='create'?{...profile,...form,id:target,display_name:choice.display_name,email:choice.email,role:choice.role,share_enabled:choice.share_enabled}:action==='reset'?{...profile,revision:2,updated}:{...profile,...form,display_name:choice.display_name,email:choice.email,role:choice.role,active:choice.active,share_enabled:choice.share_enabled,revision:2,governance_revision:1+(permission?1:0),updated}
  receipt={request_id:choice.request_id,action,target_id:target,request_sha256:originalStaffFingerprint(choice),committed:true,user,revoked_sessions:revoke}
  if(options.afterCommit)return await options.afterCommit(receipt,route,init)
  return json(receipt,action==='create'?201:200)
 }
 const api=createOriginalStaffApi({employeeId:owner,isCurrent:()=>live,rootPath:'',transport,timeoutMs:options.timeoutMs??8000,...(options.pending?{pending:options.pending}:{}),onPending:marker=>{markers.push(marker);options.onPending?.(marker)}})
 return{api,calls,markers,transport,setCurrent:value=>{live=value},setWrites:value=>{writes=value;creates=value},receipt:()=>receipt,setReceipt:value=>{receipt=value}}
}
test('actual client update matches the server public fingerprint and complete owner/CAS receipt',async()=>{
 const f=fixture(),value=await f.api.update(profile,form);assert.equal(value.user.display_name,form.display_name);assert.equal(value.user.revision,2);assert.equal(f.calls.length,2);const write=f.calls[1];assert.equal(write.init.method,'PATCH');assert.equal(write.route,'/api/native-auth/original-staff/users/'+target);assert.equal(write.init.headers['X-AgentStudio-Expected-Owner'],owner);assert.equal(write.init.headers['X-AgentStudio-Request'],'1');assert.equal(JSON.parse(write.init.body).expected_updated,created);assert.equal(f.api.pending(),null);assert(f.markers[0]);assert.equal(f.markers.at(-1),null)
 for(const c of f.calls){assert.equal(c.init.credentials,'same-origin');assert.equal(c.init.cache,'no-store');assert.equal(c.init.redirect,'error');assert.equal(c.init.headers.Authorization,undefined);assert.equal(c.init.headers['X-Rh-User-Id'],undefined);assert.equal(c.init.signal.aborted,false)}
})
for(const action of ['create','reset'])test('actual '+action+' retains no password-verification material in its public pending locator',async()=>{
 const f=fixture(),value=action==='create'?await f.api.create({display_name:form.display_name,email:form.email,role:form.role,share_enabled:form.share_enabled,password}):await f.api.resetPassword(profile,password),marker=f.markers[0]
 assert.equal(value.action,action);assert(Object.isFrozen(marker));assert.equal(marker.expected_after_governance_revision,1);assert.equal(marker.expected_revoked_sessions,action==='reset');const text=JSON.stringify(marker);for(const forbidden of [password,form.display_name,form.email,'password','password_record'])assert(!text.includes(forbidden));assert.equal(marker.request_sha256,value.request_sha256)
})
test('permission and email edits preserve their distinct governance and revocation semantics',async()=>{
 for(const patch of [{role:'admin'},{active:false},{share_enabled:true},{email:'changed@example.com'}]){const f=fixture(),value=await f.api.update(profile,{...form,...patch}),marker=f.markers[0];assert.equal(value.user.governance_revision,patch.email?1:2);assert.equal(marker.expected_revoked_sessions,patch.share_enabled?false:true)}
})
test('lost commit ACK resumes from a secret-free locator using only exact GET while writes are disabled',async()=>{
 const f=fixture({afterCommit:()=>{throw Error('terminal disconnect')}});await assert.rejects(f.api.update(profile,form),e=>e.outcomeUnknown);const marker=f.api.pending(),copy=JSON.parse(JSON.stringify(marker)),saved=f.receipt();assert(marker);await assert.rejects(f.api.update(profile,form),e=>e.outcomeUnknown);assert.equal(f.calls.length,2)
 const g=fixture({pending:copy});g.setWrites(false);g.setReceipt(saved);assert.equal((await g.api.confirmPending()).request_id,marker.request_id);assert.equal(g.calls.length,1);const r=g.calls[0],url=new URL(r.route,'https://staff.invalid');assert.equal(r.init.method,'GET');assert.equal(url.searchParams.get('request_sha256'),marker.request_sha256);assert.equal(url.searchParams.get('action'),'update');assert.equal(url.searchParams.get('target_id'),target);assert.equal(g.api.pending(),null)
})
test('missing or mismatched GET receipt preserves the original marker and never sends another write',async()=>{
 const f=fixture({afterCommit:()=>{throw Error('terminal disconnect')}});await assert.rejects(f.api.resetPassword(profile,password));const marker=f.api.pending(),g=fixture({pending:marker}),resumed=g.api.pending();assert.deepEqual(resumed,marker);await assert.rejects(g.api.confirmPending(),e=>e.status===404);assert.equal(g.api.pending(),resumed);g.setReceipt({...f.receipt(),request_sha256:'a'.repeat(64)});await assert.rejects(g.api.confirmPending(),e=>e.outcomeUnknown);assert.deepEqual(g.calls.map(c=>c.init.method),['GET','GET']);assert.equal(g.api.pending(),resumed)
})
test('an old employee marker cannot enter a replacement employee context',()=>{
 const marker={format:'agentstudio.original-staff.pending.v1',employee_id:owner,request_id:crypto.randomUUID(),action:'create',target_id:null,request_sha256:'a'.repeat(64),expected_after_revision:1,expected_after_governance_revision:1,expected_revoked_sessions:false,before_updated:null,created_at:Date.now()};assert.throws(()=>parseOriginalStaffPending(marker,target));assert.throws(()=>parseOriginalStaffPending({...marker,password},owner))
})
test('current epoch is checked again after metadata and before dispatching private input',async()=>{
 let f;f=fixture({intercept:(route)=>{if(route.endsWith('/meta')){f.setCurrent(false);return json({protocol:originalStaffProtocol,available:true,writes:true,create:true})}}});await assert.rejects(f.api.resetPassword(profile,password),e=>e.code==='employee_session_changed');assert.equal(f.calls.length,1);assert.equal(f.api.pending(),null)
})
test('late committed receipt for an invalidated epoch cannot confirm or clear its old locator',async()=>{
 let resolve;const waiting=new Promise(done=>{resolve=done}),f=fixture({afterCommit:()=>waiting}),pending=f.api.update(profile,form);await settle();await settle();assert(f.receipt());f.setCurrent(false);resolve(json(f.receipt()));await assert.rejects(pending,e=>e.outcomeUnknown);assert(f.api.pending());assert.equal(f.calls.filter(c=>c.init.method==='PATCH').length,1)
})
test('failed locator persistence prevents a credential-bearing request from being sent',async()=>{
 const f=fixture({onPending:marker=>{if(marker)throw Error('terminal storage quota')}});await assert.rejects(f.api.resetPassword(profile,password),e=>e.code==='original_staff_pending_storage_unavailable');assert.deepEqual(f.calls.map(c=>c.init.method),['GET']);assert.equal(f.api.pending(),null)
})
test('known server refusal clears the locator but does not retry without an explicit new action',async()=>{
 const f=fixture({intercept:(_r,i)=>i.method==='PATCH'?json({error:'employee_revision_changed'},409):undefined});await assert.rejects(f.api.update(profile,form),e=>e.status===409&&!e.outcomeUnknown);assert.equal(f.api.pending(),null);assert.equal(f.calls.length,2)
})
test('complete UTF8 EOF is released without aborting the fetch or cancelling the already-complete body',async()=>{
 let cancelled=0,signal;const f=fixture({afterCommit:value=>{const bytes=new TextEncoder().encode(JSON.stringify(value));let at=0;return new Response(new ReadableStream({pull(controller){if(at===bytes.length)controller.close();else controller.enqueue(bytes.slice(at,++at))},cancel(){cancelled++}},{highWaterMark:0}),{status:200,headers:{'content-type':'application/json'}})}});await f.api.update(profile,form);signal=f.calls.at(-1).init.signal;assert.equal(signal.aborted,false);assert.equal(cancelled,0)
})
for(const mutation of ['duplicate','truncated','overlong'])test('strict '+mutation+' ACK remains unknown and cannot unlock another write',async()=>{
 const f=fixture({afterCommit:value=>mutation==='duplicate'?new Response(JSON.stringify(value).replace('{','{"committed":false,'),{headers:{'content-type':'application/json'}}):mutation==='truncated'?new Response('{',{headers:{'content-type':'application/json'}}):new Response(JSON.stringify(value),{headers:{'content-type':'application/json','content-length':'262145'}})});await assert.rejects(f.api.update(profile,form),e=>e.outcomeUnknown);assert(f.api.pending());await assert.rejects(f.api.update(profile,form),e=>e.outcomeUnknown);assert.equal(f.calls.length,2)
})
test('body timeout cancels an incomplete write response while retaining the exact original marker',async()=>{
 let cancelled=false;const f=fixture({timeoutMs:20,afterCommit:()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'))},cancel(){cancelled=true}}),{headers:{'content-type':'application/json'}})});await assert.rejects(f.api.resetPassword(profile,password),e=>e.outcomeUnknown);await settle();assert(cancelled);assert(f.api.pending())
})
test('preaborted or superseded contexts do not send any private request',async()=>{
 const a=fixture(),cancel=new AbortController();cancel.abort();await assert.rejects(a.api.resetPassword(profile,password,cancel.signal),e=>!e.outcomeUnknown);assert.equal(a.calls.length,0);const b=fixture();b.setCurrent(false);await assert.rejects(b.api.resetPassword(profile,password),e=>e.code==='employee_session_changed');assert.equal(b.calls.length,0)
})
test('late uncooperative transport completion is cancelled unread and cannot send a second POST',async()=>{
 let resolve,cancelled=false,pulls=0;const wait=new Promise(done=>{resolve=done}),f=fixture({timeoutMs:20,afterCommit:()=>wait}),pending=f.api.resetPassword(profile,password);await assert.rejects(pending,e=>e.outcomeUnknown);resolve(new Response(new ReadableStream({pull(){pulls++},cancel(){cancelled=true}},{highWaterMark:0}),{headers:{'content-type':'application/json'}}));await settle();assert(cancelled);assert.equal(pulls,0);assert.equal(f.calls.length,2);assert(f.api.pending())
})
test('unsafe roots, invalid ids and unbounded deadlines are refused before any transport',()=>{
 for(const change of [{employeeId:'foreign-identity'},{rootPath:'https://outside.invalid'},{timeoutMs:8001},{timeoutMs:0},{isCurrent:null}])assert.throws(()=>createOriginalStaffApi({employeeId:owner,isCurrent:()=>true,...change}))
})
test('actual self projection must match the verified employee, without changing a replacement identity',async()=>{
 const own=fixture({intercept:route=>route.endsWith('/me')?json({user:{...profile,id:owner}}):undefined});assert.equal((await own.api.me()).id,owner)
 const other=fixture({intercept:route=>route.endsWith('/me')?json({user:profile}):undefined});await assert.rejects(other.api.me(),e=>e.code==='invalid_original_staff_identity');assert.equal(other.calls.length,1)
})
test('list consumes complete paging/cardinality and exact requested role/state filters',async()=>{
 const result={items:[profile],page:2,perPage:20,totalItems:21,totalPages:2,summary:{total:40,active:30,admins:3,sharing:20}},f=fixture({intercept:route=>route.includes('/users?')?json(result):undefined});assert.equal((await f.api.list({page:2,perPage:20,q:'%_',role:'employee',active:'true'})).items.length,1);assert.equal(new URL(f.calls[0].route,'https://staff.invalid').searchParams.get('q'),'%_')
 for(const change of [{page:1,items:Array(20).fill(profile)},{items:[{...profile,role:'admin'}]},{items:[{...profile,active:false}]}]){const g=fixture({intercept:route=>route.includes('/users?')?json({...result,...change}):undefined});await assert.rejects(g.api.list({page:2,role:'employee',active:'true'}))}
})
test('absent or disabled metadata never sends a mutation',async()=>{
 for(const cap of [{available:true,writes:true,create:true},{protocol:originalStaffProtocol,available:true,writes:false,create:false}]){const f=fixture({intercept:route=>route.endsWith('/meta')?json(cap):undefined});await assert.rejects(f.api.resetPassword(profile,password));assert.equal(f.calls.length,1);assert.equal(f.api.pending(),null)}
})
test('a pending actual metadata read excludes a concurrent second submit before any password dispatch',async()=>{
 let resolve;const wait=new Promise(done=>{resolve=done}),f=fixture({intercept:route=>route.endsWith('/meta')?wait:undefined}),first=f.api.resetPassword(profile,password);await assert.rejects(f.api.resetPassword(profile,password),e=>e.code==='original_staff_request_busy');assert.equal(f.calls.length,1);resolve(json({protocol:originalStaffProtocol,available:true,writes:true,create:true}));await first;assert.equal(f.calls.length,2)
})
