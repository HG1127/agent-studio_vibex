// Query forwarding and failure/HTTP boundary tests; SQL responses here are
// deliberately stubbed. Real query/RLS evidence belongs to the guarded TCP file.
import test from 'node:test'
import assert from 'node:assert/strict'
import {Readable} from 'node:stream'
import {readFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {OwnOperationsRepository,ownOperationsGuardSql,ownOperationsSchemaSql,ownOperationsNowSql,ownOperationsCountsSql,ownOperationsRecentSql,ownOperationsTodosSql,ownOperationsTables,ownSearchPattern} from '../src/own-operations-repository.ts'
import {createOwnOperationsHttpHandler} from '../src/own-operations-http.ts'
import {ownCountKeys,ownCursor,parseOwnTodoQuery,parseOwnCursor} from '../src/own-operations-contract.ts'
import {HttpError} from '../src/contracts.ts'
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,identity={issuer:'urn:agentstudio:local:v1',subject:'synthetic'},us='2026-10-27T01:02:03.123456Z',owner=id(9)
const unavailable=e=>e.status===409&&e.code==='own_overview_unavailable',counts=()=>Object.fromEntries(ownCountKeys.map(k=>[k,'0']))
const row=(n=1,stamp=us)=>({category:'approval',kind:'agent_single',id:id(n),resource_id:id(8),resource_name:'元数据',step_key:null,status:'awaiting_approval',observed_at_us:stamp,category_rank:1})
function fixture(options={}){
 const trace=[];let connections=0,releases=0
 const pool={async connect(){connections++;if(options.connectError)throw Error('private_connection_error');return {release(){releases++},async query(sql,values=[]){
  trace.push({sql,values});if(options.throwAt===sql)throw Error('private_sql_error')
  if(sql.includes('identity_user_id('))return {rows:[{id:options.missingActor?null:owner}]}
  if(sql.startsWith("SELECT current_user="))return {rows:[{ok:options.context!==false}]}
  if(sql===ownOperationsGuardSql)return {rows:[{ok:options.guard!==false}]}
  if(sql==='SELECT agentstudio.agent_memory_outcome_epoch() AS epoch')return {rows:[{epoch:options.epoch===undefined?'1':options.epoch}]}
  if(sql===ownOperationsSchemaSql)return {rows:ownOperationsTables.map(name=>({name,ok:options.schema!==false}))}
  if(sql===ownOperationsNowSql)return {rows:[{as_of:us}]}
  if(sql===ownOperationsCountsSql)return {rows:[options.counts??counts()]}
  if(sql===ownOperationsRecentSql)return {rows:options.recent??[]}
  if(sql===ownOperationsTodosSql)return {rows:options.rows??[]}
  return {rows:[]}
 }}}}
 return {repo:new OwnOperationsRepository(pool),trace,get connections(){return connections},get releases(){return releases}}
}
test('Native issuer and closed input refuse before acquiring a SQL connection',async()=>{
 const f=fixture();for(const who of [null,{}, {...identity,issuer:'https://foreign.invalid'},{...identity,subject:''}])await assert.rejects(f.repo.overview(who),e=>e.status===403)
 for(const q of [{owner_user_id:id(1)},{limit:21},{before:'v1.invalid'}])await assert.rejects(f.repo.todos(identity,q),e=>e.status===400)
 assert.equal(f.connections,0)
})
test('one actor/RLS/active epoch transaction computes complete counts independently of latest12',async()=>{
 const f=fixture({counts:{...counts(),awaiting_approval:'75'}}),value=await f.repo.overview(identity)
 assert.equal(value.counts.awaiting_approval,75);assert.deepEqual(value.recent,[]);assert.equal(value.as_of,us.slice(0,23)+'Z')
 assert.equal(f.connections,1);assert.equal(f.releases,1);assert.equal(f.trace[0].sql,'BEGIN ISOLATION LEVEL REPEATABLE READ');assert.equal(f.trace.at(-1).sql,'COMMIT')
 assert.ok(f.trace.findIndex(v=>v.sql===ownOperationsGuardSql)<f.trace.findIndex(v=>v.sql===ownOperationsCountsSql))
 assert.deepEqual(f.trace.find(v=>v.sql===ownOperationsCountsSql).values,[owner,us])
 assert.match(ownOperationsCountsSql,/count\(\*\).*unsupported_runs/);assert.doesNotMatch(ownOperationsCountsSql,/LIMIT/i)
 assert.match(ownOperationsRecentSql,/ORDER BY created_at DESC,id DESC LIMIT 12$/)
})
test('query is bound before limit, literal wildcard escaping and bounded limit+1 are forwarded',async()=>{
 const f=fixture();await f.repo.todos(identity,{q:'  %_\\中文  ',category:'failed',kind:'workflow_safe',limit:3})
 const call=f.trace.find(v=>v.sql===ownOperationsTodosSql)
 assert.deepEqual(call.values,[owner,us,'failed','workflow_safe','%\\%\\_\\\\中文%',null,null,null,'',4])
 assert.equal(ownSearchPattern('%_\\'),'%\\%\\_\\\\%');assert.doesNotMatch(call.sql,/%_\\中文/)
 assert.match(call.sql,/resource_name_full ILIKE \$5/);assert.match(call.sql,/coalesce\(step_key,''\) COLLATE "C" DESC LIMIT \$10/)
 assert.doesNotMatch(call.sql,/SELECT \*|OFFSET|instruction|result_text|arguments_sha256|idempotency_key|result_reference/i)
})
test('microsecond pagination carries exact last tuple and original server threshold',async()=>{
 const f=fixture({rows:[row(2),row(1,us.replace('456','455'))]}),q=parseOwnTodoQuery({limit:1}),first=await f.repo.todos(identity,q),cursor=parseOwnCursor(first.next_cursor,q)
 assert.equal(first.items.length,1);assert.equal(first.has_more,true);assert.equal(cursor.observed_at,us);assert.equal(cursor.step_key,null)
 const second=fixture({rows:[row(1,us.replace('456','455'))]});assert.equal((await second.repo.todos(identity,{...q,before:first.next_cursor})).has_more,false)
 assert.deepEqual(second.trace.find(v=>v.sql===ownOperationsTodosSql).values,[owner,us,'all','all','%%',us,id(2),1,'',2])
})
test('future cursor, corrupt lookahead, ordering and bad count refuse without publishing or committing',async()=>{
 const q=parseOwnTodoQuery({limit:1}),future=ownCursor(q,us.replace('2026','2027'),{observed_at:us,id:id(1),category_rank:1,step_key:null}),f=fixture()
 await assert.rejects(f.repo.todos(identity,{...q,before:future}),e=>e.status===400&&e.code==='invalid_own_todo_cursor');assert.equal(f.trace.at(-1).sql,'ROLLBACK')
 for(const options of [{rows:[row(2),{...row(1),resource_name:null}]},{rows:[row(1),row(2)]},{rows:[row(1),{...row(1),status:'running'}]},{rows:[row(3),row(2),row(1)]}]){
  const broken=fixture(options);await assert.rejects(broken.repo.todos(identity,q),unavailable);assert.equal(broken.trace.at(-1).sql,'ROLLBACK')
 }
 for(const bad of ['9007199254740992',null,'-1','01'])await assert.rejects(fixture({counts:{...counts(),queued:bad}}).repo.overview(identity),unavailable)
})
test('catalog, active account, actor, acquisition and commit failures fail closed and release',async()=>{
 for(const options of [{guard:false},{schema:false},{context:false},{epoch:'9007199254740992'},{epoch:'1e0'},{epoch:''},{throwAt:'COMMIT'},{connectError:true}]){
  const f=fixture(options);await assert.rejects(f.repo.overview(identity),unavailable);assert.equal(f.releases,options.connectError?0:1)
  if(!options.connectError)assert.equal(f.trace.at(-1).sql,'ROLLBACK')
 }
 for(const options of [{epoch:null},{missingActor:true}])await assert.rejects(fixture(options).repo.overview(identity),e=>e.status===401&&e.code==='session_required')
})
test('bounded decoded names preserve complete Unicode characters within the public UTF16 limit',async()=>{
 for(const name of ['😀'.repeat(59)+'%_\\尾标','x'.repeat(119)+'😀']){
  const page=await fixture({rows:[{...row(),resource_name:name}]}).repo.todos(identity)
  assert.ok(page.items[0].resource_name.length<=120);assert.ok(page.items[0].resource_name.isWellFormed())
 }
})
test('SQL supported modes, owner joins and stale/7d thresholds retain explicit scope',()=>{
 for(const sql of [ownOperationsCountsSql,ownOperationsRecentSql,ownOperationsTodosSql]){
  assert.match(sql,/r.owner_user_id=\$1::uuid/);assert.match(sql,/a.owner_user_id=r.owner_user_id/);assert.match(sql,/w.owner_user_id=r.owner_user_id/)
  assert.match(sql,/j.owner_user_id=r.owner_user_id/);assert.match(sql,/workflow_safe_v1/);assert.match(sql,/agent_native_v2/);assert.match(sql,/workflow_native_v2/)
 }
 assert.match(ownOperationsCountsSql,/kind IS NULL/);assert.match(ownOperationsCountsSql,/created_at >= \$2::timestamptz-interval '7 days'/)
 assert.match(ownOperationsTodosSql,/interval '10 minutes'/);assert.match(ownOperationsTodosSql,/interval '60 seconds'/)
 assert.match(ownOperationsGuardSql,/p.prosecdef/);assert.match(ownOperationsGuardSql,/sha256/)
})
const cookie='__Host-agentstudio_session='+'A'.repeat(43),origin='http://127.0.0.1:43000'
async function request({url='/api/v2/own-todos',method='GET',headers={},body=[],identityValue=identity,repository={},authError}={}){
 let calls=0;const req=Readable.from(body);Object.assign(req,{url,method,headers:{cookie,origin,...headers}})
 const res={writeHead(status,headers){this.status=status;this.headers=headers},end(body){this.body=JSON.parse(body)}}
 const handler=createOwnOperationsHttpHandler({repository:{overview:async()=>fixture().repo.overview(identity),todos:async(_who,q)=>{calls++;return fixture().repo.todos(identity,q)},...repository},allowedOrigin:origin,authenticateRequest:async()=>{if(authError)throw authError;return identityValue}})
 const handled=await handler(req,res);return {...res,handled,calls}
}
test('HTTP only handles exact two paths and returns private no-store metadata with no owner field',async()=>{
 const r=await request();assert.equal(r.handled,true);assert.equal(r.status,200);assert.equal(r.calls,1)
 assert.equal(r.headers['Cache-Control'],'no-store');assert.equal(r.headers.Pragma,'no-cache');assert.equal(r.headers['Cross-Origin-Resource-Policy'],'same-origin');assert.equal(r.headers['Referrer-Policy'],'no-referrer')
 assert.doesNotMatch(JSON.stringify(r.body),/owner_user_id|checkpoint|instruction|token/)
 for(const url of ['/api/v2/company-overview','/api/v2/own-todos/','/api/v2/own-todos-extra'])assert.equal((await request({url})).handled,false)
})
test('HTTP refuses Bearer/forged identity/cross-origin and verifies actual session before reading',async()=>{
 for(const headers of [{cookie:undefined},{cookie:cookie+'; '+cookie},{authorization:'Bearer forged'},{'x-rh-user-id':owner,cookie:undefined}]){const r=await request({headers});assert.equal(r.status,401);assert.deepEqual(r.body,{error:'session_required'});assert.equal(r.calls,0)}
 for(const headers of [{origin:'https://foreign.invalid'},{'sec-fetch-site':'cross-site'}])assert.equal((await request({headers})).status,403)
 assert.equal((await request({identityValue:{...identity,issuer:'forged'}})).status,403)
 assert.equal((await request({authError:Object.assign(Error('private_session_detail'),{status:401})})).status,401)
})
test('HTTP rejects methods, bodies and query drift and never leaks internal errors or malformed DTO',async()=>{
 for(const method of ['POST','HEAD','PATCH','DELETE']){const r=await request({method});assert.equal(r.status,405);assert.equal(r.headers.Allow,'GET');assert.equal(r.calls,0)}
 for(const options of [{headers:{'content-length':'1'}},{headers:{'transfer-encoding':'chunked'}},{body:[Buffer.from('x')]},{url:'/api/v2/own-todos?limit=21'},{url:'/api/v2/own-overview?owner=x'}]){const r=await request(options);assert.equal(r.status,400);assert.equal(r.calls,0)}
 for(const todos of [async()=>{throw Error('password_private_sql')},async()=>({owner_user_id:owner}),async()=>{throw new HttpError(409,'untrusted_private_code')}]){
  const r=await request({repository:{todos}});assert.equal(r.status,409);assert.deepEqual(r.body,{error:'own_overview_unavailable'})
 }
})
test('genuine TCP entry refuses ordinary host before pg/fixture/network imports',()=>{
 const path=fileURLToPath(new URL('./own-operations-tcp.integration.mjs',import.meta.url)),source=readFileSync(path,'utf8'),guard=source.indexOf('const target=requireEphemeralPg18Ci()')
 assert.ok(guard>0);assert.ok(guard<source.indexOf("await import('pg')"));assert.ok(guard<source.indexOf("await import('./helpers/agent-assessment-fixture.mjs')"))
 const env={...process.env,CI:'false',GITHUB_ACTIONS:'false'};delete env.NODE_OPTIONS
 const result=spawnSync(process.execPath,['--experimental-strip-types',path],{env,encoding:'utf8',timeout:10000})
 assert.notEqual(result.status,0);assert.match(result.stderr,/refuse_non_ephemeral_pg18_ci/);assert.doesNotMatch(result.stderr,/ECONNREFUSED|ERR_MODULE_NOT_FOUND|PGlite|password authentication/)
})
