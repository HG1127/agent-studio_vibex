// Pure request/actor control flow. Identity, SQL transport and actor mapping are
// terminal test observations, NOT real authenticated PostgreSQL credentials.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {PassThrough} from 'node:stream'
import {stripTypeScriptTypes} from 'node:module'
import {HttpError} from '../services/pg-api/src/contracts.ts'
import {createAgentInternalShareHttp} from '../services/pg-api/src/agent-internal-share-http.ts'
import {createPgNativeInternalShareApi,PgNativeInternalShareError} from '../src/lib/pgNativeInternalShare.ts'
import {createOriginalInternalTemplatesController} from '../src/lib/originalInternalTemplates.ts'
import {requireInternalShareNative} from '../services/pg-api/src/agent-internal-share-runtime-policy.ts'
import {internalShareId,parseInternalShareIntent,internalShareDigest,internalShareIntentValue,internalShareReviewValue} from '../shared/agent-internal-share-contract.ts'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),alice=id(1),bob=id(2),code='aB3'.repeat(16),identity={issuer:'urn:agentstudio:local:v1',subject:'verified-bob-subject'}
const intent=action=>action==='create'?{action,request_id:id(8),source:{spec_id:id(3),revision:1,source_sha256:'a'.repeat(64)},preview_hash:'b'.repeat(64),confirm_safe:true,acknowledgement:'SHARE_REVIEWED_AGENT_TEMPLATE_ONCE'}:action==='redeem'?{action,request_id:id(8),share_code:code,confirm:true}:{action:'revoke',request_id:id(8),id:id(4),confirm:true}
function repository(){
 const source=fs.readFileSync(new URL('../services/pg-api/src/agent-internal-share-repository.ts',import.meta.url),'utf8'),start=source.indexOf('export class AgentInternalShareRepository'),actual=stripTypeScriptTypes(source.slice(start)).replace('export class','class'),events=[]
 const db={async query(sql){events.push(sql);return{rows:[]}},release(){events.push('release')}},pool={async connect(){events.push('connect');return db}}
 const withActorClient=async(client,selectedPool,verified,body)=>{assert.equal(client,db);assert.equal(selectedPool,pool);assert.deepEqual(verified,identity);events.push('actual_mapping_port_bob');return body(client,bob)}
 const admit=async(client,owner)=>{assert.equal(client,db);assert.equal(owner,bob);events.push('owned_admission_context')}
 const translated=error=>{throw error}
 const Class=Function('HttpError','requireInternalShareNative','withActorClient','assertOwnedAdmissionContext','internalShareId','parseInternalShareIntent','translated',actual+';return AgentInternalShareRepository')(HttpError,requireInternalShareNative,withActorClient,admit,internalShareId,parseInternalShareIntent,translated)
 return{repo:new Class(pool,{allowWrites:true}),events,source}
}
for(const action of ['create','redeem','revoke'])test('actual '+action+' record and confirm compare expected against mapped Bob before all business SQL',async()=>{
 const {repo,events}=repository()
 for(const operation of ['record','confirm']){
  events.length=0;await assert.rejects(repo[operation](identity,intent(action),alice),error=>error.status===409&&error.code==='agent_internal_share_employee_changed')
  assert.deepEqual(events,['connect','BEGIN','actual_mapping_port_bob','owned_admission_context','ROLLBACK','release'])
 }
})
async function http({body=intent('redeem'),headers={},rawHeaders,repository,method='POST',url='/api/v2/internal-templates'}={}){
 const req=new PassThrough(),bytes=JSON.stringify(body);req.method=method;req.url=url;req.headers={origin:'https://localhost:17443',cookie:'__Host-agentstudio_session='+'a'.repeat(43),'x-agentstudio-request':'1','content-type':'application/json','content-length':String(Buffer.byteLength(bytes)),...headers}
 req.rawHeaders=rawHeaders??Object.entries(req.headers).flatMap(([k,v])=>[k,v]);req.end(bytes)
 let result;const res={writeHead(status,headers){result={status,headers};return this},end(bytes){result.body=JSON.parse(bytes)}}
 await createAgentInternalShareHttp({allowedOrigin:'https://localhost:17443',authenticateRequest:async()=>identity,repository})(req,res)
 return result
}
test('real HTTP function carries the condition to record/confirm and preserves409; it is not a caller auth identity',async()=>{
 const {repo,events}=repository()
 for(const path of ['/api/v2/internal-templates','/api/v2/internal-templates/confirm']){
  const result=await http({url:path,body:path.endsWith('confirm')?{intent:intent('redeem')}:intent('redeem'),headers:{'x-agentstudio-expected-employee':alice},repository:repo})
  assert.equal(result.status,409);assert.equal(result.body.error,'agent_internal_share_employee_changed')
 }
 assert.equal(events.some(v=>String(v).includes('agent_internal_share_record')),false)
})
test('malformed duplicate or array expected headers reject before repository, while missing header stays backward-compatible',async()=>{
 let called=0,seen
 const repository={async record(actual,value,expected){called++;seen={actual,expected};throw new HttpError(409,'agent_internal_share_request_conflict')}}
 for(const value of ['', 'wrong',[alice,alice]]){const result=await http({headers:{'x-agentstudio-expected-employee':value},repository});assert.equal(result.status,400)}
 const duplicate=await http({headers:{'x-agentstudio-expected-employee':alice},rawHeaders:['X-AgentStudio-Expected-Employee',alice,'x-agentstudio-expected-employee',alice],repository});assert.equal(duplicate.status,400);assert.equal(called,0)
 const legacy=await http({repository});assert.equal(legacy.status,409);assert.equal(called,1);assert.deepEqual(seen,{actual:identity,expected:undefined})
})
test('Cookie/Origin/CSRF and forged identity headers are still checked before any condition or repository call',async()=>{
 let called=0;const repository={async record(){called++}}
 for(const headers of [{cookie:''},{authorization:'Bearer fake'},{'x-rh-user-id':alice},{origin:'https://foreign.invalid'},{'x-agentstudio-request':undefined}]){
  const result=await http({headers:{'x-agentstudio-expected-employee':alice,...headers},repository});assert([401,403].includes(result.status))
 }
 assert.equal(called,0)
})
test('actual client sends closed expected employee only on explicit record/confirm;409 remains definite and visible',async()=>{
 const calls=[],api=createPgNativeInternalShareApi({transport:async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({error:'agent_internal_share_employee_changed'}),{status:409,headers:{'content-type':'application/json'}})}})
 for(const operation of ['record','confirm'])await assert.rejects(api[operation](intent('redeem'),undefined,alice),error=>error instanceof PgNativeInternalShareError&&error.status===409&&error.code==='agent_internal_share_employee_changed'&&error.definite)
 for(const {init}of calls){assert.equal(new Headers(init.headers).get('x-agentstudio-expected-employee'),alice);assert.equal(new Headers(init.headers).has('authorization'),false);assert.equal(new Headers(init.headers).has('x-rh-user-id'),false)}
 const count=calls.length;await assert.rejects(api.record(intent('redeem'),undefined,'not-a-uuid'));assert.equal(calls.length,count)
 await assert.rejects(api.record(intent('redeem')));assert.equal(new Headers(calls.at(-1).init.headers).has('x-agentstudio-expected-employee'),false)
})
test('original controller closes over Alice even if actual request transport now authenticates Bob; no redeem SQL executes',async()=>{
 const model=repository(),requests=[]
 const list={protocol:'agent_internal_share_list_v1',ok:true,scope:'current_user',specs:[{id:id(3),name:'方案'}],invites:[]}
 const api=createPgNativeInternalShareApi({transport:async(url,init)=>{
  if(init.method==='GET')return new Response(JSON.stringify(list),{status:200,headers:{'content-type':'application/json'}})
  requests.push(new Headers(init.headers).get('x-agentstudio-expected-employee'))
  const result=await http({url:url.replace('/__pg_native',''),body:JSON.parse(init.body),headers:{'x-agentstudio-expected-employee':new Headers(init.headers).get('x-agentstudio-expected-employee')},repository:model.repo})
  return new Response(JSON.stringify(result.body),{status:result.status,headers:{'content-type':'application/json'}})
 }})
 const controller=createOriginalInternalTemplatesController({api,currentEmployee:()=>alice,verifyEmployee:async()=>alice,capabilities:async()=>({internal_share_available:true,internal_share_writes_enabled:true,config_writes_enabled:true}),copyText:async()=>{},onChange:()=>{}})
 await controller.start();for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve))
 controller.setCode(code);await controller.handleRedeem();assert.deepEqual(requests,[alice]);assert.equal(controller.getView().redeemed,null);assert.match(controller.getView().error,/账号已变化/)
 assert.equal(model.events.some(v=>String(v).includes('SELECT')),false);controller.dispose()
})
