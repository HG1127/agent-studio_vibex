// Final14 controller-owned clients. No caller Pool, driver, SQL, target or clock.
import {createHash} from 'node:crypto'
import {verifyCompleteProfileOperatorRuntime,loadCompleteProfileOperatorPg,assertCompleteProfileOperatorRuntime} from './pg18-complete-operator-runtime.mjs'
import {inspectCompleteProfile,verifyCompleteProfile} from './pg18-complete-profile.ts'
import {completeServiceActualLogin} from './pg18-complete-service-core.mjs'
import {verifyPgRuntimeTarget} from './pg-runtime-target.ts'
import {verifyPgWorkerRoleBoundary} from './worker-role-preflight.ts'
import {verifyBoundDispatchRole} from './bound-dispatch-role-preflight.ts'
import {verifyKnowledgeIndexLogin,verifyKnowledgeIndexSchema} from './knowledge-index-privileges.ts'
import {inspectAgentAssessmentOperatorPool,inspectAgentDesignOperatorPool} from './agent-assessment-service.ts'
import {loadAgentDesignAuditVerifier} from './agent-design-runtime-policy.ts'
import {inspectAgentPlanWorkflowServicePool} from './agent-plan-workflow-composition.ts'
import {inspectNativeLocalExecutorPreflight} from './native-local-executor-service-preflight.ts'
import {sendWorkerHeartbeatOperatorCommand} from './worker-heartbeat-activation-control-client.ts'
import {verifyWorkerHeartbeatManagementCatalog} from './worker-heartbeat-management-audit.ts'
import {full069ReaderCatalogAuditRequirement} from './pg18-full069-reader-audit-phase.mjs'
import {parseWorkerHeartbeatControlJson,controlJournalPhases} from './worker-heartbeat-activation-control-contract.ts'
import {parseWriterBootCredential} from './worker-heartbeat-writer-protocol.ts'
import {workerHeartbeatKinds} from './worker-heartbeat-contract.ts'
import {readLivePrivate} from './pg18-full069-worker-live-trust.mjs'
import {liveEntries,liveLimits,full069RootJournalBudget,closed,hex,uuid,freeze} from './pg18-full069-worker-live-contract.mjs'
import {finalBusinessLogins} from './pg18-full069-final-login-contract.mjs'
import {finalContext,assertFinalStable} from './pg18-full069-final-trust.mjs'
import {readFull069Final14Catalog} from './pg18-full069-final14-catalog.mjs'
const states=new WeakMap(),sha=v=>createHash('sha256').update(v).digest('hex'),fail=c=>{throw Error('full069_final_runtime_'+c)}
const target=Object.freeze({mode:'baota_pg18',host:'127.0.0.1',database:'agent_studio',port:5333,user:'agentstudio_stage_worker',expectedMajor:18})
function state(handle){const s=states.get(handle);if(!s||s.closed)fail('untrusted_runtime');finalContext(s.trust);assertCompleteProfileOperatorRuntime(s.capability);return s}
function secret(file){const b=readLivePrivate(file,{max:4096}).bytes,text=b.toString('utf8'),value=text.replace(/\r?\n$/,'');if(!Buffer.from(text).equals(b)||value.length<32||value.length>512||/[^!-~]/.test(value))fail('secret_format');return value}
async function read(pool,work){const db=await pool.connect();let begun=false,destroy=false;try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;await db.query("SET LOCAL search_path=pg_catalog; SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='8000ms'");return await work(db)}finally{if(begun)try{await db.query('ROLLBACK')}catch{destroy=true}db.release(destroy)}}
export function readFull069FinalRootJournal(){
 const bytes=readLivePrivate('/var/lib/agentstudio-telemetry-control/journal.jsonl',{max:4194304}).bytes,text=bytes.toString('utf8');if(!Buffer.from(text).equals(bytes)||!text.endsWith('\n'))fail('root_journal_incomplete');let previous='0'.repeat(64),epoch=0n
 const records=text.slice(0,-1).split('\n').map((line,sequence)=>{const r=closed(parseWorkerHeartbeatControlJson(Buffer.from(line),2097152),['format','sequence','previous_sha256','instance_id','epoch','action_id','phase','data','record_sha256']),{record_sha256,...body}=r;if(r.format!=='worker_heartbeat_control_journal_v1'||r.sequence!==sequence||r.previous_sha256!==previous||!uuid(r.instance_id)||typeof r.epoch!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(r.epoch)||BigInt(r.epoch)>18446744073709551615n||BigInt(r.epoch)<epoch||r.action_id!==null&&!uuid(r.action_id)||!controlJournalPhases.includes(r.phase)||!hex(record_sha256)||sha(JSON.stringify(body))!==record_sha256||JSON.stringify(r)!==line)fail('root_journal_chain');previous=record_sha256;epoch=BigInt(r.epoch);return r})
 return {records,head:previous,bytes:bytes.length}
}
async function rootStatus(s){const v=closed(await sendWorkerHeartbeatOperatorCommand({op:'inspect'}),['phase','instance_id','fence_epoch','published_epoch','policy_sha256','read_gate','in_flight_reads','mutation_in_flight','is_activation_capability']);if(v.phase!=='serving'||v.instance_id!==s.profile.telemetry_instance_id||v.fence_epoch!==s.profile.telemetry_epoch||v.published_epoch!==v.fence_epoch||v.read_gate!=='open'||v.mutation_in_flight!==false||v.is_activation_capability!==false||!hex(v.policy_sha256))fail('root_not_current');if(s.policySha&&v.policy_sha256!==s.policySha)fail('policy_changed');return v}
async function physical(s){
 const business=await inspectCompleteProfile(s.pools.admin,s.snapshot.complete,s.profile.complete_source_sha256,s.profile.business_target);if(!business.structure_and_receipt_verified)fail('full069_structure')
 await read(s.pools.telemetry,async db=>{const r=(await db.query("SELECT current_database() AS database,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,(pg_control_system()).system_identifier::text AS system,host(inet_server_addr()) AS host,inet_server_port() AS port,session_user::text AS login,current_user::text AS actor,current_setting('server_version_num')::integer AS version,NOT pg_is_in_recovery() AS primary,(extract(epoch FROM pg_postmaster_start_time())*1000000)::numeric(30,0)::text AS started")).rows[0];if(!r||r.database!=='agent_studio_telemetry'||r.oid!==s.profile.telemetry_target.database_oid||r.system!==s.profile.telemetry_target.system_identifier||r.host!=='127.0.0.1'||r.port!==5333||r.login!=='postgres'||r.actor!=='postgres'||r.version<180000||r.version>=190000||r.primary!==true||r.started!==s.binding.postmaster_started_us)fail('telemetry_target')})
}
function currentPolicy(s,journal){const pubs=journal.records.filter(r=>r.phase==='published'&&r.instance_id===s.profile.telemetry_instance_id&&r.epoch===s.profile.telemetry_epoch),raw=pubs.at(-1)?.data?.policy;if(!raw)fail('published_policy_missing');const p=closed(raw,['protocol','binding','reader','kinds','slots']);if(p.protocol!=='worker_heartbeat_activation_policy_v1'||JSON.stringify(p.binding.role_oids)!==JSON.stringify(s.binding.roles.map(r=>r.oid))||p.binding.system_id!==s.profile.telemetry_target.system_identifier||p.binding.database_oid!==s.binding.database_oid||p.reader.login!==true||!Array.isArray(p.slots)||p.slots.length!==16||workerHeartbeatKinds.some(kind=>p.slots.filter(v=>v.kind===kind&&v.mode==='active').length!==1))fail('published_policy_changed');return p}
function bootBindings(s){return liveEntries.flatMap((entry,i)=>entry.kinds.map(kind=>{const w=s.profile.workers[i],leaf='telemetry-'+kind.replaceAll('_','-')+'.boot.json',mount=w.mounts.find(m=>m.leaf===leaf);if(!mount)fail('boot_mount_missing');const b=readLivePrivate(mount.source,{owner:w.uid,mode:[0o400],max:16384});if(b.sha256!==mount.sha256)fail('boot_file_changed');const credential=parseWriterBootCredential(parseWorkerHeartbeatControlJson(b.bytes),kind);if(credential.uid!==w.uid)fail('boot_uid');return {kind,uid:w.uid,generation:credential.generation}}))}
async function telemetryState(s,ready=false,ended=false){
 const status=await rootStatus(s),journal=readFull069FinalRootJournal(),policy=currentPolicy(s,journal),bindings=bootBindings(s),issued=journal.records.filter(r=>r.phase==='writer_boot_issued'),used=issued.map(r=>r.data.uid)
 s.currentPolicy=policy;
  if(s.journalCount&&(journal.records.length<s.journalCount||journal.records[s.journalCount-1]?.record_sha256!==s.journalHead))fail('root_journal_rewritten');s.journalCount=journal.records.length;s.journalHead=journal.head
 if(used.length>liveLimits.uidPool||new Set(used).size!==used.length||used.some(uid=>!s.rootProfile.writers.boot_uids.includes(uid)))fail('uid_reuse')
 const roles=s.binding.roles.map((r,i)=>({oid:r.oid,name:r.name,login:i===0?false:i===1?policy.reader.login:policy.slots[i-2].mode==='active',inherit:false,super:false,bypass:false,create_db:false,create_role:false,replication:false,connection_limit:i===0?-1:i===1?2:1,config:null,no_expiry:true,memberships:0}))
 const observed=await read(s.pools.telemetry,async db=>{
  const common={database_oid:s.binding.database_oid,database_owner_oid:s.binding.owner_oid,schema_oid:s.binding.schema_oid,roles}
   // The operator connection audits management only. The Reader-only audit is
   // mandatory inside the original Controller lease during every Native read.
  const management=await verifyWorkerHeartbeatManagementCatalog(db,{protocol:'worker_heartbeat_management_catalog_expectations_v1',...common,operator:{oid:s.binding.operator_oid,name:s.binding.operator_login}});if(management?.catalog_verified!==true)fail('telemetry_catalog')
  const rows=(await db.query("SELECT kind,slot_no::integer,generation::text,last_sequence::text AS sequence,state,reason,to_char(observed_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') AS observed_at,draining,enabled FROM studio_telemetry.slot_state ORDER BY kind,slot_no")).rows
  const backends=(await db.query("SELECT a.pid,a.backend_start::text AS started,r.oid::integer AS role_oid,a.usename,a.datid::integer AS database_oid FROM pg_stat_activity a JOIN pg_roles r ON r.rolname=a.usename WHERE a.datid=$1::oid AND (starts_with(a.usename,'studio_telemetry_tx_') OR a.usename='studio_telemetry_reader') ORDER BY a.usename,a.pid",[s.binding.database_oid])).rows
  return {rows,backends}
 })
 if(observed.rows.length!==16||new Set(observed.rows.map(r=>r.kind+':'+r.slot_no)).size!==16)fail('telemetry_row_set')
 const projected=bindings.map(binding=>{const slots=policy.slots.filter(v=>v.kind===binding.kind&&v.mode==='active'&&v.generation===binding.generation);if(slots.length!==1)fail('boot_policy_generation');const slot=slots[0],role=s.binding.roles.find(r=>r.name==='studio_telemetry_tx_'+binding.kind+'_'+slot.slot_no),row=observed.rows.find(r=>r.kind===binding.kind&&r.slot_no===slot.slot_no);if(!role||row?.generation!==binding.generation||row.enabled!==true)fail('generation_changed')
  const claims=journal.records.filter(r=>r.phase==='writer_boot_claimed'&&r.instance_id===s.profile.telemetry_instance_id&&r.data.kind===binding.kind&&r.data.generation===binding.generation),bounds=journal.records.filter(r=>r.phase==='writer_backend_bound'&&r.instance_id===s.profile.telemetry_instance_id&&r.data.kind===binding.kind&&r.data.generation===binding.generation)
  if(ready||ended){if(claims.length!==1||claims[0].data.uid!==binding.uid||claims[0].data.role_oid!==role.oid||bounds.length!==1)fail('live_binding_missing');const d=bounds[0].data,b=closed(d.backend,['pid','started']);if(d.database_oid!==s.binding.database_oid||d.role_oid!==role.oid||d.slot_no!==slot.slot_no||!uuid(d.backend_id)||!Number.isInteger(b.pid)||b.pid<1||typeof b.started!=='string')fail('live_backend_binding');const ends=journal.records.filter(r=>r.phase==='writer_backend_ended'&&r.instance_id===s.profile.telemetry_instance_id&&r.data.backend_id===d.backend_id);if(ended){if(ends.length!==1||JSON.stringify(ends[0].data)!==JSON.stringify(d))fail('backend_end_missing')}else{if(ends.length!==0||!observed.backends.some(r=>r.pid===b.pid&&r.started===b.started&&r.role_oid===role.oid&&r.database_oid===s.binding.database_oid))fail('owned_backend_missing')}
  }
  if(ready&&!ended){const age=Date.now()-Date.parse(row.observed_at);if(row.state!=='ready'||row.reason!=='startup_checks_complete'||row.draining!==false||!Number.isFinite(age)||age<0||age>45000||!/^[1-9][0-9]*$/.test(row.sequence))fail('live_not_fresh')}
  return {kind:binding.kind,generation:binding.generation,slot_no:slot.slot_no,sequence:row.sequence,observed_at:row.observed_at}
 })
 if(ended&&observed.backends.length!==0)fail('telemetry_backends_remain')
 if(ready&&!ended&&observed.backends.filter(r=>r.usename!=='studio_telemetry_reader').length!==8)fail('extra_writer_backend')
 return {policy_sha256:status.policy_sha256,root_journal_head_sha256:journal.head,root_journal_records:journal.records.length,used_boot_uids:used.length,bindings:projected,telemetry_backend_count:observed.backends.length,readers_in_flight:status.in_flight_reads}
}

async function businessState(s){
 if(!s.currentPolicy)fail('current_telemetry_policy_missing')
 const expectations={complete_roles:s.snapshot.complete.roles,business_target:s.profile.business_target,telemetry_binding:s.binding,telemetry_policy:s.currentPolicy,business_accounts:finalBusinessLogins}
 const business=await read(s.pools.admin,async db=>{
 const ledger=(await db.query('SELECT version,description FROM agentstudio.schema_migrations ORDER BY version')).rows,ledgerSha=sha(JSON.stringify(ledger));if(s.ledgerSha&&s.ledgerSha!==ledgerSha)fail('ledger_changed')
 const queues=(await db.query('SELECT (SELECT count(*)::integer FROM agentstudio.jobs) AS jobs,(SELECT count(*)::integer FROM agentstudio.runs) AS runs,(SELECT count(*)::integer FROM agentstudio.agent_review_requests) AS reviews,(SELECT count(*)::integer FROM agentstudio.knowledge_query_jobs) AS queries')).rows[0];closed(queues,['jobs','runs','reviews','queries']);if(Object.values(queues).some(v=>v!==0))fail('business_queues_nonempty')
 const catalog=await readFull069Final14Catalog(db,expectations);return {catalog,ledgerSha,queues:{...queues}}
 })
 assertFinalStable(s.trust);const telemetry=await read(s.pools.telemetry,async db=>await readFull069Final14Catalog(db,expectations)),hashes={}
 // Each database owns a different object catalog. Pin both ACL digests and
 // require the shared global role/membership/HBA observations to agree.
 for(const catalog of[business.catalog,telemetry]){if(catalog.business_login_count!==14||catalog.telemetry_role_count!==18||!Number.isSafeInteger(catalog.global_role_count)||catalog.global_role_count<1||catalog.global_role_count!==business.catalog.global_role_count||!hex(catalog.acl_sha256))fail('catalog_shape');const verifiers=catalog.business_verifier_sha256s;if(!verifiers||Object.keys(verifiers).length!==14||finalBusinessLogins.some(a=>!hex(verifiers[a.login])||verifiers[a.login]!==s.records.business_verifier_sha256s[a.login]))fail('business_verifier_changed')}
 for(const key of['roles_sha256','memberships_sha256','hba_sha256']){if(!hex(business.catalog[key])||business.catalog[key]!==telemetry[key])fail('global_catalog_disagrees');hashes[key]=business.catalog[key]}
 hashes.acl_sha256=sha(JSON.stringify({business:business.catalog.acl_sha256,telemetry:telemetry.acl_sha256}))
 if(s.catalogHashes&&['roles_sha256','memberships_sha256','acl_sha256','hba_sha256'].some(k=>hashes[k]!==s.catalogHashes[k]))fail('current_global_catalog_changed')
 return {ledger_sha256:business.ledgerSha,...hashes,business_acl_sha256:business.catalog.acl_sha256,telemetry_acl_sha256:telemetry.acl_sha256,business_login_count:14,business_actual_login_auditors:14,queues:business.queues}
}
function makePool(s,user,password,database='agent_studio'){const p=new s.Pool({host:'127.0.0.1',port:5333,database,user,password,ssl:false,options:'',max:1,connectionTimeoutMillis:2000,idleTimeoutMillis:2000,statement_timeout:8000,query_timeout:10000});p.on('error',()=>{s.failed=true});return p}
function openBusinessPools(s){if(s.businessOpen)fail('business_pools_open');for(const a of s.bindings.accounts)s.pools[a.key]=makePool(s,a.login,secret(a.credential.file));s.businessOpen=true}
async function closeBusinessPools(s){const rows=finalBusinessLogins.map(a=>s.pools[a.key]).filter(Boolean),out=await Promise.allSettled(rows.map(p=>p.end()));for(const a of finalBusinessLogins)delete s.pools[a.key];s.businessOpen=false;if(out.some(r=>r.status!=='fulfilled'))fail('business_pool_close')}
async function actualBusinessAudits(s){
 if(!s.businessOpen)fail('business_pools_closed');const audit=await loadAgentDesignAuditVerifier();assertFinalStable(s.trust)
 // Each branch owns a distinct max=1 LOGIN pool; branches never share clients.
 const results=await Promise.allSettled(finalBusinessLogins.map(async a=>{const p=s.pools[a.key],t={...target,user:a.login};await verifyPgRuntimeTarget(p,t);assertFinalStable(s.trust)
  if(a.action&&await completeServiceActualLogin(p,a.action)!==true)fail('actual_login')
  switch(a.key){
   case 'api':await verifyBoundDispatchRole(p,t,'api');await inspectAgentPlanWorkflowServicePool(p,'agentstudio_api');break
   case 'worker':await verifyPgWorkerRoleBoundary(p,t);break
   case 'identity':await verifyBoundDispatchRole(p,t,'identity');break
   case 'broker':await verifyBoundDispatchRole(p,t,'broker');await inspectAgentPlanWorkflowServicePool(p,'agentstudio_model_broker');break
   case 'index_worker':await verifyKnowledgeIndexLogin(p,'worker');await verifyKnowledgeIndexSchema(p,'worker');break
   case 'index_broker':await verifyKnowledgeIndexLogin(p,'broker');await verifyKnowledgeIndexSchema(p,'broker');break
   case 'review_worker':await inspectAgentAssessmentOperatorPool(p,t,'worker');break
   case 'review_dispatch':await inspectAgentAssessmentOperatorPool(p,t,'dispatch');break
   case 'design_worker':await inspectAgentDesignOperatorPool(p,t,'worker',audit);break
   case 'design_dispatch':await inspectAgentDesignOperatorPool(p,t,'dispatch',audit);break
   case 'executor':{const e=await inspectNativeLocalExecutorPreflight(p,{database:'agent_studio',port:5333});if(e.read_only!==true||e.original_C_audit_verified!==true||e.transaction_bound_identity!==true||e.listener_started!==false||e.device_paired!==false||e.effect_executed!==false)fail('executor_audit');break}
   case 'plan_workflow_worker':await inspectAgentPlanWorkflowServicePool(p,'agentstudio_plan_workflow_worker');break
   case 'plan_workflow_dispatch':await inspectAgentPlanWorkflowServicePool(p,'agentstudio_plan_workflow_dispatch');break
  }
  assertFinalStable(s.trust)
 }));const rejected=results.find(r=>r.status==='rejected');if(rejected)throw rejected.reason
 const full=await verifyCompleteProfile(s.pools.admin,s.pools.api,s.snapshot.complete,s.profile.complete_source_sha256);if(full.full_catalog_audit_verified!==true||full.actual_api_login_verified!==true)fail('full069_catalog');assertFinalStable(s.trust)
}
async function businessBackendsZero(s){return read(s.pools.admin,async db=>{const rows=(await db.query('SELECT pid,backend_start::text AS started,usename FROM pg_stat_activity WHERE datid=$1::oid AND usename=ANY($2::text[]) ORDER BY usename,pid',[s.profile.business_target.database_oid,finalBusinessLogins.map(a=>a.login)])).rows;if(rows.length!==0)fail('business_backends_remain');return {business_backend_count:0,business_audit_pools_closed:true}})}
export async function openFull069FinalRuntime(trust){
 const c=finalContext(trust);assertFinalStable(trust);const b=c.base,capability=verifyCompleteProfileOperatorRuntime(c.source.complete,b.profile.complete_source_sha256,{manifestFile:b.profile.runtime_manifest_file,manifestSha256:b.profile.runtime_manifest_sha256,lockSha256:b.profile.runtime_lock_sha256}),{Pool}=loadCompleteProfileOperatorPg(capability)
 const s={...b,trust,bindings:c.bindings,records:c.records,controlRuntimeSha256:c.controlRuntimeSha256,snapshot:{complete:c.source.complete},capability,Pool,pools:{},businessOpen:false,closed:false,failed:false,initial:null,ledgerSha:null,catalogHashes:null,policySha:null,binding:b.rootProfile.binding,currentPolicy:null};const handle=Object.freeze(Object.create(null));states.set(handle,s)
 try{const admin=secret(b.profile.credentials.admin);s.pools.admin=makePool(s,'postgres',admin);s.pools.telemetry=makePool(s,'postgres',admin,'agent_studio_telemetry');openBusinessPools(s);await physical(s);assertFinalStable(trust);await actualBusinessAudits(s);const telemetry=await telemetryState(s),business=await businessState(s),journal=readFull069FinalRootJournal(),budget=full069RootJournalBudget(journal.bytes,b.profile.minimum_ms,{role_oid:s.binding.roles[1].oid,database_oid:s.binding.database_oid});if(telemetry.telemetry_backend_count!==0||telemetry.readers_in_flight!==0||journal.records.some(r=>['writer_boot_claimed','writer_backend_bound'].includes(r.phase)&&telemetry.bindings.some(x=>x.generation===r.data.generation)))fail('initial_claim_or_backend_present');s.ledgerSha=business.ledger_sha256;s.catalogHashes=Object.fromEntries(['roles_sha256','memberships_sha256','acl_sha256','hba_sha256'].map(k=>[k,business[k]]));s.policySha=telemetry.policy_sha256;s.initial={...business,...telemetry,root_journal_budget:budget,reader_catalog_audit:full069ReaderCatalogAuditRequirement};assertFinalStable(trust);return handle}catch(error){s.closed=true;await Promise.allSettled(Object.values(s.pools).map(p=>p.end()));throw error}
}
export function full069FinalPreflight(handle){const s=state(handle);return freeze({full069_current_catalog:true,actual_service_logins:14,assessment_design_independent_logins:true,executor_independent_login:true,runtime_manifests:{operator_sha256:s.profile.runtime_manifest_sha256,control_sha256:s.controlRuntimeSha256},preparation_records:s.records.historical,...s.initial,qualifies_run:false,production_cutover_allowed:false})}
export async function observeFull069FinalRuntime(handle,{ready=true,ended=false}={}){const s=state(handle);if(s.failed)fail('runtime_client_failed');if(!s.businessOpen)fail('business_pools_closed');assertFinalStable(s.trust);await physical(s);assertFinalStable(s.trust);await actualBusinessAudits(s);const telemetry=await telemetryState(s,ready,ended),business=await businessState(s);assertFinalStable(s.trust);return freeze({...business,...telemetry})}
// After all owned applications stop, audit pools close before the 14-LOGIN zero
// check. The independent END acknowledgement does not substitute for this check.
export async function finalizeFull069FinalRuntime(handle){const s=state(handle);assertFinalStable(s.trust);if(s.businessOpen)await closeBusinessPools(s);const zero=await businessBackendsZero(s),telemetry=await telemetryState(s,false,true),business=await businessState(s);assertFinalStable(s.trust);return freeze({...business,...telemetry,...zero})}
export async function verifyFull069FinalRuntimeAfterAcknowledgement(handle){const s=state(handle);if(s.businessOpen)fail('business_pools_open');assertFinalStable(s.trust);openBusinessPools(s);let observation;try{observation=await observeFull069FinalRuntime(handle,{ready:false,ended:true})}finally{await closeBusinessPools(s)}const zero=await businessBackendsZero(s);assertFinalStable(s.trust);return freeze({...observation,...zero})}
export async function closeFull069FinalRuntime(handle){const s=states.get(handle);if(!s||s.closed)return;s.closed=true;const results=await Promise.allSettled(Object.values(s.pools).map(p=>p.end()));s.businessOpen=false;if(results.some(r=>r.status!=='fulfilled'))fail('runtime_close')}
