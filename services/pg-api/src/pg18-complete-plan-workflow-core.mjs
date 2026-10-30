// Independent atomic fixed F05 pair. Original C8/Review protocols unchanged.
import{createHash}from'node:crypto'
import{completeServiceTarget,completeServiceLedger}from'./pg18-complete-service-core.mjs'
import{verifyCompleteProfile,completeProfileLocksSql}from'./pg18-complete-profile.ts'
import{assertComplete069PlanWorkflowSources}from'./pg18-complete-plan-workflow-sources.mjs'
import{complete069PlanWorkflowCatalog,complete069PlanWorkflowBaseline}from'./pg18-complete-plan-workflow-catalog.mjs'
import{complete069PlanWorkflowAbi as abi,complete069PlanWorkflowTargetGuardSql as targetGuard,complete069PlanWorkflowReservationSql as reservation,complete069PlanWorkflowActivationSql as activation}from'./pg18-complete-plan-workflow-plan.mjs'
import{inspectAgentPlanWorkflowServicePool}from'./agent-plan-workflow-composition.ts'
import{verifyPgRuntimeTarget}from'./pg-runtime-target.ts'
import{verifyApprovalDelegationCredentials}from'./approval-delegation-audit.ts'
import{verifyNativeLocalDeviceSchema}from'./native-local-device-audit.ts'
import{verifyAgentCallerCredentials}from'./agent-caller-audit.ts'
import{verifyOwnerToolTrialCredentials}from'./owner-tool-trial-audit.ts'
const fail=c=>{throw Error('complete069_plan_workflow_'+c)},sha=v=>createHash('sha256').update(v).digest('hex')
export async function complete069PlanWorkflowImage(db,snapshot){
 if(snapshot.complete.tables.length!==133)fail('source_refused');const images=[]
 for(const table of snapshot.complete.tables){if(!/^(?:agentstudio|agentstudio_auth)\.[a-z_]+$/.test(table))fail('source_refused');const row=(await db.query("SELECT encode(sha256(convert_to(coalesce(jsonb_agg(j ORDER BY j::text),'[]'::jsonb)::text,'UTF8')),'hex') AS hash FROM (SELECT to_jsonb(t) AS j FROM "+table.split('.').map(s=>'"'+s+'"').join('.')+' t) s')).rows[0];if(typeof row?.hash!=='string'||!/^[a-f0-9]{64}$/.test(row.hash))fail('image_refused');images.push([table,row.hash])}
 return sha(JSON.stringify(images))
}
async function records(db,snapshot){const rows=(await db.query('SELECT version FROM agentstudio.schema_migrations ORDER BY version')).rows;if(JSON.stringify(rows.map(r=>r.version))!==JSON.stringify([...snapshot.complete.versions,'pg18_fresh_runtime_001','pg18_complete_069_001'].sort()))fail('ledger_refused')}
async function fresh(db,snapshot){
 const row=(await db.query("SELECT (SELECT count(*)::int FROM agentstudio_auth.accounts) AS accounts,(SELECT count(*)::int FROM agentstudio.users) AS users,(SELECT count(*)::int FROM agentstudio_auth.accounts a JOIN agentstudio.users u ON u.id=a.user_id WHERE a.enabled AND a.is_admin AND u.status='active' AND u.external_issuer='urn:agentstudio:local:v1') AS admins")).rows[0]
 if(!row||row.accounts!==1||row.users!==1||row.admins!==1)fail('fresh_initial_admin_required')
 for(const table of snapshot.complete.tables){if(['agentstudio.schema_migrations','agentstudio.users','agentstudio_auth.accounts','agentstudio_auth.sessions'].includes(table))continue;if(!/^(?:agentstudio|agentstudio_auth)\.[a-z_]+$/.test(table))fail('source_refused');if((await db.query('SELECT NOT EXISTS(SELECT 1 FROM '+table.split('.').map(s=>'"'+s+'"').join('.')+') AS empty')).rows[0]?.empty!==true)fail('fresh_business_state_required')}
}
async function actualApi(api){
 const db=await api.connect();let begun=false
 try{await db.query('BEGIN READ ONLY');begun=true;const row=(await db.query('SELECT session_user::text AS login,current_user::text AS actor')).rows[0];if(row?.login!=='agentstudio_stage_login'||row.actor!==row.login)fail('actual_api_login_required');await db.query('SET LOCAL ROLE agentstudio_api');if(await verifyApprovalDelegationCredentials(db)!==true||await verifyNativeLocalDeviceSchema(db)!==true||await verifyAgentCallerCredentials(db)!==true||await verifyOwnerToolTrialCredentials(db)!==true)fail('actual_api_catalog_refused')}
 finally{try{if(begun)await db.query('ROLLBACK')}finally{db.release()}}
}
export async function complete069PlanWorkflowPreflight(admin,api,snapshot,cfg){
 assertComplete069PlanWorkflowSources(snapshot,cfg.planWorkflowSourceSha256)
 if(snapshot.complete.source_sha256!==cfg.sourceSha256)fail('source_cohort_refused')
 const full=await verifyCompleteProfile(admin,api,snapshot.complete,cfg.sourceSha256)
 if(full.full_catalog_audit_verified!==true||full.target.system_identifier!==cfg.target.system_identifier||full.target.database_oid!==cfg.target.database_oid)fail('full069_required')
 const db=await admin.connect();let begun=false
 try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;await completeServiceTarget(db,cfg.target);await records(db,snapshot);await complete069PlanWorkflowCatalog(db,snapshot.complete);await fresh(db,snapshot);return{baseline:await complete069PlanWorkflowBaseline(db),ledger:await completeServiceLedger(db),image:await complete069PlanWorkflowImage(db,snapshot)}}
 finally{try{if(begun)await db.query('ROLLBACK')}finally{db.release()}}
}
export async function complete069PlanWorkflowPairState(db,snapshot,baseline){
 if(await complete069PlanWorkflowBaseline(db)!==baseline)fail('baseline_catalog_changed')
 const present=(await db.query('SELECT rolname AS name FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname',[abi.map(a=>a.login)])).rows
 if(present.length===0){await complete069PlanWorkflowCatalog(db,snapshot.complete);return{present:false,enabled:false,verifiers:[]}}
 if(present.length!==2)fail('partial_pair_refused')
 const roles=await complete069PlanWorkflowCatalog(db,snapshot.complete,{pairPresent:true}),verifiers=abi.map(a=>roles.get(a.login)?.verifier)
 activation(verifiers)
 return{present:true,enabled:true,verifiers}
}
export async function prepareComplete069PlanWorkflowPair(admin,api,snapshot,cfg,verifiers,before,start){
 const db=await admin.connect();let begun=false,destroy=false
 try{await db.query('BEGIN');begun=true;await db.query("SET LOCAL search_path=pg_catalog,public; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='45s'");await completeServiceTarget(db,cfg.target);await db.query(targetGuard)
  if((await db.query(completeProfileLocksSql)).rows[0]?.locked!==true)fail('schema_lock_busy')
  assertComplete069PlanWorkflowSources(snapshot,cfg.planWorkflowSourceSha256)
  if(await completeServiceLedger(db)!==before.ledger||await complete069PlanWorkflowImage(db,snapshot)!==before.image)fail('predecessor_state_changed')
  if((await complete069PlanWorkflowPairState(db,snapshot,before.baseline)).present)fail('existing_pair_no_takeover')
  await records(db,snapshot);await fresh(db,snapshot);await actualApi(api)
  const enable=activation(verifiers);await start(verifiers.map(sha),before.baseline,before.ledger,before.image)
  await db.query(reservation);await db.query(enable)
  const state=await complete069PlanWorkflowPairState(db,snapshot,before.baseline)
  if(!state.enabled||JSON.stringify(state.verifiers)!==JSON.stringify(verifiers)||await completeServiceLedger(db)!==before.ledger||await complete069PlanWorkflowImage(db,snapshot)!==before.image)fail('precommit_refused')
  assertComplete069PlanWorkflowSources(snapshot,cfg.planWorkflowSourceSha256);await completeServiceTarget(db,cfg.target);await db.query('COMMIT');begun=false;return true
 }finally{if(begun)await db.query('ROLLBACK').catch(()=>{destroy=true});db.release(destroy)}
}
export async function verifyComplete069PlanWorkflowLogin(pool,kind){
 const definition=abi.find(a=>a.kind===kind);if(!definition)fail('fixed_pair_kind_refused')
 await verifyPgRuntimeTarget(pool,{mode:'baota_pg18',host:'127.0.0.1',port:5333,database:'agent_studio',user:definition.login,expectedMajor:18})
 const db=await pool.connect();try{const row=(await db.query('SELECT session_user::text AS login,current_user::text AS actor')).rows[0];if(row?.login!==definition.login||row.actor!==row.login)fail('actual_pair_login_required')}finally{db.release()}
 await inspectAgentPlanWorkflowServicePool(pool,definition.group);return true
}
export async function inspectComplete069PlanWorkflowPair(admin,api,dedicated,snapshot,cfg,intent){
 const db=await admin.connect();let begun=false,state,matches=false
 try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;await completeServiceTarget(db,cfg.target);await records(db,snapshot);await fresh(db,snapshot)
  if(await completeServiceLedger(db)!==intent.ledger_sha256||await complete069PlanWorkflowImage(db,snapshot)!==intent.business_image_sha256)fail('predecessor_state_changed')
  state=await complete069PlanWorkflowPairState(db,snapshot,intent.baseline_catalog_sha256);matches=state.present&&state.verifiers.every((v,i)=>sha(v)===intent.pair[i].verifier_sha256)
 }finally{try{if(begun)await db.query('ROLLBACK')}finally{db.release()}}
 let worker=false,dispatch=false,catalog=false
 if(matches){worker=await verifyComplete069PlanWorkflowLogin(dedicated[0],'worker');dispatch=await verifyComplete069PlanWorkflowLogin(dedicated[1],'broker');catalog=(await verifyCompleteProfile(admin,api,snapshot.complete,cfg.sourceSha256)).full_catalog_audit_verified===true}
 assertComplete069PlanWorkflowSources(snapshot,cfg.planWorkflowSourceSha256)
 return{observed_pair_enabled:state.enabled,verifiers_match_intent:matches,worker_login_verified:worker,dispatch_login_verified:dispatch,actual_api_catalog_verified:catalog,migration_ledger_unchanged:true,all133_table_images_unchanged:true}
}
