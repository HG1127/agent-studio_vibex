// Hosted-only, import-safe. Static imports are builtins and the unchanged gate.
// No DB driver, fixture, Worker, provider or SQL is executed on module import.
import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {workerHeartbeatCiAdminOptions} from './worker-heartbeat-ci-guard.mjs'

export const knowledgeAssessmentLanes=Object.freeze(['index','query','assessment'])
export const knowledgeAssessmentCounts=worker=>{const s=worker.claimAdmissionSnapshot();return [s.closed,s.pending,s.uncertain]}
export const knowledgeAssessmentRoles=Object.freeze({index:'agentstudio_knowledge_index_worker',query:'agentstudio_knowledge_index_worker',assessment:'agentstudio_review_worker'})
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}
const digest=value=>createHash('sha256').update(value).digest('hex')
const quote=value=>'"'+value.replaceAll('"','""')+'"'
export async function knowledgeAssessmentBounded(promise,label,ms=15000){
 let timer
 try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('knowledge_assessment_ci_timeout_'+label)),ms)})])}
 finally{clearTimeout(timer)}
}
export function knowledgeAssessmentPassword(runId,lane){
 if(typeof runId!=='string'||!/^\d{1,32}$/.test(runId)||!knowledgeAssessmentLanes.includes(lane))throw Error('invalid_knowledge_assessment_ci_password_input')
 return createHash('sha512').update('disposable_knowledge_assessment_claim:'+lane+':'+runId).digest('hex').slice(0,80)
}
export const knowledgeAssessmentClaimSql=Object.freeze({
 index:'SELECT agentstudio.knowledge_index_claim($1::uuid) AS value',
 query:'SELECT agentstudio.knowledge_query_claim($1::uuid) AS value',
 assessment:'SELECT agentstudio.agent_assessment_claim($1::uuid) AS value',
})
const knowledgePrelude=lane=>[
 'connect','BEGIN','SET LOCAL ROLE agentstudio_knowledge_index_worker',"SET LOCAL lock_timeout='3s'","SET LOCAL statement_timeout='5s'",
 ...(lane==='index'?["SELECT set_config('agentstudio.knowledge_index_runtime_enabled','true',true)"]:[
  "SELECT set_config('agentstudio.knowledge_index_runtime_enabled','false',true)",
  "SELECT set_config('agentstudio.knowledge_sharing_enabled',$1::text,true)",
  "SELECT set_config('agentstudio.knowledge_query_runtime_enabled','true',true)",
  "SELECT set_config('agentstudio.knowledge_tool_runtime_enabled',$1::text,true)",
 ]),
]

export async function knowledgeAssessmentTcpFixture(capability){
 // Reject forged/cloned capability before importing any DB/business code.
 const target=workerHeartbeatCiAdminOptions(capability,'main')
 const {default:pg}=await import('pg')
 const admin=new pg.Pool({...target,max:3}),pools=[],created=[],live=new Set(),errorHandled=new WeakSet()
 const logins={},runtimePools={},callbacks={index:0,query:0,assessment:0}
 let fixture,baseline,auditPrelude
 const identity=async()=>{
  const row=(await admin.query("SELECT current_database() AS database,session_user::text AS login,current_setting('server_version_num')::integer AS version,(SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=session_user) AS superuser,(SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()) AS database_oid,(SELECT system_identifier::text FROM pg_catalog.pg_control_system()) AS system_identifier")).rows[0]
  assert.equal(row.database,'agentstudio_pg18_ci');assert.equal(row.login,'agentstudio_admin');assert.equal(row.superuser,true)
  assert.ok(row.version>=180000&&row.version<190000);assert.match(row.database_oid,/^[1-9][0-9]*$/);assert.match(row.system_identifier,/^[1-9][0-9]*$/)
  if(baseline){assert.equal(row.database_oid,baseline.database_oid);assert.equal(row.system_identifier,baseline.system_identifier)}
  return row
 }
 try{
  baseline=await identity()
  const empty=(await admin.query("SELECT (SELECT count(*)::integer FROM pg_catalog.pg_namespace WHERE nspname IN('agentstudio','agentstudio_auth')) AS schemas,(SELECT count(*)::integer FROM pg_catalog.pg_roles WHERE starts_with(rolname,'agentstudio_')) AS roles,(SELECT count(*)::integer FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE NOT starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema') AS relations")).rows[0]
  assert.deepEqual(empty,{schemas:0,roles:1,relations:0},'knowledge-assessment requires its OWN fresh service, never another matrix member DB')
  const {descriptivePatchFixture}=await import('./agent-descriptive-patch-fixture.mjs')
  fixture=await descriptivePatchFixture() // Genuine original001..060 exactly once.
  await identity()
  const [{KnowledgeIndexWorker},{KnowledgeQueryWorker},{AgentAssessmentWorker},contract,{makeNativeScramVerifier},assessmentFixture]=await Promise.all([
   import('../../src/knowledge-index-worker.ts'),import('../../src/knowledge-query-worker.ts'),import('../../src/agent-assessment-worker.ts'),
   import('../../src/agent-assessment-contract.ts'),import('../../src/native-activation-cli.mjs'),import('./agent-assessment-fixture.mjs'),
  ])
  const stageFlags=async()=>(await admin.query("SELECT rolname,rolcanlogin FROM pg_catalog.pg_roles WHERE rolname IN('agentstudio_stage_login','agentstudio_stage_worker') ORDER BY rolname")).rows
  const originalStageFlags=await stageFlags();assert.equal(originalStageFlags.length,2)
  assert.equal(originalStageFlags.find(row=>row.rolname==='agentstudio_stage_worker').rolcanlogin,false)
  const full=async()=>{
   await fixture.h.withActor(fixture.pool,fixture.identities.alice,async db=>assert.equal(await fixture.h.verifyAgentDescriptivePatchCredentials(db),true))
   assert.deepEqual(await stageFlags(),originalStageFlags,'never activate or alter old stage LOGINs')
  }
  await full()
  for(const lane of knowledgeAssessmentLanes){
   const login='ka_'+lane+'_claim_ci_'+process.env.GITHUB_RUN_ID,password=knowledgeAssessmentPassword(process.env.GITHUB_RUN_ID,lane)
   assert.match(login,/^ka_(?:index|query|assessment)_claim_ci_[0-9]{1,32}$/)
   const db=await admin.connect()
   try{
    await db.query('BEGIN');await db.query("SET LOCAL password_encryption='scram-sha-256'")
    await db.query('CREATE ROLE '+quote(login)+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 2 PASSWORD '"+makeNativeScramVerifier(password)+"'")
    await db.query('GRANT '+knowledgeAssessmentRoles[lane]+' TO '+quote(login)+' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE')
    await db.query('COMMIT');created.push(login)
   }catch(error){await db.query('ROLLBACK').catch(()=>{});throw Error('knowledge_assessment_ci_login_setup_failed')}
   finally{db.release()}
   logins[lane]=login
   runtimePools[lane]=new pg.Pool({...target,user:login,password,max:2,application_name:'knowledge_assessment_'+lane+'_ci'})
   pools.push(runtimePools[lane])
  }
  const verifyRuntime=async(db,lane)=>{
   const r=(await db.query("SELECT session_user::text AS login,current_user::text AS role,pg_backend_pid()::integer AS pid,r.rolcanlogin AS can_login,r.rolinherit AS inherits,r.rolsuper AS superuser,r.rolbypassrls AS bypass,r.rolcreatedb AS create_db,r.rolcreaterole AS create_role,r.rolreplication AS replication,r.rolconnlimit AS connection_limit,r.rolconfig IS NULL AS no_config,ARRAY(SELECT p.rolname::text FROM pg_catalog.pg_roles p WHERE p.rolname<>session_user AND pg_has_role(session_user,p.oid,'MEMBER') ORDER BY p.rolname) AS reachable,ARRAY(SELECT p.rolname::text FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles p ON p.oid=m.roleid WHERE m.member=r.oid ORDER BY p.rolname) AS direct,(SELECT bool_and(NOT m.admin_option AND NOT m.inherit_option AND m.set_option) FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid) AS membership_options FROM pg_catalog.pg_roles r WHERE r.rolname=session_user")).rows[0]
   assert.equal(r.login,logins[lane]);assert.equal(r.role,logins[lane]);assert.notEqual(r.login,'agentstudio_admin')
   for(const key of ['inherits','superuser','bypass','create_db','create_role','replication'])assert.equal(r[key],false,key)
   assert.equal(r.can_login,true);assert.equal(r.no_config,true);assert.equal(r.connection_limit,2);assert.equal(r.membership_options,true)
   assert.deepEqual(r.direct,[knowledgeAssessmentRoles[lane]]);assert.deepEqual(r.reachable,[knowledgeAssessmentRoles[lane]])
   assert.ok(Number.isSafeInteger(r.pid)&&r.pid>0);return r
  }
  const assertEmpty=async lane=>{
   const sql=lane==='index'?"SELECT (SELECT count(*) FROM agentstudio.knowledge_embedding_queue)+(SELECT count(*) FROM agentstudio.knowledge_index_attempts) AS n":
    lane==='query'?"SELECT count(*) AS n FROM agentstudio.knowledge_query_jobs WHERE status IN('prepared','dispatched')":
    "SELECT count(*) AS n FROM agentstudio.agent_review_jobs WHERE state='pending'"
   assert.equal(Number((await admin.query(sql)).rows[0].n),0,'unexpected queue in '+lane+' lane')
  }
  for(const lane of knowledgeAssessmentLanes)await assertEmpty(lane)
  const worker=(lane,pool,dispatch)=>{
   const callback=async(...args)=>{callbacks[lane]++;if(dispatch)return dispatch(...args);throw Error('unexpected_knowledge_assessment_dispatch')}
   if(lane==='index')return new KnowledgeIndexWorker(pool,callback,{approvedForIsolatedUat:true})
   if(lane==='query')return new KnowledgeQueryWorker(pool,callback,{approvedForIsolatedUat:true})
   return new AgentAssessmentWorker(pool,randomUUID(),callback,{executionEnabled:true,executionApproval:contract.agentAssessmentApproval})
  }
  const contextSql="SELECT session_user::text AS login,current_user::text AS role,current_setting('lock_timeout') AS lock_timeout,current_setting('statement_timeout') AS statement_timeout,current_setting('agentstudio.knowledge_index_runtime_enabled',true) AS index_flag,current_setting('agentstudio.knowledge_query_runtime_enabled',true) AS query_flag,current_setting('agentstudio.knowledge_sharing_enabled',true) AS sharing_flag,current_setting('agentstudio.knowledge_tool_runtime_enabled',true) AS tool_flag"
  const verifyContext=(row,lane)=>{
   assert.equal(row.login,logins[lane]);assert.equal(row.role,knowledgeAssessmentRoles[lane]);assert.equal(row.lock_timeout,'3s');assert.equal(row.statement_timeout,'5s')
   if(lane==='index')assert.equal(row.index_flag,'true')
   if(lane==='query'){assert.equal(row.index_flag,'false');assert.equal(row.query_flag,'true');assert.equal(row.sharing_flag,'false');assert.equal(row.tool_flag,'false')}
  }
  const probe=(lane,options={})=>{
   const gates=new Map((options.holds??[]).map(name=>[name,{hit:deferred(),gate:deferred(),used:false}]))
   const trace=[],pid=deferred(),owned=new Set(),faults=new Set(),lost=Error('knowledge_assessment_ci_delivery_lost_after_real_sql')
   const pause=async(name,result)=>{const gate=gates.get(name);if(gate&&!gate.used){gate.used=true;gate.hit.resolve(result);await gate.gate.promise}}
   const pool=new Proxy(runtimePools[lane],{get(target,key){
    if(key==='knowledgeIndexRuntime')return lane==='index'
    if(key==='knowledgeQueryRuntime')return lane==='query'
    if(['knowledgeSharing','knowledgeToolRuntime'].includes(key))return false
    if(key!=='connect'){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}
    return async()=>{
     const db=await target.connect();owned.add(db);live.add(db)
     if(!errorHandled.has(db)){db.on('error',()=>{});errorHandled.add(db)}
     try{pid.resolve((await verifyRuntime(db,lane)).pid);await pause('connect',db)}
     catch(error){owned.delete(db);live.delete(db);db.release(true);throw error}
     let ordinal=0
     return new Proxy(db,{get(client,key){
      if(key==='release')return(...args)=>{owned.delete(client);live.delete(client);return client.release(client.connection.stream.destroyed?true:args[0])}
      if(key!=='query'){const value=Reflect.get(client,key,client);return typeof value==='function'?value.bind(client):value}
      return(sql,values)=>{
       const record={sql,values:values??[],ordinal:++ordinal,settled:false};trace.push(record)
       // Original query goes to the ACTUAL client synchronously before any
       // await. All barriers below hold delivery AFTER real SQL completion.
       const request=client.query(sql,values)
       return Promise.resolve(request).then(async result=>{
        record.settled=true;record.result=result
        let name=sql===knowledgeAssessmentClaimSql[lane]?'claim':sql.includes('agent_assessment_pause(')?'pause':sql
        if(lane==='assessment'&&auditPrelude){
         for(const [n,label]of [[1,'session_login'],[2,'session_reachable'],[3,'session_direct'],[auditPrelude.length-1,'full_audit_last']]){
          const expected=auditPrelude[n]
          if(record.ordinal===n+1&&sql===expected.sql&&JSON.stringify(record.values)===JSON.stringify(expected.values))name=label
         }
        }
        record.name=name
        if(name==='claim'||name==='pause'){
         // Independent real context SELECT after RPC success, while the saved
         // parser is waiting on delivery. It never precedes claim send.
         record.context=(await client.query(contextSql)).rows[0];verifyContext(record.context,lane)
        }
        await pause(name,result)
        if(options.disconnectAt===name&&!faults.has('socket')){
         faults.add('socket');const stream=client.connection.stream
         if(!stream.closed)await new Promise(done=>{stream.once('close',done);stream.destroy()})
         throw lost
        }
        const drop=name==='COMMIT'&&options.loseCommitAck||name==='claim'&&options.loseClaimAck||name==='ROLLBACK'&&options.loseRollbackAck
        if(drop&&!faults.has(name)){faults.add(name);throw lost}
        return result // Exact original pg.Result and JSON value, no fake rows.
       },error=>{record.rejected=true;record.error_code=error.code;throw error})
      }
     }})
    }
   }})
   return {pool,trace,pid:pid.promise,lost,
    hit:name=>{assert.ok(gates.has(name),name);return knowledgeAssessmentBounded(gates.get(name).hit.promise,name)},
    release:name=>{assert.ok(gates.has(name),name);gates.get(name).gate.resolve()},
    releaseAll(){for(const gate of gates.values())gate.gate.resolve()},
    async settle(work){this.releaseAll();if(work)try{await knowledgeAssessmentBounded(work.catch(()=>{}),'settle',5000)}catch{for(const db of owned)db.connection.stream.destroy();await knowledgeAssessmentBounded(work.catch(()=>{}),'destroy',5000)}},
   }
  }
  // Learn the real complete audited helper prelude by executing the actual
  // TS-private helper once with a no-op body. No audit function is replaced.
  // The final audit barrier matches its real last SQL+parameters+ordinal, so
  // closing there happens BEFORE the saved claim body reaches its final gate.
  const calibration=probe('assessment'),calibrator=worker('assessment',calibration.pool)
  assert.equal(await calibrator.worker(async()=>null),null)
  assert.equal(calibration.trace.at(-1).sql,'COMMIT');assert.equal(calibration.trace.at(-1).result.command,'COMMIT')
  auditPrelude=calibration.trace.slice(0,-1).map(({sql,values})=>({sql,values}))
  assert.ok(auditPrelude.length>10);assert.equal(auditPrelude[0].sql,'BEGIN')
  assert.ok(auditPrelude[1].sql.startsWith('SELECT rolcanlogin AS login'))
  assert.ok(auditPrelude[2].sql.startsWith('SELECT r.rolname AS name FROM pg_catalog.pg_roles'))
  assert.ok(auditPrelude[3].sql.startsWith('SELECT r.rolname AS name,m.admin_option AS admin'))
  calibrator.closeNewClaims();assert.deepEqual(knowledgeAssessmentCounts(calibrator),[true,0,0])
  await full()
  const stages=lane=>lane!=='assessment'?knowledgePrelude(lane):[
   'connect','BEGIN','session_login','session_reachable','session_direct','SET LOCAL ROLE agentstudio_review_worker',
   "SET LOCAL lock_timeout='3s'","SET LOCAL statement_timeout='5s'",'SELECT current_user AS role','full_audit_last',
  ]
  const image=async()=>{
   const tables=['knowledge_embedding_queue','knowledge_index_attempts','knowledge_index_attempt_chunks','knowledge_query_jobs','agent_review_requests','agent_review_jobs','agent_review_controls','agent_assessment_leases','agent_assessment_effects','agent_assessment_outcomes','agent_assessment_outputs','audit_events']
   const sql=tables.map(name=>"'"+name+"',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb) FROM agentstudio."+name+' r)').join(',')
   return digest(JSON.stringify((await admin.query('SELECT jsonb_build_object('+sql+') AS value')).rows[0].value))
  }
  const activity=async pid=>(await admin.query('SELECT usename::text AS login,state,backend_xid IS NOT NULL AS xid FROM pg_catalog.pg_stat_activity WHERE pid=$1',[pid])).rows[0]
  const gone=async pid=>{
   const until=Date.now()+10000
   while(Date.now()<until){if((await admin.query('SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE pid=$1) AS gone',[pid])).rows[0].gone)return;await new Promise(done=>setTimeout(done,25))}
   throw Error('knowledge_assessment_ci_backend_not_gone')
  }
  const seedAssessment=async()=>{
   await identity();await assertEmpty('assessment')
   // Original Native employee API creates, cancels its own synthetic run and
   // records feedback; original review API then admits this pending request.
   // It never calls a Worker, model, embedding provider, Broker or MCP.
   return assessmentFixture.assessmentRequest(fixture,{purpose:'evaluate'})
  }
  const state=async s=>(await admin.query("SELECT j.state AS job_state,l.state AS lease_state,l.worker_id::text,l.lease_token::text,l.lease_version::text,l.lease_expires_at,(SELECT count(*)::integer FROM agentstudio.audit_events a WHERE a.owner_user_id=j.owner_user_id AND a.target_kind='agent_review' AND a.target_id=j.request_id::text AND a.action='agent_assessment.claimed') AS claims,(SELECT count(*)::integer FROM agentstudio.audit_events a WHERE a.owner_user_id=j.owner_user_id AND a.target_kind='agent_review' AND a.target_id=j.request_id::text AND a.action='agent_assessment.paused') AS pauses FROM agentstudio.agent_review_jobs j LEFT JOIN agentstudio.agent_assessment_leases l USING(owner_user_id,request_id) WHERE j.owner_user_id=$1 AND j.request_id=$2",[s.owner,s.raw.request_id])).rows[0]
  const cleanupAssessment=async s=>{if(s){await identity();await assessmentFixture.assessmentCancel(fixture,s)}}
  const locked=async(s,shouldLock=true)=>{
   const db=await admin.connect()
   try{
    await db.query('BEGIN')
    const query=()=>db.query('SELECT request_id FROM agentstudio.agent_review_requests WHERE owner_user_id=$1 AND request_id=$2 FOR UPDATE NOWAIT',[s.owner,s.raw.request_id])
    if(shouldLock)await assert.rejects(query(),error=>error.code==='55P03');else assert.equal((await query()).rows.length,1)
   }finally{await db.query('ROLLBACK').catch(()=>{});db.release()}
  }
  return {admin,fixture,logins,runtimePools,verifyRuntime,full,assertEmpty,worker,probe,stages,image,activity,gone,seedAssessment,state,cleanupAssessment,locked,callbacks,
   calibration:{query_count:auditPrelude.length,final_query_sha256:digest(auditPrelude.at(-1).sql),real_audit_executed:true,no_audit_mock:true},
   async close(){
    for(const db of live)db.connection.stream.destroy()
    const errors=(await Promise.allSettled(pools.map(pool=>pool.end()))).filter(row=>row.status==='rejected')
    try{await identity();for(const login of [...created].reverse())await admin.query('DROP ROLE '+quote(login))}
    finally{try{await fixture.close()}finally{await admin.end()}}
    if(errors.length)throw Error('knowledge_assessment_ci_pool_cleanup_failed')
   },
  }
 }catch(error){
  for(const db of live)db.connection.stream.destroy();await Promise.allSettled(pools.map(pool=>pool.end()))
  for(const login of [...created].reverse())await admin.query('DROP ROLE '+quote(login)).catch(()=>{})
  await fixture?.close().catch(()=>{});await admin.end();throw error
 }
}
