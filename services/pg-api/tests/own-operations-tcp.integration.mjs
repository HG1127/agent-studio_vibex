// Genuine PG18/TCP only. Ordinary hosts refuse BEFORE loading pg, fixtures,
// application modules, opening a socket or executing any SQL. Never local-skip.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {requireEphemeralPg18Ci} from '../src/pg18-ephemeral-ci-guard.mjs'
const target=requireEphemeralPg18Ci()
if(process.platform!=='linux'||process.env.RUNNER_OS!=='Linux')throw Error('own_operations_hosted_linux_only')
const {default:pg}=await import('pg')
const {agentAssessmentTcpFixture}=await import('./helpers/agent-assessment-fixture.mjs')
const {OwnOperationsRepository,ownOperationsTodosSql,inspectOwnOperationsSchema}=await import('../src/own-operations-repository.ts')
const {ownCursor,parseOwnCursor,parseOwnTodoQuery,ownCategoryRanks}=await import('../src/own-operations-contract.ts')
const {createNativeOwnOperationsBusinessHandler}=await import('../src/own-operations-http.ts')
const {inspectAgentMemoryOutcomeSchema}=await import('../src/agent-memory-outcome-audit.ts')
const {selectNativePg18UatCapabilities}=await import('../src/native-config-uat-policy.ts')
const {createNativeAuthHttpHandler}=await import('../src/native-auth-http.mjs')
const {NativeAuthRepository}=await import('../src/native-auth-repository.mjs')
const {createServer}=await import('node:http')
const {once}=await import('node:events')
const {setTimeout:delay}=await import('node:timers/promises')
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const unavailable=e=>e.status===409&&e.code==='own_overview_unavailable'
const privateFields=/ownSyntheticPrivate|"(?:owner_user_id|instruction|result_text|checkpoint|arguments_sha256|idempotency_key|result_reference|model_binding|payload|lease_token|email|token)"/
const us=column=>`to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
async function snapshot(f){
 const tables=(await f.db.query("SELECT n.nspname,c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind='r' ORDER BY n.nspname,c.relname")).rows,result={}
 for(const {nspname,relname} of tables){assert.match(nspname,/^[a-z_]+$/);assert.match(relname,/^[a-z_0-9]+$/);const rows=(await f.db.query(`SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb) AS rows FROM ${nspname}.${relname} r`)).rows[0].rows;result[nspname+'.'+relname]={rows:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')}}
 return result
}
async function readOnly(f,body){const before=await snapshot(f);try{return await body()}finally{assert.deepEqual(await snapshot(f),before,'GET/refusal must not mutate any business/private/audit row')}}
function tracePool(pool,{explain=false}={}){
 const trace=[],plans=[]
 const connect=async()=>{const db=await pool.connect();return {release:()=>db.release(),async query(sql,args=[]){
  assert.doesNotMatch(sql,/^\s*(?:INSERT|UPDATE|DELETE|MERGE)\b/i)
  const result=await db.query(sql,args),parts=Array.isArray(result)?result:[result]
  // node-postgres returns Result[] for the actor's two SET LOCAL statements.
  // Trace its actual rows without altering/replacing the driver's result.
  const counts=parts.map(part=>{assert.ok(Array.isArray(part.rows));return part.rows.length})
  trace.push({sql,args,count:counts.reduce((sum,count)=>sum+count,0),result_counts:counts,multi_result:Array.isArray(result)})
  // Measure the actual restricted API role/actor transaction and RLS plan,
  // not an admin-bypass plan. This extra SELECT remains inside readOnly hashes.
  if(explain&&sql===ownOperationsTodosSql&&!plans.length)plans.push((await db.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+sql,args)).rows[0]['QUERY PLAN'])
  return result
 }}}
 // Preserve the base pool's actual capability getters and method receiver;
 // the tracer changes only connect/query observation, not permission flags.
 const wrapped=new Proxy(Object.create(pool),{get(_target,key){if(key==='connect')return connect;const value=Reflect.get(pool,key,pool);return typeof value==='function'?value.bind(pool):value}})
 return {trace,plans,pool:wrapped}
}
function fixedQuery(anchor,beforeId,query={}){
 const q=parseOwnTodoQuery(query),category=q.category==='all'?'failed':q.category
 // This is the actual saved server clock. Every seeded attention timestamp
 // is at least59 seconds older, so this protocol-valid boundary omits none.
 return {...q,before:ownCursor(q,anchor,{observed_at:anchor,id:beforeId,category_rank:ownCategoryRanks[category],step_key:category==='effect_review'?'fixture-page-start':null})}
}
async function seed(f){
 const anchor=(await f.db.query(`SELECT ${us('clock_timestamp()')} AS stamp`)).rows[0].stamp
 const alice=f.users.alice,bob=f.users.bob,spec=f.resources.alice.spec.id,other=f.resources.bob.spec.id,wf=id(900),searchSpec=id(901)
 await f.db.query("INSERT INTO agentstudio.workflows(id,owner_user_id,name,graph) VALUES($1,$2,'Synthetic workflow','{}')",[wf,alice])
 await f.db.query("INSERT INTO agentstudio.agent_specs(id,owner_user_id,name,spec) SELECT $1,owner_user_id,$2,spec FROM agentstudio.agent_specs WHERE id=$3",[searchSpec,'😀'.repeat(59)+'%_\\尾标',spec])
 await f.db.query("UPDATE agentstudio.agent_specs SET name='  ' WHERE id=$1",[spec])
 async function run(n,{who=alice,resource=spec,workflow=false,mode=null,status='awaiting_approval',created='1 day',updated='1 hour',micros=0}={}){
  const checkpoint={ownSyntheticPrivate:'checkpoint-body',...(mode===null?{}:{execution_mode:mode})}
  await f.db.query(`INSERT INTO agentstudio.runs(id,owner_user_id,kind,agent_spec_id,workflow_id,status,instruction,result_text,checkpoint,created_at,updated_at,finished_at)
   VALUES($1,$2,$3,$4,$5,$6,'ownSyntheticPrivate instruction','ownSyntheticPrivate result',$7::jsonb,$8::timestamptz-$9::interval,$8::timestamptz-$10::interval+$11::integer*interval '1 microsecond',CASE WHEN $6 IN('failed','succeeded','cancelled') THEN $8::timestamptz ELSE NULL END)`,[id(n),who,workflow?'workflow':'agent',workflow?null:resource,workflow?resource:null,status,JSON.stringify(checkpoint),anchor,created,updated,micros])
 }
 for(let n=1;n<=55;n++)await run(n,{micros:Math.floor(n/2)})
 await run(56,{mode:'agent_native_v2',status:'awaiting_input'})
 await run(57,{workflow:true,resource:wf,mode:'workflow_native_v2',status:'paused'})
 await run(58,{workflow:true,resource:wf,mode:'start_end_only',status:'awaiting_approval'})
 await f.db.query("INSERT INTO agentstudio.jobs(owner_user_id,run_id,kind,dedupe_key,payload) VALUES($1,$2,'workflow_tick','own-safe-fixture','{\"phase\":\"workflow_safe_v1\",\"ownSyntheticPrivate\":\"job-body\"}')",[alice,id(58)])
 await run(59,{workflow:true,resource:wf,mode:'future_workflow',status:'awaiting_approval'})
 await run(60,{workflow:true,resource:wf,status:'running'})
 await run(61,{resource:searchSpec,updated:'2 hours'})
 await run(62,{status:'failed',created:'7 days'})
 await run(63,{status:'failed',created:'7 days 1 microsecond'})
 await run(64,{status:'running'})
 await run(65,{status:'queued'})
 await run(66,{who:bob,resource:other})
 // Uncommon but supported stored combinations are metadata, not new authority.
 await run(67,{workflow:true,resource:wf,mode:'workflow_native_v2',status:'awaiting_input'})
 await run(68,{status:'paused'})
 async function effect(n,step,status,age){await f.db.query(`INSERT INTO agentstudio.external_effects(run_id,owner_user_id,step_key,tool_name,arguments_sha256,idempotency_key,status,result_reference,updated_at) VALUES($1,$2,$3,'ownSyntheticPrivate tool',$4,$5,$6,'ownSyntheticPrivate reference',$7::timestamptz-$8::interval)`,[id(n),alice,step,'a'.repeat(64),'ownSyntheticPrivate-'+randomUUID(),status,anchor,age])}
 await effect(57,'😀','unknown','1 hour');await effect(57,'\ue000','unknown','1 hour')
 await effect(64,'old-started','started','10 minutes 1 microsecond');await effect(64,'boundary','started','10 minutes');await effect(64,'fresh','started','9 minutes')
 await effect(59,'unsupported','unknown','1 hour');await effect(64,'finished','succeeded','1 hour')
 async function schedule(n,age,{enabled=true,deleted=false}={}){await f.db.query(`INSERT INTO agentstudio.schedules(id,owner_user_id,kind,agent_spec_id,name,recurrence,time_zone,next_at,enabled,deleted_at) VALUES($1,$2,'agent',$3,'Synthetic overdue','{}','UTC',$4::timestamptz-$5::interval,$6,CASE WHEN $7 THEN $4::timestamptz ELSE NULL END)`,[id(n),alice,spec,anchor,age,enabled,deleted])}
 await schedule(800,'60 seconds 1 microsecond');await schedule(801,'60 seconds');await schedule(802,'59 seconds');await schedule(803,'1 day',{enabled:false});await schedule(804,'1 day',{deleted:true})
 await f.db.query("INSERT INTO agentstudio.knowledge_bases(owner_user_id,name) VALUES($1,'Synthetic Alice KB'),($2,'Synthetic Bob KB')",[alice,bob])
 await f.db.query("INSERT INTO agentstudio.knowledge_access(base_id,owner_user_id,recipient_user_id,access_role) SELECT id,owner_user_id,$1,'viewer' FROM agentstudio.knowledge_bases WHERE owner_user_id=$2",[alice,bob])
 const fixed=(query={})=>fixedQuery(anchor,id(1),query)
 return {anchor,alice,bob,spec,wf,searchSpec,fixed}
}
test('actual disposable PG18 owner operations: data/RLS/Native HTTP/cursors/read-only', {concurrency:false,timeout:240000},async t=>{
 const f=await agentAssessmentTcpFixture();let server,authPool,nativeRead
 try{
  const outcomeSchemaAvailable=await inspectAgentMemoryOutcomeSchema(f.pool)
  assert.equal(outcomeSchemaAvailable,true)
  const ownOperationsAvailable=await inspectOwnOperationsSchema(f.pool,outcomeSchemaAvailable)
  assert.equal(ownOperationsAvailable,true,'actual full052 audit and seven FORCE-RLS tables/typed readable columns must pass before capabilities/mount')
  const s=await seed(f),repo=new OwnOperationsRepository(f.pool)
  // The trigger makes an accidental audit INSERT observable, including a
  // caught/rolled-back INSERT. All data above are synthetic fixture setup.
  await f.db.exec("CREATE FUNCTION agentstudio.own_fixture_no_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'own_read_attempted_audit_insert'; END $$; REVOKE ALL ON FUNCTION agentstudio.own_fixture_no_audit() FROM PUBLIC; CREATE TRIGGER own_fixture_no_audit BEFORE INSERT ON agentstudio.audit_events FOR EACH ROW EXECUTE FUNCTION agentstudio.own_fixture_no_audit()")
  await t.test('complete counts exceed50 independently of latest12; explicit owners/unsupported modes/private bodies',async()=>{
   const a=await readOnly(f,()=>repo.overview(f.identities.alice)),b=await readOnly(f,()=>repo.overview(f.identities.bob))
   assert.equal(a.counts.awaiting_approval,57);assert.equal(a.counts.awaiting_input,2);assert.equal(a.counts.paused,2);assert.equal(a.counts.running,1);assert.equal(a.counts.queued,1)
   assert.equal(a.counts.unsupported_runs,2);assert.equal(a.counts.owned_agents,2);assert.equal(a.counts.knowledge_bases,1);assert.equal(a.recent.length,12)
   assert.equal(b.counts.awaiting_approval,1);assert.equal(b.counts.knowledge_bases,1);assert.equal(b.recent.length,1);assert.equal(b.recent[0].run_id,id(66))
   assert.ok(a.recent.every(r=>r.run_id!==id(66)&&r.run_id!==id(59)&&r.run_id!==id(60)));assert.doesNotMatch(JSON.stringify({a,b}),privateFields)
   assert.ok(a.recent.some(r=>r.resource_name==='Agent '+s.spec.slice(0,8)))
   const trace=tracePool(f.pool);await readOnly(f,()=>new OwnOperationsRepository(trace.pool).overview(f.identities.alice))
   assert.equal(trace.trace[0].sql,'BEGIN ISOLATION LEVEL REPEATABLE READ');assert.equal(trace.trace.at(-1).sql,'COMMIT')
  })
  await t.test('three real pages traverse55 same-millisecond ties using exact microsecond+UUID tuple',async()=>{
   const q={category:'approval',kind:'agent_single',limit:20},traced=tracePool(f.pool,{explain:true}),reads=new OwnOperationsRepository(traced.pool),pages=[]
   let current=s.fixed(q)
   do{const page=await readOnly(f,()=>reads.todos(f.identities.alice,current));pages.push(page);assert.equal(page.as_of,s.anchor.slice(0,23)+'Z');if(!page.has_more)break;const cursor=parseOwnCursor(page.next_cursor,parseOwnTodoQuery(q));assert.equal(cursor.as_of,s.anchor);current={...q,before:page.next_cursor}}while(pages.length<5)
   const expected=Array.from({length:55},(_,i)=>55-i).map(n=>id(n)).concat(id(61))
   assert.deepEqual(pages.flatMap(p=>p.items.map(v=>v.id)),expected);assert.deepEqual(pages.map(p=>p.items.length),[20,20,16])
   assert.equal(new Set(pages.flatMap(p=>p.items.map(v=>v.id))).size,56)
   const queries=traced.trace.filter(v=>v.sql===ownOperationsTodosSql);assert.deepEqual(queries.map(v=>v.count),[21,21,16]);assert.ok(queries.every(v=>v.args.at(-1)===21))
   assert.equal(traced.plans.length,1);const plan=traced.plans[0]
   assert.equal(plan[0].Plan['Node Type'],'Limit');assert.equal(plan[0].Plan['Actual Rows'],21);t.diagnostic('own_todos_synthetic_pg18_explain='+JSON.stringify(plan))
  })
  await t.test('resource-name literal search precedes limit/truncation and valid filter intersections stay empty',async()=>{
   const page=await readOnly(f,()=>repo.todos(f.identities.alice,{q:'%_\\尾标'}));assert.deepEqual(page.items.map(v=>v.id),[id(61)])
   assert.ok(page.items[0].resource_name.length<=120);assert.ok(!page.items[0].resource_name.includes('尾标'));assert.ok(page.items[0].resource_name.isWellFormed())
   assert.deepEqual((await readOnly(f,()=>repo.todos(f.identities.bob,{q:'%_\\尾标'}))).items,[])
   for(const q of [{category:'failed',kind:'schedule'},{category:'schedule_overdue',kind:'workflow_v2'}])assert.deepEqual((await readOnly(f,()=>repo.todos(f.identities.alice,q))).items,[])
   const uncommon=await readOnly(f,()=>repo.todos(f.identities.alice,{category:'human_input',kind:'workflow_v2'}));assert.deepEqual(uncommon.items.map(v=>v.id),[id(67)])
  })
  await t.test('fixed SQL microsecond boundaries: failed creation7d, started10min, enabled/nondeleted overdue60s',async()=>{
   const failed=await readOnly(f,()=>repo.todos(f.identities.alice,s.fixed({category:'failed'})));assert.deepEqual(failed.items.map(v=>v.id),[id(62)])
   const effects=await readOnly(f,()=>repo.todos(f.identities.alice,s.fixed({category:'effect_review'})));assert.equal(effects.items.length,3);assert.deepEqual(new Set(effects.items.map(v=>v.step_key)),new Set(['😀','\ue000','old-started']))
   const schedules=await readOnly(f,()=>repo.todos(f.identities.alice,s.fixed({category:'schedule_overdue'})));assert.deepEqual(schedules.items.map(v=>v.id),[id(800)])
   // Same run/time: effect rank4 before paused rank3; C byte order puts
   // astral😀 before BMP private-use U+E000. Page size1 splits both ties.
   const q={q:'Synthetic workflow',limit:1},all=[];let current=s.fixed(q)
   do{const p=await readOnly(f,()=>repo.todos(f.identities.alice,current));all.push(...p.items);if(!p.has_more)break;current={...q,before:p.next_cursor}}while(all.length<10)
   const tied=all.filter(v=>v.id===id(57));assert.deepEqual(tied.map(v=>[v.category,v.step_key]),[['effect_review','😀'],['effect_review','\ue000'],['paused',null]])
  })
  await t.test('a cursor fixes thresholds while current state changes may remove rows; refresh resets current metadata',async()=>{
   const q={category:'approval',kind:'agent_single',limit:20},first=await readOnly(f,()=>repo.todos(f.identities.alice,q)),cursor=parseOwnCursor(first.next_cursor,parseOwnTodoQuery(q))
   await f.db.query("UPDATE agentstudio.runs SET status='cancelled',finished_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1",[id(20)])
   const next=await readOnly(f,()=>repo.todos(f.identities.alice,{...q,before:first.next_cursor}));assert.ok(next.items.every(v=>v.id!==id(20)));assert.equal(next.as_of,cursor.as_of.slice(0,23)+'Z')
   if(next.next_cursor)assert.equal(parseOwnCursor(next.next_cursor,parseOwnTodoQuery(q)).as_of,cursor.as_of)
   await assert.rejects(readOnly(f,()=>repo.todos(f.identities.alice,{...q,q:'other',before:first.next_cursor})),e=>e.status===400&&e.code==='invalid_own_todo_cursor')
   const refreshed=await readOnly(f,()=>repo.overview(f.identities.alice));assert.equal(refreshed.counts.awaiting_approval,56)
  })
  await t.test('real Native Cookie HTTP uses actual verified employee; malformed/auth refusals stay closed/no-write',async()=>{
   authPool=new pg.Pool({...target,user:'agentstudio_native_login',password:createHash('sha512').update(target.password+':assessment:agentstudio_native_login').digest('hex').slice(0,80),max:2})
   const auth=new NativeAuthRepository({connect:()=>authPool.connect()});let native,business
   server=createServer((req,res)=>{native.handler(req,res).catch(()=>{res.writeHead(500);res.end()})});server.listen(0,'127.0.0.1');await once(server,'listening')
   const origin='http://127.0.0.1:'+server.address().port
   native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,allowOwnOperations:ownOperationsAvailable,businessHandler:(req,res)=>business(req,res)})
   business=createNativeOwnOperationsBusinessHandler({available:ownOperationsAvailable,repository:repo,allowedOrigin:origin,authenticateRequest:native.authenticateRequest,
    policy:selectNativePg18UatCapabilities({},origin,false),businessHandler:async(_req,res)=>{res.writeHead(404);res.end()}})
   const cookies={}
   for(const who of ['alice','bob']){const response=await fetch(origin+'/api/native-auth/login',{method:'POST',headers:{Origin:origin,'X-Agentstudio-Request':'1','Content-Type':'application/json'},body:JSON.stringify({email:'assessment-'+who+'@example.test',password:who==='alice'?'SyntheticAssessmentAlice#2026':'SyntheticAssessmentBob#2026'})});assert.equal(response.status,200);cookies[who]=response.headers.get('set-cookie').split(';')[0]}
   async function get(path,cookie=cookies.alice,extra={}){return readOnly(f,async()=>{const r=await fetch(origin+path,{headers:{Origin:origin,Cookie:cookie,...extra}});const body=await r.json();assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.doesNotMatch(JSON.stringify(body),privateFields);return {status:r.status,body}})}
   nativeRead=path=>get(path,cookies.bob)
   assert.equal((await get('/api/v2/own-overview')).status,200);assert.equal((await get('/api/v2/own-todos',cookies.bob)).body.items.length,1)
   const capabilities=await get('/api/native-auth/capabilities');assert.equal(capabilities.body.own_operations_available,true);assert.equal(capabilities.body.config_writes_enabled,false);assert.equal(capabilities.body.run_submission_enabled,false)
   const denied=await readOnly(f,async()=>{const r=await fetch(origin+'/api/v2/own-todos',{method:'POST',headers:{Origin:origin,Cookie:cookies.alice}});return {status:r.status,body:await r.json()}})
   assert.deepEqual(denied,{status:405,body:{error:'method_not_allowed'}})
   assert.deepEqual(await get('/api/v2/own-todos',''),{status:401,body:{error:'session_required'}})
   assert.equal((await get('/api/v2/own-todos',cookies.alice,{Authorization:'Bearer forged'})).status,401)
   assert.equal((await get('/api/v2/own-todos?owner_user_id='+s.bob)).status,400)
   assert.equal((await get('/api/v2/own-todos?category=failed&category=paused')).status,400)
   await f.db.query('UPDATE agentstudio_auth.accounts SET enabled=false WHERE user_id=$1',[s.alice])
   assert.equal((await get('/api/v2/own-overview')).status,401);await assert.rejects(readOnly(f,()=>repo.overview(f.identities.alice)),e=>e.status===401)
   assert.equal((await get('/api/v2/own-overview',cookies.bob)).status,200)
   await f.db.query('UPDATE agentstudio_auth.accounts SET enabled=true,governance_revision=governance_revision+2 WHERE user_id=$1',[s.alice])
  })
  await t.test('real catalog dependency drift refuses409 without publishing zero counts',async()=>{
   await f.db.exec('REVOKE EXECUTE ON FUNCTION agentstudio.agent_memory_outcome_epoch() FROM agentstudio_api')
   try{await assert.rejects(inspectOwnOperationsSchema(f.pool,true),unavailable);await assert.rejects(readOnly(f,()=>repo.overview(f.identities.bob)),unavailable);assert.deepEqual(await nativeRead('/api/v2/own-overview'),{status:409,body:{error:'own_overview_unavailable'}})}finally{await f.db.exec('GRANT EXECUTE ON FUNCTION agentstudio.agent_memory_outcome_epoch() TO agentstudio_api')}
   await f.db.exec('ALTER TABLE agentstudio.schedules NO FORCE ROW LEVEL SECURITY')
   try{await assert.rejects(inspectOwnOperationsSchema(f.pool,true),unavailable);await assert.rejects(readOnly(f,()=>repo.todos(f.identities.bob)),unavailable);assert.deepEqual(await nativeRead('/api/v2/own-todos'),{status:409,body:{error:'own_overview_unavailable'}})}finally{await f.db.exec('ALTER TABLE agentstudio.schedules FORCE ROW LEVEL SECURITY')}
   await f.db.exec('REVOKE SELECT ON agentstudio.schedules FROM agentstudio_api')
   try{await assert.rejects(inspectOwnOperationsSchema(f.pool,true),unavailable);assert.deepEqual(await nativeRead('/api/v2/own-overview'),{status:409,body:{error:'own_overview_unavailable'}})}finally{await f.db.exec('GRANT SELECT ON agentstudio.schedules TO agentstudio_api')}
  })
  await t.test('independent real account disable waits on the guard lock; later reads refuse after its commit',async()=>{
   let reached,release;const hit=new Promise(resolve=>{reached=resolve}),gate=new Promise(resolve=>{release=resolve})
   const guarded={knowledgeSharing:true,async connect(){const db=await f.pool.connect();return {release:()=>db.release(),async query(sql,args=[]){const reply=await db.query(sql,args);if(sql==='SELECT agentstudio.agent_memory_outcome_epoch() AS epoch'){reached();await gate}return reply}}}}
   const admin=new pg.Pool({...target,max:1,application_name:'synthetic-own-disable'});let disabling,reading,disabler
   async function bounded(p){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('own_real_lock_timeout')),7000)})])}finally{clearTimeout(timer)}}
   try{
    reading=readOnly(f,()=>new OwnOperationsRepository(guarded).overview(f.identities.bob));reading.catch(()=>{})
    await bounded(hit)
    disabler=await admin.connect();await disabler.query('BEGIN')
    disabling=disabler.query('UPDATE agentstudio_auth.accounts SET enabled=false WHERE user_id=$1',[s.bob]);disabling.catch(()=>{})
    let blocked=false
    for(let n=0;n<80;n++){const rows=(await f.db.query("SELECT wait_event_type FROM pg_catalog.pg_stat_activity WHERE application_name='synthetic-own-disable' AND state='active'")).rows;if(rows.some(r=>r.wait_event_type==='Lock')){blocked=true;break};await delay(25)}
    assert.equal(blocked,true,'a separate actual UPDATE must wait for the actual epoch FOR SHARE lock')
    release();assert.equal((await bounded(reading)).counts.awaiting_approval,1);await bounded(disabling);await disabler.query('COMMIT')
    await assert.rejects(readOnly(f,()=>repo.overview(f.identities.bob)),e=>e.status===401&&e.code==='session_required')
   }finally{
    release();await Promise.allSettled([reading,disabling].filter(Boolean));if(disabler){await disabler.query('ROLLBACK').catch(()=>{});disabler.release()};await admin.end()
    await f.db.query('UPDATE agentstudio_auth.accounts SET enabled=true,governance_revision=governance_revision+2 WHERE user_id=$1',[s.bob])
   }
  })
 }finally{
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
  if(authPool)await authPool.end()
  try{await f.db.exec('DROP TRIGGER IF EXISTS own_fixture_no_audit ON agentstudio.audit_events; DROP FUNCTION IF EXISTS agentstudio.own_fixture_no_audit()')}finally{await f.close()}
 }
})
