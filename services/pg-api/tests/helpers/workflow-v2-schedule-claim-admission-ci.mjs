// Import-safe hosted-only fixture. Builtins and the unchanged shared guard are
// the only static imports. No driver, Worker, fixture or SQL executes on import.
import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {workerHeartbeatCiAdminOptions} from './worker-heartbeat-ci-guard.mjs'

export const v2ScheduleScopeStages=Object.freeze([
 'knowledge_sharing_enabled','knowledge_embedding_settings_enabled','knowledge_embedding_consent_enabled',
 'knowledge_index_runtime_enabled','knowledge_query_runtime_enabled','knowledge_tool_runtime_enabled',
].map(name=>'scope:'+name))
export const v2ScheduleCounts=worker=>{const s=worker.claimAdmissionSnapshot();return [s.closed,s.pending,s.uncertain]}
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}
export async function v2ScheduleBounded(promise,label,ms=12000){
 let timer
 try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('v2_schedule_ci_timeout_'+label)),ms)})])}
 finally{clearTimeout(timer)}
}
export function v2ScheduleClaimPassword(runId,purpose='claim'){
 if(typeof runId!=='string'||!/^\d{1,32}$/.test(runId))throw Error('invalid_v2_schedule_ci_run_id')
 if(!['claim','owned'].includes(purpose))throw Error('invalid_v2_schedule_ci_password_purpose')
 // The original verifier requires exactly80hex; never weaken its policy.
 return createHash('sha512').update('disposable_v2_schedule_'+purpose+':'+runId).digest('hex').slice(0,80)
}
const quote=value=>'"'+value.replaceAll('"','""')+'"'

export async function v2ScheduleClaimTcpFixture(capability){
 // Real capability identity, not a cloned plan, BEFORE all dynamic imports.
 const target=workerHeartbeatCiAdminOptions(capability,'main')
 const {default:pg}=await import('pg')
 const admin=new pg.Pool({...target,max:3}),extraPools=[],liveClients=new Set(),errorHandled=new WeakSet()
 let fixture,baseline
 const createdLogins=[]
 const login='v2_schedule_claim_ci_'+process.env.GITHUB_RUN_ID
 const ownedLogin='v2_schedule_owned_ci_'+process.env.GITHUB_RUN_ID
 assert.match(login,/^v2_schedule_claim_ci_[0-9]{1,32}$/)
 assert.match(ownedLogin,/^v2_schedule_owned_ci_[0-9]{1,32}$/)
 const password=v2ScheduleClaimPassword(process.env.GITHUB_RUN_ID)
 const ownedPassword=v2ScheduleClaimPassword(process.env.GITHUB_RUN_ID,'owned')
 assert.notEqual(password,ownedPassword)
 const identity=async()=>{
  const row=(await admin.query("SELECT current_database() AS database,session_user::text AS login,current_setting('server_version_num')::integer AS version,(SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=session_user) AS superuser,(SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()) AS database_oid,(SELECT system_identifier::text FROM pg_catalog.pg_control_system()) AS system_identifier")).rows[0]
  assert.equal(row.database,'agentstudio_pg18_ci');assert.equal(row.login,'agentstudio_admin');assert.equal(row.superuser,true)
  assert.ok(row.version>=180000&&row.version<190000)
  assert.match(row.database_oid,/^[1-9][0-9]*$/);assert.match(row.system_identifier,/^[1-9][0-9]*$/)
  if(baseline){assert.equal(row.database_oid,baseline.database_oid);assert.equal(row.system_identifier,baseline.system_identifier)}
  return row
 }
 try{
  baseline=await identity()
  const empty=(await admin.query("SELECT (SELECT count(*)::integer FROM pg_catalog.pg_namespace WHERE nspname IN('agentstudio','agentstudio_auth')) AS schemas,(SELECT count(*)::integer FROM pg_catalog.pg_roles WHERE starts_with(rolname,'agentstudio_')) AS roles,(SELECT count(*)::integer FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE NOT starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema') AS relations")).rows[0]
  assert.deepEqual(empty,{schemas:0,roles:1,relations:0},'v2-schedule matrix requires its OWN fresh service, never the dormant/prepare/telemetry service')
  const {descriptivePatchFixture}=await import('./agent-descriptive-patch-fixture.mjs')
  fixture=await descriptivePatchFixture() // Genuine original001..060, once.
  await identity()
  const [{WorkflowV2Worker},{ScheduleRuntimeWorker},{WorkflowRepository},{WorkflowV2RunRepository},{AutonomousAgentRunRepository},
   {ScheduleDraftRepository},{ScheduleRuntimeRepository},{SCHEDULE_BACKGROUND_ACK},{applyKnowledgeScope},{makeNativeScramVerifier}]=await Promise.all([
   import('../../src/workflow-v2-worker.ts'),import('../../src/schedule-runtime-worker.ts'),import('../../src/workflow-repository.ts'),
   import('../../src/workflow-v2-run-repository.ts'),import('../../src/autonomous-agent-run-repository.ts'),
   import('../../src/schedule-draft-repository.ts'),import('../../src/schedule-runtime-repository.ts'),
   import('../../src/schedule-runtime-contract.ts'),import('../../src/knowledge-scope-policy.ts'),import('../../src/native-activation-cli.mjs'),
  ])
  const sql=name=>readFileSync(new URL('../../../../db/postgres/'+name,import.meta.url),'utf8')
  const claimSql=Object.freeze({workflow_native_v2:sql('008_claim_workflow_v2.sql'),agent_native_v2:sql('009_claim_autonomous_agent.sql')})
  const finishSql=sql('003_finish_job.sql')
  const stageFlags=async()=>(await admin.query("SELECT rolname,rolcanlogin FROM pg_catalog.pg_roles WHERE rolname IN('agentstudio_stage_login','agentstudio_stage_worker') ORDER BY rolname")).rows
  const originalStageFlags=await stageFlags()
  assert.equal(originalStageFlags.length,2)
  assert.deepEqual(originalStageFlags,[{rolname:'agentstudio_stage_login',rolcanlogin:false},{rolname:'agentstudio_stage_worker',rolcanlogin:false}],'both old stage logins must remain disabled')
  const full=async()=>{
   await fixture.h.withActor(fixture.pool,fixture.identities.alice,async db=>{
    assert.equal(await fixture.h.verifyAgentDescriptivePatchCredentials(db),true)
   })
   assert.deepEqual(await stageFlags(),originalStageFlags,'never reactivate or otherwise change original stage LOGIN flags')
  }
  await full()
  for(const [name,secret,roles]of [[login,password,'agentstudio_worker'],[ownedLogin,ownedPassword,'agentstudio_worker,agentstudio_api']]){
   const installer=await admin.connect()
   try{
    await installer.query('BEGIN')
    await installer.query("SET LOCAL password_encryption='scram-sha-256'")
    await installer.query('CREATE ROLE '+quote(name)+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 2 PASSWORD '"+makeNativeScramVerifier(secret)+"'")
    await installer.query('GRANT '+roles+' TO '+quote(name)+' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE')
    await installer.query('COMMIT');createdLogins.push(name)
   }catch(error){await installer.query('ROLLBACK').catch(()=>{});throw Error('v2_schedule_ci_synthetic_login_setup_failed')}
   finally{installer.release()}
  }
  const runtimePool=new pg.Pool({...target,user:login,password,max:2,application_name:'v2_schedule_claim_minimal_ci'})
  extraPools.push(runtimePool)
  // The genuine fresh/Native installation leaves the original stage LOGIN
  // disabled. Never reactivate it. A separate disposable owned-test LOGIN has
  // only the original worker+API SET authority needed by held business paths.
  const ownedPool=new pg.Pool({...target,user:ownedLogin,password:ownedPassword,max:2,application_name:'v2_schedule_owned_ci'})
  extraPools.push(ownedPool)
  const verifyRuntime=async(db,expected=login)=>{
   const r=(await db.query("SELECT session_user::text AS login,current_user::text AS role,pg_backend_pid()::integer AS pid,r.rolsuper AS superuser,r.rolbypassrls AS bypass,r.rolinherit AS inherits,r.rolcanlogin AS can_login,r.rolcreatedb AS create_db,r.rolcreaterole AS create_role,r.rolreplication AS replication,r.rolconnlimit AS connection_limit,r.rolconfig IS NULL AS no_config,ARRAY(SELECT p.rolname::text FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles p ON p.oid=m.roleid WHERE m.member=r.oid ORDER BY p.rolname) AS parents,(SELECT bool_and(NOT m.admin_option AND NOT m.inherit_option AND m.set_option) FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid) AS minimal_membership_options FROM pg_catalog.pg_roles r WHERE r.rolname=session_user")).rows[0]
   assert.equal(r.login,expected);assert.equal(r.role,expected);assert.notEqual(r.login,'agentstudio_admin')
   for(const key of ['superuser','bypass','inherits','create_db','create_role','replication'])assert.equal(r[key],false,key)
   assert.equal(r.can_login,true);assert.equal(r.no_config,true);assert.ok(Number.isSafeInteger(r.pid)&&r.pid>0)
   assert.deepEqual(r.parents,expected===login?['agentstudio_worker']:['agentstudio_api','agentstudio_worker'])
   assert.ok([login,ownedLogin].includes(expected));assert.equal(r.connection_limit,2);assert.equal(r.minimal_membership_options,true)
   return r
  }
  await full()
  const worker=(mode,pool,name)=>new WorkflowV2Worker(pool,name,{executionMode:mode})
  const scheduler=(pool,name)=>new ScheduleRuntimeWorker(pool,name)
  const flows=new WorkflowRepository(fixture.pool),runs=new WorkflowV2RunRepository(fixture.pool),agents=new AutonomousAgentRunRepository(fixture.pool)
  const drafts=new ScheduleDraftRepository(fixture.pool),schedules=new ScheduleRuntimeRepository(fixture.pool,{enabled:true})
  const graph=()=>({version:2,nodes:[{id:'start',type:'start',data:{title:'Start'},position:{x:0,y:0}},
   {id:'end',type:'end',data:{title:'End',output_template:'{{start.output}}'},position:{x:100,y:0}}],edges:[{id:'start-end',source:'start',target:'end'}]})
  const assertEmpty=async mode=>{
   assert.ok(['workflow_native_v2','agent_native_v2'].includes(mode))
   const row=(await admin.query("SELECT count(*)::integer AS n FROM agentstudio.jobs j JOIN agentstudio.runs r ON r.id=j.run_id AND r.owner_user_id=j.owner_user_id JOIN agentstudio.users u ON u.id=j.owner_user_id WHERE j.kind=$1 AND j.payload->>'phase'=$2 AND u.status='active' AND r.status IN('queued','running') AND j.attempts<j.max_attempts AND ((j.status='queued' AND j.scheduled_at<=clock_timestamp()) OR (j.status='leased' AND j.lease_until<=clock_timestamp())) AND NOT EXISTS(SELECT 1 FROM agentstudio.external_effects x WHERE x.run_id=j.run_id AND x.owner_user_id=j.owner_user_id AND x.status IN('started','unknown'))",[mode==='agent_native_v2'?'run_tick':'workflow_tick',mode])).rows[0]
   assert.equal(row.n,0,'unexpected eligible '+mode+' synthetic job')
  }
  const seed=async(mode,label,{malformed=false}={})=>{
   await identity();await assertEmpty(mode)
   const owner=fixture.users.alice,who=fixture.identities.alice
   let result,target
   if(mode==='workflow_native_v2'){
    target=await flows.create(who,'Synthetic V2 claim '+label,graph())
    result=await runs.submit(who,target.id,{expected_revision:Number(target.revision),idempotency_key:'v2_claim_'+randomUUID(),instruction:'Synthetic deterministic V2 '+label})
   }else{
    target=fixture.resources.alice.spec
    result=await agents.submit(who,target.id,{expected_revision:Number(target.revision),idempotency_key:'agent_claim_'+randomUUID(),instruction:'Synthetic claim only '+label,max_steps:1})
   }
   const rows=(await admin.query("SELECT id FROM agentstudio.jobs WHERE run_id=$1 AND owner_user_id=$2 AND payload->>'phase'=$3",[result.run.id,owner,mode])).rows
   assert.equal(rows.length,1)
   if(malformed)await admin.query("UPDATE agentstudio.jobs SET payload=payload-'graph_sha256' WHERE id=$1 AND owner_user_id=$2 AND status='queued'",[rows[0].id,owner])
   return {mode,owner,target:target.id,run:result.run.id,job:rows[0].id}
  }
  const state=async item=>(await admin.query('SELECT status,attempts,lease_owner,lease_token::text,lease_version::text,lease_until,payload FROM agentstudio.jobs WHERE id=$1 AND owner_user_id=$2',[item.job,item.owner])).rows[0]
  const cleanupSeed=async item=>{
   if(!item)return
   await identity()
   // Post-assertion disposal of this case's synthetic rows only. Not recovery.
   await admin.query("UPDATE agentstudio.jobs SET status='cancelled',lease_owner=NULL,lease_token=NULL,lease_until=NULL WHERE id=$1 AND owner_user_id=$2 AND status IN('queued','leased')",[item.job,item.owner])
   await admin.query("UPDATE agentstudio.runs SET status='cancelled' WHERE id=$1 AND owner_user_id=$2 AND status IN('queued','running')",[item.run,item.owner])
  }
  const assertNoDue=async()=>{
   const row=(await admin.query("SELECT (SELECT count(*)::integer FROM agentstudio.schedule_occurrences WHERE attempts<4 AND status IN('pending','retryable') AND coalesce(next_retry_at,'-infinity')<=clock_timestamp() OR status='launching' AND lease_until<clock_timestamp())+(SELECT count(*)::integer FROM agentstudio.schedules WHERE enabled AND deleted_at IS NULL AND recurrence->>'config_format' IN('pg_schedule_execution_v2','pg_schedule_execution_v3') AND next_at<=clock_timestamp()) AS n")).rows[0]
   assert.equal(row.n,0,'unexpected due schedule/occurrence from a previous case')
  }
  const seedSchedule=async label=>{
   await identity();await assertNoDue()
   const who=fixture.identities.alice,owner=fixture.users.alice
   const flow=await flows.create(who,'Synthetic scheduled V2 '+label,graph())
   const draft=await drafts.create(who,{name:'Synthetic due '+label,kind:'workflow',target_id:flow.id,time_zone:'UTC',rule:{kind:'interval',interval_minutes:15}})
   const activation=await schedules.activate(who,draft.id,{expected_revision:Number(draft.revision),expected_target_revision:Number(flow.revision),
    instruction:'Synthetic schedule launch '+label,max_steps:1,anchor_at:new Date().toISOString(),expires_at:null,max_occurrences:1,max_auto_effects:1,
    background_ack:SCHEDULE_BACKGROUND_ACK,knowledge_charge_ack:null,request_id:randomUUID()})
   const queued=await schedules.runNow(who,draft.id,Number(activation.revision))
   assert.equal(queued.queued,true)
   return {owner,schedule:draft.id,occurrence:queued.occurrence_id,planned:queued.run_id,flow:flow.id}
  }
  const scheduleState=async item=>(await admin.query("SELECT o.id,o.status,o.attempts,o.lease_owner,o.lease_token::text,o.lease_version::text,o.run_id,o.planned_run_id,o.scheduled_for,o.error_code,(SELECT count(*)::integer FROM agentstudio.schedule_execution_origins x WHERE x.occurrence_id=o.id AND x.owner_user_id=o.owner_user_id) AS origins,(SELECT count(*)::integer FROM agentstudio.runs r WHERE r.id=o.planned_run_id AND r.owner_user_id=o.owner_user_id) AS runs,(SELECT count(*)::integer FROM agentstudio.jobs j WHERE j.run_id=o.planned_run_id AND j.owner_user_id=o.owner_user_id) AS jobs FROM agentstudio.schedule_occurrences o WHERE o.id=$1 AND o.schedule_id=$2 AND o.owner_user_id=$3",[item.occurrence,item.schedule,item.owner])).rows[0]
  const disposedSchedules=new Set()
  const cleanupSchedule=async item=>{
   if(!item||disposedSchedules.has(item.schedule))return
   await identity()
   const row=(await admin.query('SELECT revision FROM agentstudio.schedules WHERE id=$1 AND owner_user_id=$2',[item.schedule,item.owner])).rows[0]
   assert.equal(await schedules.control(fixture.identities.alice,item.schedule,Number(row.revision),'pause'),true)
   await admin.query("UPDATE agentstudio.jobs SET status='cancelled',lease_owner=NULL,lease_token=NULL,lease_until=NULL WHERE run_id=$1 AND owner_user_id=$2 AND status IN('queued','leased')",[item.planned,item.owner])
   await admin.query("UPDATE agentstudio.runs SET status='cancelled' WHERE id=$1 AND owner_user_id=$2 AND status IN('queued','running')",[item.planned,item.owner])
   disposedSchedules.add(item.schedule)
  }
  const rowLock=async(table,id,expected)=>{
   assert.ok(['jobs','schedule_occurrences'].includes(table))
   const db=await admin.connect()
   try{await db.query('BEGIN');const operation=()=>db.query('SELECT id FROM agentstudio.'+table+' WHERE id=$1 FOR UPDATE NOWAIT',[id])
    if(expected)await assert.rejects(operation(),error=>error.code==='55P03');else assert.equal((await operation()).rows.length,1)
   }finally{await db.query('ROLLBACK').catch(()=>{});db.release()}
  }
  const activity=async pid=>(await admin.query('SELECT state,backend_xid IS NOT NULL AS xid,usename::text AS login FROM pg_catalog.pg_stat_activity WHERE pid=$1',[pid])).rows[0]
  const waitDisconnected=async(pid,readState,expected)=>{
   const until=Date.now()+10000
   while(Date.now()<until){
    const gone=(await admin.query('SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE pid=$1) AS gone',[pid])).rows[0].gone,row=await readState()
    if(gone&&row.status===expected&&row.attempts===(expected==='queued'||expected==='pending'?0:1))return row
    await new Promise(done=>setTimeout(done,25))
   }
   throw Error('v2_schedule_ci_server_disconnect_outcome_not_observed')
  }
  const reserveOwned=async(item,workerId)=>{
   const db=await runtimePool.connect()
   try{
    await verifyRuntime(db);await db.query('BEGIN');await applyKnowledgeScope(db,runtimePool);await db.query('SET LOCAL ROLE agentstudio_worker')
    const row=(await admin.query('SELECT revision,next_at FROM agentstudio.schedules WHERE id=$1 AND owner_user_id=$2',[item.schedule,item.owner])).rows[0]
    const occurrence=await scheduleState(item)
    const result=await db.query('SELECT agentstudio.schedule_reserve($1::uuid,$2::bigint,$3::timestamptz,$4::timestamptz,$5::text) AS claim',[item.schedule,Number(row.revision),occurrence.scheduled_for,row.next_at,workerId])
    assert.ok(result.rows[0]?.claim);await db.query('COMMIT');return result.rows[0].claim
   }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error}finally{db.release()}
  }
  const probe=(mode,options={})=>{
   assert.ok(['workflow_native_v2','agent_native_v2','schedule'].includes(mode))
   const base=options.owned?ownedPool:runtimePool,expected=options.owned?ownedLogin:login
   const gates=new Map((options.holds??[]).map(name=>[name,{hit:deferred(),gate:deferred(),used:false}]))
   const trace=[],owned=new Set(),pids=[],pid=deferred(),faults=new Set(),lost=Error('v2_schedule_ci_delivery_lost_after_real_sql')
   let connections=0
   const label=sql=>{
    if(sql===claimSql[mode])return 'claim'
    if(sql.startsWith("SELECT set_config('agentstudio."))return 'scope:'+sql.split("'")[1].slice('agentstudio.'.length)
    if(sql.startsWith('SELECT j.* FROM agentstudio.jobs j '))return 'reconcile'
    for(const name of ['peek','reserve','launch_context','register_origin','launch_failed'])if(sql.startsWith('SELECT agentstudio.schedule_'+name+'('))return name
    if(sql.startsWith('INSERT INTO agentstudio.runs '))return 'admit_run'
    return sql
   }
   const pause=async(name,value)=>{const gate=gates.get(name);if(gate&&!gate.used){gate.used=true;gate.hit.resolve(value);await gate.gate.promise}}
   const socketClose=async client=>{const stream=client.connection.stream;if(!stream.closed)await new Promise(done=>{stream.once('close',done);stream.destroy()})}
   const pool=new Proxy(base,{get(target,key){
    if(key!=='connect'){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}
    return async()=>{
     const db=await target.connect(),number=++connections;owned.add(db);liveClients.add(db)
     if(!errorHandled.has(db)){db.on('error',()=>{});errorHandled.add(db)}
     try{const observed=await verifyRuntime(db,expected);pids[number-1]=observed.pid;pid.resolve(observed.pid);await pause('connect',db);await pause('connect:'+number,db)}
     catch(error){owned.delete(db);liveClients.delete(db);db.release(true);throw error}
     return new Proxy(db,{get(client,key){
      if(key==='release')return(...args)=>{owned.delete(client);liveClients.delete(client);return client.release(client.connection.stream.destroyed?true:args[0])}
      if(key!=='query'){const value=Reflect.get(client,key,client);return typeof value==='function'?value.bind(client):value}
      return(sql,values)=>{
       const name=label(sql),record={sql,values,name,connection:number,settled:false};trace.push(record)
       // The original SQL is synchronously submitted on the actual held LOGIN
       // before any barrier. Original pg.Result/Result[] is never cloned/faked.
       let request
       try{request=client.query(sql,values)}catch(error){record.rejected=true;record.error_code=error.code;throw error}
       return Promise.resolve(request).then(async result=>{
        record.settled=true;record.result=result;await pause(name,result);await pause(name+':'+number,result)
        if((options.disconnectAt===name||options.disconnectAt===name+':'+number)&&!faults.has('socket')){faults.add('socket');await socketClose(client);throw lost}
        const dropped=(options.loseAckAt??[]).find(key=>(key===name||key===name+':'+number)&&!faults.has(key))
        if(dropped){faults.add(dropped);throw lost}
        return result
       },error=>{record.rejected=true;record.error_code=error.code;throw error})
      }
     }})
    }
   }})
   return {pool,trace,pids,pid:pid.promise,lost,connections:()=>connections,hit:name=>{assert.ok(gates.has(name),name);return v2ScheduleBounded(gates.get(name).hit.promise,name)},
    release:name=>{assert.ok(gates.has(name),name);gates.get(name).gate.resolve()},releaseAll(){for(const gate of gates.values())gate.gate.resolve()},
    async settle(work){this.releaseAll();if(work)try{await v2ScheduleBounded(work.catch(()=>{}),'case_cleanup',5000)}catch{for(const db of owned)db.connection.stream.destroy();await v2ScheduleBounded(work.catch(()=>{}),'case_destroy',5000)}},
   }
  }
  return {admin,fixture,login,ownedLogin,runtimePool,ownedPool,claimSql,finishSql,verifyRuntime,full,worker,scheduler,assertEmpty,seed,state,cleanupSeed,
   assertNoDue,seedSchedule,scheduleState,cleanupSchedule,rowLock,activity,waitDisconnected,reserveOwned,probe,
   async close(){
    for(const db of liveClients)db.connection.stream.destroy()
    const errors=(await Promise.allSettled(extraPools.map(p=>p.end()))).filter(x=>x.status==='rejected')
    try{await identity();for(const name of [...createdLogins].reverse())await admin.query('DROP ROLE '+quote(name))}
    finally{try{await fixture.close()}finally{await admin.end()}}
    if(errors.length)throw Error('v2_schedule_ci_runtime_pool_cleanup_failed')
   }}
 }catch(error){
  for(const db of liveClients)db.connection.stream.destroy()
  await Promise.allSettled(extraPools.map(p=>p.end()))
  for(const name of [...createdLogins].reverse())await admin.query('DROP ROLE '+quote(name)).catch(()=>{})
  await fixture?.close().catch(()=>{});await admin.end();throw error
 }
}
