// Hosted disposable prepare-only testing. Import-safe: Node builtins and the
// unchanged pure CI guard only. No driver/runtime/fixture is imported here.
import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {workerHeartbeatCiAdminOptions} from './worker-heartbeat-ci-guard.mjs'

export const prepareScopeStages=Object.freeze([
 'knowledge_sharing_enabled','knowledge_embedding_settings_enabled','knowledge_embedding_consent_enabled',
 'knowledge_index_runtime_enabled','knowledge_query_runtime_enabled','knowledge_tool_runtime_enabled',
].map(s=>'scope:'+s))
export const prepareCounts=w=>{const s=w.claimAdmissionSnapshot();return [s.closed,s.pending,s.uncertain]}
export function prepareDeferred(){let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}
export async function prepareBounded(promise,label,ms=12000){
 let timer
 try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('prepare_ci_timeout_'+label)),ms)})])}
 finally{clearTimeout(timer)}
}
const quote=s=>'"'+s.replaceAll('"','""')+'"'

export async function prepareClaimTcpFixture(capability){
 // Reject a forged/cloned plan BEFORE importing pg, business code or fixtures.
 const target=workerHeartbeatCiAdminOptions(capability,'main')
 const {default:pg}=await import('pg')
 const admin=new pg.Pool({...target,max:2}),extraPools=[],liveClients=new Set()
 let fixture,createdLogin=false,baseline
 const login='prepare_claim_ci_'+process.env.GITHUB_RUN_ID,ownedLogin='prepare_owned_ci_'+process.env.GITHUB_RUN_ID
 assert.match(login,/^prepare_claim_ci_[0-9]{1,32}$/)
 const password=createHash('sha512').update('disposable_prepare_claim:'+process.env.GITHUB_RUN_ID).digest('hex').slice(0,80)
 const ownedPassword=createHash('sha512').update('disposable_prepare_owned:'+process.env.GITHUB_RUN_ID).digest('hex').slice(0,80)
 const identity=async()=>{
  const row=(await admin.query("SELECT current_database() AS database,session_user AS login,current_setting('server_version_num')::integer AS version,(SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=session_user) AS superuser,(SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()) AS database_oid,(SELECT system_identifier::text FROM pg_catalog.pg_control_system()) AS system_identifier")).rows[0]
  assert.equal(row.database,'agentstudio_pg18_ci');assert.equal(row.login,'agentstudio_admin');assert.equal(row.superuser,true)
  assert.ok(row.version>=180000&&row.version<190000)
  assert.match(row.database_oid,/^[1-9][0-9]*$/);assert.match(row.system_identifier,/^[1-9][0-9]*$/)
  if(baseline){assert.equal(row.database_oid,baseline.database_oid);assert.equal(row.system_identifier,baseline.system_identifier)}
  return row
 }
 try{
  baseline=await identity()
  const empty=(await admin.query("SELECT (SELECT count(*)::integer FROM pg_catalog.pg_namespace WHERE nspname IN('agentstudio','agentstudio_auth')) AS schemas,(SELECT count(*)::integer FROM pg_catalog.pg_roles WHERE starts_with(rolname,'agentstudio_')) AS roles,(SELECT count(*)::integer FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE NOT starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema') AS relations")).rows[0]
  assert.deepEqual(empty,{schemas:0,roles:1,relations:0},'prepare matrix requires its OWN fresh service; never reuse the telemetry case')
  const {descriptivePatchFixture}=await import('./agent-descriptive-patch-fixture.mjs')
  fixture=await descriptivePatchFixture() // Genuine unchanged001..060, exactly once.
  await identity()
  const {AgentPrepareWorker}=await import('../../src/agent-worker.ts')
  const claimSql=readFileSync(new URL('../../../../db/postgres/005_claim_agent_prepare.sql',import.meta.url),'utf8')
  const finishSql=readFileSync(new URL('../../../../db/postgres/003_finish_job.sql',import.meta.url),'utf8')
  const full=async()=>{
   await fixture.h.withActor(fixture.pool,fixture.identities.alice,async db=>{
    assert.equal(await fixture.h.verifyAgentDescriptivePatchCredentials(db),true)
   })
   const old=(await admin.query("SELECT rolname::text AS name,rolcanlogin AS login FROM pg_catalog.pg_roles WHERE rolname IN('agentstudio_stage_login','agentstudio_stage_worker') ORDER BY rolname")).rows
   assert.deepEqual(old,[{name:'agentstudio_stage_login',login:false},{name:'agentstudio_stage_worker',login:false}])
  }
  await full()
  const {makeNativeScramVerifier}=await import('../../src/native-activation-cli.mjs')
  const loginInstaller=await admin.connect()
  // Password is deterministic synthetic run-ID material; never emitted or read
  // from a file. Fixed safe identifier and hex password, not caller SQL text.
  try{
   await loginInstaller.query("BEGIN; SET LOCAL password_encryption='scram-sha-256'")
   await loginInstaller.query('CREATE ROLE '+quote(login)+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 2 PASSWORD '"+makeNativeScramVerifier(password)+"'")
   await loginInstaller.query('GRANT agentstudio_worker TO '+quote(login)+' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE')
   await loginInstaller.query('CREATE ROLE '+quote(ownedLogin)+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 2 PASSWORD '"+makeNativeScramVerifier(ownedPassword)+"'")
   for(const role of ['agentstudio_api','agentstudio_worker'])await loginInstaller.query('GRANT '+role+' TO '+quote(ownedLogin)+' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE')
   await loginInstaller.query('COMMIT');createdLogin=true
  }catch(error){await loginInstaller.query('ROLLBACK').catch(()=>{});throw Error('prepare_ci_synthetic_login_setup_failed')}
  finally{loginInstaller.release()}
  const runtimePool=new pg.Pool({...target,user:login,password,max:2,application_name:'prepare_claim_minimal_ci'})
  extraPools.push(runtimePool)
  // The original fresh installer intentionally leaves both old stage roles
  // NOLOGIN. A separate disposable login exercises held prepare's existing
  // worker-to-owner API transition; the minimal claim login still has no API.
  const ownedPool=new pg.Pool({...target,user:ownedLogin,password:ownedPassword,max:2,application_name:'prepare_held_synthetic_ci'})
  extraPools.push(ownedPool)
  const verifyRuntime=async(db,expected=login)=>{
   const r=(await db.query("SELECT session_user::text AS login,current_user::text AS role,pg_backend_pid()::integer AS pid,r.rolsuper AS superuser,r.rolbypassrls AS bypass,r.rolinherit AS inherits,r.rolcanlogin AS can_login,r.rolcreatedb AS create_db,r.rolcreaterole AS create_role,r.rolreplication AS replication,r.rolconnlimit AS connection_limit,ARRAY(SELECT p.rolname::text FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles p ON p.oid=m.roleid WHERE m.member=r.oid ORDER BY p.rolname) AS parents FROM pg_catalog.pg_roles r WHERE r.rolname=session_user")).rows[0]
   assert.equal(r.login,expected);assert.equal(r.role,expected);assert.notEqual(r.login,'agentstudio_admin')
   for(const key of ['superuser','bypass','inherits','create_db','create_role','replication'])assert.equal(r[key],false,key)
   assert.equal(r.can_login,true);assert.ok(Number.isInteger(r.pid)&&r.pid>0)
   const expectedParents=expected===login?['agentstudio_worker']:['agentstudio_api','agentstudio_worker']
   assert.deepEqual(r.parents,expectedParents);assert.equal(r.connection_limit,2)
   const memberships=(await db.query("SELECT p.rolname::text AS role,m.admin_option AS admin,m.inherit_option AS inherit,m.set_option AS set FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles p ON p.oid=m.roleid WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=session_user) ORDER BY p.rolname")).rows
   assert.deepEqual(memberships,expectedParents.map(role=>({role,admin:false,inherit:false,set:true})))
   return r
  }
  await full() // Old FULL must coexist with the new narrow LOGIN.
  const seed=async label=>{
   await identity()
   const owner=fixture.users.alice,spec=fixture.resources.alice.spec.id
   const revision=(await admin.query('SELECT revision::text AS revision FROM agentstudio.agent_specs WHERE id=$1 AND owner_user_id=$2',[spec,owner])).rows[0].revision
   const db=await admin.connect()
   try{
    await db.query('BEGIN')
    const run=(await db.query("INSERT INTO agentstudio.runs(owner_user_id,kind,agent_spec_id,status,instruction) VALUES($1,'agent',$2,'queued',$3) RETURNING id",[owner,spec,'Synthetic prepare CI '+label])).rows[0]
    const job=(await db.query("INSERT INTO agentstudio.jobs(owner_user_id,run_id,kind,dedupe_key,status,payload,scheduled_at,max_attempts) VALUES($1,$2,'run_tick',$3,'queued',$4::jsonb,clock_timestamp()-interval '1 second',3) RETURNING id",[owner,run.id,'prepare-ci-'+randomUUID(),JSON.stringify({phase:'prepare',spec_revision:revision})])).rows[0]
    await db.query('COMMIT');return {owner,spec,run:run.id,job:job.id}
   }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e}finally{db.release()}
  }
  const state=async s=>(await admin.query('SELECT status,attempts,lease_owner,lease_token::text,lease_version::text,lease_until FROM agentstudio.jobs WHERE id=$1 AND owner_user_id=$2',[s.job,s.owner])).rows[0]
  const cleanupSeed=async s=>{
   if(!s)return
   await identity()
   // Disposal only AFTER assertions; never used as rollback/recovery evidence.
   // Keep immutable audit rows. No DELETE, cascade or schema reset.
   await admin.query("UPDATE agentstudio.jobs SET status='cancelled',lease_owner=NULL,lease_token=NULL,lease_until=NULL WHERE id=$1 AND owner_user_id=$2 AND status IN('queued','leased')",[s.job,s.owner])
   await admin.query("UPDATE agentstudio.runs SET status='cancelled' WHERE id=$1 AND owner_user_id=$2 AND status='queued'",[s.run,s.owner])
  }
  const locked=async s=>{
   const db=await admin.connect()
   try{await db.query('BEGIN');await assert.rejects(db.query('SELECT id FROM agentstudio.jobs WHERE id=$1 FOR UPDATE NOWAIT',[s.job]),e=>e.code==='55P03')}
   finally{await db.query('ROLLBACK').catch(()=>{});db.release()}
  }
  const waitDisconnected=async(pid,s)=>{
   const until=Date.now()+10000
   while(Date.now()<until){
    const gone=(await admin.query('SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE pid=$1) AS gone',[pid])).rows[0].gone
    const row=await state(s)
    if(gone&&row.status==='queued'&&row.attempts===0)return row
    await new Promise(done=>setTimeout(done,25))
   }
   throw Error('prepare_ci_server_rollback_not_observed')
  }
  const probe=(options={})=>{
   const base=options.owned?ownedPool:runtimePool,expected=options.owned?ownedLogin:login
   const gates=new Map((options.holds??[]).map(name=>[name,{hit:prepareDeferred(),gate:prepareDeferred(),used:false}]))
   const trace=[],owned=new Set(),pid=prepareDeferred(),lost=Error('prepare_ci_delivery_lost_after_real_sql')
   const label=sql=>sql===claimSql?'claim':sql.startsWith("SELECT set_config('agentstudio.")?'scope:'+sql.split("'")[1].slice('agentstudio.'.length):sql
   const pause=async(name,value)=>{const g=gates.get(name);if(g&&!g.used){g.used=true;g.hit.resolve(value);await g.gate.promise}}
   const pool=new Proxy(base,{get(target,key){
    if(key!=='connect'){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}
    return async()=>{
     const db=await target.connect();owned.add(db);liveClients.add(db)
     db.on('error',()=>{}) // Expected socket-destruction case, no error suppression of queries.
     try{pid.resolve((await verifyRuntime(db,expected)).pid);await pause('connect',db)}catch(error){owned.delete(db);liveClients.delete(db);db.release(true);throw error}
     return new Proxy(db,{get(client,key){
      if(key==='release')return(...args)=>{owned.delete(client);liveClients.delete(client);return client.release(...args)}
      if(key!=='query'){const value=Reflect.get(client,key,client);return typeof value==='function'?value.bind(client):value}
      return(sql,values)=>{
       const record={sql,settled:false};trace.push(record)
       // Submit to the ACTUAL held pg client synchronously before any await.
       const request=client.query(sql,values)
       return Promise.resolve(request).then(async result=>{
        record.settled=true;record.result=result
        const name=label(sql);await pause(name,result)
        if(name==='COMMIT'&&options.loseCommitAck)throw lost
        if(name==='claim'&&options.disconnectAfterClaim){
         const stream=client.connection.stream
         await new Promise(done=>{if(stream.destroyed)return done();stream.once('close',done);stream.destroy()})
         throw lost
        }
        if(name==='claim'&&options.loseClaimAck)throw lost
        return result // Original pg.Result/Result[], no cloning or fake rows.
       })
      }
     }})
    }
   }})
   return {pool,trace,pid:pid.promise,lost,hit:name=>prepareBounded(gates.get(name).hit.promise,name),
    release:name=>gates.get(name).gate.resolve(),releaseAll(){for(const g of gates.values())g.gate.resolve()},
    async settle(work){this.releaseAll();if(work)try{await prepareBounded(work.catch(()=>{}),'case_cleanup',5000)}catch{for(const db of owned)db.connection.stream.destroy();await prepareBounded(work.catch(()=>{}),'case_destroy',5000)}},
   }
  }
  return {AgentPrepareWorker,admin,fixture,runtimePool,ownedPool,login,claimSql,finishSql,verifyRuntime,full,seed,state,cleanupSeed,locked,waitDisconnected,probe,
   async close(){
    for(const db of liveClients)db.connection.stream.destroy()
    const errors=(await Promise.allSettled(extraPools.map(p=>p.end()))).filter(x=>x.status==='rejected')
    try{await identity();if(createdLogin)for(const name of [ownedLogin,login])await admin.query('DROP ROLE '+quote(name))}
    finally{try{await fixture.close()}finally{await admin.end()}}
    if(errors.length)throw Error('prepare_ci_runtime_pool_cleanup_failed')
   }}
 }catch(error){
  for(const db of liveClients)db.connection.stream.destroy()
  await Promise.allSettled(extraPools.map(p=>p.end()))
  if(createdLogin)for(const name of [ownedLogin,login])await admin.query('DROP ROLE '+quote(name)).catch(()=>{})
  await fixture?.close().catch(()=>{});await admin.end();throw error
 }
}
