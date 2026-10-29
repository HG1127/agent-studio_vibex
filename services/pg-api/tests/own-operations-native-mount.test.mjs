// Pure catalog-query doubles and in-memory HTTP streams only. No server,
// fixture, provider, database or socket is opened by this file.
import test from 'node:test'
import assert from 'node:assert/strict'
import {Readable} from 'node:stream'
import {readFileSync} from 'node:fs'
import {createNativeAuthHttpHandler} from '../src/native-auth-http.mjs'
import {createNativeOwnOperationsBusinessHandler} from '../src/own-operations-http.ts'
import {inspectOwnOperationsSchema,ownOperationsGuardSql,ownOperationsSchemaSql,ownOperationsColumnsSql,ownOperationsReadColumns,ownOperationsTables} from '../src/own-operations-repository.ts'
import {selectNativePg18UatCapabilities,permitNativePg18BusinessUatRequest} from '../src/native-config-uat-policy.ts'
import {ownCountKeys} from '../src/own-operations-contract.ts'
const origin='http://127.0.0.1:43000',token='S'.repeat(43),cookie='__Host-agentstudio_session='+token,stamp='2026-10-27T01:02:03.123Z'
const identity={issuer:'urn:agentstudio:local:v1',subject:'actual-verified-stub'},policy=selectNativePg18UatCapabilities({},origin,false)
const overview=()=>({protocol:'native_own_overview_v1',scope:'current_user',as_of:stamp,window_days:7,counts:Object.fromEntries(ownCountKeys.map(k=>[k,0])),recent:[],delegated_approvals:'unavailable'})
const todos=q=>({protocol:'native_own_todos_v1',scope:'current_user',as_of:stamp,category:q.category,kind:q.kind,q:q.q,limit:q.limit,items:[],has_more:false,next_cursor:null})
const unavailable=e=>e.status===409&&e.code==='own_overview_unavailable'
function catalog(options={}){
 const trace=[];let connected=0,released=0
 const pool={async connect(){connected++;if(options.connectError)throw Error('private_connect_failure');return {release(){released++},async query(sql,args=[]){
  trace.push({sql,args});if(options.throwAt===sql)throw Error('private_catalog_failure')
  if(sql===ownOperationsGuardSql)return {rows:options.missingGuard?[]:[{ok:options.guard!==false}]}
  if(sql===ownOperationsSchemaSql)return {rows:ownOperationsTables.filter(n=>n!==options.missingTable).map(name=>({name,ok:name!==options.unsafeTable}))}
  if(sql===ownOperationsColumnsSql){const wanted=ownOperationsReadColumns[args[0]];return {rows:Object.entries(wanted).filter(([name])=>name!==options.missingColumn).map(([name,[type,required]])=>({name,type:name===options.badType?'text':type,required:name===options.badNull?!required:required,plain:name!==options.generated,readable:name!==options.unreadable}))}}
  return {rows:[]}
 }}}}
 return {pool,trace,get connected(){return connected},get released(){return released}}
}
test('default050 is safely absent before an extra connection; true requires the audited052 prerequisite',async()=>{
 const f=catalog();assert.equal(await inspectOwnOperationsSchema(f.pool,false),false);assert.equal(f.connected,0)
 for(const bad of [undefined,null,'true',1])await assert.rejects(inspectOwnOperationsSchema(f.pool,bad),unavailable)
 assert.equal(f.connected,0)
})
test('read availability performs catalog-only READ ONLY inspection of the pinned guard and all required columns',async()=>{
 const f=catalog();assert.equal(await inspectOwnOperationsSchema(f.pool,true),true)
 assert.equal(f.connected,1);assert.equal(f.released,1);assert.equal(f.trace[0].sql,'BEGIN READ ONLY');assert.equal(f.trace[1].sql,'SET LOCAL ROLE agentstudio_api');assert.equal(f.trace.at(-1).sql,'ROLLBACK')
 const columns=f.trace.filter(c=>c.sql===ownOperationsColumnsSql);assert.equal(columns.length,7);assert.deepEqual(columns.map(c=>c.args[0]),ownOperationsTables)
 for(const c of f.trace){assert.doesNotMatch(c.sql,/^\s*(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|GRANT|REVOKE)\b|SELECT agentstudio\.agent_memory_outcome_epoch\(/i);assert.doesNotMatch(c.sql,/\b(?:FROM|JOIN) agentstudio\.(?:runs|jobs|users|schedules|external_effects|agent_specs|knowledge_bases|workflows)\b/)}
})
test('partial/unsafe schema, wrong column/nullability/grant, and failures refuse instead of advertising reads',async()=>{
 for(const options of [{guard:false},{missingGuard:true},{missingTable:'jobs'},{unsafeTable:'schedules'},{missingColumn:'deleted_at'},{badType:'owner_user_id'},{badNull:'next_at'},{generated:'status'},{unreadable:'checkpoint'},{throwAt:ownOperationsSchemaSql},{connectError:true}]){
  const f=catalog(options);await assert.rejects(inspectOwnOperationsSchema(f.pool,true),unavailable);assert.equal(f.released,options.connectError?0:1)
  if(!options.connectError)assert.equal(f.trace.at(-1).sql,'ROLLBACK')
 }
})
function runtime({available=false,selectedPolicy=policy,capability=available,writes=false}={}){
 const calls={verified:0,profiles:0,overview:0,todos:0,fallback:0};let native,business,active=true
 const auth={async login(){throw Error('not_a_login_test')},async revokeSession(){},async provisionEmployee(){},async getSessionProfile(value){calls.profiles++;return active&&value===token?{id:'synthetic',email:'synthetic@example.test',display_name:'Synthetic',is_admin:false}:null},async verifySession(value){calls.verified++;return active&&value===token?identity:null}}
 const repository={async overview(who){calls.overview++;assert.deepEqual(who,identity);return overview()},async todos(who,q){calls.todos++;assert.deepEqual(who,identity);return todos(q)}}
 native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,allowConfigurationWrites:writes,allowOwnOperations:capability,businessHandler:(req,res)=>business(req,res)})
 business=createNativeOwnOperationsBusinessHandler({available,repository,policy:selectedPolicy,allowedOrigin:origin,authenticateRequest:native.authenticateRequest,businessHandler:async(_req,res)=>{calls.fallback++;res.writeHead(200,{'Content-Type':'application/json'});res.end('{"existing":true}')}})
 return {calls,disable(){active=false},async request({url='/api/v2/own-todos',method='GET',headers={},body=[]}={}){
  const req=Readable.from(body);Object.assign(req,{url,method,headers:{cookie,origin,...headers}})
  const res={writeHead(status,headers){this.status=status;this.headers=headers},end(raw){this.body=JSON.parse(raw)}}
  await native.handler(req,res);return res
 }}
}
test('common read capability defaults absent/false and does not inherit configuration or submission writes',async()=>{
 for(const capability of [undefined,false,'true',1]){const f=runtime({capability});const r=await f.request({url:'/api/native-auth/capabilities'});assert.equal(r.status,200);assert.equal(r.body.own_operations_available===true,false)}
 const writeOnly=await runtime({writes:true}).request({url:'/api/native-auth/capabilities'});assert.equal(writeOnly.body.config_writes_enabled,true);assert.equal(writeOnly.body.own_operations_available===true,false)
 const f=runtime({available:true}),r=await f.request({url:'/api/native-auth/capabilities'})
 assert.equal(r.body.own_operations_available,true);assert.equal(r.body.config_writes_enabled,false);assert.equal(r.body.run_submission_enabled,false);assert.equal(r.body.workflow_v2_submission_enabled===true,false)
 assert.equal(Object.hasOwn(r.body,'own_overview_available'),false);assert.equal(Object.hasOwn(r.body,'own_todos_available'),false)
 for(const path of ['/api/v2/own-overview','/api/v2/own-todos'])assert.equal(permitNativePg18BusinessUatRequest(path,'GET',policy),true)
})
test('actual Native wrapper/shared dispatcher reaches both owner GETs only after Cookie verification',async()=>{
 const f=runtime({available:true});const a=await f.request({url:'/api/v2/own-overview'}),b=await f.request({url:'/api/v2/own-todos?category=failed&kind=schedule&q=%25_%5C&limit=1'})
 assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(a.body.protocol,'native_own_overview_v1');assert.equal(b.body.protocol,'native_own_todos_v1');assert.equal(b.body.q,'%_\\')
 assert.equal(f.calls.overview,1);assert.equal(f.calls.todos,1);assert.equal(f.calls.verified,2);assert.equal(f.calls.fallback,0)
 for(const r of [a,b]){assert.equal(r.headers['Cache-Control'],'no-store');assert.equal(r.headers.Pragma,'no-cache');assert.equal(r.headers['Referrer-Policy'],'no-referrer');assert.equal(r.headers['Cross-Origin-Resource-Policy'],'same-origin')}
})
test('missing052 capability still authenticates GET then refuses409 without repository or legacy fallback',async()=>{
 const f=runtime();for(const url of ['/api/v2/own-overview','/api/v2/own-todos']){const r=await f.request({url});assert.equal(r.status,409);assert.deepEqual(r.body,{error:'own_overview_unavailable'})}
 assert.equal(f.calls.verified,2);assert.equal(f.calls.overview+f.calls.todos+f.calls.fallback,0)
})
test('global allowlist remains ahead of owner auth/reads and all original write gates remain closed',async()=>{
 const f=runtime({available:true})
 for(const url of ['/api/v2/own-overview','/api/v2/own-todos'])for(const method of ['POST','PATCH','DELETE','HEAD','OPTIONS']){const r=await f.request({url,method});assert.equal(r.status,405);assert.deepEqual(r.body,{error:'method_not_allowed'});assert.equal(r.headers.Allow,'GET')}
 assert.equal(f.calls.verified,0);assert.equal(f.calls.overview+f.calls.todos+f.calls.fallback,0)
 for(const url of ['/api/v2/agent-specs','/api/v2/runs','/api/v2/workflow-runs'])assert.equal((await f.request({url,method:'POST'})).status,405)
 assert.equal(f.calls.fallback,0);assert.equal((await f.request({url:'/api/v2/agent-specs'})).body.existing,true);assert.equal(f.calls.fallback,1)
 assert.equal((await f.request({url:'/api/v2/own-todos/extra'})).status,405)
})
test('Cookie/Origin/closed-query/active-session refusals never fall back to a forged actor or token verifier',async()=>{
 const f=runtime({available:true})
 for(const headers of [{cookie:undefined,'x-rh-user-id':'forged'},{authorization:'Bearer forged'},{cookie:'__Host-agentstudio_session='+'F'.repeat(43)}])assert.equal((await f.request({headers})).status,401)
 assert.equal((await f.request({headers:{origin:'https://foreign.invalid'}})).status,403)
 for(const url of ['/api/v2/own-overview?owner=x','/api/v2/own-todos?owner_user_id=forged','/api/v2/own-todos?limit=1&limit=2'])assert.equal((await f.request({url})).status,400)
 f.disable();assert.equal((await f.request()).status,401);assert.equal((await f.request({url:'/api/native-auth/capabilities'})).status,401)
 assert.equal(f.calls.overview+f.calls.todos+f.calls.fallback,0)
})
test('production server binds inspected read availability and shared policy composition before createServer',()=>{
 const source=readFileSync(new URL('../src/native-server.ts',import.meta.url),'utf8')
 assert.match(source,/outcomeMemoryAvailable=await inspectAgentMemoryOutcomeSchema\(business\)/)
 assert.match(source,/ownOperationsAvailable=await inspectOwnOperationsSchema\(business,outcomeMemoryAvailable\)/)
 assert.match(source,/allowOwnOperations:ownOperationsAvailable/)
 assert.match(source,/businessHandler=createNativeOwnOperationsBusinessHandler\(/)
 assert.match(source,/available:ownOperationsAvailable/);assert.match(source,/repository:new OwnOperationsRepository\(business\)/)
  const own=source.indexOf('businessHandler=createNativeOwnOperationsBusinessHandler('),entry=source.indexOf('const entryHandler=createNativeEntryHttpHandler(native.handler,callerPublicHttp)'),listen=source.indexOf('const localServer=createServer(entryHandler)')
  assert.ok(own>=0&&entry>own&&listen>entry,'the actual entry must preserve the inspected Native policy/auth chain for every non-public route')
})
