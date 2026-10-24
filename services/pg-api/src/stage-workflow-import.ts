import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {fileURLToPath} from 'node:url'
// Offline, storage-only subset. Never mount on the HTTP API or start a worker.
import {safeWorkflowGraph,isUuid,type SqlPool} from './contracts.ts'
import {contentHash} from './stage-agent-import.ts'

import {isApprovedStageMigrationOwner} from './stage-migration-identity.ts'
export class WorkflowImportError extends Error {}
function fail(code:string):never {throw new WorkflowImportError(code)}
const id=/^[A-Za-z0-9]{15}$/
const sha=/^[a-f0-9]{64}$/
const columns=['id','rh_user_id','name','description','graph','source',
  'spec_id','require_approval','created','updated']
export function normalizeLegacyWorkflow(raw:Record<string,unknown>,owners:ReadonlyMap<string,string>){
  // Hash BEFORE parsing: absent fields and the original graph string survive.
  const original=JSON.parse(JSON.stringify(raw)) as Record<string,unknown>
  if(contentHash(original)!==contentHash(raw)||Object.keys(raw).some(k=>!columns.includes(k)))
    fail('workflow_unmapped_source_field')
  if(typeof raw.id!=='string'||!id.test(raw.id)||typeof raw.rh_user_id!=='string'||
    !id.test(raw.rh_user_id)||!isUuid(owners.get(raw.rh_user_id)))
    fail('workflow_identity_not_mapped')
  if(typeof raw.name!=='string'||!raw.name||raw.name!==raw.name.trim()||
    raw.name.length>100||raw.name.includes('\0'))fail('workflow_name_incompatible')
  for(const key of ['description','source','spec_id'])
    if(Object.hasOwn(raw,key)&&raw[key]!=='')fail('workflow_'+key+'_unsupported')
  if(raw.require_approval!==true&&raw.require_approval!==1)
    fail('workflow_approval_unsupported')
  let graph:unknown
  if(typeof raw.graph==='string'&&raw.graph.length>1_000_000)fail('workflow_graph_too_large')
  try {graph=typeof raw.graph==='string'?JSON.parse(raw.graph):raw.graph}
  catch {fail('workflow_graph_invalid')}
  // Conservative lexical roundtrip catches duplicate keys and precision loss.
  // Whitespace outside strings is insignificant; content inside strings stays.
  if(typeof raw.graph==='string'&&raw.graph.replace(/("(?:\\.|[^"\\])*")|\s+/g,
    (_match,quoted:string|undefined)=>quoted??'')!==JSON.stringify(graph))
    fail('workflow_graph_json_not_lossless')
  try {
    // Archive imports keep their original non-runnable skeleton contract.
    // V2 resource references require verified current-owner configuration,
    // not the legacy export's identity mapping or archive provenance.
    if(!graph||typeof graph!=="object"||Object.hasOwn(graph,"version"))
      fail('workflow_graph_not_lossless_skeleton')
    if(contentHash(safeWorkflowGraph(graph))!==contentHash(graph))
      fail('workflow_graph_would_change')
  } catch {fail('workflow_graph_not_lossless_skeleton')}
  function date(value:unknown){
    if(typeof value!=='string'||!/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value))
      fail('workflow_timestamp_incompatible')
    const result=new Date(value.replace(' ','T'))
    if(!Number.isFinite(result.valueOf())||result.toISOString().slice(0,19)!==value.replace(' ','T').slice(0,19))
      fail('workflow_timestamp_incompatible')
    return result.toISOString()
  }
  const created_at=date(raw.created),updated_at=date(raw.updated)
  if(updated_at<created_at)fail('workflow_clock_order_invalid')
  const row={legacy_id:raw.id,owner_user_id:owners.get(raw.rh_user_id)!,
    name:raw.name,graph,created_at,updated_at,source_record:original}
  return {...row,payload_sha256:contentHash(row)}
}
export type LegacyWorkflowRow=ReturnType<typeof normalizeLegacyWorkflow>
export type WorkflowImportPlan={source_snapshot_sha256:string;rows:LegacyWorkflowRow[]}
// Only the verified offline reader can issue an importable plan. Revalidated
// at write time; callers cannot forge a snapshot by supplying a digest string.
const plans=new WeakMap<WorkflowImportPlan,string>()
function registerVerifiedWorkflowPlan(plan:WorkflowImportPlan){
  // Private issuer: only the verified offline reader below can register plans.
  plans.set(plan,contentHash(plan));return plan
}
export async function importLegacyWorkflowsToStage(pool:SqlPool,plan:WorkflowImportPlan){
  if(!plans.has(plan)||plans.get(plan)!==contentHash(plan)||
    !sha.test(plan.source_snapshot_sha256)||!plan.rows.length||plan.rows.length>5000)
    fail('workflow_unverified_or_mutated_plan')
  // Freeze an independent copy before the first await.
  const {rows,source_snapshot_sha256:source}=structuredClone(plan)
  const seen=new Set<string>()
  for(const r of rows){
    const owner=r.source_record.rh_user_id
    if(typeof owner!=='string'||seen.has(r.legacy_id)||
      contentHash(normalizeLegacyWorkflow(r.source_record,new Map([[owner,r.owner_user_id]])))!==contentHash(r))
      fail('workflow_batch_tampered')
    seen.add(r.legacy_id)
  }
  const db=await pool.connect();let begun=false
  try {
    await db.query('BEGIN');begun=true
    await db.query("SET LOCAL lock_timeout='5s'")
    await db.query("SET LOCAL statement_timeout='30s'")
    const guard=(await db.query<{database:string;login:string;admin:boolean;version:number}>(
      "SELECT current_database() AS database,session_user AS login,"+
      "(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS admin,"+
      "current_setting('server_version_num')::integer AS version")).rows[0]
    if(!guard||guard.database!=='agentstudio_stage'||guard.login!=='agentstudio_admin'||
      guard.admin!==true||guard.version<170000||guard.version>=180000)
      fail('workflow_refuse_nonisolated_database')
    // Serializes imports AND blocks concurrent queue/config writes until commit.
    await db.query('LOCK TABLE agentstudio.workflows,agentstudio.legacy_workflow_imports,'+
      'agentstudio.legacy_agent_imports,agentstudio.agent_specs,agentstudio.users,'+
      'agentstudio.jobs,agentstudio.runs,agentstudio.schedules IN EXCLUSIVE MODE')
    const migration=await db.query("SELECT version FROM agentstudio.schema_migrations WHERE version='pg_v8_006'")
    if(migration.rows.length!==1)fail('workflow_missing_import_schema')
    const blocked=await db.query("SELECT 1 FROM agentstudio.jobs WHERE status IN ('queued','leased') UNION ALL "+
      "SELECT 1 FROM agentstudio.runs WHERE status IN ('queued','running','awaiting_approval','paused') UNION ALL "+
      'SELECT 1 FROM agentstudio.schedules WHERE enabled=true')
    if(blocked.rows.length)fail('workflow_stage_execution_not_drained')
    const conflict=await db.query('SELECT 1 FROM agentstudio.legacy_workflow_imports WHERE source_snapshot_sha256<>$1 '+
      'UNION ALL SELECT 1 FROM agentstudio.legacy_agent_imports WHERE source_snapshot_sha256<>$1',[source])
    if(conflict.rows.length)fail('workflow_snapshot_conflict')
    const untracked=await db.query('SELECT 1 FROM agentstudio.workflows w LEFT JOIN '+
      'agentstudio.legacy_workflow_imports m ON w.id=m.target_workflow_id WHERE m.target_workflow_id IS NULL')
    if(untracked.rows.length)fail('workflow_untracked_target')
    let imported=0,replayed=0
    for(const row of rows){
      if(!await isApprovedStageMigrationOwner(db,row.owner_user_id,source))
        fail('workflow_owner_not_active')
      const previous=(await db.query<{target_workflow_id:string;payload_sha256:string;owner_user_id:string}>(
        'SELECT target_workflow_id,payload_sha256,owner_user_id FROM agentstudio.legacy_workflow_imports '+
        'WHERE legacy_workflow_id=$1',[row.legacy_id])).rows[0]
      if(previous){
        if(previous.payload_sha256!==row.payload_sha256||previous.owner_user_id!==row.owner_user_id)
          fail('workflow_existing_mismatch')
        replayed++
      }else{
        const target=(await db.query<{id:string}>('INSERT INTO agentstudio.workflows '+
          '(owner_user_id,name,graph,created_at,updated_at) VALUES($1::uuid,$2,$3::jsonb,$4::timestamptz,$5::timestamptz) RETURNING id',
          [row.owner_user_id,row.name,JSON.stringify(row.graph),row.created_at,row.updated_at])).rows[0]?.id
        if(!isUuid(target))fail('workflow_invalid_target_id')
        await db.query('INSERT INTO agentstudio.legacy_workflow_imports '+
          '(source_snapshot_sha256,legacy_workflow_id,owner_user_id,target_workflow_id,payload_sha256,source_record) '+
          'VALUES($1,$2,$3::uuid,$4::uuid,$5,$6::jsonb)',
          [source,row.legacy_id,row.owner_user_id,target,row.payload_sha256,JSON.stringify(row.source_record)])
        imported++
      }
      const match=(await db.query<{owner_user_id:string;name:string;graph:unknown;created_at:string|Date;
        updated_at:string|Date;source_record:Record<string,unknown>;payload_sha256:string;visibility:string;team_id:string|null;revision:number}>(
        'SELECT w.*,m.source_record,m.payload_sha256 FROM agentstudio.workflows w '+
        'JOIN agentstudio.legacy_workflow_imports m ON w.id=m.target_workflow_id AND w.owner_user_id=m.owner_user_id '+
        'WHERE m.legacy_workflow_id=$1 AND m.source_snapshot_sha256=$2',[row.legacy_id,source])).rows[0]
      if(!match||match.visibility!=='private'||match.team_id!==null||Number(match.revision)!==1||
        match.payload_sha256!==row.payload_sha256||contentHash({legacy_id:row.legacy_id,
          owner_user_id:match.owner_user_id,name:match.name,graph:match.graph,
          created_at:new Date(match.created_at).toISOString(),updated_at:new Date(match.updated_at).toISOString(),
          source_record:match.source_record})!==row.payload_sha256)
        fail('workflow_reconciliation_mismatch')
    }
    const total=(await db.query<{n:number}>('SELECT count(*)::int AS n FROM agentstudio.legacy_workflow_imports')).rows[0]?.n
    if(total!==rows.length)fail('workflow_batch_incomplete')
    await db.query('COMMIT');begun=false
    return {stage_only:true,imported,replayed,reconciled:rows.length,execution_enabled:false,
      source_snapshot_sha256:source,production_cutover_allowed:false}
  }catch(error){
    if(begun)await db.query('ROLLBACK').catch(()=>undefined)
    if(error instanceof WorkflowImportError)throw error
    throw new WorkflowImportError('workflow_import_sql_failed')
  }finally{db.release()}
}

// Verified offline SQLite reader. No network client, no CLI execution mode.


const digest=(file:string)=>createHash('sha256').update(fs.readFileSync(file)).digest('hex')
export function prepareWorkflowImport(snapshotPath:string,manifestPath:string,mappingPath:string){
  const files=[snapshotPath,manifestPath,mappingPath].map(p=>fs.realpathSync(path.resolve(p)))
  const live=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../pocketbase/pb_data').toLowerCase()
  for(const file of files){
    const normalized=file.toLowerCase()
    if(normalized===live||normalized.startsWith(live+path.sep)||!fs.statSync(file).isFile())fail('workflow_live_source_forbidden')
  }
  if(new Set(files.map(p=>p.toLowerCase())).size!==3)fail('workflow_duplicate_input_paths')
  const [snapshot,manifest,mapping]=files as [string,string,string]
  // Standalone consistent backup only; sidecars imply a mutable/live SQLite DB.
  if(['-wal','-shm','-journal'].some(s=>fs.existsSync(snapshot+s)))fail('workflow_sqlite_sidecar_forbidden')
  if(fs.statSync(manifest).size>5_000_000||fs.statSync(mapping).size>5_000_000)fail('workflow_metadata_too_large')
  const before=files.map(digest)
  const info=JSON.parse(fs.readFileSync(manifest,'utf8'))
  if(info.format!=='agent-studio-sqlite-snapshot-v1'||info.sha256!==before[0]||
    !/^[a-f0-9]{64}$/.test(info.sha256)||info.bytes!==fs.statSync(snapshot).size||
    !info.tables||typeof info.tables!=='object'||Array.isArray(info.tables))fail('workflow_manifest_invalid')
  const identity=JSON.parse(fs.readFileSync(mapping,'utf8'))
  if(identity.schema_version!=='studio-approved-identity-map-v2'||identity.source_sha256!==info.sha256||
    !Array.isArray(identity.records))fail('workflow_mapping_snapshot_mismatch')
  const db=new DatabaseSync(snapshot,{readOnly:true})
  try {
    if(Object.values(db.prepare('PRAGMA quick_check').get()??{})[0]!=='ok')fail('workflow_sqlite_integrity_failed')
    for(const required of ['studio_users','workflows'])
      if(!Object.hasOwn(info.tables,required))fail('workflow_manifest_missing_table')
    for(const [table,count] of Object.entries(info.tables)){
      if(!/^[A-Za-z_][A-Za-z0-9_]{0,120}$/.test(table)||!Number.isSafeInteger(count)||Number(count)<0)
        fail('workflow_manifest_invalid_count')
      if(db.prepare('SELECT count(*) AS n FROM "'+table+'"').get()?.n!==count)fail('workflow_manifest_count_mismatch')
    }
    const users=new Set(db.prepare('SELECT id FROM studio_users').all().map(r=>String(r.id)))
    const owners=new Map<string,string>(),targets=new Set<string>()
    for(const entry of identity.records){
      if(!entry||typeof entry.old_id!=='string'||!/^[A-Za-z0-9]{15}$/.test(entry.old_id)||!users.has(entry.old_id)||
        typeof entry.new_studio_user_id!=='string'||! /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(entry.new_studio_user_id)||
        typeof entry.verified_by!=='string'||entry.verified_by.trim().length<2||entry.verified_by.length>120||
        typeof entry.approved_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(entry.approved_at)||
        !Number.isFinite(Date.parse(entry.approved_at)))fail('workflow_mapping_unapproved')
      const target=entry.new_studio_user_id.toLowerCase()
      if(owners.has(entry.old_id)||targets.has(target))fail('workflow_mapping_collision')
      owners.set(entry.old_id,target);targets.add(target)
    }
    if(!users.size||owners.size!==users.size)fail('workflow_mapping_incomplete')
    const columns=db.prepare('PRAGMA table_info(workflows)').all().map(r=>String(r.name))
    const known=['id','rh_user_id','name','description','graph','source','spec_id','require_approval','created','updated']
    if(columns.some(c=>!known.includes(c))||['id','rh_user_id','name','graph','require_approval','created','updated'].some(c=>!columns.includes(c)))
      fail('workflow_source_schema_unsupported')
    const count=Number(info.tables.workflows)
    if(count<1||count>5000)fail('workflow_batch_size_invalid')
    // SELECT * deliberately keeps missing columns absent rather than defaulting.
    const rows=db.prepare('SELECT * FROM workflows ORDER BY id').all().map(r=>normalizeLegacyWorkflow(r,owners))
    if(files.some((file,i)=>digest(file)!==before[i]))fail('workflow_source_changed')
    return registerVerifiedWorkflowPlan({source_snapshot_sha256:info.sha256,rows})
  }finally{db.close()}
}
