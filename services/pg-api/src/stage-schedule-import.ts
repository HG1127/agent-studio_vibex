// Offline, admin-only quarantine. Never mount on HTTP or invoke a scheduler.
import {isUuid,type SqlPool} from './contracts.ts'
import {contentHash,normalizeLegacyAgent} from './stage-agent-import.ts'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {fileURLToPath} from 'node:url'

export class ScheduleImportError extends Error {}
function fail(code:string):never {throw new ScheduleImportError(code)}
const id=/^[A-Za-z0-9]{15}$/
const columns=['id','rh_user_id','name','target_kind','target_id','instruction','recurrence_kind',
  'interval_minutes','time_zone','local_time','weekday','start_at_ms','next_at_ms',
  'model_connection_id','model_id','max_steps','enabled','deleted','revision','created_ms','updated_ms','last_due_ms']
export function normalizeLegacySchedule(raw:Record<string,unknown>,owners:ReadonlyMap<string,string>){
  if(Object.keys(raw).length!==columns.length||columns.some(k=>!Object.hasOwn(raw,k)))fail('schedule_source_schema_unsupported')
  const original=structuredClone(raw)
  if(typeof raw.id!=='string'||!id.test(raw.id)||typeof raw.rh_user_id!=='string'||!id.test(raw.rh_user_id)||
    !isUuid(owners.get(raw.rh_user_id))||typeof raw.target_id!=='string'||!id.test(raw.target_id))fail('schedule_identity_not_mapped')
  for(const key of ['name','instruction','recurrence_kind','time_zone','local_time','model_connection_id','model_id'])
    if(typeof raw[key]!=='string'||(raw[key] as string).includes('\0')||(raw[key] as string).length>10000)fail('schedule_text_incompatible')
  if(!raw.name||!raw.instruction||!['agent','workflow'].includes(String(raw.target_kind))||
    !['once','interval','daily','weekly'].includes(String(raw.recurrence_kind))||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(raw.local_time)))fail('schedule_rule_unsupported')
  try {new Intl.DateTimeFormat('en',{timeZone:String(raw.time_zone)}).format(0)}catch{fail('schedule_time_zone_unsupported')}
  for(const key of ['interval_minutes','weekday','start_at_ms','next_at_ms','max_steps','enabled','deleted','revision','created_ms','updated_ms','last_due_ms'])
    if(!Number.isSafeInteger(raw[key])||Number(raw[key])<0)fail('schedule_integer_not_lossless')
  if(![0,1].includes(Number(raw.enabled))||![0,1].includes(Number(raw.deleted))||Number(raw.revision)<1||
    Number(raw.weekday)>6||Number(raw.interval_minutes)<15||Number(raw.interval_minutes)>10080||
    Number(raw.max_steps)<1||Number(raw.max_steps)>30)fail('schedule_rule_unsupported')
  for(const key of ['start_at_ms','next_at_ms','created_ms','updated_ms','last_due_ms'])
    if(!Number.isFinite(new Date(Number(raw[key])).valueOf()))fail('schedule_timestamp_incompatible')
  if(Number(raw.updated_ms)<Number(raw.created_ms))fail('schedule_clock_order_invalid')
  // Execution-only fields stay in admin storage verbatim; no model credentials are read.
  const row={legacy_id:raw.id,owner_user_id:owners.get(raw.rh_user_id)!,source_record:original}
  return {...row,payload_sha256:contentHash(row)}
}
export type ScheduleImportPlan={source_snapshot_sha256:string;identity_mapping_sha256:string;rows:ReturnType<typeof normalizeLegacySchedule>[];agent_hashes:Record<string,string>}
const plans=new WeakMap<ScheduleImportPlan,string>()

export async function importLegacySchedulesToStage(pool:SqlPool,plan:ScheduleImportPlan){
  if(!plans.has(plan)||plans.get(plan)!==contentHash(plan)||!plan.rows.length||plan.rows.length>5000)
    fail('schedule_unverified_or_mutated_plan')
  const {rows,agent_hashes,source_snapshot_sha256:source,identity_mapping_sha256:mappingHash}=structuredClone(plan)
  const db=await pool.connect();let begun=false
  try{
    await db.query('BEGIN');begun=true
    await db.query("SET LOCAL lock_timeout='5s'")
    await db.query("SET LOCAL statement_timeout='30s'")
    const guard=(await db.query<{database:string;login:string;admin:boolean;version:number}>(
      "SELECT current_database() AS database,session_user AS login,(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS admin,current_setting('server_version_num')::integer AS version")).rows[0]
    if(!guard||guard.database!=='agentstudio_stage'||guard.login!=='agentstudio_admin'||guard.admin!==true||
      guard.version<170000||guard.version>=180000)fail('schedule_refuse_nonisolated_database')
    await db.query('LOCK TABLE agentstudio.schedules,agentstudio.legacy_schedule_imports,agentstudio.users,'+
      'agentstudio.agent_specs,agentstudio.workflows,agentstudio.legacy_agent_imports,agentstudio.legacy_workflow_imports,'+
      'agentstudio.jobs,agentstudio.runs,agentstudio.schedule_occurrences IN EXCLUSIVE MODE')
    if((await db.query("SELECT version FROM agentstudio.schema_migrations WHERE version='pg_v8_008'")).rows.length!==1)
      fail('schedule_missing_import_schema')
    if((await db.query("SELECT 1 FROM agentstudio.jobs WHERE status IN ('queued','leased') UNION ALL "+
      "SELECT 1 FROM agentstudio.runs WHERE status IN ('queued','running','awaiting_approval','paused') UNION ALL "+
      'SELECT 1 FROM agentstudio.schedules WHERE enabled=true')).rows.length)fail('schedule_stage_execution_not_drained')
    if((await db.query('SELECT 1 FROM agentstudio.legacy_schedule_imports WHERE source_snapshot_sha256<>$1 UNION ALL '+
      'SELECT 1 FROM agentstudio.legacy_agent_imports WHERE source_snapshot_sha256<>$1 UNION ALL '+
      'SELECT 1 FROM agentstudio.legacy_workflow_imports WHERE source_snapshot_sha256<>$1',[source])).rows.length)fail('schedule_snapshot_conflict')
    if((await db.query('SELECT 1 FROM agentstudio.schedules s LEFT JOIN agentstudio.legacy_schedule_imports m '+
      'ON s.id=m.target_schedule_id WHERE m.target_schedule_id IS NULL')).rows.length)fail('schedule_untracked_target')
    let imported=0,replayed=0
    for(const row of rows){
      const r=row.source_record
      if((await db.query("SELECT id FROM agentstudio.users WHERE id=$1::uuid AND status='active'",[row.owner_user_id])).rows.length!==1)
        fail('schedule_owner_not_active')
      const agent=r.target_kind==='agent'
      const target=(await db.query<{id:string;payload_sha256:string;name:string;spec:unknown;owner_user_id:string;created_at:string|Date;updated_at:string|Date;visibility:string;team_id:string|null;requires_approval:boolean}>(agent?
        'SELECT a.*,m.payload_sha256 FROM agentstudio.legacy_agent_imports m JOIN agentstudio.agent_specs a ON a.id=m.target_spec_id AND a.owner_user_id=m.owner_user_id WHERE m.legacy_spec_id=$1 AND m.owner_user_id=$2::uuid AND m.source_snapshot_sha256=$3':
        'SELECT a.id,m.payload_sha256 FROM agentstudio.legacy_workflow_imports m JOIN agentstudio.workflows a ON a.id=m.target_workflow_id AND a.owner_user_id=m.owner_user_id WHERE m.legacy_workflow_id=$1 AND m.owner_user_id=$2::uuid AND m.source_snapshot_sha256=$3',
        [r.target_id,row.owner_user_id,source])).rows
      if(target.length!==1||!isUuid(target[0]?.id)||!/^[a-f0-9]{64}$/.test(target[0]!.payload_sha256))fail('schedule_target_crosswalk_missing')
      // W1 intentionally forbids even disabled schedules for imported workflows.
      // Do not override its trigger or silently downgrade the dependency.
      if(!agent)fail('schedule_workflow_quarantine_contract_blocks_schedule')
      const a=target[0]!
      if(a.payload_sha256!==agent_hashes[String(r.target_id)]||a.visibility!=='private'||a.team_id!==null||a.requires_approval!==true||
        contentHash({legacy_id:r.target_id,owner_user_id:a.owner_user_id,name:a.name,spec:a.spec,
          created_at:new Date(a.created_at).toISOString(),updated_at:new Date(a.updated_at).toISOString()})!==a.payload_sha256)
        fail('schedule_target_payload_mismatch')
      const targetId=target[0]!.id
      const recurrence={legacy_import:'quarantined',execution_supported:false}
      const expected={owner_user_id:row.owner_user_id,kind:r.target_kind,agent_spec_id:targetId,workflow_id:null,
        name:r.name,recurrence,time_zone:r.time_zone,next_at:null,enabled:false,revision:Number(r.revision),
        created_at:new Date(Number(r.created_ms)).toISOString(),updated_at:new Date(Number(r.updated_ms)).toISOString()}
      const projectionHash=contentHash(expected)
      const previous=(await db.query<{payload_sha256:string;projection_sha256:string;owner_user_id:string;identity_mapping_sha256:string}>(
        'SELECT payload_sha256,projection_sha256,owner_user_id,identity_mapping_sha256 FROM agentstudio.legacy_schedule_imports WHERE legacy_schedule_id=$1',[row.legacy_id])).rows[0]
      if(previous){
        if(previous.payload_sha256!==row.payload_sha256||previous.projection_sha256!==projectionHash||previous.owner_user_id!==row.owner_user_id||previous.identity_mapping_sha256!==mappingHash)
          fail('schedule_existing_mismatch')
        replayed++
      }else{
        const sid=(await db.query<{id:string}>('INSERT INTO agentstudio.schedules '+
          '(owner_user_id,kind,agent_spec_id,name,recurrence,time_zone,next_at,enabled,revision,created_at,updated_at) '+
          'VALUES($1::uuid,$2,$3::uuid,$4,$5::jsonb,$6,NULL,false,$7,$8::timestamptz,$9::timestamptz) RETURNING id',
          [row.owner_user_id,r.target_kind,targetId,r.name,JSON.stringify(recurrence),r.time_zone,r.revision,expected.created_at,expected.updated_at])).rows[0]?.id
        if(!isUuid(sid))fail('schedule_invalid_target_id')
        await db.query('INSERT INTO agentstudio.legacy_schedule_imports '+
          '(source_snapshot_sha256,legacy_schedule_id,owner_user_id,target_schedule_id,payload_sha256,projection_sha256,source_record,identity_mapping_sha256) '+
          'VALUES($1,$2,$3::uuid,$4::uuid,$5,$6,$7::jsonb,$8)',[source,row.legacy_id,row.owner_user_id,sid,row.payload_sha256,projectionHash,JSON.stringify(r),mappingHash])
        imported++
      }
      const stored=(await db.query<Record<string,unknown>>('SELECT s.*,m.source_record,m.payload_sha256,m.projection_sha256,m.identity_mapping_sha256,m.owner_user_id AS mapped_owner '+
        'FROM agentstudio.schedules s JOIN agentstudio.legacy_schedule_imports m ON s.id=m.target_schedule_id '+
        'WHERE m.legacy_schedule_id=$1 AND m.source_snapshot_sha256=$2',[row.legacy_id,source])).rows[0]
      if(!stored)fail('schedule_reconciliation_mismatch')
      const projection=Object.fromEntries(Object.keys(expected).map(k=>[k,stored[k]]))
      projection.revision=Number(projection.revision)
      projection.created_at=new Date(projection.created_at as string).toISOString()
      projection.updated_at=new Date(projection.updated_at as string).toISOString()
      if(stored.mapped_owner!==row.owner_user_id||stored.identity_mapping_sha256!==mappingHash||stored.payload_sha256!==row.payload_sha256||stored.projection_sha256!==projectionHash||
        contentHash(projection)!==projectionHash||contentHash({legacy_id:row.legacy_id,owner_user_id:stored.mapped_owner,source_record:stored.source_record})!==row.payload_sha256)
        fail('schedule_reconciliation_mismatch')
    }
    if((await db.query<{n:number}>('SELECT count(*)::int AS n FROM agentstudio.legacy_schedule_imports')).rows[0]?.n!==rows.length)
      fail('schedule_batch_incomplete')
    await db.query('COMMIT');begun=false
    return {stage_only:true,imported,replayed,reconciled:rows.length,execution_enabled:false,
      quarantine_only:true,history_migrated:false,production_cutover_allowed:false,source_snapshot_sha256:source}
  }catch(error){
    if(begun)await db.query('ROLLBACK').catch(()=>undefined)
    if(error instanceof ScheduleImportError)throw error
    throw new ScheduleImportError('schedule_import_sql_failed')
  }finally{db.release()}
}
const digest=(file:string)=>createHash('sha256').update(fs.readFileSync(file)).digest('hex')
export function prepareScheduleImport(snapshotPath:string,manifestPath:string,mappingPath:string){
  const files=[snapshotPath,manifestPath,mappingPath].map(p=>fs.realpathSync(path.resolve(p)))
  const livePath=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../pocketbase/pb_data')
  const live=(fs.existsSync(livePath)?fs.realpathSync(livePath):livePath).toLowerCase()
  for(const file of files){
    const normalized=file.toLowerCase()
    if(normalized===live||normalized.startsWith(live+path.sep)||!fs.statSync(file).isFile())fail('schedule_live_source_forbidden')
  }
  if(new Set(files.map(p=>p.toLowerCase())).size!==3)fail('schedule_duplicate_input_paths')
  const [snapshot,manifest,mapping]=files as [string,string,string]
  // Standalone consistent backup only; sidecars imply a mutable/live SQLite DB.
  if(['-wal','-shm','-journal'].some(s=>fs.existsSync(snapshot+s)))fail('schedule_sqlite_sidecar_forbidden')
  if(fs.statSync(manifest).size>5_000_000||fs.statSync(mapping).size>5_000_000)fail('schedule_metadata_too_large')
  const before=files.map(digest)
  const info=JSON.parse(fs.readFileSync(manifest,'utf8'))
  if(info.format!=='agent-studio-sqlite-snapshot-v1'||info.sha256!==before[0]||
    !/^[a-f0-9]{64}$/.test(info.sha256)||info.bytes!==fs.statSync(snapshot).size||
    !info.tables||typeof info.tables!=='object'||Array.isArray(info.tables))fail('schedule_manifest_invalid')
  const identity=JSON.parse(fs.readFileSync(mapping,'utf8'))
  if(identity.schema_version!=='studio-approved-identity-map-v2'||identity.source_sha256!==info.sha256||
    !Array.isArray(identity.records))fail('schedule_mapping_snapshot_mismatch')
  const db=new DatabaseSync(snapshot,{readOnly:true})
  try {
    db.exec('BEGIN')
    if(Object.values(db.prepare('PRAGMA quick_check').get()??{})[0]!=='ok')fail('schedule_sqlite_integrity_failed')
    for(const required of ['studio_users','agent_studio_schedules'])
      if(!Object.hasOwn(info.tables,required))fail('schedule_manifest_missing_table')
    for(const [table,count] of Object.entries(info.tables)){
      if(!/^[A-Za-z_][A-Za-z0-9_]{0,120}$/.test(table)||!Number.isSafeInteger(count)||Number(count)<0)
        fail('schedule_manifest_invalid_count')
      if(db.prepare('SELECT count(*) AS n FROM "'+table+'"').get()?.n!==count)fail('schedule_manifest_count_mismatch')
    }
    const users=new Set(db.prepare('SELECT id FROM studio_users').all().map(r=>String(r.id)))
    const owners=new Map<string,string>(),targets=new Set<string>()
    for(const entry of identity.records){
      if(!entry||typeof entry.old_id!=='string'||!/^[A-Za-z0-9]{15}$/.test(entry.old_id)||!users.has(entry.old_id)||
        typeof entry.new_studio_user_id!=='string'||! /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(entry.new_studio_user_id)||
        typeof entry.verified_by!=='string'||entry.verified_by.trim().length<2||entry.verified_by.length>120||
        typeof entry.approved_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(entry.approved_at)||
        !Number.isFinite(Date.parse(entry.approved_at)))fail('schedule_mapping_unapproved')
      const target=entry.new_studio_user_id.toLowerCase()
      if(owners.has(entry.old_id)||targets.has(target))fail('schedule_mapping_collision')
      owners.set(entry.old_id,target);targets.add(target)
    }
    if(!users.size||owners.size!==users.size)fail('schedule_mapping_incomplete')
    const sourceColumns=db.prepare('PRAGMA table_info(agent_studio_schedules)').all().map(r=>String(r.name))
    const known=columns
    if(sourceColumns.some(c=>!known.includes(c))||known.some(c=>!sourceColumns.includes(c)))
      fail('schedule_source_schema_unsupported')
    const count=Number(info.tables.agent_studio_schedules)
    if(count<1||count>5000)fail('schedule_batch_size_invalid')
    // SELECT * deliberately keeps missing columns absent rather than defaulting.
    const rows=db.prepare('SELECT * FROM agent_studio_schedules ORDER BY id').all().map(r=>normalizeLegacySchedule(r,owners))
    if(new Set(rows.map(r=>r.legacy_id)).size!==rows.length)fail('schedule_duplicate_source_id')
    const agent_hashes:Record<string,string>={}
    for(const row of rows){
      const r=row.source_record,table=r.target_kind==='agent'?'agent_specs':'workflows'
      if(!Object.hasOwn(info.tables,table))fail('schedule_manifest_missing_target_table')
      const targets=db.prepare('SELECT * FROM '+table+' WHERE id=?').all(String(r.target_id))
      if(targets.length!==1||targets[0]?.rh_user_id!==r.rh_user_id)fail('schedule_source_target_missing_or_foreign')
      if(r.target_kind==='agent')agent_hashes[String(r.target_id)]=normalizeLegacyAgent(targets[0]!,owners).payload_sha256
    }
    if(files.some((file,i)=>digest(file)!==before[i])||['-wal','-shm','-journal'].some(s=>fs.existsSync(snapshot+s)))fail('schedule_source_changed')
    const plan={source_snapshot_sha256:info.sha256,identity_mapping_sha256:before[2]!,rows,agent_hashes}; plans.set(plan,contentHash(plan)); return plan
  }finally{db.close()}
}
