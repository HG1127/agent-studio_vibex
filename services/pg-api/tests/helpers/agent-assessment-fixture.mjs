// Disposable hosted synthetic SQL only. Importing this module opens no DB.
// Never execute these helpers against company/production data.
import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import pg from 'pg'
import {agentReviewLedgerFixture,reviewLedgerSource,reviewLedgerSubmission,reviewLedgerFeedbackErase} from './agent-review-ledger-fixture.mjs'
import {canonicalMcpJson} from '../../src/mcp-catalog.ts'
import {agentReviewDimensions,parseAgentReviewSubmission} from '../../src/agent-review-contract.ts'
import {agentDescriptiveLimits} from '../../../../shared/agent-role-limits.mjs'
import {requireEphemeralPg18Ci} from '../../src/pg18-ephemeral-ci-guard.mjs'
import {loadPg18CiBaseline} from '../../src/pg18-ci-schema.mjs'
import {loadNativeAuthPg18CiSchema} from '../../src/pg18-native-auth-ci-schema.mjs'
import {captureFreshRuntimeSources,freshRuntimeSqlBody} from '../../src/pg18-fresh-runtime-source.mjs'
import {installFreshRuntime} from '../../src/pg18-fresh-runtime-install.ts'
import {verifyFreshForTest} from '../../src/baota-pg18-fresh-init.mjs'
import {makeNativeScramVerifier} from '../../src/native-activation-cli.mjs'
import {NativeAuthRepository} from '../../src/native-auth-repository.mjs'
import {ModelConnectionRepository} from '../../src/model-connection-repository.ts'
import {AgentSpecRepository} from '../../src/repository.ts'
import {safeAgentSpec} from '../../src/contracts.ts'
import {AgentReviewSourceRepository} from '../../src/agent-review-source.ts'
import {AgentReviewLedgerRepository} from '../../src/agent-review-ledger.ts'
import {AgentFeedbackRepository} from '../../src/agent-feedback-repository.ts'
import {AutonomousAgentRunRepository} from '../../src/autonomous-agent-run-repository.ts'

export const assessmentRoles={worker:'agentstudio_review_worker',dispatch:'agentstudio_review_dispatch'}
const functions={claim:1,context:4,reserve:4,finish:5,pause:4}
const casts={claim:['uuid'],context:['uuid','uuid','bigint','uuid'],reserve:['uuid','uuid','bigint','uuid'],finish:['uuid','uuid','bigint','uuid','jsonb'],pause:['uuid','uuid','bigint','uuid']}

export async function agentAssessmentFixture({installed=true}={}){
  const f=await agentReviewLedgerFixture()
  try{
    if(installed)await f.db.exec(f.sql('migrations/pg_v9_057_agent_assessment_execution.sql'))
    return f
  }catch(error){await f.close();throw error}
}
export async function assessmentRole(f,role,body){
  assert.ok([...Object.values(assessmentRoles),'agentstudio_api','agentstudio_worker','agentstudio_model_broker','agentstudio_native_auth','agentstudio_bound_dispatch'].includes(role))
  const db=await f.pool.connect();let begun=false
  try{await db.query('BEGIN');begun=true;await db.query('SET LOCAL ROLE '+role);const value=await body(db);await db.query('COMMIT');begun=false;return value}
  finally{if(begun)await db.query('ROLLBACK').catch(()=>{});db.release()}
}
export async function assessmentCall(f,role,name,args){
  assert.ok(Object.hasOwn(functions,name));assert.equal(args.length,functions[name])
  const parameters=casts[name].map((type,index)=>'$'+(index+1)+'::'+type).join(',')
  const values=args.map((value,index)=>casts[name][index]==='jsonb'?JSON.stringify(value):value)
  return assessmentRole(f,role,async db=>(await db.query('SELECT agentstudio.agent_assessment_'+name+'('+parameters+') AS value',values)).rows[0].value)
}
export const assessmentProof=lease=>({request_id:lease.request_id,lease_token:lease.lease_token,lease_version:Number(lease.lease_version),worker_id:lease.worker_id})
export const assessmentArgs=p=>[p.request_id,p.lease_token,p.lease_version,p.worker_id]
export const assessmentClaim=(f,worker=randomUUID())=>assessmentCall(f,assessmentRoles.worker,'claim',[worker])
export const assessmentContext=(f,p)=>assessmentCall(f,assessmentRoles.dispatch,'context',assessmentArgs(p))
export const assessmentReserve=(f,p)=>assessmentCall(f,assessmentRoles.dispatch,'reserve',assessmentArgs(p))
export const assessmentFinish=(f,p,completion)=>assessmentCall(f,assessmentRoles.dispatch,'finish',[...assessmentArgs(p),completion])
export const assessmentPause=(f,p)=>assessmentCall(f,assessmentRoles.worker,'pause',assessmentArgs(p))
export async function assessmentRequest(f,options={}){
  const s=await reviewLedgerSource(f,options),p=await reviewLedgerSubmission(f,s,options.purpose??'evaluate')
  if(options.outputTokenLimit!==undefined){
    p.choice={...p.choice,output_token_limit:options.outputTokenLimit}
    p.prepared=await f.review.preview(s.identity,p.choice)
    p.raw={...p.raw,output_token_limit:options.outputTokenLimit,expected_input_sha256:p.prepared.input_sha256}
  }
  if(options.requestId!==undefined)p.raw={...p.raw,request_id:options.requestId}
  p.parsed=parseAgentReviewSubmission(p.raw)
  const receipt=await f.ledger.submit(s.identity,p.raw)
  return {...s,...p,receipt}
}
export async function assessmentErase(f,p){
  return f.closed.change(p.identity,{action:'erase',request_id:randomUUID(),review_id:p.raw.request_id,expected_request_sha256:p.parsed.request_sha256,confirm:true})
}
export async function assessmentCancel(f,p){
  return f.closed.change(p.identity,{action:'cancel',request_id:randomUUID(),review_id:p.raw.request_id,expected_request_sha256:p.parsed.request_sha256,confirm:true})
}
export async function assessmentFeedbackErase(f,p){return f.feedback.change(p.identity,await reviewLedgerFeedbackErase(f,p))}
export async function assessmentRows(f,requestId,owner){
  const result={}
  for(const suffix of ['leases','effects','outcomes','outputs'])result[suffix]=(await f.db.query('SELECT to_jsonb(r) AS row FROM agentstudio.agent_assessment_'+suffix+' r WHERE request_id=$1'+(owner?' AND owner_user_id=$2':''),owner?[requestId,owner]:[requestId])).rows.map(v=>v.row)
  return result
}
export async function assessmentCounts(f){
  return (await f.db.query(`SELECT
    (SELECT count(*) FROM agentstudio.agent_assessment_leases)::integer AS leases,
    (SELECT count(*) FROM agentstudio.agent_assessment_effects)::integer AS effects,
    (SELECT count(*) FROM agentstudio.agent_assessment_outcomes)::integer AS outcomes,
    (SELECT count(*) FROM agentstudio.agent_assessment_outputs)::integer AS outputs,
    (SELECT count(*) FROM agentstudio.agent_review_inputs)::integer AS inputs,
    (SELECT count(*) FROM agentstudio.agent_review_tombstones)::integer AS tombstones,
    (SELECT count(*) FROM agentstudio.jobs)::integer AS old_jobs,
    (SELECT count(*) FROM agentstudio.external_effects)::integer AS old_effects,
    (SELECT count(*) FROM agentstudio.agent_optimization_links)::integer AS role_acceptances,
    (SELECT count(*) FROM agentstudio.agent_collaboration_revisions)::integer AS role_history,
    (SELECT count(*) FROM agentstudio.audit_events)::integer AS audits`)).rows[0]
}
export async function expireAssessmentLease(f,p){
  await f.db.query("UPDATE agentstudio.agent_assessment_leases SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE request_id=$1 AND lease_token=$2 AND lease_version=$3",[p.request_id,p.lease_token,p.lease_version])
}
export const assessmentOutputHash=(p,result)=>createHash('sha256').update(canonicalMcpJson({protocol:'agent_paid_review_output_v1',request_id:p.raw.request_id,purpose:p.raw.purpose,input_sha256:p.prepared.input_sha256,result})).digest('hex')
export const assessmentEvaluation=()=>({score:0,dimensions:agentReviewDimensions.map(name=>({name,score:0,comment:'合成质量意见😀，不代表引擎或审批证明'})),suggestions:[]})
export const assessmentOptimization=()=>({descriptive:{goal:'核'.repeat(agentDescriptiveLimits.goal),task_scope:'界'.repeat(agentDescriptiveLimits.task_scope),
  deliverables:['交付😀'.repeat(100)],task_plan:[],done_criteria:['严格保留原始权限；建议需本人另行接受']},tools_note:'Only a descriptive opinion',rationale:'Synthetic optimization result, never an accepted role revision'})
export async function assessmentAuditFault(f,body){
  await f.db.exec(`CREATE FUNCTION agentstudio.synthetic_reject_assessment_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic_assessment_audit_failed'; END$$;
    REVOKE ALL ON FUNCTION agentstudio.synthetic_reject_assessment_audit() FROM PUBLIC;
    CREATE TRIGGER synthetic_assessment_audit BEFORE INSERT ON agentstudio.audit_events FOR EACH ROW EXECUTE FUNCTION agentstudio.synthetic_reject_assessment_audit()`)
  try{return await body()}
  finally{await f.db.exec('DROP TRIGGER synthetic_assessment_audit ON agentstudio.audit_events; DROP FUNCTION agentstudio.synthetic_reject_assessment_audit()')}
}

// The Broker holds a verified API transaction while separate dispatch and
// secret transactions commit. A single-session PGlite adapter cannot exercise
// that durability boundary. The real mTLS integration therefore requires a
// dedicated empty GitHub-only PG18 service; no ambient DATABASE_URL is allowed.
export async function agentAssessmentTcpFixture(env=process.env){
  const target=requireEphemeralPg18Ci(env)
  const pools=[],key=Buffer.from('0123456789abcdef'.repeat(4),'hex')
  const admin=new pg.Pool({...target,max:6,statement_timeout:15000,query_timeout:20000});pools.push(admin)
  const sql=file=>readFileSync(new URL('../../../../db/postgres/'+file,import.meta.url),'utf8').split(/\r?\n/).filter(line=>!line.trim().startsWith('\\')).join('\n')
  const adapter=pool=>({knowledgeSharing:true,connect:()=>pool.connect()})
  const passwordFor=login=>createHash('sha512').update(target.password+':assessment:'+login).digest('hex').slice(0,80)
  const addLogin=async(db,login,roles)=>{
    assert.match(login,/^[a-z_]+$/);assert.match(roles,/^[a-z_,]+$/)
    await db.query('CREATE ROLE '+login+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+makeNativeScramVerifier(passwordFor(login))+"'")
    await db.query('GRANT '+roles+' TO '+login)
  }
  const loginPool=login=>{const pool=new pg.Pool({...target,user:login,password:passwordFor(login),max:4,statement_timeout:15000,query_timeout:20000});pools.push(pool);return adapter(pool)}
  try{
    const observed=(await admin.query(`SELECT current_database() AS db,session_user AS login,current_setting('server_version_num')::integer AS version,
      (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=session_user) AS superuser,
      (SELECT count(*)::integer FROM pg_catalog.pg_namespace WHERE nspname IN('agentstudio','agentstudio_auth')) AS schemas,
      (SELECT count(*)::integer FROM pg_catalog.pg_roles WHERE rolname LIKE 'agentstudio\\_%' ESCAPE '\\') AS roles`)).rows[0]
    assert.equal(observed.db,'agentstudio_pg18_ci');assert.equal(observed.login,'agentstudio_admin');assert.equal(observed.superuser,true)
    assert.ok(observed.version>=180000&&observed.version<190000);assert.equal(observed.schemas,0);assert.equal(observed.roles,1,'fresh dedicated service is required')
    const snapshot=captureFreshRuntimeSources(),bootstrap=await admin.connect()
    try{
      await bootstrap.query('BEGIN');await bootstrap.query("SET LOCAL password_encryption='scram-sha-256'")
      try{
        await bootstrap.query(loadPg18CiBaseline().sql)
        await addLogin(bootstrap,'agentstudio_stage_login','agentstudio_api')
        await addLogin(bootstrap,'agentstudio_stage_worker','agentstudio_worker,agentstudio_api')
        await verifyFreshForTest(bootstrap)
        const native=freshRuntimeSqlBody(loadNativeAuthPg18CiSchema().sql)
        await installFreshRuntime({query(text,args=[]){return bootstrap.query(text===snapshot.steps[0].sql?native:text,args)}},snapshot)
        await bootstrap.query('COMMIT')
      }catch(error){await bootstrap.query('ROLLBACK');throw error}
    }finally{bootstrap.release()}
    for(const part of ['051_agent_memory_derived','052_agent_memory_outcome','053_agent_memory_failure_source','054_agent_feedback','055_agent_optimization','056_agent_review_ledger','057_agent_assessment_execution'])
      await admin.query(sql('migrations/pg_v9_'+part+'.sql'))
    await admin.query("ALTER ROLE agentstudio_native_login LOGIN PASSWORD '"+makeNativeScramVerifier(passwordFor('agentstudio_native_login'))+"'")
    for(const [login,role] of [['synthetic_assessment_api','agentstudio_api'],['synthetic_assessment_worker','agentstudio_review_worker'],['synthetic_assessment_dispatch','agentstudio_review_dispatch'],['synthetic_assessment_secret','agentstudio_model_broker']])
      await addLogin(admin,login,role)
    const pool=loginPool('synthetic_assessment_api'),workerPool=loginPool('synthetic_assessment_worker'),dispatchPool=loginPool('synthetic_assessment_dispatch'),secretPool=loginPool('synthetic_assessment_secret')
    const store=new NativeAuthRepository(loginPool('agentstudio_native_login'))
    const alice=await store.provisionInitialAdmin({email:'assessment-alice@example.test',password:'SyntheticAssessmentAlice#2026',display_name:'Synthetic Alice'})
    const session=await store.login('assessment-alice@example.test','SyntheticAssessmentAlice#2026')
    const bob=await store.provisionEmployee(session.token,{email:'assessment-bob@example.test',password:'SyntheticAssessmentBob#2026',display_name:'Synthetic Bob'})
    const users={alice:alice.id,bob:bob.id},identities={},resources={},models=new ModelConnectionRepository(pool,key,secretPool),agents=new AgentSpecRepository(pool)
    for(const who of ['alice','bob']){
      identities[who]=(await admin.query('SELECT external_issuer AS issuer,external_subject AS subject FROM agentstudio.users WHERE id=$1',[users[who]])).rows[0]
      const created=await models.create(identities[who],{name:'Synthetic assessment '+who,provider:'openai',base_url:'https://api.openai.com/v1',api_key:'synthetic-'+who+'-assessment-key-never-network',models:['synthetic'],enabled:true})
      const model=await models.testConnection(identities[who],created.id,created.revision,async()=>({status:'ok',latency_ms:1,error_code:''}))
      const binding={connection_id:model.id,connection_revision:model.revision,model_id:'synthetic'}
      const spec=await agents.create(identities[who],'Synthetic assessment '+who,safeAgentSpec({goal:'Synthetic assessment role '+who,task_scope:'Disposable CI only',deliverables:['Evidence'],task_plan:[],done_criteria:['No external calls'],tools:['calculate'],knowledge_base_ids:[],model_binding:binding}))
      resources[who]={model,binding,spec}
    }
    return {db:{query:(text,args=[])=>admin.query(text,args),exec:text=>admin.query(text)},pool,workerPool,dispatchPool,secretPool,key,sql,users,identities,resources,models,agents,
      review:new AgentReviewSourceRepository(pool),ledger:new AgentReviewLedgerRepository(pool,{allowSubmissions:true}),closed:new AgentReviewLedgerRepository(pool),
      feedback:new AgentFeedbackRepository(pool,{allowSubmit:true,allowLessonStorage:true}),owned:new AutonomousAgentRunRepository(pool,{allowHumanInput:true}),
      async close(){key.fill(0);await Promise.allSettled(pools.map(p=>p.end()))}}
  }catch(error){key.fill(0);await Promise.allSettled(pools.map(p=>p.end()));throw error}
}
