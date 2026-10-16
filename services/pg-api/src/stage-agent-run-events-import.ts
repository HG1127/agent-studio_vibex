// Offline library only. Never mount in API/Operator or import a worker/provider.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {prepareHistoryImport,HistoryImportError,type HistoryImportPlan} from './stage-history-import.ts'
import {contentHash} from './stage-agent-import.ts'
import {isUuid,type SqlPool} from './contracts.ts'

export class AgentRunEventsImportError extends Error {}
function fail(code:string):never {throw new AgentRunEventsImportError('agent_run_events_'+code)}
const id=/^[A-Za-z0-9]{15}$/
const fields={run_events:['id','run_id','step_index','seq','event_type','content','created','updated']} as const
type Table=keyof typeof fields
type Row={source_table:Table;legacy_id:string;owner_user_id:string;legacy_run_id:string;source_record:Record<string,unknown>;payload_sha256:string}
export type AgentRunEventsImportPlan={source_snapshot_sha256:string;identity_mapping_sha256:string;manifest_sha256:string;parents:HistoryImportPlan['rows'];rows:Row[]}
const issued=new WeakMap<AgentRunEventsImportPlan,string>()
const digest=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
function approved(r:Record<string,unknown>){
  return typeof r?.verified_by==='string'&&r.verified_by.trim().length>=2&&r.verified_by.length<=120&&
    typeof r.approved_at==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(r.approved_at)&&Number.isFinite(Date.parse(r.approved_at))
}
function emptyJson(v:unknown){
  if(v===null)return
  if(typeof v!=='string'||v.includes('\0')||v.length>2_000_000)fail('json_unsupported')
  // Preserve the original text. Complex values, duplicate keys and even scalar
  // JSON are deliberately unsupported, regardless of reviewer assertions.
  if(!/^[ \t\r\n]*(?:null|\{[ \t\r\n]*\}|\[[ \t\r\n]*\])[ \t\r\n]*$/.test(v))fail('structured_history_not_supported')
}
export function prepareAgentRunEventsImport(snapshotPath:string,manifestPath:string,mappingPath:string):AgentRunEventsImportPlan {
  try{return prepare(snapshotPath,manifestPath,mappingPath)}catch(e){
    if(e instanceof AgentRunEventsImportError)throw e
    if(e instanceof HistoryImportError)return fail(e.message.replace(/^history_/,''))
    return fail('source_invalid')
  }
}
function prepare(snapshotPath:string,manifestPath:string,mappingPath:string):AgentRunEventsImportPlan {
  const parentPlan=prepareHistoryImport(snapshotPath,manifestPath,mappingPath)
  const files=[snapshotPath,manifestPath,mappingPath].map(p=>fs.realpathSync(p))
  const livePath=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../pocketbase/pb_data')
  const live=(fs.existsSync(livePath)?fs.realpathSync(livePath):livePath).toLowerCase()
  for(const p of files)if(!fs.statSync(p).isFile()||p.toLowerCase()===live||p.toLowerCase().startsWith(live+path.sep))fail('live_source_forbidden')
  if(new Set(files.map(p=>p.toLowerCase())).size!==3)fail('duplicate_paths')
  const [snapshot,manifest,mapping]=files as [string,string,string]
  const sidecars=()=>['-wal','-shm','-journal'].some(s=>fs.existsSync(snapshot+s))
  if(sidecars())fail('source_not_frozen')
  if(fs.statSync(manifest).size>5_000_000||fs.statSync(mapping).size>5_000_000)fail('metadata_too_large')
  const before=files.map(digest),info=JSON.parse(fs.readFileSync(manifest,'utf8'))
  if(info.format!=='agent-studio-sqlite-snapshot-v1'||info.sha256!==before[0]||
    !/^[a-f0-9]{64}$/.test(info.sha256)||info.bytes!==fs.statSync(snapshot).size||
    !info.tables||typeof info.tables!=='object'||Array.isArray(info.tables))fail('manifest_invalid')
  const identity=JSON.parse(fs.readFileSync(mapping,'utf8'))
  if(identity.schema_version!=='studio-approved-identity-map-v2'||identity.source_sha256!==info.sha256||!Array.isArray(identity.records))fail('mapping_invalid')
  const review=info.agent_run_events_archive_review
  if(!review||review.source_sha256!==info.sha256||review.identity_mapping_sha256!==before[2]||
    review.credentials_absent!==true||!approved(review)||!review.tables||typeof review.tables!=='object'||
    Object.keys(review.tables).sort().join(',')!=='run_events')fail('content_review_required')
  const db=new DatabaseSync(snapshot,{readOnly:true})
  try {
    db.exec('BEGIN')
    if(Object.values(db.prepare('PRAGMA quick_check').get()??{})[0]!=='ok')fail('sqlite_integrity')
    const actual=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'").all().map(r=>String(r.name)).sort()
    if(actual.join(',')!==Object.keys(info.tables).sort().join(','))fail('manifest_not_complete')
    for(const table of ['agent_runs','run_events','studio_users','agent_specs'])
      if(!Object.hasOwn(info.tables,table))fail('manifest_missing_table')
    for(const [table,n] of Object.entries(info.tables)){
      if(!/^[A-Za-z_][A-Za-z0-9_]{0,120}$/.test(table)||!Number.isSafeInteger(n)||Number(n)<0)fail('manifest_count_invalid')
      if(db.prepare('SELECT count(*) AS n FROM "'+table+'"').get()?.n!==n)fail('manifest_count_mismatch')
    }
    for(const table of Object.keys(fields) as Table[]){
      const columns=db.prepare('PRAGMA table_xinfo('+table+')').all()
      if(columns.length!==fields[table].length||columns.some(c=>Number(c.hidden)!==0||!fields[table].includes(String(c.name) as never)))fail('unknown_or_missing_field')
      for(const c of columns){
        const numeric=['step_index','seq'].includes(String(c.name))
        const json=['content'].includes(String(c.name))
        if(!(numeric?/^(?:NUMERIC|INTEGER|REAL)$/i:json?/^(?:JSON|TEXT)$/i:/^TEXT$/i).test(String(c.type)))fail('source_type_unsupported')
      }
    }
    const users=new Set(db.prepare('SELECT id FROM studio_users').all().map(r=>String(r.id)))
    const owners=new Map<string,string>(),targets=new Set<string>()
    for(const r of identity.records){
      if(!r||typeof r.old_id!=='string'||!id.test(r.old_id)||!users.has(r.old_id)||!isUuid(r.new_studio_user_id)||!approved(r))fail('owner_unverified')
      const target=r.new_studio_user_id.toLowerCase()
      if(owners.has(r.old_id)||targets.has(target))fail('mapping_collision')
      owners.set(r.old_id,target);targets.add(target)
    }
    if(!users.size||owners.size!==users.size)fail('mapping_incomplete')
    const rows:Row[]=[],runs=new Map(parentPlan.rows.map(r=>[r.legacy_id,r]))
    const parentColumns=db.prepare('PRAGMA table_xinfo(agent_runs)').all()
    if(parentColumns.length!==18||parentColumns.some(c=>Number(c.hidden)!==0))fail('unknown_or_missing_field')
    // Re-read only reviewed parent fields and prove SQLite text bytes are lossless.
    for(const parent of parentPlan.rows){
      const keys=Object.keys(parent.source_record)
      const text=keys.filter(k=>!['current_step','max_steps'].includes(k))
      const projection=[...keys.map(k=>'"'+k+'"'),...text.map(k=>'hex(CAST("'+k+'" AS BLOB)) AS "_bytes_'+k+'"')]
      const matches=db.prepare('SELECT '+projection.join(',')+' FROM agent_runs WHERE id=?').all(parent.legacy_id)
      if(matches.length!==1)fail('parent_missing_or_foreign')
      const raw=matches[0]!
      for(const k of text){const v=raw[k];if(typeof v==='string'&&Buffer.from(v,'utf8').toString('hex').toUpperCase()!==raw['_bytes_'+k])fail('text_not_lossless')}
      if(contentHash(Object.fromEntries(keys.map(k=>[k,raw[k]])))!==parent.payload_sha256)fail('source_changed')
    }
    for(const table of Object.keys(fields) as Table[]){
      const n=Number(info.tables[table])
      if(n>5000||rows.length+n>10000)fail('batch_size')
      const reviewed=review.tables[table]?.row_sha256
      if(!Array.isArray(reviewed)||reviewed.length!==n||new Set(reviewed).size!==n||reviewed.some(h=>typeof h!=='string'||!/^[a-f0-9]{64}$/.test(h)))fail('review_or_count_mismatch')
      const seen=new Set<string>()
      // node:sqlite can truncate TEXT at embedded NUL. Verify original SQLite
      // UTF-8 bytes independently, so truncation/replacement never passes review.
      const textFields=fields[table].filter(k=>!['step_index','seq'].includes(k))
      const projection=[...fields[table].map(k=>'"'+k+'"'),...textFields.map(k=>'hex(CAST("'+k+'" AS BLOB)) AS "_bytes_'+k+'"')]
      for(const selected of db.prepare('SELECT '+projection.join(',')+' FROM '+table+' ORDER BY id').all()){
        const raw:Record<string,unknown>=Object.fromEntries(fields[table].map(k=>[k,selected[k]]))
        for(const k of textFields){
          const v=raw[k]
          if(typeof v==='string'&&Buffer.from(v,'utf8').toString('hex').toUpperCase()!==selected['_bytes_'+k])fail('text_not_lossless')
        }
        if(typeof raw.id!=='string'||!id.test(raw.id)||seen.has(raw.id))fail('identity_or_reference_invalid')
        seen.add(raw.id)
        for(const k of fields[table]){
          const v=raw[k]
          if(['step_index','seq'].includes(k)){
            if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||Object.is(v,-0))fail('number_not_lossless')
          }else if(['content'].includes(k))emptyJson(v)
          else if(typeof v!=='string'||v.includes('\0')||v.length>2_000_000||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v))fail('text_not_lossless')
        }
        if(/(?:password|passwd|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|authorization|bearer\s|-----BEGIN .*PRIVATE KEY|\bsk-[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]+\.eyJ)/i.test(JSON.stringify(raw)))fail('possible_secret')
        if(typeof raw.run_id!=='string'||!id.test(raw.run_id))fail('run_missing_or_foreign')
        const run=runs.get(raw.run_id)
        if(!run||owners.get(String(run.source_record.rh_user_id))!==run.owner_user_id)fail('run_missing_or_foreign')
        const owner=run.owner_user_id,runId=run.legacy_id
        const payload=contentHash(raw)
        if(!reviewed.includes(payload))fail('review_or_count_mismatch')
        const row:Row={source_table:table,legacy_id:raw.id,owner_user_id:owner,legacy_run_id:runId,source_record:structuredClone(raw),payload_sha256:payload}
        rows.push(row)
      }
      if(seen.size!==n)fail('review_or_count_mismatch')
    }
    if(parentPlan.source_snapshot_sha256!==before[0]||parentPlan.identity_mapping_sha256!==before[2]||parentPlan.manifest_sha256!==before[1]||sidecars()||files.some((p,i)=>digest(p)!==before[i]))fail('source_changed')
    const plan={source_snapshot_sha256:info.sha256,identity_mapping_sha256:before[2]!,manifest_sha256:before[1]!,parents:parentPlan.rows,rows}
    issued.set(plan,contentHash(plan));return plan
  }finally{db.close()}
}

export async function importLegacyAgentRunEventsToStage(pool:SqlPool,plan:AgentRunEventsImportPlan){
  if(!issued.has(plan)||issued.get(plan)!==contentHash(plan))fail('unverified_or_mutated_plan')
  const input=structuredClone(plan),db=await pool.connect().catch(()=>fail('sql_failed'));let begun=false
  try{
    await db.query('BEGIN');begun=true
    await db.query("SET LOCAL lock_timeout='5s'")
    await db.query("SET LOCAL statement_timeout='30s'")
    const g=(await db.query<{database:string;login:string;admin:boolean;version:number}>(
      "SELECT current_database() AS database,session_user AS login,(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS admin,current_setting('server_version_num')::integer AS version")).rows[0]
    if(!g||g.database!=='agentstudio_stage'||g.login!=='agentstudio_admin'||g.admin!==true||g.version<170000||g.version>=180000)fail('wrong_stage_database_or_version')
    await db.query('LOCK TABLE agentstudio.legacy_agent_run_events,agentstudio.legacy_run_history,agentstudio.users,agentstudio.jobs,agentstudio.runs,agentstudio.schedules IN EXCLUSIVE MODE')
    if((await db.query("SELECT version FROM agentstudio.schema_migrations WHERE version='pg_v9_015'")).rows.length!==1)fail('missing_migration')
    if((await db.query("SELECT 1 FROM agentstudio.jobs UNION ALL SELECT 1 FROM agentstudio.runs WHERE status IN ('queued','running','awaiting_approval','paused') UNION ALL SELECT 1 FROM agentstudio.schedules WHERE enabled=true")).rows.length)fail('stage_execution_not_drained')
    // Exact reviewed identity binding is required for active AND disabled users.
    if((await db.query("SELECT version FROM agentstudio.schema_migrations WHERE version='pg_v8_011'")).rows.length!==1)fail('target_identity_unverified')
    await db.query('LOCK TABLE agentstudio.legacy_user_imports IN EXCLUSIVE MODE')
    if((await db.query('SELECT 1 FROM agentstudio.legacy_agent_run_events WHERE source_snapshot_sha256<>$1 OR identity_mapping_sha256<>$2 OR manifest_sha256<>$3',
      [input.source_snapshot_sha256,input.identity_mapping_sha256,input.manifest_sha256])).rows.length)fail('snapshot_or_review_conflict')
    let imported=0,replayed=0
    for(const row of input.rows){
      const parent=input.parents.find(r=>r.legacy_id===row.legacy_run_id)
      if(!parent||parent.owner_user_id!==row.owner_user_id)fail('parent_missing_or_foreign')
      const storedParent=(await db.query<Record<string,unknown>>('SELECT * FROM agentstudio.legacy_run_history WHERE legacy_id=$1',[row.legacy_run_id])).rows[0]
      if(!storedParent||storedParent.source_table!=='agent_runs'||storedParent.owner_user_id!==row.owner_user_id||
        storedParent.source_snapshot_sha256!==input.source_snapshot_sha256||storedParent.identity_mapping_sha256!==input.identity_mapping_sha256||
        storedParent.manifest_sha256!==input.manifest_sha256||storedParent.executable!==false||storedParent.evidence_status!=='historical_unverified'||
        storedParent.payload_sha256!==parent.payload_sha256||contentHash(storedParent.source_record)!==parent.payload_sha256)fail('parent_missing_or_foreign')
      const oldOwner=parent.source_record.rh_user_id
      if((await db.query('SELECT 1 FROM agentstudio.legacy_user_imports m JOIN agentstudio.users u ON u.id=m.target_user_id '+
        'WHERE m.legacy_user_id=$1 AND m.target_user_id=$2::uuid AND m.source_snapshot_sha256=$3 '+
        "AND m.reviewed_mapping_sha256=$4 AND m.reviewed_idp_sha256 ~ '^[a-f0-9]{64}$' AND m.active_automatically=false AND u.status IN ('active','disabled')",
        [oldOwner,row.owner_user_id,input.source_snapshot_sha256,input.identity_mapping_sha256])).rows.length!==1)fail('target_identity_unverified')
      const key=[row.source_table,row.legacy_id]
      if((await db.query('SELECT archive_id FROM agentstudio.legacy_agent_run_events WHERE source_table=$1 AND legacy_id=$2',key)).rows.length)replayed++
      else{
        await db.query('INSERT INTO agentstudio.legacy_agent_run_events(source_snapshot_sha256,identity_mapping_sha256,manifest_sha256,source_table,legacy_id,owner_user_id,legacy_run_id,source_record,payload_sha256) '+
          'VALUES($1,$2,$3,$4,$5,$6::uuid,$7,$8::jsonb,$9)',
          [input.source_snapshot_sha256,input.identity_mapping_sha256,input.manifest_sha256,row.source_table,row.legacy_id,row.owner_user_id,row.legacy_run_id,JSON.stringify(row.source_record),row.payload_sha256]);imported++
      }
      const stored=(await db.query<Record<string,unknown>>('SELECT * FROM agentstudio.legacy_agent_run_events WHERE source_table=$1 AND legacy_id=$2',key)).rows[0]
      if(!stored||stored.executable!==false||stored.model_execution_enabled!==false||stored.evidence_status!=='historical_unverified'||
        stored.source_snapshot_sha256!==input.source_snapshot_sha256||stored.identity_mapping_sha256!==input.identity_mapping_sha256||stored.manifest_sha256!==input.manifest_sha256||
        ['source_table','legacy_id','owner_user_id','legacy_run_id','payload_sha256'].some(k=>stored[k]!==row[k as keyof Row])||
        contentHash(stored.source_record)!==row.payload_sha256)fail('reconciliation_mismatch')
    }
    if((await db.query<{n:number}>('SELECT count(*)::int AS n FROM agentstudio.legacy_agent_run_events')).rows[0]?.n!==input.rows.length)fail('batch_incomplete')
    await db.query('COMMIT');begun=false
    return {imported,replayed,reconciled:input.rows.length,execution_enabled:false,model_execution_enabled:false,history_verified:false,runtime_jobs_created:0,side_effects_created:0,production_cutover_allowed:false}
  }catch(e){
    if(begun)await db.query('ROLLBACK').catch(()=>undefined)
    if(e instanceof AgentRunEventsImportError)throw e
    return fail('sql_failed')
  }finally{db.release()}
}
