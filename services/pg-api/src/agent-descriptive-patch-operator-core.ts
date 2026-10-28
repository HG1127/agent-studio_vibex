// Unmounted060 core. The frozen offline source manifest does NOT seal this
// file. A future trusted entry must seal core/CLI, validate private files and
// supply its independently approved expected digest before any installation.
import {createHash,randomUUID} from 'node:crypto'
import type {SqlClient} from './contracts.ts'
import {assertDescriptivePatchOperatorSnapshot,type DescriptivePatchOperatorSnapshot} from './agent-descriptive-patch-operator-source.mjs'
import {assertGeneratedOperatorSnapshot,type GeneratedOperatorSnapshot} from './agent-generated-operator-source.mjs'
import {assertGeneratedOperatorAuthorization,generatedOperatorCatalogSql,generatedOperatorContextSql,generatedOperatorTargetSql,type GeneratedOperatorApproval} from './agent-generated-operator-core.ts'
import {verifyAgentGeneratedCredentials} from './agent-generated-audit.ts'
import {verifyAgentDescriptivePatchCredentials} from './agent-descriptive-patch-audit.ts'
import {verifyOptionalCredentialBoundary} from './optional-credential-boundary.ts'
import {serviceLoginTargetGuardSql} from './pg18-service-login-policy.mjs'

type Client=SqlClient&{release(destroy?:boolean):void}
type Pool={connect():Promise<Client>}
type Target=Readonly<{system_identifier:string;database_oid:string}>
export type DescriptivePatchOperatorApproval=Target&Readonly<{
  format:'agent_descriptive_patch_operator_approval_v1';source_sha256:string;predecessor_source_sha256:string;
  predecessor_schema_sha256:string;fresh_runtime_source_sha256:string;backup_manifest_sha256:string;
  backup_archive_sha256:string;restore_evidence_sha256:string;expires_at:string;feature_disabled:true;
  maintenance_approved:true;workers_stopped:true;writes_disabled:true;installation_approved:boolean;
}>
export type DescriptivePatchOperatorJournal=Target&Readonly<{
  format:'agent_descriptive_patch_operator_journal_v1';source_sha256:string;predecessor_schema_sha256:string;
  nonce:string;backend_pid:number;backend_start:string;phase:'before_ddl'|'commit_pending'|'commit_unknown'|'commit_acknowledged';
}>
declare const authorizationType:unique symbol
export type DescriptivePatchOperatorAuthorization=Readonly<{[authorizationType]:true}>
type Persist=(record:DescriptivePatchOperatorJournal)=>Promise<void>
type ApprovalOrigin=Readonly<{snapshot:DescriptivePatchOperatorSnapshot;expected:string;checkedAt:number}>
type Authorization=ApprovalOrigin&Readonly<{approval:DescriptivePatchOperatorApproval;mode:'read'|'install';predecessorSnapshot:GeneratedOperatorSnapshot;predecessorApproval:GeneratedOperatorApproval}>
const approvals=new WeakMap<object,ApprovalOrigin>(),authorizations=new WeakMap<object,Authorization>()
const predecessorSourceSha='c934562ba2b8fa6c204bf0fa25573d2a63dc45cfdd6be22f30120a914d2d4bcb'
const hash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
const digits=(value:unknown):value is string=>typeof value==='string'&&/^[1-9][0-9]{0,19}$/.test(value)
const sha=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
function fail(code:string):never{throw Error('descriptive_patch_operator_'+code)}
function record(value:unknown,keys:readonly string[]):Record<string,unknown>{
  if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length)fail('invalid_evidence')
  const descriptors=Object.getOwnPropertyDescriptors(value)
  if(keys.some(key=>!descriptors[key]||!('value'in descriptors[key]!)||!descriptors[key]!.enumerable))fail('invalid_evidence')
  return value as Record<string,unknown>
}
function snapshotGate(snapshot:DescriptivePatchOperatorSnapshot,expected:string){
  if(!hash(expected))fail('source_refused')
  // No default to snapshot.source_sha256 or an automatically refreshed digest.
  assertDescriptivePatchOperatorSnapshot(snapshot,expected)
  if(snapshot.manifest.predecessor.source_sha256!==predecessorSourceSha||snapshot.manifest.latest_migration!=='pg_v9_060'||snapshot.manifest.default_fresh_latest!=='pg_v9_050')fail('source_refused')
}
export function assertDescriptivePatchOperatorSealedSnapshot(snapshot:DescriptivePatchOperatorSnapshot,expectedSourceSha256:string){
  snapshotGate(snapshot,expectedSourceSha256)
  const core='services/pg-api/src/agent-descriptive-patch-operator-core.ts'
  const cli='services/pg-api/src/agent-descriptive-patch-operator-cli.mjs'
  const source='services/pg-api/src/agent-descriptive-patch-operator-source.mjs'
  const paths=new Set(snapshot.manifest.sources.map(s=>s.path)),edges=snapshot.manifest.imports
  if(!paths.has(core)||!paths.has(cli)||!edges.some(e=>e.from===cli&&e.to===core)||!edges.some(e=>e.from===core&&e.to===source))fail('unsealed_operator_source')
}
const approvalKeys=['format','source_sha256','predecessor_source_sha256','system_identifier','database_oid','predecessor_schema_sha256',
  'fresh_runtime_source_sha256','backup_manifest_sha256','backup_archive_sha256','restore_evidence_sha256','expires_at',
  'feature_disabled','maintenance_approved','workers_stopped','writes_disabled','installation_approved'] as const
function approvalFields(raw:unknown,snapshot:DescriptivePatchOperatorSnapshot,expected:string,now:number){
  const v=record(raw,approvalKeys)
  if(!Number.isFinite(now)||v.format!=='agent_descriptive_patch_operator_approval_v1'||v.source_sha256!==expected||v.predecessor_source_sha256!==predecessorSourceSha||
    v.fresh_runtime_source_sha256!==snapshot.manifest.default_fresh_source_sha256||!digits(v.system_identifier)||!digits(v.database_oid)||
    approvalKeys.filter(k=>k.endsWith('_sha256')).some(k=>!hash(v[k]))||
    ['feature_disabled','maintenance_approved','workers_stopped','writes_disabled'].some(k=>v[k]!==true)||typeof v.installation_approved!=='boolean'||
    typeof v.expires_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v.expires_at)||!Number.isFinite(Date.parse(v.expires_at))||
    new Date(v.expires_at).toISOString()!==v.expires_at||Date.parse(v.expires_at)<=now||Date.parse(v.expires_at)>now+86400000)fail('invalid_evidence')
  return v
}
// Parsing a candidate does not prove backup, restore, OS maintenance or file
// provenance, and does not authorize a connection. No backup verifier is minted.
export function parseDescriptivePatchOperatorApproval(raw:unknown,snapshot:DescriptivePatchOperatorSnapshot,expectedSourceSha256:string,now=Date.now()):DescriptivePatchOperatorApproval{
  snapshotGate(snapshot,expectedSourceSha256)
  const approval=Object.freeze({...approvalFields(raw,snapshot,expectedSourceSha256,now)}) as DescriptivePatchOperatorApproval
  approvals.set(approval,Object.freeze({snapshot,expected:expectedSourceSha256,checkedAt:now}))
  return approval
}
function checkAuthorization(value:Authorization){
  const now=Date.now(),{snapshot,expected,approval,predecessorSnapshot,predecessorApproval}=value
  snapshotGate(snapshot,expected)
  const origin=approvals.get(approval)
  if(!origin||origin.snapshot!==snapshot||origin.expected!==expected||now<origin.checkedAt)fail('approval_provenance_required')
  approvalFields(approval,snapshot,expected,now)
  assertGeneratedOperatorSnapshot(predecessorSnapshot,predecessorSourceSha)
  // Reuse the original private WeakMap provenance and real-clock age checks.
  // NEVER call verifyGeneratedOperatorBackupEvidence here with substitute
  // objects. The trusted entry must supply the original accepted reference.
  assertGeneratedOperatorAuthorization(predecessorSnapshot,predecessorApproval)
  for(const key of ['system_identifier','database_oid','predecessor_schema_sha256','fresh_runtime_source_sha256',
    'backup_manifest_sha256','backup_archive_sha256','restore_evidence_sha256'] as const){
    if(approval[key]!==predecessorApproval[key])fail('backup_binding_changed')
  }
  if(Date.parse(approval.expires_at)>Date.parse(predecessorApproval.expires_at))fail('backup_binding_changed')
  if(value.mode!=='read'&&value.mode!=='install'||value.mode==='install'&&approval.installation_approved!==true)fail('write_not_approved')
  // Even genuine old evidence cannot authorize an unsealed new implementation.
  // The current35fb offline foundation intentionally refuses this boundary.
  assertDescriptivePatchOperatorSealedSnapshot(snapshot,expected)
  return approval
}
export function authorizeDescriptivePatchOperator(snapshot:DescriptivePatchOperatorSnapshot,approval:DescriptivePatchOperatorApproval,
  predecessorSnapshot:GeneratedOperatorSnapshot,predecessorApproval:GeneratedOperatorApproval,mode:'read'|'install'):DescriptivePatchOperatorAuthorization{
  const origin=approvals.get(approval)
  if(!origin||origin.snapshot!==snapshot)fail('approval_provenance_required')
  const value=Object.freeze({...origin,approval,predecessorSnapshot,predecessorApproval,mode})
  checkAuthorization(value)
  const capability=Object.freeze({}) as DescriptivePatchOperatorAuthorization
  authorizations.set(capability,value)
  return capability
}
export function assertDescriptivePatchOperatorAuthorization(snapshot:DescriptivePatchOperatorSnapshot,capability:DescriptivePatchOperatorAuthorization){
  const value=authorizations.get(capability)
  if(!value||value.snapshot!==snapshot)fail('trusted_evidence_required')
  return checkAuthorization(value)
}
// No platform/UID override argument. Ordinary-machine refusal precedes pools.
export function assertDescriptivePatchOperatorHost(){
  if(process.platform!=='linux'||process.getuid?.()!==0)fail('disabled')
}
const journalKeys=['format','source_sha256','system_identifier','database_oid','predecessor_schema_sha256','nonce','backend_pid','backend_start','phase'] as const
function journalFields(raw:unknown){
  const v=record(raw,journalKeys)
  if(v.format!=='agent_descriptive_patch_operator_journal_v1'||!hash(v.source_sha256)||!hash(v.predecessor_schema_sha256)||!digits(v.system_identifier)||!digits(v.database_oid)||
    typeof v.nonce!=='string'||!(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/).test(v.nonce)||!Number.isSafeInteger(v.backend_pid)||Number(v.backend_pid)<=0||
    typeof v.backend_start!=='string'||!v.backend_start||v.backend_start.length>128||v.backend_start.includes('\0')||
    typeof v.phase!=='string'||!['before_ddl','commit_pending','commit_unknown','commit_acknowledged'].includes(v.phase))fail('invalid_journal')
  return v
}
export function parseDescriptivePatchOperatorJournal(raw:unknown,approval:DescriptivePatchOperatorApproval):DescriptivePatchOperatorJournal{
  if(!approvals.has(approval))fail('approval_provenance_required')
  const v=journalFields(raw)
  if(['source_sha256','system_identifier','database_oid','predecessor_schema_sha256'].some(k=>v[k]!==approval[k as keyof DescriptivePatchOperatorApproval]))fail('invalid_journal')
  return Object.freeze({...v}) as DescriptivePatchOperatorJournal
}
export function parseDescriptivePatchOperatorJournalRecords(raw:unknown,approval:DescriptivePatchOperatorApproval){
  if(!Array.isArray(raw)||Object.getPrototypeOf(raw)!==Array.prototype||raw.length<1||raw.length>3)fail('invalid_journal')
  const descriptors=Object.getOwnPropertyDescriptors(raw)
  if(Reflect.ownKeys(raw).length!==raw.length+1||Array.from({length:raw.length},(_,i)=>descriptors[String(i)]).some(d=>!d||!('value'in d)||!d.enumerable))fail('invalid_journal')
  const records=Array.from({length:raw.length},(_,i)=>parseDescriptivePatchOperatorJournal(descriptors[String(i)]!.value,approval)),first=records[0]!
  if(first.phase!=='before_ddl'||records.some((r,i)=>r.nonce!==first.nonce||r.backend_pid!==first.backend_pid||r.backend_start!==first.backend_start||
    i===1&&r.phase!=='commit_pending'||i===2&&!['commit_unknown','commit_acknowledged'].includes(r.phase)))fail('invalid_journal')
  return records.at(-1)!
}
export class DescriptivePatchOperatorCommitUnknown extends Error{
  readonly journal:DescriptivePatchOperatorJournal
  constructor(journal:DescriptivePatchOperatorJournal){super('descriptive_patch_operator_commit_unknown');this.journal=journal}
}
export class DescriptivePatchOperatorInstalledUnverified extends Error{
  readonly journal:DescriptivePatchOperatorJournal
  constructor(journal:DescriptivePatchOperatorJournal){super('descriptive_patch_operator_installed_unverified');this.journal=journal}
}
// Pure transport boundary shared with the actual path. It cannot choose DDL,
// supply a positive auditor or turn recovery into another install attempt.
export async function commitDescriptivePatchOperatorTransaction(db:SqlClient,journal:DescriptivePatchOperatorJournal,persist:Persist){
  const base=Object.freeze({...journalFields(journal)}) as DescriptivePatchOperatorJournal
  if(base.phase!=='before_ddl'||typeof persist!=='function')fail('invalid_journal')
  const pending=Object.freeze({...base,phase:'commit_pending' as const})
  await persist(pending)
  try{await db.query('COMMIT')}
  catch{
    const unknown=Object.freeze({...base,phase:'commit_unknown' as const})
    try{await persist(unknown)}catch{}
    throw new DescriptivePatchOperatorCommitUnknown(unknown)
  }
  const acknowledged=Object.freeze({...base,phase:'commit_acknowledged' as const})
  try{await persist(acknowledged)}catch{throw new DescriptivePatchOperatorInstalledUnverified(acknowledged)}
  return acknowledged
}
export const descriptivePatchOperatorContextSql=generatedOperatorContextSql
export const descriptivePatchOperatorTargetSql=generatedOperatorTargetSql
// Reuse the reviewed catalog query under the fixed c934 full059 closure. Only
// the optional migration exclusion changes: preserve ALL059 objects/stamp,
// exclude only060 objects and its FK RI mounts; full060 checks those exact OIDs.
export const descriptivePatchOperatorCatalogSql=generatedOperatorCatalogSql
  .replaceAll('pg_v9_059','pg_v9_060').replaceAll('agent_generated_','agent_descriptive_patch_')
  .replaceAll(',16)',',24)').replaceAll(',17)',',25)')
export const descriptivePatchOperatorLockSql='SELECT pg_try_advisory_xact_lock(61824,271828) AND pg_try_advisory_xact_lock(61824,20261024) AS locked'
export const descriptivePatchOperatorRuntimeRoles=Object.freeze(['agentstudio_api','agentstudio_worker','agentstudio_native_auth','agentstudio_bound_dispatch','agentstudio_model_broker',
  'agentstudio_knowledge_index_worker','agentstudio_knowledge_index_broker','agentstudio_review_worker','agentstudio_review_dispatch'])
export const descriptivePatchOperatorQuiescenceSql="SELECT count(*)::integer AS count FROM pg_catalog.pg_stat_activity a JOIN pg_catalog.pg_roles login ON login.oid=a.usesysid "+
  "WHERE a.pid<>pg_backend_pid() AND NOT login.rolsuper AND EXISTS(SELECT 1 FROM pg_catalog.pg_roles runtime WHERE runtime.rolname=ANY($1::text[]) AND pg_catalog.pg_has_role(login.oid,runtime.oid,'MEMBER'))"
const transactionReadOnlySql="SELECT pg_catalog.current_setting('transaction_read_only')='on' AS read_only"
const activeJournalSql='SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE pid=$1 AND backend_start::text=$2 AND pid<>pg_backend_pid() AND xact_start IS NOT NULL) AS active'
async function target(db:SqlClient,expected:Target){
  await db.query(serviceLoginTargetGuardSql)
  const rows=(await db.query<Target&{backend_pid:number;backend_start:string}>(descriptivePatchOperatorTargetSql)).rows,actual=rows[0]
  if(rows.length!==1||!actual||actual.system_identifier!==expected.system_identifier||actual.database_oid!==expected.database_oid||!Number.isSafeInteger(actual.backend_pid)||actual.backend_pid<=0||typeof actual.backend_start!=='string'||!actual.backend_start)fail('target_changed')
  return actual
}
async function quiescent(db:SqlClient){
  // Same authenticated OID/transitive MEMBER check as059, including idle,
  // custom and NOINHERIT workers. This does not claim to stop OS services.
  const rows=(await db.query<{count:number}>(descriptivePatchOperatorQuiescenceSql,[[...descriptivePatchOperatorRuntimeRoles]])).rows
  if(rows.length!==1||rows[0]?.count!==0)fail('runtime_connections_present')
}
async function schema(db:SqlClient,approval:DescriptivePatchOperatorApproval){
  await db.query(descriptivePatchOperatorContextSql)
  const migrations=(await db.query<{version:string;description:string}>('SELECT version,description FROM agentstudio.schema_migrations ORDER BY version')).rows
  if(!migrations.some(m=>m.version==='pg_v9_059')||new Set(migrations.map(m=>m.version)).size!==migrations.length||
    migrations.some(m=>/^pg_v9_/.test(m.version)&&(!/^pg_v9_0(?:[1-4][0-9]|5[0-9]|60)$/.test(m.version)||m.version>'pg_v9_060')))fail('predecessor_changed')
  let receipt:Record<string,unknown>
  try{receipt=JSON.parse(migrations.find(m=>m.version==='pg18_fresh_runtime_001')?.description??'')}catch{fail('fresh_receipt_changed')}
  if(!receipt||receipt.format!=='pg18_fresh_runtime_v1'||receipt.latest_migration!=='pg_v9_050'||receipt.source_sha256!==approval.fresh_runtime_source_sha256||receipt.legacy_rows_copied!==0||receipt.legacy_import_versions_fabricated!==false)fail('fresh_receipt_changed')
  const catalogs=(await db.query<{catalog:unknown}>(descriptivePatchOperatorCatalogSql)).rows
  if(catalogs.length!==1||!catalogs[0]?.catalog||sha(catalogs[0].catalog)!==approval.predecessor_schema_sha256)fail('predecessor_changed')
  await db.query('SET LOCAL ROLE agentstudio_api')
  let installed:boolean
  try{
    if(await verifyAgentGeneratedCredentials(db)!==true)fail('predecessor_audit_failed')
    installed=await verifyAgentDescriptivePatchCredentials(db)
    if(typeof installed!=='boolean'||installed!==migrations.some(m=>m.version==='pg_v9_060'))fail('schema_state_invalid')
  }finally{await db.query('RESET ROLE')}
  await target(db,approval)
  return installed
}
const pending=()=>Object.freeze({state:'pending' as const,installed:null,schema_verified:false,runtime_login_verified:false,
  invocation_commit_acknowledged:false,automatic_retry_authorized:false,production_cutover_allowed:false})
export async function inspectDescriptivePatchOperator(pool:Pool,snapshot:DescriptivePatchOperatorSnapshot,capability:DescriptivePatchOperatorAuthorization,journal?:DescriptivePatchOperatorJournal){
  assertDescriptivePatchOperatorHost()
  const approval=assertDescriptivePatchOperatorAuthorization(snapshot,capability)
  const savedJournal=journal===undefined?undefined:parseDescriptivePatchOperatorJournal(journal,approval)
  const db=await pool.connect()
  try{
    assertDescriptivePatchOperatorAuthorization(snapshot,capability)
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    await db.query(descriptivePatchOperatorContextSql)
    if((await db.query<{read_only:boolean}>(transactionReadOnlySql)).rows[0]?.read_only!==true)fail('recovery_transaction_unsafe')
    await db.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='45s'")
    await target(db,approval)
    if((await db.query<{locked:boolean}>(descriptivePatchOperatorLockSql)).rows[0]?.locked!==true)return pending()
    if(savedJournal&&(await db.query<{active:boolean}>(activeJournalSql,[savedJournal.backend_pid,savedJournal.backend_start])).rows[0]?.active!==false)return pending()
    const installed=await schema(db,approval)
    assertDescriptivePatchOperatorAuthorization(snapshot,capability)
    return Object.freeze({state:installed?'installed_exact' as const:'predecessor_exact' as const,installed,schema_verified:true,
      runtime_login_verified:false,source_sha256:approval.source_sha256,invocation_commit_acknowledged:false,automatic_retry_authorized:false,production_cutover_allowed:false})
  }finally{let destroy=false;await db.query('ROLLBACK').catch(()=>{destroy=true});db.release(destroy)}
}
export async function recoverDescriptivePatchOperator(pool:Pool,snapshot:DescriptivePatchOperatorSnapshot,capability:DescriptivePatchOperatorAuthorization,records:unknown){
  assertDescriptivePatchOperatorHost()
  const approval=assertDescriptivePatchOperatorAuthorization(snapshot,capability)
  const journal=parseDescriptivePatchOperatorJournalRecords(records,approval)
  return inspectDescriptivePatchOperator(pool,snapshot,capability,journal)
}
export async function applyDescriptivePatchOperator(pool:Pool,snapshot:DescriptivePatchOperatorSnapshot,capability:DescriptivePatchOperatorAuthorization,persist:Persist){
  assertDescriptivePatchOperatorHost()
  const approval=assertDescriptivePatchOperatorAuthorization(snapshot,capability)
  if(authorizations.get(capability)?.mode!=='install'||!approval.installation_approved)fail('write_not_approved')
  if(typeof persist!=='function')fail('durable_journal_required')
  const db=await pool.connect();let destroy=false,journal:DescriptivePatchOperatorJournal|undefined
  try{
    assertDescriptivePatchOperatorAuthorization(snapshot,capability)
    await db.query('BEGIN')
    await db.query(descriptivePatchOperatorContextSql)
    await db.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='45s'")
    const actual=await target(db,approval)
    if((await db.query<{locked:boolean}>(descriptivePatchOperatorLockSql)).rows[0]?.locked!==true)fail('schema_lock_busy')
    await quiescent(db)
    if(await schema(db,approval))fail('already_installed')
    journal=Object.freeze({format:'agent_descriptive_patch_operator_journal_v1',source_sha256:approval.source_sha256,
      system_identifier:approval.system_identifier,database_oid:approval.database_oid,predecessor_schema_sha256:approval.predecessor_schema_sha256,
      nonce:randomUUID(),backend_pid:actual.backend_pid,backend_start:actual.backend_start,phase:'before_ddl'})
    await persist(journal)
    assertDescriptivePatchOperatorAuthorization(snapshot,capability)
    const before=await target(db,approval)
    if(before.backend_pid!==actual.backend_pid||before.backend_start!==actual.backend_start)fail('client_changed')
    await quiescent(db)
    assertDescriptivePatchOperatorAuthorization(snapshot,capability)
    await db.query(snapshot.body) // The only DDL: exact060, once, on THIS client.
    if(!await schema(db,approval))fail('postflight_failed')
    const same=await target(db,approval)
    if(same.backend_pid!==actual.backend_pid||same.backend_start!==actual.backend_start)fail('client_changed')
    assertDescriptivePatchOperatorAuthorization(snapshot,capability)
    journal=await commitDescriptivePatchOperatorTransaction(db,journal,persist)
  }catch(error){
    if(error instanceof DescriptivePatchOperatorCommitUnknown){destroy=true;throw error}
    if(error instanceof DescriptivePatchOperatorInstalledUnverified)throw error
    await db.query('ROLLBACK').catch(()=>{destroy=true});throw error
  }finally{db.release(destroy)}
  try{
    const post=await inspectDescriptivePatchOperator(pool,snapshot,capability)
    if(post.state!=='installed_exact')fail('durable_postflight_failed')
    return Object.freeze({...post,invocation_commit_acknowledged:true,services_started:false,feature_activation_authorized:false})
  }catch{throw new DescriptivePatchOperatorInstalledUnverified(journal!)}
}
// Separate actual runtime pool, never the privileged installation client. No
// fake pool, role/user result substitution or verifier override is accepted.
export async function verifyDescriptivePatchOperatorRuntimeLogin(pool:Pool,snapshot:DescriptivePatchOperatorSnapshot,capability:DescriptivePatchOperatorAuthorization,kind:'api'|'worker'|'identity'|'broker'){
  assertDescriptivePatchOperatorHost()
  const approval=assertDescriptivePatchOperatorAuthorization(snapshot,capability)
  const logins={api:'agentstudio_stage_login',worker:'agentstudio_stage_worker',identity:'agentstudio_bound_dispatch_login',broker:'agentstudio_model_broker_login'}
  if(!Object.hasOwn(logins,kind))fail('runtime_kind_invalid')
  const login=logins[kind],role=kind==='identity'?'agentstudio_bound_dispatch':kind==='broker'?'agentstudio_model_broker':'agentstudio_api'
  const db=await pool.connect()
  try{
    assertDescriptivePatchOperatorAuthorization(snapshot,capability)
    await db.query('BEGIN READ ONLY')
    await db.query(descriptivePatchOperatorContextSql)
    const state=(await db.query<{ok:boolean}>("SELECT current_database()='agent_studio' AND host(inet_server_addr())='127.0.0.1' AND inet_server_port()=5333 AND current_setting('server_version_num')::integer BETWEEN 180000 AND 189999 AND session_user=$1 AND current_user=session_user AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreaterole AND NOT r.rolcreatedb AND NOT r.rolreplication AND NOT pg_is_in_recovery() AND (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database())=$2 AS ok FROM pg_catalog.pg_roles r WHERE r.rolname=session_user",[login,approval.database_oid])).rows[0]
    if(state?.ok!==true)fail('runtime_login_unsafe')
    const member=(await db.query<{ok:boolean}>("SELECT pg_has_role(session_user,(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1::text),'SET') AS ok",[role])).rows[0]
    if(member?.ok!==true)fail('runtime_login_unsafe')
    await db.query('SET LOCAL ROLE '+role)
    const assumed=(await db.query<{login:string;role:string}>('SELECT session_user AS login,current_user AS role')).rows[0]
    if(assumed?.login!==login||assumed.role!==role)fail('runtime_login_unsafe')
    await verifyOptionalCredentialBoundary(db,kind)
    if(kind==='api'||kind==='worker'){
      await db.query('SET LOCAL ROLE agentstudio_api')
      if(await verifyAgentGeneratedCredentials(db)!==true||await verifyAgentDescriptivePatchCredentials(db)!==true)fail('runtime_schema_unsafe')
    }
    assertDescriptivePatchOperatorAuthorization(snapshot,capability)
    return Object.freeze({kind,login,actual_login_verified:true,production_cutover_allowed:false})
  }finally{let destroy=false;await db.query('ROLLBACK').catch(()=>{destroy=true});db.release(destroy)}
}
