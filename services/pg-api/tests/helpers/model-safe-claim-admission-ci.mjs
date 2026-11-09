// Import-safe hosted-only fixture. Builtins and the unchanged shared guard are
// the only static imports. No driver, Worker, fixture or SQL executes on import.
import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {workerHeartbeatCiAdminOptions} from './worker-heartbeat-ci-guard.mjs'

export const modelSafeScopeStages=Object.freeze([
 'knowledge_sharing_enabled','knowledge_embedding_settings_enabled','knowledge_embedding_consent_enabled',
 'knowledge_index_runtime_enabled','knowledge_query_runtime_enabled','knowledge_tool_runtime_enabled',
].map(name=>'scope:'+name))
export const modelSafeCounts=worker=>{const s=worker.claimAdmissionSnapshot();return [s.closed,s.pending,s.uncertain]}
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}
export async function modelSafeBounded(promise,label,ms=12000){
 let timer
 try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('model_safe_ci_timeout_'+label)),ms)})])}
 finally{clearTimeout(timer)}
}
export function modelSafeClaimPassword(runId,purpose='claim'){
 if(typeof runId!=='string'||!/^\d{1,32}$/.test(runId))throw Error('invalid_model_safe_ci_run_id')
 if(!['claim','owned'].includes(purpose))throw Error('invalid_model_safe_ci_password_purpose')
 // The original verifier requires exactly80hex; never weaken its policy.
 return createHash('sha512').update('disposable_model_safe_'+purpose+':'+runId).digest('hex').slice(0,80)
}
const quote=value=>'"'+value.replaceAll('"','""')+'"'

export async function modelSafeClaimTcpFixture(capability){
 // Real capability identity, not a cloned plan, BEFORE all dynamic imports.
 const target=workerHeartbeatCiAdminOptions(capability,'main')
 const {default:pg}=await import('pg')
 const admin=new pg.Pool({...target,max:3}),extraPools=[],liveClients=new Set(),errorHandled=new WeakSet()
 let fixture,baseline,providerCalls=0
 const createdLogins=[]
 const login='model_safe_claim_ci_'+process.env.GITHUB_RUN_ID
 const ownedLogin='model_safe_owned_ci_'+process.env.GITHUB_RUN_ID
 assert.match(login,/^model_safe_claim_ci_[0-9]{1,32}$/)
 assert.match(ownedLogin,/^model_safe_owned_ci_[0-9]{1,32}$/)
 const password=modelSafeClaimPassword(process.env.GITHUB_RUN_ID)
 const ownedPassword=modelSafeClaimPassword(process.env.GITHUB_RUN_ID,'owned')
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
  assert.deepEqual(empty,{schemas:0,roles:1,relations:0},'model-safe matrix requires its OWN fresh service, never the dormant/prepare/telemetry service')
  const {descriptivePatchFixture}=await import('./agent-descriptive-patch-fixture.mjs')
  fixture=await descriptivePatchFixture() // Genuine original001..060, once.
  await identity()
  const [{AgentModelWorker},{WorkflowSafeWorker},{WorkflowRepository},{WorkflowSafeRunRepository},{makeNativeScramVerifier}]=await Promise.all([
   import('../../src/model-worker.ts'),import('../../src/workflow-safe-worker.ts'),import('../../src/workflow-repository.ts'),
   import('../../src/workflow-safe-run-repository.ts'),import('../../src/native-activation-cli.mjs'),
  ])
  const sql=name=>readFileSync(new URL('../../../../db/postgres/'+name,import.meta.url),'utf8')
  const claimSql=Object.freeze({model:sql('006_claim_agent_model.sql'),safe:sql('007_claim_workflow_safe.sql')})
  const finishSql=sql('003_finish_job.sql')
  const stageFlags=async()=>(await admin.query("SELECT rolname,rolcanlogin FROM pg_catalog.pg_roles WHERE rolname IN('agentstudio_stage_login','agentstudio_stage_worker') ORDER BY rolname")).rows
  const originalStageFlags=await stageFlags()
  assert.equal(originalStageFlags.length,2)
  assert.equal(originalStageFlags.find(row=>row.rolname==='agentstudio_stage_worker').rolcanlogin,false,'original stage Worker must remain NOLOGIN')
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
   }catch(error){await installer.query('ROLLBACK').catch(()=>{});throw Error('model_safe_ci_synthetic_login_setup_failed')}
   finally{installer.release()}
  }
  const runtimePool=new pg.Pool({...target,user:login,password,max:2,application_name:'model_safe_claim_minimal_ci'})
  extraPools.push(runtimePool)
  // The genuine fresh/Native installation leaves the original stage LOGIN
  // disabled. Never reactivate it. A separate disposable owned-test LOGIN has
  // only the original worker+API SET authority needed by held business paths.
  const ownedPool=new pg.Pool({...target,user:ownedLogin,password:ownedPassword,max:2,application_name:'model_safe_owned_ci'})
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
  const provider=Object.freeze({async generate(){providerCalls++;throw Error('unexpected_model_provider_execution')}})
  const worker=(lane,pool,name)=>lane==='model'?new AgentModelWorker(pool,name,provider):new WorkflowSafeWorker(pool,name)
  const flows=new WorkflowRepository(fixture.pool),safeRuns=new WorkflowSafeRunRepository(fixture.pool)
  const assertEmpty=async lane=>{
   const row=(await admin.query("SELECT count(*)::integer AS n FROM agentstudio.jobs j JOIN agentstudio.runs r ON r.id=j.run_id AND r.owner_user_id=j.owner_user_id JOIN agentstudio.users u ON u.id=j.owner_user_id WHERE j.kind=$1 AND j.payload->>'phase'=$2 AND u.status='active' AND r.status=ANY($3::text[]) AND j.attempts<j.max_attempts AND ((j.status='queued' AND j.scheduled_at<=clock_timestamp()) OR (j.status='leased' AND j.lease_until<=clock_timestamp())) AND NOT EXISTS(SELECT 1 FROM agentstudio.external_effects x WHERE x.run_id=j.run_id AND x.owner_user_id=j.owner_user_id AND x.status IN('started','unknown'))",[lane==='model'?'run_tick':'workflow_tick',lane==='model'?'model':'workflow_safe_v1',lane==='model'?['queued']:['queued','running']])).rows[0]
   assert.equal(row.n,0,'refuse a fixture with an unexpected eligible '+lane+' job')
  }
  const seed=async(lane,label,{malformed=false}={})=>{
   await identity();await assertEmpty(lane)
   const owner=fixture.users.alice
   if(lane==='safe'){
    const node=(id,type)=>({id,type,data:{title:id},position:{x:id==='start'?0:100,y:0}})
    const graph={nodes:[node('start','start'),node('end','end')],edges:[{id:'start-end',source:'start',target:'end'}]}
    const flow=await flows.create(fixture.identities.alice,'Synthetic claim '+label,graph)
    const result=await safeRuns.submit(fixture.identities.alice,flow.id,{expected_revision:Number(flow.revision),idempotency_key:'claim_'+randomUUID()})
    const job=(await admin.query("SELECT id FROM agentstudio.jobs WHERE run_id=$1 AND owner_user_id=$2 AND kind='workflow_tick' AND payload->>'phase'='workflow_safe_v1'",[result.run.id,owner])).rows
    assert.equal(job.length,1)
    if(malformed)await admin.query("UPDATE agentstudio.jobs SET payload=payload-'graph_sha256' WHERE id=$1 AND owner_user_id=$2 AND status='queued'",[job[0].id,owner])
    return {lane,owner,flow:flow.id,run:result.run.id,job:job[0].id}
   }
   const spec=fixture.resources.alice.spec.id
   const revision=(await admin.query('SELECT revision::text FROM agentstudio.agent_specs WHERE id=$1 AND owner_user_id=$2',[spec,owner])).rows[0].revision
   const db=await admin.connect()
   try{
    await db.query('BEGIN')
    const run=(await db.query("INSERT INTO agentstudio.runs(owner_user_id,kind,agent_spec_id,status,instruction,checkpoint) VALUES($1,'agent',$2,'queued',$3,$4::jsonb) RETURNING id",[owner,spec,'Synthetic model claim '+label,JSON.stringify({spec_revision:revision})])).rows[0]
    const job=(await db.query("INSERT INTO agentstudio.jobs(owner_user_id,run_id,kind,dedupe_key,status,payload,scheduled_at,max_attempts) VALUES($1,$2,'run_tick',$3,'queued',$4::jsonb,clock_timestamp()-interval '1 second',3) RETURNING id",[owner,run.id,'model-safe-ci-'+randomUUID(),JSON.stringify({phase:'model',spec_revision:malformed?'synthetic_invalid_revision':revision})])).rows[0]
    // Synthetic employee approval only; no automatic model path is invoked.
    await db.query("INSERT INTO agentstudio.approvals(owner_user_id,run_id,step_key,requested_by,decided_by,status,decided_at) VALUES($1,$2,'model',$1,$1,'approved',clock_timestamp())",[owner,run.id])
    await db.query('COMMIT');return {lane,owner,spec,run:run.id,job:job.id}
   }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error}finally{db.release()}
  }
  const state=async s=>(await admin.query('SELECT status,attempts,lease_owner,lease_token::text,lease_version::text,lease_until,payload FROM agentstudio.jobs WHERE id=$1 AND owner_user_id=$2',[s.job,s.owner])).rows[0]
  const cleanupSeed=async s=>{
   if(!s)return
   await identity()
   // Only this scenario's synthetic rows, AFTER assertions. Never recovery
   // evidence, audit deletion, a schema reset, or mutation of real data.
   await admin.query("UPDATE agentstudio.jobs SET status='cancelled',lease_owner=NULL,lease_token=NULL,lease_until=NULL WHERE id=$1 AND owner_user_id=$2 AND status IN('queued','leased')",[s.job,s.owner])
   await admin.query("UPDATE agentstudio.runs SET status='cancelled' WHERE id=$1 AND owner_user_id=$2 AND status IN('queued','running')",[s.run,s.owner])
  }
  const locked=async s=>{
   const db=await admin.connect()
   try{await db.query('BEGIN');await assert.rejects(db.query('SELECT id FROM agentstudio.jobs WHERE id=$1 FOR UPDATE NOWAIT',[s.job]),e=>e.code==='55P03')}
   finally{await db.query('ROLLBACK').catch(()=>{});db.release()}
  }
  const unlocked=async s=>{
   const db=await admin.connect()
   try{await db.query('BEGIN');assert.equal((await db.query('SELECT id FROM agentstudio.jobs WHERE id=$1 FOR UPDATE NOWAIT',[s.job])).rows.length,1)}
   finally{await db.query('ROLLBACK').catch(()=>{});db.release()}
  }
  const activity=async pid=>(await admin.query('SELECT state,backend_xid IS NOT NULL AS xid,usename::text AS login FROM pg_catalog.pg_stat_activity WHERE pid=$1',[pid])).rows[0]
  const waitDisconnected=async(pid,s,expected)=>{
   const until=Date.now()+10000
   while(Date.now()<until){
    const gone=(await admin.query('SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE pid=$1) AS gone',[pid])).rows[0].gone,row=await state(s)
    if(gone&&row.status===expected&&row.attempts===(expected==='queued'?0:1))return row
    await new Promise(done=>setTimeout(done,25))
   }
   throw Error('model_safe_ci_server_disconnect_outcome_not_observed')
  }
  const probe=(lane,options={})=>{
   const base=options.owned?ownedPool:runtimePool,expected=options.owned?ownedLogin:login
   const gates=new Map((options.holds??[]).map(name=>[name,{hit:deferred(),gate:deferred(),used:false}]))
   const trace=[],owned=new Set(),pid=deferred(),lost=Error('model_safe_ci_delivery_lost_after_real_sql'),faults=new Set()
   const label=sql=>sql===claimSql[lane]?'claim':sql.startsWith("SELECT set_config('agentstudio.")?'scope:'+sql.split("'")[1].slice('agentstudio.'.length):sql
   const pause=async(name,value)=>{const g=gates.get(name);if(g&&!g.used){g.used=true;g.hit.resolve(value);await g.gate.promise}}
   const socketClose=async client=>{
    const stream=client.connection.stream
    if(!stream.closed)await new Promise(done=>{stream.once('close',done);stream.destroy()})
   }
   const pool=new Proxy(base,{get(target,key){
    if(key!=='connect'){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}
    return async()=>{
     const db=await target.connect();owned.add(db);liveClients.add(db)
     if(!errorHandled.has(db)){db.on('error',()=>{});errorHandled.add(db)}
     try{pid.resolve((await verifyRuntime(db,expected)).pid);await pause('connect',db)}
     catch(error){owned.delete(db);liveClients.delete(db);db.release(true);throw error}
     return new Proxy(db,{get(client,key){
      if(key==='release')return(...args)=>{owned.delete(client);liveClients.delete(client);return client.release(client.connection.stream.destroyed?true:args[0])}
      if(key!=='query'){const value=Reflect.get(client,key,client);return typeof value==='function'?value.bind(client):value}
      return(sql,values)=>{
       const record={sql,values,settled:false};trace.push(record)
       // Submit the original SQL on the actual LOGIN synchronously. No await
       // before send and no fabricated pg.Result, row, command or ACK.
       const request=client.query(sql,values)
       return Promise.resolve(request).then(async result=>{
        record.settled=true;record.result=result
        const name=label(sql);await pause(name,result)
        if(options.disconnectAt===name&&!faults.has('socket')){faults.add('socket');await socketClose(client);throw lost}
        const drop=name==='COMMIT'&&options.loseCommitAck||name==='claim'&&options.loseClaimAck||name==='ROLLBACK'&&options.loseRollbackAck
        if(drop&&!faults.has(name)){faults.add(name);throw lost}
        return result // Exactly the original successful pg result object.
       },error=>{record.rejected=true;record.error_code=error.code;throw error})
      }
     }})
    }
   }})
   return {pool,trace,pid:pid.promise,lost,hit:name=>{assert.ok(gates.has(name),name);return modelSafeBounded(gates.get(name).hit.promise,name)},
    release:name=>{assert.ok(gates.has(name),name);gates.get(name).gate.resolve()},
    releaseAll(){for(const g of gates.values())g.gate.resolve()},
    async settle(work){this.releaseAll();if(work)try{await modelSafeBounded(work.catch(()=>{}),'case_cleanup',5000)}catch{for(const db of owned)db.connection.stream.destroy();await modelSafeBounded(work.catch(()=>{}),'case_destroy',5000)}},
   }
  }
  return {admin,fixture,login,ownedLogin,runtimePool,ownedPool,claimSql,finishSql,verifyRuntime,full,worker,assertEmpty,seed,state,cleanupSeed,locked,unlocked,activity,waitDisconnected,probe,providerCalls:()=>providerCalls,
   async close(){
    for(const db of liveClients)db.connection.stream.destroy()
    const errors=(await Promise.allSettled(extraPools.map(p=>p.end()))).filter(x=>x.status==='rejected')
    try{await identity();for(const name of [...createdLogins].reverse())await admin.query('DROP ROLE '+quote(name))}
    finally{try{await fixture.close()}finally{await admin.end()}}
    if(errors.length)throw Error('model_safe_ci_runtime_pool_cleanup_failed')
   }}
 }catch(error){
  for(const db of liveClients)db.connection.stream.destroy()
  await Promise.allSettled(extraPools.map(p=>p.end()))
  for(const name of [...createdLogins].reverse())await admin.query('DROP ROLE '+quote(name)).catch(()=>{})
  await fixture?.close().catch(()=>{});await admin.end();throw error
 }
}
