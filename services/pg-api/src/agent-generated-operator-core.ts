import {createHash,randomUUID} from 'node:crypto'
import type {SqlClient} from './contracts.ts'
import {assertGeneratedOperatorSnapshot,type GeneratedOperatorSnapshot} from './agent-generated-operator-source.mjs'
import {verifyAgentGeneratedCredentials} from './agent-generated-audit.ts'
import {verifyAgentOpinionCredentials} from './agent-opinion-audit.ts'
import {verifyOptionalCredentialBoundary} from './optional-credential-boundary.ts'
import {serviceLoginTargetGuardSql} from './pg18-service-login-policy.mjs'

type Client=SqlClient&{release(destroy?:boolean):void}
type Pool={connect():Promise<Client>}
type Target={system_identifier:string;database_oid:string}
export type GeneratedOperatorApproval=Target&{
  format:'agent_generated_operator_approval_v1';source_sha256:string;predecessor_schema_sha256:string;
  fresh_runtime_source_sha256:string;backup_manifest_sha256:string;backup_archive_sha256:string;
  restore_evidence_sha256:string;expires_at:string;feature_disabled:true;maintenance_approved:true
}
export type GeneratedOperatorJournal=Target&{
  format:'agent_generated_operator_journal_v1';source_sha256:string;predecessor_schema_sha256:string;
  nonce:string;backend_pid:number;backend_start:string;phase:'before_ddl'|'commit_pending'|'commit_unknown'|'commit_acknowledged'
}
type Persist=(record:GeneratedOperatorJournal)=>Promise<void>
const sha=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const hash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
const digits=(value:unknown):value is string=>typeof value==='string'&&/^[1-9][0-9]{0,19}$/.test(value)
function fail(code:string):never{throw Error('generated_operator_'+code)}
function record(value:unknown,keys:string[]):Record<string,unknown>{
  if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length)fail('invalid_evidence')
  const descriptors=Object.getOwnPropertyDescriptors(value)
  if(keys.some(key=>!descriptors[key]||!('value'in descriptors[key]!)||!descriptors[key]!.enumerable))fail('invalid_evidence')
  return value as Record<string,unknown>
}
const approvalKeys=['format','source_sha256','system_identifier','database_oid','predecessor_schema_sha256','fresh_runtime_source_sha256',
  'backup_manifest_sha256','backup_archive_sha256','restore_evidence_sha256','expires_at','feature_disabled','maintenance_approved']
export function parseGeneratedOperatorApproval(raw:unknown,snapshot:GeneratedOperatorSnapshot,now=Date.now()):GeneratedOperatorApproval{
  assertGeneratedOperatorSnapshot(snapshot,snapshot.source_sha256)
  const v=record(raw,approvalKeys)
  if(v.format!=='agent_generated_operator_approval_v1'||v.source_sha256!==snapshot.source_sha256||v.fresh_runtime_source_sha256!==snapshot.manifest.default_fresh_source_sha256||!digits(v.system_identifier)||!digits(v.database_oid)||
    approvalKeys.filter(k=>k.endsWith('_sha256')).some(k=>!hash(v[k]))||v.feature_disabled!==true||v.maintenance_approved!==true||
    typeof v.expires_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v.expires_at)||
    !Number.isFinite(Date.parse(v.expires_at))||new Date(v.expires_at).toISOString()!==v.expires_at||Date.parse(v.expires_at)<=now||Date.parse(v.expires_at)>now+86400000)fail('invalid_evidence')
  return Object.freeze({...v}) as GeneratedOperatorApproval
}
type VerifiedBackup=Readonly<{approval:Readonly<GeneratedOperatorApproval>;backup:Readonly<Record<string,unknown>>;restore:Readonly<Record<string,unknown>>;backupSha:string;restoreSha:string;checkedAt:number}>
const backed=new WeakMap<object,VerifiedBackup>()
export function verifyGeneratedOperatorBackupEvidence(approval:GeneratedOperatorApproval,backup:unknown,restore:unknown,backupSha:string,restoreSha:string,now=Date.now()){
  if(!Number.isFinite(now)||backupSha!==approval.backup_manifest_sha256||restoreSha!==approval.restore_evidence_sha256)fail('backup_changed')
  const b=record(backup,['format','archive_sha256','system_identifier','database_oid','predecessor_schema_sha256','fresh_runtime_source_sha256','captured_at'])
  const r=record(restore,['format','backup_manifest_sha256','archive_sha256','system_identifier','database_oid','predecessor_schema_sha256','verified_at','restored'])
  if(b.format!=='pg18_generated_059_backup_v1'||r.format!=='pg18_generated_059_restore_v1'||r.restored!==true||r.backup_manifest_sha256!==backupSha||
    b.archive_sha256!==approval.backup_archive_sha256||r.archive_sha256!==approval.backup_archive_sha256||
    ['system_identifier','database_oid','predecessor_schema_sha256'].some(k=>b[k]!==approval[k as keyof GeneratedOperatorApproval]||r[k]!==b[k])||b.fresh_runtime_source_sha256!==approval.fresh_runtime_source_sha256)fail('backup_changed')
  for(const date of [b.captured_at,r.verified_at])if(typeof date!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString()!==date||Date.parse(date)>now||Date.parse(date)<now-86400000)fail('backup_changed')
  if(Date.parse(String(r.verified_at))<Date.parse(String(b.captured_at)))fail('backup_changed')
  // This binds separately accepted root-owned backup/restore evidence. It does
  // not manufacture a backup or treat a digest as proof of a restore drill.
  const saved=backed.get(approval)
  if(saved){
    if(now<saved.checkedAt||approvalKeys.some(k=>approval[k as keyof GeneratedOperatorApproval]!==saved.approval[k as keyof GeneratedOperatorApproval])||
      Object.keys(saved.backup).some(k=>b[k]!==saved.backup[k])||Object.keys(saved.restore).some(k=>r[k]!==saved.restore[k])||backupSha!==saved.backupSha||restoreSha!==saved.restoreSha)fail('backup_changed')
  }else backed.set(approval,Object.freeze({approval:Object.freeze({...approval}),backup:Object.freeze({...b}),restore:Object.freeze({...r}),backupSha,restoreSha,checkedAt:now}))
  return approval
}
export function parseGeneratedOperatorJournal(raw:unknown,approval:GeneratedOperatorApproval):GeneratedOperatorJournal{
  const v=record(raw,['format','source_sha256','system_identifier','database_oid','predecessor_schema_sha256','nonce','backend_pid','backend_start','phase'])
  if(v.format!=='agent_generated_operator_journal_v1'||['source_sha256','system_identifier','database_oid','predecessor_schema_sha256'].some(k=>v[k]!==approval[k as keyof GeneratedOperatorApproval])||
    typeof v.nonce!=='string'||!(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/).test(v.nonce)||!Number.isSafeInteger(v.backend_pid)||Number(v.backend_pid)<=0||
    typeof v.backend_start!=='string'||!v.backend_start||!['before_ddl','commit_pending','commit_unknown','commit_acknowledged'].includes(String(v.phase)))fail('invalid_journal')
  return Object.freeze({...v}) as GeneratedOperatorJournal
}
export class GeneratedOperatorCommitUnknown extends Error{
  readonly journal:GeneratedOperatorJournal
  constructor(journal:GeneratedOperatorJournal){super('generated_operator_commit_unknown');this.journal=journal}
}
export class GeneratedOperatorInstalledUnverified extends Error{
  readonly journal:GeneratedOperatorJournal
  constructor(journal:GeneratedOperatorJournal){super('generated_operator_installed_unverified');this.journal=journal}
}
// A narrow commit boundary, shared by the real audited path and pure transport
// fault tests. It supplies no DDL/auditor override or caller-controlled SQL.
export async function commitGeneratedOperatorTransaction(db:SqlClient,journal:GeneratedOperatorJournal,persist:Persist){
  const pending={...journal,phase:'commit_pending' as const};await persist(Object.freeze(pending))
  try{await db.query('COMMIT')}
  catch{
    const unknown={...journal,phase:'commit_unknown' as const}
    await persist(Object.freeze(unknown)).catch(()=>{})
    throw new GeneratedOperatorCommitUnknown(unknown)
  }
  const acknowledged={...journal,phase:'commit_acknowledged' as const}
  try{await persist(Object.freeze(acknowledged))}catch{throw new GeneratedOperatorInstalledUnverified(acknowledged)}
  return acknowledged
}
// Fixed caller context for deparsing public extension objects and full audits.
// Re-establish it after the unchanged059 body sets its own transaction-local path.
export const generatedOperatorContextSql='SET LOCAL search_path=pg_catalog,public'
// Stable catalog metadata only. No employee/feedback/output rows or prosrc text
// leave PostgreSQL. New059 RI triggers on old parent tables are excluded by the
// validated new FK namespace; the unchanged full validators remain authoritative.
export const generatedOperatorCatalogSql=`SELECT jsonb_build_object(
 'schemas',(SELECT coalesce(jsonb_agg(jsonb_build_array(nspname,nspowner,nspacl) ORDER BY nspname),'[]'::jsonb) FROM pg_catalog.pg_namespace WHERE nspname IN('agentstudio','agentstudio_auth')),
 'migrations',(SELECT coalesce(jsonb_agg(jsonb_build_array(version,description) ORDER BY version),'[]'::jsonb) FROM agentstudio.schema_migrations WHERE version<>'pg_v9_059'),
 'relations',(SELECT coalesce(jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relkind,c.relowner,c.relrowsecurity,c.relforcerowsecurity,c.relacl,c.reloptions) ORDER BY n.nspname,c.relname),'[]'::jsonb) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND left(c.relname,16)<>'agent_generated_'),
 'columns',(SELECT coalesce(jsonb_agg(jsonb_build_array(n.nspname,c.relname,a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attisdropped,a.attidentity,a.attgenerated,a.attacl,pg_get_expr(d.adbin,d.adrelid)) ORDER BY n.nspname,c.relname,a.attnum),'[]'::jsonb) FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname IN('agentstudio','agentstudio_auth') AND left(c.relname,16)<>'agent_generated_' AND a.attnum>0),
 'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_array(n.nspname,x.conname,x.conrelid,x.confrelid,x.convalidated,pg_get_constraintdef(x.oid)) ORDER BY n.nspname,x.conname,x.oid),'[]'::jsonb) FROM pg_catalog.pg_constraint x JOIN pg_catalog.pg_namespace n ON n.oid=x.connamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND left(x.conname,16)<>'agent_generated_'),
 'routines',(SELECT coalesce(jsonb_agg(jsonb_build_array(n.nspname,p.proname,oidvectortypes(p.proargtypes),p.proowner,p.prorettype,p.prosecdef,p.provolatile,p.proisstrict,p.proconfig,p.proacl,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')) ORDER BY n.nspname,p.proname,oidvectortypes(p.proargtypes)),'[]'::jsonb) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND left(p.proname,16)<>'agent_generated_'),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_array(t.tgrelid,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) ORDER BY t.tgrelid,t.tgname),'[]'::jsonb) FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND left(c.relname,16)<>'agent_generated_' AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint x WHERE x.oid=t.tgconstraint AND left(x.conname,16)='agent_generated_')),
 'policies',(SELECT coalesce(jsonb_agg(jsonb_build_array(p.polrelid,p.polname,p.polcmd,p.polroles,p.polpermissive,pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polrelid,p.polname),'[]'::jsonb) FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth')),
 'types',(SELECT coalesce(jsonb_agg(jsonb_build_array(n.nspname,t.typname,t.typowner,t.typtype,t.typrelid,t.typelem,t.typarray,t.typnotnull,t.typbasetype,t.typtypmod,t.typacl,t.typdefault) ORDER BY n.nspname,t.typname),'[]'::jsonb) FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND left(t.typname,16)<>'agent_generated_' AND left(t.typname,17)<>'_agent_generated_'),
 'indexes',(SELECT coalesce(jsonb_agg(jsonb_build_array(i.indexrelid,i.indrelid,i.indisunique,i.indisprimary,i.indisexclusion,i.indimmediate,i.indisvalid,i.indisready,i.indislive,pg_get_indexdef(i.indexrelid)) ORDER BY i.indexrelid),'[]'::jsonb) FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND left(c.relname,16)<>'agent_generated_'),
 'defaults',(SELECT coalesce(jsonb_agg(jsonb_build_array(defaclrole,defaclnamespace,defaclobjtype,defaclacl) ORDER BY defaclrole,defaclnamespace,defaclobjtype),'[]'::jsonb) FROM pg_catalog.pg_default_acl WHERE defaclnamespace IN(0,'agentstudio'::regnamespace,'agentstudio_auth'::regnamespace)),
 'roles',(SELECT coalesce(jsonb_agg(jsonb_build_array(rolname,rolcanlogin,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,rolconfig) ORDER BY rolname),'[]'::jsonb) FROM pg_catalog.pg_roles WHERE rolname LIKE 'agentstudio_%'),
 'memberships',(SELECT coalesce(jsonb_agg(jsonb_build_array(roleid,member,grantor,admin_option,inherit_option,set_option) ORDER BY roleid,member,grantor),'[]'::jsonb) FROM pg_catalog.pg_auth_members WHERE roleid IN(SELECT oid FROM pg_catalog.pg_roles WHERE rolname LIKE 'agentstudio_%') OR member IN(SELECT oid FROM pg_catalog.pg_roles WHERE rolname LIKE 'agentstudio_%'))
) AS catalog`
export const generatedOperatorTargetSql="SELECT (pg_control_system()).system_identifier::text AS system_identifier,(SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()) AS database_oid,pg_backend_pid() AS backend_pid,(SELECT backend_start::text FROM pg_catalog.pg_stat_activity WHERE pid=pg_backend_pid()) AS backend_start"
const lockSql='SELECT pg_try_advisory_xact_lock(61824,271828) AND pg_try_advisory_xact_lock(61824,20261024) AS locked'
const runtimeRoles=Object.freeze(['agentstudio_api','agentstudio_worker','agentstudio_native_auth','agentstudio_bound_dispatch','agentstudio_model_broker',
  'agentstudio_knowledge_index_worker','agentstudio_knowledge_index_broker','agentstudio_review_worker','agentstudio_review_dispatch'])
async function target(db:SqlClient,expected:Target){
  await db.query(serviceLoginTargetGuardSql)
  const actual=(await db.query<Target&{backend_pid:number;backend_start:string}>(generatedOperatorTargetSql)).rows[0]
  if(!actual||actual.system_identifier!==expected.system_identifier||actual.database_oid!==expected.database_oid||!Number.isSafeInteger(actual.backend_pid)||actual.backend_pid<=0||!actual.backend_start)fail('target_changed')
  return actual
}
async function schema(db:SqlClient,approval:GeneratedOperatorApproval){
  await db.query(generatedOperatorContextSql)
  const migrations=(await db.query<{version:string;description:string}>('SELECT version,description FROM agentstudio.schema_migrations ORDER BY version')).rows
  if(!migrations.some(m=>m.version==='pg_v9_058')||new Set(migrations.map(m=>m.version)).size!==migrations.length||migrations.some(m=>/^pg_v9_/.test(m.version)&&(!/^pg_v9_0(?:[1-4][0-9]|5[0-9])$/.test(m.version)||m.version>'pg_v9_059')))fail('predecessor_changed')
  const fresh=migrations.find(m=>m.version==='pg18_fresh_runtime_001');let receipt:Record<string,unknown>
  try{receipt=JSON.parse(fresh?.description??'')}catch{fail('fresh_receipt_changed')}
  if(receipt.format!=='pg18_fresh_runtime_v1'||receipt.latest_migration!=='pg_v9_050'||receipt.source_sha256!==approval.fresh_runtime_source_sha256||receipt.legacy_rows_copied!==0||receipt.legacy_import_versions_fabricated!==false)fail('fresh_receipt_changed')
  const value=(await db.query<{catalog:unknown}>(generatedOperatorCatalogSql)).rows[0]?.catalog
  if(!value||sha(value)!==approval.predecessor_schema_sha256)fail('predecessor_changed')
  await db.query('SET LOCAL ROLE agentstudio_api')
  let installed:boolean
  try{
    installed=await verifyAgentGeneratedCredentials(db)
    if(!installed&&await verifyAgentOpinionCredentials(db)!==true)fail('predecessor_audit_failed')
    if(installed!==migrations.some(m=>m.version==='pg_v9_059'))fail('schema_state_invalid')
  }finally{await db.query('RESET ROLE')}
  await target(db,approval)
  return installed
}
// Pure capability/time gate shared by entry and the immediate pre-DDL boundary.
// No caller-owned evidence object or a prior brand can extend its validity.
export function assertGeneratedOperatorAuthorization(snapshot:GeneratedOperatorSnapshot,approval:GeneratedOperatorApproval){
  assertGeneratedOperatorSnapshot(snapshot,approval.source_sha256)
  parseGeneratedOperatorApproval(approval,snapshot)
  const saved=backed.get(approval)
  if(!saved)fail('backup_evidence_required')
  verifyGeneratedOperatorBackupEvidence(approval,saved.backup,saved.restore,saved.backupSha,saved.restoreSha)
  return approval
}
export async function inspectGeneratedOperator(pool:Pool,snapshot:GeneratedOperatorSnapshot,raw:GeneratedOperatorApproval,journal?:GeneratedOperatorJournal){
  const approval=assertGeneratedOperatorAuthorization(snapshot,raw);if(journal)parseGeneratedOperatorJournal(journal,approval)
  const db=await pool.connect()
  try{
    assertGeneratedOperatorAuthorization(snapshot,approval)
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    await db.query(generatedOperatorContextSql)
    const transaction=(await db.query<{read_only:boolean}>("SELECT pg_catalog.current_setting('transaction_read_only')='on' AS read_only")).rows[0]
    if(transaction?.read_only!==true)fail('recovery_transaction_unsafe')
    await db.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='45s'")
    await target(db,approval)
    const lock=(await db.query<{locked:boolean}>(lockSql)).rows[0]
    if(lock?.locked!==true)return {state:'pending' as const,installed:null,schema_verified:false,runtime_login_verified:false,production_cutover_allowed:false}
    if(journal){
      // This confirmed read-only inspector transaction may reuse the backend
      // of an ended install. Other live backends still block recovery, as do
      // the original transaction's advisory locks checked above.
      const active=(await db.query<{active:boolean}>("SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE pid=$1 AND backend_start::text=$2 AND pid<>pg_backend_pid() AND xact_start IS NOT NULL) AS active",[journal.backend_pid,journal.backend_start])).rows[0]
      if(active?.active!==false)return {state:'pending' as const,installed:null,schema_verified:false,runtime_login_verified:false,production_cutover_allowed:false}
    }
    const installed=await schema(db,approval)
    return {state:installed?'installed_exact' as const:'predecessor_exact' as const,installed,schema_verified:true,runtime_login_verified:false,
      source_sha256:snapshot.source_sha256,invocation_commit_acknowledged:false,automatic_retry_authorized:false,production_cutover_allowed:false}
  }finally{let destroy=false;await db.query('ROLLBACK').catch(()=>{destroy=true});db.release(destroy)}
}
export async function applyGeneratedOperator(pool:Pool,snapshot:GeneratedOperatorSnapshot,raw:GeneratedOperatorApproval,persist:Persist){
  const approval=assertGeneratedOperatorAuthorization(snapshot,raw)
  if(typeof persist!=='function')fail('durable_journal_required')
  const db=await pool.connect();let destroy=false,journal:GeneratedOperatorJournal|undefined
  try{
    assertGeneratedOperatorAuthorization(snapshot,approval)
    await db.query('BEGIN')
    await db.query(generatedOperatorContextSql)
    await db.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='45s'")
    const actual=await target(db,approval)
    if((await db.query<{locked:boolean}>(lockSql)).rows[0]?.locked!==true)fail('schema_lock_busy')
    // The activity login OID remains the authenticated session identity even
    // after SET ROLE. MEMBER includes NOINHERIT and transitive memberships,
    // covering independently named review/index logins. Superusers report
    // implicit membership everywhere and are not runtime sessions here.
    const connected=(await db.query<{count:number}>("SELECT count(*)::integer AS count FROM pg_catalog.pg_stat_activity a JOIN pg_catalog.pg_roles login ON login.oid=a.usesysid "+
      "WHERE a.pid<>pg_backend_pid() AND NOT login.rolsuper AND EXISTS(SELECT 1 FROM pg_catalog.pg_roles runtime WHERE runtime.rolname=ANY($1::text[]) AND pg_catalog.pg_has_role(login.oid,runtime.oid,'MEMBER'))",[[...runtimeRoles]])).rows[0]
    if(connected?.count!==0)fail('runtime_connections_present')
    if(await schema(db,approval))fail('already_installed')
    journal={format:'agent_generated_operator_journal_v1',source_sha256:snapshot.source_sha256,system_identifier:approval.system_identifier,database_oid:approval.database_oid,
      predecessor_schema_sha256:approval.predecessor_schema_sha256,nonce:randomUUID(),backend_pid:actual.backend_pid,backend_start:actual.backend_start,phase:'before_ddl'}
    await persist(Object.freeze({...journal}))
    assertGeneratedOperatorAuthorization(snapshot,approval)
    await db.query(snapshot.body)
    // Direct full validator on THIS real client sees uncommitted059. schema()
    // restores the fixed caller path and API role, never an employee identity.
    if(!await schema(db,approval))fail('postflight_failed')
    const same=await target(db,approval)
    if(same.backend_pid!==actual.backend_pid||same.backend_start!==actual.backend_start)fail('client_changed')
    journal=await commitGeneratedOperatorTransaction(db,journal,persist)
  }catch(error){
    if(error instanceof GeneratedOperatorCommitUnknown){destroy=true;throw error}
    if(error instanceof GeneratedOperatorInstalledUnverified)throw error
    await db.query('ROLLBACK').catch(()=>{destroy=true});throw error
  }finally{db.release(destroy)}
  try{
    const post=await inspectGeneratedOperator(pool,snapshot,approval)
    if(post.state!=='installed_exact')fail('durable_postflight_failed')
    return {...post,invocation_commit_acknowledged:true,services_started:false,feature_activation_authorized:false}
  }catch{throw new GeneratedOperatorInstalledUnverified(journal!)}
}
// Separate real login pool only; never pass the privileged installation client
// through a fake pool or substitute role/session/user query results.
export async function verifyGeneratedOperatorRuntimeLogin(pool:Pool,kind:'api'|'worker'|'identity'|'broker',expected:Target){
  const logins={api:'agentstudio_stage_login',worker:'agentstudio_stage_worker',identity:'agentstudio_bound_dispatch_login',broker:'agentstudio_model_broker_login'}
  if(!Object.hasOwn(logins,kind))fail('runtime_kind_invalid')
  const login=logins[kind],role=kind==='identity'?'agentstudio_bound_dispatch':kind==='broker'?'agentstudio_model_broker':'agentstudio_api'
  record(expected,['system_identifier','database_oid']);if(!digits(expected.system_identifier)||!digits(expected.database_oid))fail('target_changed')
  const db=await pool.connect()
  try{
    await db.query('BEGIN READ ONLY')
    await db.query(generatedOperatorContextSql)
    const state=(await db.query<{ok:boolean}>("SELECT current_database()='agent_studio' AND host(inet_server_addr())='127.0.0.1' AND inet_server_port()=5333 AND current_setting('server_version_num')::integer BETWEEN 180000 AND 189999 AND session_user=$1 AND current_user=session_user AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreaterole AND NOT r.rolcreatedb AND NOT r.rolreplication AND NOT pg_is_in_recovery() AND (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database())=$2 AS ok FROM pg_catalog.pg_roles r WHERE r.rolname=session_user",[login,expected.database_oid])).rows[0]
    // pg_control_system is intentionally NOT granted to runtime logins. The
    // expected cluster binding is established by the separate admin postcheck;
    // this pool proves its actual login and forced endpoint/database identity.
    if(state?.ok!==true)fail('runtime_login_unsafe')
    // NOINHERIT logins must explicitly assume their fixed, already-granted
    // audit group. session_user remains the real login for the full boundary.
    const member=(await db.query<{ok:boolean}>("SELECT pg_has_role(session_user,(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1::text),'SET') AS ok",[role])).rows[0]
    if(member?.ok!==true)fail('runtime_login_unsafe')
    await db.query('SET LOCAL ROLE '+role)
    const assumed=(await db.query<{login:string;role:string}>('SELECT session_user AS login,current_user AS role')).rows[0]
    if(assumed?.login!==login||assumed.role!==role)fail('runtime_login_unsafe')
    await verifyOptionalCredentialBoundary(db,kind)
    if(kind==='api'||kind==='worker'){
      await db.query('SET LOCAL ROLE agentstudio_api')
      if(await verifyAgentGeneratedCredentials(db)!==true)fail('runtime_schema_unsafe')
    }
    return {kind,login,actual_login_verified:true,production_cutover_allowed:false}
  }finally{let destroy=false;await db.query('ROLLBACK').catch(()=>{destroy=true});db.release(destroy)}
}
