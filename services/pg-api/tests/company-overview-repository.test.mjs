// Pure transaction/DTO tests only. No SQL engine, socket, provider or real
// employee rows. Positive unit cases isolate the auditor at the module boundary;
// separate cases below import the UNMODIFIED repository and real auditor and
// prove absent/drifted061 cannot reach a projection. Actual SQL/admin authority
// and successful full061->060 catalog evidence still require isolated PG18 CI.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import {HttpError} from '../src/contracts.ts'
import {withActorClient} from '../src/repository.ts'
import * as contract from '../src/company-overview-contract.ts'
import {CompanyOverviewRepository as ActualRepository,companyOverviewSql,companyEmployeeStatsSql} from '../src/company-overview-repository.ts'

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),owner=id(99)
const identity={issuer:'urn:agentstudio:local:v1',subject:'synthetic-company-admin'},at='2026-10-28T01:02:03.123Z'
const begin='BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY',mapped='SELECT agentstudio.identity_user_id($1::text,$2::text) AS id'
const counts=extra=>Object.fromEntries(contract.companyOperationalCountKeys.map(key=>[key,extra?.[key]??'0']))
const overview=extra=>({protocol:'native_company_overview_v1',scope:'company_metadata_only',as_of:at,window_days:7,totals:{employees:'205',active:'203',...counts()},worker:{availability:'unavailable',reason:'telemetry_not_installed'},...extra})
const employee=(n=1,extra={})=>({employee_id:id(n),display_name:' 员工甲 ',is_admin:false,enabled:true,status:'active',...counts(),...extra})
const page=(items=[],extra={})=>({protocol:'native_company_employee_stats_v1',scope:'company_metadata_only',as_of:at,limit:20,items,has_more:false,next_after:null,...extra})
const fault=(message,code='P0001')=>Object.assign(Error(message),{code})
const failure=(status,code)=>error=>error instanceof HttpError&&error.status===status&&error.code===code&&error.message===code
const unavailable=failure(503,'company_overview_unavailable')
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}
const source=readFileSync(new URL('../src/company-overview-repository.ts',import.meta.url),'utf8')
const stripped=stripTypeScriptTypes(source,{mode:'strip'})
const imports=[...stripped.matchAll(/^import\s+[\s\S]*?\s+from\s+"[^"]+"\r?$/gm)]
assert.equal(imports.length,4)
const body=stripped.replace(/^import\s+[\s\S]*?\s+from\s+"[^"]+"\r?$/gm,'').replace(/^export /gm,'')
const names=['HttpError','withActorClient','verifyCompanyOverviewSchema','companyDatabaseCount','companyOperationalCountKeys','companyTotalCountKeys','normalizeCompanyDisplayName','parseCompanyEmployeeQuery','parseCompanyOverview','parseCompanyEmployeePage']
const unitModule=Function(...names,body+'\nreturn {CompanyOverviewRepository,companyOverviewSql,companyEmployeeStatsSql}\n')

function fixture(options={}){
  const trace=[],state={connections:0,releases:0,audits:0,projectionCalls:0,mapped:false,actorSet:false,committed:false}
  const db={async query(sql,values=[]){
    trace.push({sql,values:structuredClone(values)})
    await options.beforeQuery?.(sql,values,state)
    if(options.throwAt===sql)throw options.error??Error('PRIVATE_DB_DETAIL')
    if(sql===mapped){state.mapped=true;return {rows:[{id:options.missingActor?null:owner}]}}
    if(sql==="SELECT set_config('agentstudio.actor_id',$1::text,true)"){assert.deepEqual(values,[owner]);state.actorSet=true}
    if(sql===companyOverviewSql||sql===companyEmployeeStatsSql){
      state.projectionCalls++;assert.equal(state.actorSet,true)
      if(!options.realAudit)assert.equal(state.audits,1)
      if(options.projectionError)throw options.projectionError
      return {rows:Object.hasOwn(options,'rows')?options.rows:[{value:sql===companyOverviewSql?(options.overview??overview()):(options.page??page())}]}
    }
    if(sql.startsWith('/* company061:')){
      if(sql.startsWith('/* company061:stamp */')){state.audits++;return {rows:[{readable:options.catalogReadable!==false,installed:false,predecessor:true}]}}
      if(sql.startsWith('/* company061:orphans */'))return {rows:[{ok:true}]}
      return {rows:[]}
    }
    if(sql==='COMMIT')state.committed=true
    return {rows:[]}
  },async release(){state.releases++;await options.beforeRelease?.();if(options.releaseError)throw Error('PRIVATE_RELEASE_DETAIL')}}
  const pool={async connect(){state.connections++;await options.beforeConnect?.();if(options.connectError)throw Error('PRIVATE_CONNECTION_DETAIL');return db}}
  const audit=async client=>{state.audits++;assert.strictEqual(client,db);assert.equal(state.mapped,true);assert.equal(state.actorSet,true);if(options.auditError)throw options.auditError}
  const unit=unitModule(HttpError,withActorClient,audit,...names.slice(3).map(name=>contract[name]))
  assert.equal(unit.companyOverviewSql,companyOverviewSql);assert.equal(unit.companyEmployeeStatsSql,companyEmployeeStatsSql)
  const repo=options.realAudit?new ActualRepository(pool):new unit.CompanyOverviewRepository(pool)
  return {repo,trace,state,db,pool}
}
function rolledBack(f){assert.equal(f.trace.at(-1)?.sql,'ROLLBACK');assert.equal(f.trace.some(row=>row.sql==='COMMIT'),false);assert.equal(f.state.releases,1)}

test('closed Native identity and employee cursor reject before acquiring a connection or invoking getters',async()=>{
  const f=fixture();let reads=0
  const getter={issuer:identity.issuer};Object.defineProperty(getter,'subject',{enumerable:true,get(){reads++;return identity.subject}})
  for(const value of [null,{},[],{...identity,issuer:'foreign'},{...identity,subject:''},{...identity,subject:'x'.repeat(256)},{...identity,subject:'a\0b'},{...identity,is_admin:true},getter])await assert.rejects(f.repo.overview(value),failure(401,'session_required'))
  const query={limit:2};Object.defineProperty(query,'after',{enumerable:true,get(){reads++;return null}})
  for(const value of [null,[],{limit:0},{limit:21},{limit:'2'},{after:id(1).toUpperCase().replace('4000','A000')},{owner_user_id:owner},{is_admin:true},query])await assert.rejects(f.repo.employees(identity,value),error=>error.status===400&&error.code==='invalid_company_employee_query')
  assert.equal(f.state.connections,0);assert.equal(f.state.audits,0);assert.equal(reads,0)
})

test('one actual withActorClient admission and mandatory audit precede a fixed projection in a readonly READ COMMITTED transaction',async()=>{
  const f=fixture(),result=await f.repo.overview(identity)
  assert.equal(result.totals.employees,205);assert.equal(result.totals.active,203);assert.deepEqual(result.worker,{availability:'unavailable',reason:'telemetry_not_installed'})
  assert.equal(f.state.connections,1);assert.equal(f.state.audits,1);assert.equal(f.state.projectionCalls,1);assert.equal(f.state.releases,1)
  assert.equal(f.trace[0].sql,begin);assert.equal(f.trace.at(-1).sql,'COMMIT')
  assert.deepEqual(f.trace.find(row=>row.sql===mapped).values,[identity.issuer,identity.subject]);assert.deepEqual(f.trace.find(row=>row.sql===companyOverviewSql).values,[])
  assert.ok(f.trace.findIndex(row=>row.sql==='SET LOCAL ROLE agentstudio_api')<f.trace.findIndex(row=>row.sql===mapped))
  for(const {sql} of f.trace)assert.doesNotMatch(sql,/FOR (?:UPDATE|SHARE)|advisory|agent_memory_outcome_epoch|agentstudio_auth\.accounts|\b(?:INSERT|UPDATE|DELETE|MERGE|GRANT)\b/i)
  assert.equal(companyOverviewSql,'SELECT agentstudio.company_overview() AS value')
  assert.equal(companyEmployeeStatsSql,'SELECT agentstudio.company_employee_stats($1::integer,$2::uuid) AS value')
})

test('each read audits again and statement-time current employee/admin refusals retain their fixed401/403',async()=>{
  const f=fixture();await f.repo.overview(identity);f.state.audits=0;await f.repo.employees(identity,{limit:20,after:null})
  assert.equal(f.state.connections,2);assert.equal(f.state.releases,2);assert.equal(f.state.audits,1)
  for(const [name,status,code] of [['company_native_session_required',401,'session_required'],['company_admin_required',403,'admin_required']]){
    const changed=fixture({beforeQuery(sql,_values,state){if(sql===companyOverviewSql)assert.equal(state.mapped,true)},projectionError:fault(name)})
    await assert.rejects(changed.repo.overview(identity),failure(status,code));rolledBack(changed)
    assert.equal(changed.state.audits,1);assert.equal(changed.state.projectionCalls,1)
  }
})

test('identity and closed page size/cursor are copied before pool await and only bound integers/UUID reach SQL',async()=>{
  const gate=deferred(),entered=deferred(),who={...identity},query={limit:2,after:id(1)}
  const f=fixture({beforeConnect(){entered.resolve();return gate.promise},page:page([employee(2),employee(3)],{limit:2,has_more:true,next_after:id(3)})})
  const work=f.repo.employees(who,query);await entered.promise;who.subject='foreign-after-await';query.limit=20;query.after=id(999);query.owner_user_id=owner;gate.resolve()
  const result=await work
  assert.deepEqual(f.trace.find(row=>row.sql===mapped).values,[identity.issuer,identity.subject]);assert.deepEqual(f.trace.find(row=>row.sql===companyEmployeeStatsSql).values,[2,id(1)])
  assert.equal(result.limit,2);assert.equal(result.next_after,id(3));assert.equal(result.items.length,2)
})

test('canonical text counts preserve zero and safe maximum, publish detached numbers and never infer healthy Worker telemetry',async()=>{
  const raw=overview();raw.totals.agent_running=String(Number.MAX_SAFE_INTEGER);raw.totals.pending_approvals='1000'
  const saved=structuredClone(raw),f=fixture({overview:raw}),result=await f.repo.overview(identity)
  assert.equal(result.totals.agent_running,Number.MAX_SAFE_INTEGER);assert.equal(result.totals.pending_approvals,1000);assert.equal(result.totals.knowledge_bases,0)
  for(const key of contract.companyTotalCountKeys)assert.equal(typeof result.totals[key],'number')
  result.totals.employees=0;result.worker.reason='mutated-by-test';assert.deepEqual(raw,saved)
  for(const worker of [{availability:'healthy',reason:'telemetry_not_installed'},{availability:'unavailable',reason:'PRIVATE_DETAIL'},{availability:'unavailable',reason:'telemetry_not_installed',queue:1}]){
    const broken=fixture({overview:overview({worker})});await assert.rejects(broken.repo.overview(identity),unavailable);rolledBack(broken)
  }
})

test('disabled employee metadata remains visible with persisted counts and producer display normalization keeps valid Unicode',async()=>{
  for(const [name,expected] of [[' \t ','员工'],[' 员工乙 ','员工乙'],['😀'.repeat(101),'😀'.repeat(100)],['a'.repeat(199)+'😀','a'.repeat(199)]]){
    const raw=employee(2,{display_name:name,enabled:false,status:'disabled',agent_running:'9',pending_approvals:'3'})
    const f=fixture({page:page([raw],{limit:1})}),result=await f.repo.employees(identity,{limit:1,after:id(1)})
    assert.equal(result.items[0].display_name,expected);assert.equal(result.items[0].enabled,false);assert.equal(result.items[0].status,'disabled');assert.equal(result.items[0].agent_running,9);assert.equal(result.items[0].pending_approvals,3)
    assert.equal(raw.agent_running,'9');assert.deepEqual(f.trace.find(row=>row.sql===companyEmployeeStatsSql).values,[1,id(1)])
  }
  for(const display_name of [null,1,'\ud800','员工\0'])await assert.rejects(fixture({page:page([employee(1,{display_name})])}).repo.employees(identity),unavailable)
})

test('every database count must be canonical text and fit safe integer range before commit',async()=>{
  const bad=['01','-1','+1','1e2','1.0',' 1','9007199254740992','9'.repeat(50),0,1n,null]
  for(const key of contract.companyTotalCountKeys)for(const value of bad){const raw=overview();raw.totals[key]=value;const f=fixture({overview:raw});await assert.rejects(f.repo.overview(identity),unavailable);rolledBack(f)}
  for(const key of contract.companyOperationalCountKeys)for(const value of bad){const f=fixture({page:page([employee(1,{[key]:value})])});await assert.rejects(f.repo.employees(identity),unavailable);rolledBack(f)}
  const raw=overview();raw.totals.active='206';await assert.rejects(fixture({overview:raw}).repo.overview(identity),unavailable)
})

test('extra private keys, missing or malformed row/value/root objects never escape the closed projection',async()=>{
  for(const rows of [[],[{value:overview()},{value:overview()}],[{}],[{value:null}],[{value:JSON.stringify(overview())}],[{value:overview(),owner_user_id:owner}]]){
    const f=fixture({rows});await assert.rejects(f.repo.overview(identity),unavailable);rolledBack(f)
  }
  for(const mutate of [raw=>{raw.email='PRIVATE_DETAIL'},raw=>{delete raw.as_of},raw=>{raw.totals.owner_user_id=owner},raw=>{raw.totals.employees='1';raw.totals.active='2'},raw=>{raw.as_of='2026-02-30T01:02:03.123Z'},raw=>{raw[Symbol('extra')]=true}]){
    const raw=overview();mutate(raw);await assert.rejects(fixture({overview:raw}).repo.overview(identity),unavailable)
  }
  let getters=0;const raw=overview();Object.defineProperty(raw.totals,'employees',{enumerable:true,get(){getters++;return '1'}})
  await assert.rejects(fixture({overview:raw}).repo.overview(identity),unavailable);assert.equal(getters,0)
})

test('employee projection rejects private attributes, sparse/accessor arrays, duplicate ordering and inconsistent pagination',async()=>{
  const cases=[page([employee(1,{email:'PRIVATE_DETAIL'})]),page([employee(1),employee(1)]),page([employee(2),employee(1)]),page([employee(1)],{limit:1,has_more:true,next_after:id(2)}),page([],{limit:1,has_more:true,next_after:id(1)}),page([],{next_after:id(1)}),page([],{has_more:'false'}),page([],{limit:19})]
  for(const raw of cases)await assert.rejects(fixture({page:raw}).repo.employees(identity,{limit:raw.limit===1?1:20,after:null}),unavailable)
  await assert.rejects(fixture({page:page([employee(1)],{limit:1})}).repo.employees(identity,{limit:1,after:id(1)}),unavailable)
  let getters=0;const array=[employee(1)];Object.defineProperty(array,'0',{enumerable:true,get(){getters++;return employee(1)}})
  await assert.rejects(fixture({page:page(array)}).repo.employees(identity),unavailable);assert.equal(getters,0)
  const sparse=Array(1);await assert.rejects(fixture({page:page(sparse)}).repo.employees(identity),unavailable)
  assert.deepEqual((await fixture().repo.employees(identity)).items,[])
})

test('only exact protected SQL permission exceptions are public and missing mapped employees are401 before auditor/projection',async()=>{
  for(const error of [fault('company_native_session_required','XX000'),fault('company_admin_required PRIVATE_DETAIL'),fault('invalid_company_employee_query'),Error('company_admin_required'),new HttpError(401,'PRIVATE_DETAIL')]){
    const f=fixture({projectionError:error});await assert.rejects(f.repo.overview(identity),unavailable);rolledBack(f)
  }
  let getters=0;const hostile=Error('PRIVATE_DETAIL');Object.defineProperty(hostile,'code',{get(){getters++;throw Error('PRIVATE_GETTER_DETAIL')}})
  const broken=fixture({projectionError:hostile});await assert.rejects(broken.repo.overview(identity),unavailable);rolledBack(broken);assert.equal(getters,0)
  const missing=fixture({missingActor:true});await assert.rejects(missing.repo.overview(identity),failure(401,'session_required'));rolledBack(missing);assert.equal(missing.state.audits,0);assert.equal(missing.state.projectionCalls,0)
  for(const [message,status,code] of [['company_native_session_required',401,'session_required'],['company_admin_required',403,'admin_required']]){
    const f=fixture({projectionError:fault(message),throwAt:'ROLLBACK',releaseError:true});await assert.rejects(f.repo.overview(identity),failure(status,code));assert.equal(f.state.releases,1)
  }
})

test('acquisition, BEGIN, role mapping, audit, projection, COMMIT and release failures all fail closed and release once',async()=>{
  for(const options of [{connectError:true},{throwAt:begin},{throwAt:'SET LOCAL ROLE agentstudio_api'},{throwAt:mapped},{auditError:Error('PRIVATE_AUDIT_DETAIL')},{throwAt:companyOverviewSql},{throwAt:'COMMIT'},{releaseError:true}]){
    const f=fixture(options);await assert.rejects(f.repo.overview(identity),unavailable);assert.equal(f.state.releases,options.connectError?0:1)
    if(options.auditError)assert.equal(f.state.projectionCalls,0)
    if(options.throwAt==='COMMIT'){assert.equal(f.trace.at(-1).sql,'ROLLBACK');assert.equal(f.state.committed,false)}
  }
})

test('nothing is published before COMMIT and client release both complete',async()=>{
  const committed=deferred(),commitGate=deferred(),releaseEntered=deferred(),releaseGate=deferred()
  const f=fixture({beforeQuery(sql){if(sql==='COMMIT'){committed.resolve();return commitGate.promise}},beforeRelease(){releaseEntered.resolve();return releaseGate.promise}})
  let published=false;const work=f.repo.overview(identity).then(value=>{published=true;return value})
  await committed.promise;assert.equal(published,false);commitGate.resolve();await releaseEntered.promise;assert.equal(published,false);releaseGate.resolve();assert.equal((await work).totals.employees,205);assert.equal(published,true)
})

test('unmodified production repository invokes the actual mandatory061 auditor on every read and refuses absence/drift before metadata SQL',async()=>{
  for(const catalogReadable of [true,false]){
    const f=fixture({realAudit:true,catalogReadable})
    await assert.rejects(f.repo.overview(identity),unavailable);await assert.rejects(f.repo.employees(identity,{limit:2,after:null}),unavailable)
    assert.equal(f.state.audits,2);assert.equal(f.state.connections,2);assert.equal(f.state.releases,2);assert.equal(f.state.projectionCalls,0)
    assert.equal(f.trace.filter(row=>row.sql==='ROLLBACK').length,2);assert.equal(f.trace.some(row=>row.sql==='COMMIT'),false)
  }
})
