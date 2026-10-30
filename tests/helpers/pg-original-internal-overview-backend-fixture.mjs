import {requireOriginalOverviewBrowserCi} from './pg-original-internal-overview-browser-guard.mjs'
// Hosted-only synthetic setup; importing this module performs no effects.
export async function originalOverviewBackendFixture(env=process.env){
 const permit=requireOriginalOverviewBrowserCi(env) // Before every dynamic import.
 const [{default:assert},{createHash},{originalLoginHome071GenuineFixture}]=await Promise.all([import('node:assert/strict'),import('node:crypto'),import('../../services/pg-api/tests/helpers/original-login-home071-genuine-fixture.mjs')])
 const f=await originalLoginHome071GenuineFixture(env)
 let closed=false,dependencyRevoked=false
 const dependency=async enabled=>{
  assert.equal(typeof enabled,'boolean')
  if(enabled===!dependencyRevoked)return
  await f.db.exec(enabled?'GRANT EXECUTE ON FUNCTION agentstudio.agent_memory_outcome_epoch() TO agentstudio_api':'REVOKE EXECUTE ON FUNCTION agentstudio.agent_memory_outcome_epoch() FROM agentstudio_api')
  dependencyRevoked=!enabled
 }
 const close=async()=>{if(closed)return;closed=true;let failure;try{await dependency(true)}catch(error){failure=error}try{await f.close()}catch(error){failure??=error}if(failure)throw failure}
 try{
  const predecessor=f.browserHomeProfile
  assert.equal(predecessor.head,permit.head);assert.equal(predecessor.profile,permit.predecessor);assert.equal(predecessor.optional070_verified,true);assert.equal(predecessor.optional071_verified,true);assert.equal(predecessor.own_operations_schema_verified,true);assert.equal(predecessor.monitor073_installed,false)
  // Original App AdminGate is preserved. Promote only synthetic Bob using the
  // real original Native employee-management endpoint and real Alice Cookie.
  const employees=await f.request('alice','/api/native-auth/employees');assert.equal(employees.status,200)
  const bob=employees.body.items.find(r=>r.id===f.users.bob);assert.ok(bob)
  const {randomUUID}=await import('node:crypto')
  const promoted=await f.request('alice','/api/native-auth/employees/change',{request_id:randomUUID(),target_id:bob.id,expected_revision:bob.revision,is_admin:true,enabled:true,share_enabled:bob.share_enabled??true,confirm:true});assert.equal(promoted.status,200)
  await f.login('bob');assert.equal((await f.profileFor('bob')).is_admin,true)
  const id=n=>'58000000-0000-4000-8000-'+String(n).padStart(12,'0'),sentinel='overviewPrivateNeverExpose',ownerRuns={alice:[],bob:[]},ownerSchedules={alice:[],bob:[]}
  const anchor=(await f.db.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS stamp")).rows[0].stamp
  for(const [who,n]of [['alice',900],['bob',901]])await f.db.query('INSERT INTO agentstudio.workflows(id,owner_user_id,name,graph) VALUES($1,$2,$3,$4::jsonb)',[id(n),f.users[who],'CURRENT_WORKFLOW_NAME_'+who,JSON.stringify({private:sentinel})])
  async function run(n,who,status,{workflow=false,mode=null,age='1 day'}={}){
   await f.db.query(`INSERT INTO agentstudio.runs(id,owner_user_id,kind,agent_spec_id,workflow_id,status,instruction,result_text,checkpoint,created_at,updated_at,finished_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8::jsonb,$9::timestamptz-$10::interval,$9::timestamptz-($10::interval/2)+$11::integer*interval '1 millisecond',CASE WHEN $6 IN('failed','succeeded','cancelled') THEN $9::timestamptz ELSE NULL END)`,[id(n),f.users[who],workflow?'workflow':'agent',workflow?null:f.resources[who].spec.id,workflow?id(who==='alice'?900:901):null,status,sentinel,JSON.stringify({private:sentinel,...(mode===null?{}:{execution_mode:mode})}),anchor,age,n])
   ownerRuns[who].push(id(n))
  }
  for(let n=1;n<=18;n++)await run(n,'alice','awaiting_approval',{age:'2 days'})
  await run(101,'alice','awaiting_approval',{workflow:true,mode:'future_workflow',age:'2 hours'})
  await run(102,'alice','running',{workflow:true,age:'3 hours'})
  await run(103,'alice','failed',{workflow:true,age:'4 hours'})
  await run(104,'alice','awaiting_input',{workflow:true,mode:'workflow_native_v2',age:'5 hours'})
  await run(201,'alice','running',{age:'1 hour'});await run(202,'alice','paused',{age:'6 hours'});await run(203,'alice','failed',{age:'7 hours'});await run(204,'alice','failed',{age:'10 days'});await run(205,'alice','queued',{age:'8 hours'})
  await run(301,'bob','awaiting_approval',{age:'30 minutes'});await run(302,'bob','running',{workflow:true,age:'40 minutes'})
  async function effect(n,who,step,status,age){await f.db.query('INSERT INTO agentstudio.external_effects(run_id,owner_user_id,step_key,tool_name,arguments_sha256,idempotency_key,status,result_reference,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$4,$8::timestamptz-$9::interval)',[id(n),f.users[who],step,sentinel,'a'.repeat(64),'overview-fixture-'+n+'-'+step,status,anchor,age])}
  await effect(201,'alice','alpha','unknown','1 hour');await effect(201,'alice','beta','unknown','1 hour');await effect(102,'alice','old-started','started','30 minutes');await effect(201,'alice','fresh','started','1 minute');await effect(201,'alice','finished','succeeded','1 hour');await effect(301,'bob','bob-only','unknown','1 hour')
  async function schedule(n,who,age,{enabled=true,deleted=false}={}){await f.db.query(`INSERT INTO agentstudio.schedules(id,owner_user_id,kind,agent_spec_id,name,recurrence,time_zone,next_at,enabled,deleted_at) VALUES($1,$2,'agent',$3,$4,'{}','UTC',$5::timestamptz-$6::interval,$7,CASE WHEN $8 THEN $5::timestamptz ELSE NULL END)`,[id(n),f.users[who],f.resources[who].spec.id,'Synthetic '+who+' schedule '+n,anchor,age,enabled,deleted]);ownerSchedules[who].push(id(n))}
  await schedule(801,'alice','1 hour');await schedule(802,'alice','2 hours');await schedule(803,'alice','-1 day');await schedule(804,'alice','1 day',{enabled:false});await schedule(805,'alice','1 day',{deleted:true});await schedule(806,'bob','-1 day')
  await f.db.query("INSERT INTO agentstudio.knowledge_bases(id,owner_user_id,name) VALUES($1,$2,'Synthetic Alice KB'),($3,$4,'Synthetic Bob KB one'),($5,$4,'Synthetic Bob KB two')",[id(951),f.users.alice,id(952),f.users.bob,id(953)])
  await f.db.query("INSERT INTO agentstudio.knowledge_access(base_id,owner_user_id,recipient_user_id,access_role) VALUES($1,$2,$3,'viewer')",[id(952),f.users.bob,f.users.alice])
  const expected={alice:{running:2,awaiting_approval:19,failed_7d:2,paused:1,schedules_active:3,schedules_overdue:2,knowledge_bases:1,writes_need_review:3},bob:{running:1,awaiting_approval:1,failed_7d:0,paused:0,schedules_active:1,schedules_overdue:0,knowledge_bases:2,writes_need_review:1}}
  const assertWire=async who=>{const response=await f.raw('/api/v2/original-ui/internal-overview',{who,headers:{'X-AgentStudio-Expected-Employee':f.users[who]}});assert.equal(response.status,200);assert.equal(response.body.employee_id,f.users[who]);assert.deepEqual(response.body.counters,expected[who]);assert.ok(!JSON.stringify(response.body).includes(sentinel));return response.body}
  await assertWire('alice');await assertWire('bob')
  const businessSnapshot=async()=>{
   const tables=(await f.db.query("SELECT n.nspname,c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND c.relkind='r' ORDER BY n.nspname,c.relname")).rows,result={}
   for(const {nspname,relname}of tables){assert.match(relname,/^[a-z_0-9]+$/);const rows=(await f.db.query(`SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb) AS rows FROM ${nspname}.${relname} r`)).rows[0].rows;result[nspname+'.'+relname]={rows:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')}}
   return result
  }
  const assertRestored=async()=>{assert.equal(dependencyRevoked,false);assert.equal((await f.db.query("SELECT has_function_privilege('agentstudio_api','agentstudio.agent_memory_outcome_epoch()','EXECUTE') AS allowed")).rows[0].allowed,true);assert.equal(await f.inspect(),'installed');assert.equal(await f.inspectCatalog(),'installed')}
  return {...f,expected,ownerRuns,ownerSchedules,privateSentinel:sentinel,businessSnapshot,assertWire,setDependencyAvailable:dependency,assertRestored,
   browserOverviewProfile:Object.freeze({format:'agentstudio.original-personal-overview.fixture.v1',profile:permit.profile,story:permit.story,head:permit.head,predecessor,synthetic_bob_admin_via_actual_api:true,seeded_personal_rows:true,company_CT03_used:false,Native_server_process_entry_verified:false,production_GO:false}),close}
 }catch(error){try{await close()}catch(cleanup){throw new AggregateError([error,cleanup],'original_overview_backend_start_cleanup_failed')}throw error}
}
