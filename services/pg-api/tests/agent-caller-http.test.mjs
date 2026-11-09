// Pure HTTP boundary mechanics with in-memory streams and method counters.
// No SQL pool, database authority, real socket, browser or Worker result.
import test from 'node:test'
import assert from 'node:assert/strict'
import {Readable} from 'node:stream'
import {createAgentCallerOwnerHttp,createAgentCallerPublicHttp} from '../src/agent-caller-http.ts'
import {HttpError} from '../src/contracts.ts'
import {NATIVE_SESSION_COOKIE} from '../src/native-employee-auth.mjs'
import {agentCallerOwnerFee,agentCallerRunFee} from '../../../shared/agent-caller-contract.ts'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),origin='https://owner.example',publicOrigin='https://caller.example',key='acs_api_'+id(1)+'_g1_'+'A'.repeat(43),identity={issuer:'urn:agentstudio:local:v1',subject:'synthetic-owner'},cookie=NATIVE_SESSION_COOKIE+'='+'A'.repeat(43),publicRoot='/api/v2/public/agent',ownerRoot='/api/v2/integrate',workspace=()=>({protocol:'agent_caller_owner_workspace_v1',budget:null,credentials:[],agents:[],owner_epoch:1}),run=()=>({request_id:id(2),session_id:id(3),input:'Synthetic boundary input',fee_ack:agentCallerRunFee,confirm:true}),budget=()=>({action:'budget',request_id:id(4),expected_revision:0,enabled:true,daily_run_limit:20,daily_model_limit:30,daily_tool_limit:0,concurrent_limit:1,fee_ack:agentCallerOwnerFee,confirm:true})
async function invoke(handler,url,{method='GET',headers={},rawHeaders,body,bytes}={}){
 const payload=bytes??(body===undefined?undefined:Buffer.from(JSON.stringify(body))),req=Readable.from(payload===undefined?[]:[payload]);req.method=method;req.url=url;req.headers={...(payload===undefined?{}:{'content-type':'application/json','content-length':String(payload.length)}),...headers};req.rawHeaders=rawHeaders??Object.entries(req.headers).flat();let status,output='',sentHeaders
 const res={writeHead(code,h){status=code;sentHeaders=h;return this},end(value){if(value!==undefined)output+=value;return this}},handled=await handler(req,res)
 return{handled,status,headers:sentHeaders,body:output?JSON.parse(output):undefined}
}
function publicFixture(){const calls=[];const repository=Object.fromEntries(['run','confirm','poll','embed','preflight'].map(name=>[name,async(...args)=>{calls.push({name,args});if(name==='preflight')return args[0]===publicOrigin;throw new HttpError(404,'agent_caller_not_found')} ]));return{calls,handler:createAgentCallerPublicHttp({repository})}}
const publicHeaders=()=>({authorization:'Bearer '+key,origin:publicOrigin}),ownerHeaders=()=>({cookie,origin,'x-agentstudio-request':'1'})
test('public HTTP refuses employee Cookie, Native CSRF, Owner overrides, JWT and missing Origin before repository methods',async()=>{
 for(const patch of[{cookie},{'x-agentstudio-request':'1'},{'x-rh-user-id':id(9)},{authorization:'Bearer employee.jwt'},{origin:undefined}]){const f=publicFixture(),r=await invoke(f.handler,publicRoot+'/run',{method:'POST',headers:{...publicHeaders(),...patch},body:run()});assert.equal(r.status,401);assert.equal(r.body.error,'agent_caller_authorization_required');assert.deepEqual(f.calls,[]);assert.equal(r.headers['Cache-Control'],'no-store')}
})
test('public HTTP rejects duplicate protected headers and encoded or queried routes without admission',async()=>{
 for(const options of[{rawHeaders:['Authorization','Bearer '+key,'authorization','Bearer '+key]},{url:publicRoot+'/run?copy=1'},{url:publicRoot+'/%72un'}]){const f=publicFixture(),r=await invoke(f.handler,options.url??publicRoot+'/run',{method:'POST',headers:publicHeaders(),body:run(),...options});assert.ok([400,401].includes(r.status));assert.deepEqual(f.calls,[])}
})
test('public HTTP consumes bounded complete fatal UTF8 duplicate-free JSON before calling admission',async()=>{
 for(const bytes of[Buffer.from('{"request_id":1,"request_id":2}'),Buffer.from([0xc3,0x28]),Buffer.from('{'),Buffer.alloc(32769,0x20)]){const f=publicFixture(),r=await invoke(f.handler,publicRoot+'/run',{method:'POST',headers:publicHeaders(),bytes});assert.ok([400,413].includes(r.status));assert.deepEqual(f.calls,[])}
 const f=publicFixture(),bytes=Buffer.from(JSON.stringify(run())),r=await invoke(f.handler,publicRoot+'/run',{method:'POST',headers:{...publicHeaders(),'content-length':String(bytes.length+1)},bytes});assert.equal(r.status,400);assert.deepEqual(f.calls,[])
})
test('public preflight allows only the exact active Origin and explicit authorization header with no credentials',async()=>{
 const f=publicFixture(),h={origin:publicOrigin,'access-control-request-method':'POST','access-control-request-headers':'authorization, content-type'},r=await invoke(f.handler,publicRoot+'/run',{method:'OPTIONS',headers:h});assert.equal(r.status,204);assert.equal(r.headers['Access-Control-Allow-Origin'],publicOrigin);assert.equal(r.headers['Access-Control-Allow-Credentials'],undefined);assert.equal(r.headers['Access-Control-Max-Age'],'0');assert.deepEqual(f.calls.map(c=>c.name),['preflight'])
 for(const patch of[{origin:'https://other.example'},{'access-control-request-headers':'content-type'},{'access-control-request-headers':'authorization, authorization'},{authorization:'Bearer '+key}]){const next=await invoke(f.handler,publicRoot+'/run',{method:'OPTIONS',headers:{...h,...patch}});assert.ok([400,403].includes(next.status))}
 assert.equal(f.calls.some(c=>['run','confirm','poll'].includes(c.name)),false)
})
test('public original confirmation and poll route to read methods without creating another run',async()=>{
 const f=publicFixture();assert.equal((await invoke(f.handler,publicRoot+'/confirm',{method:'POST',headers:publicHeaders(),body:{choice:run()}})).status,404);assert.equal((await invoke(f.handler,publicRoot+'/poll/'+id(5),{headers:publicHeaders()})).status,404);assert.deepEqual(f.calls.map(c=>c.name),['confirm','poll']);assert.equal(f.calls[0].args[0],key);assert.equal(f.calls[0].args[1],publicOrigin)
})
test('Owner HTTP normalizes only the exact original Native session401 and sanitizes unknown auth errors',async()=>{
 for(const [error,status,code]of[[Object.assign(Error('session_required'),{status:401}),401,'agent_caller_native_session_required'],[Object.assign(Error('synthetic-private-auth-detail'),{status:401}),503,'agent_caller_outcome_unknown']]){let calls=0;const h=createAgentCallerOwnerHttp({repository:{workspace:async()=>{calls++;return workspace()}},allowedOrigin:origin,authenticateRequest:async()=>{throw error}}),r=await invoke(h,ownerRoot+'/agents',{headers:ownerHeaders()});assert.equal(r.status,status);assert.equal(r.body.error,code);assert.equal(calls,0);assert.equal(JSON.stringify(r).includes('synthetic-private-auth-detail'),false)}
})
test('Owner metadata is fenced by a fresh Native identity check before returning its response',async()=>{
 for(const expired of[true,false]){let auths=0,reads=0;const h=createAgentCallerOwnerHttp({repository:{workspace:async()=>{reads++;return workspace()}},allowedOrigin:origin,authenticateRequest:async()=>{auths++;if(auths===2){if(expired)throw Object.assign(Error('session_required'),{status:401});return{...identity,subject:'different-employee'}}return identity}}),r=await invoke(h,ownerRoot+'/agents',{headers:ownerHeaders()});assert.equal(r.status,401);assert.equal(r.body.error,'agent_caller_native_session_required');assert.equal(auths,2);assert.equal(reads,1);assert.equal(Object.hasOwn(r.body,'credentials'),false)}
})
test('Owner closed writes still allow original confirmation but refuse a new budget mutation before repository change',async()=>{
 const calls=[],repository={change:async()=>{calls.push('change')},ownerConfirm:async(actor,request)=>{calls.push(['confirm',actor.subject,request]);throw new HttpError(404,'agent_caller_not_found')}},h=createAgentCallerOwnerHttp({repository,allowedOrigin:origin,authenticateRequest:async()=>identity,allowWrites:false,allowAdmission:false}),c=budget(),write=await invoke(h,ownerRoot+'/budget',{method:'POST',headers:ownerHeaders(),body:c});assert.equal(write.status,403);assert.equal(write.body.error,'agent_caller_writes_disabled');assert.deepEqual(calls,[]);const confirm=await invoke(h,ownerRoot+'/confirm',{method:'POST',headers:ownerHeaders(),body:{choice:c}});assert.equal(confirm.status,404);assert.deepEqual(calls,[['confirm',identity.subject,c.request_id]])
})
test('Owner read entry requires the original Cookie and rejects Bearer or arbitrary Owner identity before authentication',async()=>{
 for(const patch of[{cookie:undefined},{authorization:'Bearer '+key},{'x-agentstudio-owner-id':id(9)}]){let auths=0;const h=createAgentCallerOwnerHttp({repository:{},allowedOrigin:origin,authenticateRequest:async()=>{auths++;return identity}}),r=await invoke(h,ownerRoot+'/agents',{headers:{...ownerHeaders(),...patch}});assert.ok([401,403].includes(r.status));assert.equal(auths,0)}
})

test('renderer denial keeps exact authorization401 distinct from missing404, source409 and unknown503',async()=>{
 for(const [failure,status,code]of [[new HttpError(401,'agent_caller_authorization_required'),401,'agent_caller_authorization_required'],[new HttpError(404,'agent_caller_not_found'),404,'agent_caller_not_found'],[new HttpError(409,'agent_caller_source_unavailable'),409,'agent_caller_source_unavailable'],[Error('synthetic-private-database-detail'),503,'agent_caller_outcome_unknown']]){
  let reads=0;const repository={embed:async received=>{assert.equal(received,id(8));reads++;throw failure}},handler=createAgentCallerPublicHttp({repository}),result=await invoke(handler,'/embed/'+id(8))
  assert.equal(reads,1);assert.equal(result.status,status);assert.deepEqual(result.body,{error:code});assert.equal(result.headers['Cache-Control'],'no-store');assert.equal(result.headers['X-Frame-Options'],'DENY');assert.equal(result.headers['Content-Type'],'application/json; charset=utf-8');assert.equal(result.headers['Access-Control-Allow-Origin'],undefined);assert.equal(JSON.stringify(result).includes('synthetic-private-database-detail'),false)
 }
})
