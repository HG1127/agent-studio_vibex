// Offline library only. No network connector, HTTP route, worker or execution imports.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {contentHash} from './stage-agent-import.ts'
import {isUuid,type SqlPool} from './contracts.ts'
import {isApprovedStageMigrationOwner} from './stage-migration-identity.ts'

export class HistoryImportError extends Error {}
function fail(code:string):never {throw new HistoryImportError('history_'+code)}
const id=/^[A-Za-z0-9]{15}$/
const fields=['id','rh_user_id','spec_id','spec_name','instruction','status','current_step','max_steps',
  'model','config','spec_snapshot','result','error','checkpoint','evaluation','feedback','created','updated']
const jsonFields=['config','spec_snapshot','checkpoint','evaluation','feedback']
const digest=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
type Row={legacy_id:string;owner_user_id:string;source_record:Record<string,unknown>;payload_sha256:string}
export type HistoryImportPlan={source_snapshot_sha256:string;identity_mapping_sha256:string;manifest_sha256:string;rows:Row[]}
const issued=new WeakMap<HistoryImportPlan,string>()

export function prepareHistoryImport(snapshotPath:string,manifestPath:string,mappingPath:string):HistoryImportPlan {
  try{return prepare(snapshotPath,manifestPath,mappingPath)}catch(e){
    if(e instanceof HistoryImportError)throw e
    return fail('source_invalid') // Never disclose SQLite content or filesystem errors.
  }
}
function prepare(snapshotPath:string,manifestPath:string,mappingPath:string):HistoryImportPlan {
  const files=[snapshotPath,manifestPath,mappingPath].map(p=>fs.realpathSync(p))
  const livePath=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../pocketbase/pb_data')
  const live=(fs.existsSync(livePath)?fs.realpathSync(livePath):livePath).toLowerCase()
  for(const p of files)if(!fs.statSync(p).isFile()||p.toLowerCase()===live||p.toLowerCase().startsWith(live+path.sep))fail('live_source_forbidden')
  if(new Set(files.map(p=>p.toLowerCase())).size!==3)fail('duplicate_paths')
  const [snapshot,manifest,mapping]=files as [string,string,string]
  const sidecars=()=>['-wal','-shm','-journal'].some(s=>fs.existsSync(snapshot+s))
  if(sidecars())fail('source_not_frozen')
  if(fs.statSync(manifest).size>5_000_000||fs.statSync(mapping).size>5_000_000)fail('metadata_too_large')
  const before=files.map(digest)
  const info=JSON.parse(fs.readFileSync(manifest,'utf8'))
  if(info.format!=='agent-studio-sqlite-snapshot-v1'||info.sha256!==before[0]||
    !/^[a-f0-9]{64}$/.test(info.sha256)||info.bytes!==fs.statSync(snapshot).size||
    !info.tables||typeof info.tables!=='object'||Array.isArray(info.tables))fail('manifest_invalid')
  const mappingData=JSON.parse(fs.readFileSync(mapping,'utf8'))
  if(mappingData.schema_version!=='studio-approved-identity-map-v2'||mappingData.source_sha256!==info.sha256||
    !Array.isArray(mappingData.records))fail('mapping_invalid')
  // Text cannot be proven secret-free by regex. Require explicit per-row content review,
  // bound to the frozen snapshot and exact raw payload; never redact silently.
  const review=info.history_archive_review
  if(!review||review.source_sha256!==info.sha256||review.table!=='agent_runs'||review.credentials_absent!==true||
    typeof review.verified_by!=='string'||review.verified_by.trim().length<2||review.verified_by.length>120||
    typeof review.approved_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(review.approved_at)||
    !Number.isFinite(Date.parse(review.approved_at))||!Array.isArray(review.row_sha256))fail('content_review_required')
  const db=new DatabaseSync(snapshot,{readOnly:true})
  try {
    db.exec('BEGIN')
    if(Object.values(db.prepare('PRAGMA quick_check').get()??{})[0]!=='ok')fail('sqlite_integrity')
    for(const table of ['agent_runs','studio_users','agent_specs'])if(!Object.hasOwn(info.tables,table))fail('manifest_missing_table')
    for(const [table,n] of Object.entries(info.tables)){
      if(!/^[A-Za-z_][A-Za-z0-9_]{0,120}$/.test(table)||!Number.isSafeInteger(n)||Number(n)<0)fail('manifest_count_invalid')
      if(db.prepare('SELECT count(*) AS n FROM "'+table+'"').get()?.n!==n)fail('manifest_count_mismatch')
    }
    const columns=db.prepare('PRAGMA table_info(agent_runs)').all().map(r=>String(r.name))
    if(columns.length!==fields.length||fields.some(k=>!columns.includes(k)))fail('unknown_or_missing_field')
    // Only identity columns are read from users/specs. No credentials/configuration SELECT *.
    const users=new Set(db.prepare('SELECT id FROM studio_users').all().map(r=>String(r.id)))
    const owners=new Map<string,string>(),targets=new Set<string>()
    for(const r of mappingData.records){
      if(!r||typeof r.old_id!=='string'||!id.test(r.old_id)||!users.has(r.old_id)||!isUuid(r.new_studio_user_id)||
        typeof r.verified_by!=='string'||r.verified_by.trim().length<2||r.verified_by.length>120||
        typeof r.approved_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(r.approved_at)||
        !Number.isFinite(Date.parse(r.approved_at)))fail('owner_unverified')
      const dest=r.new_studio_user_id.toLowerCase()
      if(owners.has(r.old_id)||targets.has(dest))fail('mapping_collision')
      owners.set(r.old_id,dest);targets.add(dest)
    }
    if(!users.size||owners.size!==users.size)fail('mapping_incomplete')
    const n=Number(info.tables.agent_runs)
    if(n<1||n>5000)fail('batch_size')
    const rows:Row[]=db.prepare('SELECT '+fields.map(k=>'"'+k+'"').join(',')+' FROM agent_runs ORDER BY id').all().map(raw=>{
      if(typeof raw.id!=='string'||!id.test(raw.id)||typeof raw.rh_user_id!=='string'||!owners.has(raw.rh_user_id)||
        typeof raw.spec_id!=='string'||!id.test(raw.spec_id))fail('identity_or_reference_invalid')
      const specs=db.prepare('SELECT id,rh_user_id FROM agent_specs WHERE id=?').all(raw.spec_id)
      if(specs.length!==1||specs[0]?.rh_user_id!==raw.rh_user_id)fail('spec_missing_or_foreign')
      for(const k of fields){
        const v=raw[k]
        if(['current_step','max_steps'].includes(k)){
          if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0)fail('number_not_lossless')
        }else if(jsonFields.includes(k)){
          // First slice blocks opaque nested references/credentials. Keep original SQLite
          // text verbatim, including whitespace, when the JSON is empty/null.
          if(v!==null){
            if(typeof v!=='string')fail('json_unsupported')
            let parsed:unknown;try{parsed=JSON.parse(v)}catch{fail('json_unsupported')}
            if(parsed!==null&&!(Array.isArray(parsed)&&parsed.length===0)&&
              !(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&Object.keys(parsed).length===0))fail('structured_history_not_supported')
          }
        }else if(typeof v!=='string'||v.includes('\0')||v.length>2_000_000)fail('text_not_lossless')
      }
      const text=JSON.stringify(raw)
      if(/(?:password|passwd|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|authorization|bearer\s|-----BEGIN .*PRIVATE KEY|\bsk-[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]+\.eyJ)/i.test(text))fail('possible_secret')
      return {legacy_id:raw.id,owner_user_id:owners.get(raw.rh_user_id)!,source_record:structuredClone(raw),payload_sha256:contentHash(raw)}
    })
    if(rows.length!==n||new Set(rows.map(r=>r.legacy_id)).size!==n||review.row_sha256.length!==n||
      new Set(review.row_sha256).size!==n||rows.some(r=>!review.row_sha256.includes(r.payload_sha256)))fail('review_or_count_mismatch')
    if(sidecars()||files.some((p,i)=>digest(p)!==before[i]))fail('source_changed')
    const plan={source_snapshot_sha256:info.sha256,identity_mapping_sha256:before[2]!,manifest_sha256:before[1]!,rows}
    issued.set(plan,contentHash(plan));return plan
  }finally{db.close()}
}

export async function importLegacyHistoryToStage(pool:SqlPool,plan:HistoryImportPlan){
  if(!issued.has(plan)||issued.get(plan)!==contentHash(plan))fail('unverified_or_mutated_plan')
  const input=structuredClone(plan)
  const db=await pool.connect();let begun=false
  try{
    await db.query('BEGIN');begun=true
    await db.query("SET LOCAL lock_timeout='5s'")
    await db.query("SET LOCAL statement_timeout='30s'")
    const g=(await db.query<{database:string;login:string;admin:boolean;version:number}>(
      "SELECT current_database() AS database,session_user AS login,(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS admin,current_setting('server_version_num')::integer AS version")).rows[0]
    if(!g||g.database!=='agentstudio_stage'||g.login!=='agentstudio_admin'||g.admin!==true||g.version<170000||g.version>=180000)fail('wrong_stage_database_or_version')
    await db.query('LOCK TABLE agentstudio.legacy_run_history,agentstudio.users IN EXCLUSIVE MODE')
    if((await db.query("SELECT version FROM agentstudio.schema_migrations WHERE version='pg_v8_012'")).rows.length!==1)fail('missing_migration')
    if((await db.query('SELECT 1 FROM agentstudio.legacy_run_history WHERE source_snapshot_sha256<>$1 OR identity_mapping_sha256<>$2 OR manifest_sha256<>$3',
      [input.source_snapshot_sha256,input.identity_mapping_sha256,input.manifest_sha256])).rows.length)fail('snapshot_or_review_conflict')
    let imported=0,replayed=0
    for(const row of input.rows){
      if(!await isApprovedStageMigrationOwner(db,row.owner_user_id,input.source_snapshot_sha256))fail('target_owner_unverified')
      const owner=(await db.query<{status:string}>('SELECT status FROM agentstudio.users WHERE id=$1::uuid',[row.owner_user_id])).rows[0]
      if(owner?.status==='disabled'){
        const identity=(await db.query('SELECT 1 FROM agentstudio.legacy_user_imports WHERE legacy_user_id=$1 '+
          'AND target_user_id=$2::uuid AND source_snapshot_sha256=$3 AND reviewed_mapping_sha256=$4 AND active_automatically=false',
          [row.source_record.rh_user_id,row.owner_user_id,input.source_snapshot_sha256,input.identity_mapping_sha256])).rows
        if(identity.length!==1)fail('target_identity_crosswalk_mismatch')
      }
      const old=(await db.query('SELECT archive_id FROM agentstudio.legacy_run_history WHERE legacy_id=$1',[row.legacy_id])).rows
      if(old.length)replayed++
      else{
        await db.query('INSERT INTO agentstudio.legacy_run_history(source_snapshot_sha256,identity_mapping_sha256,manifest_sha256,source_table,legacy_id,owner_user_id,source_record,payload_sha256) '+
          "VALUES($1,$2,$3,'agent_runs',$4,$5::uuid,$6::jsonb,$7)",
          [input.source_snapshot_sha256,input.identity_mapping_sha256,input.manifest_sha256,row.legacy_id,row.owner_user_id,JSON.stringify(row.source_record),row.payload_sha256]);imported++
      }
      const stored=(await db.query<Record<string,unknown>>('SELECT * FROM agentstudio.legacy_run_history WHERE legacy_id=$1',[row.legacy_id])).rows[0]
      if(!stored||stored.owner_user_id!==row.owner_user_id||stored.source_table!=='agent_runs'||stored.executable!==false||
        stored.evidence_status!=='historical_unverified'||stored.source_snapshot_sha256!==input.source_snapshot_sha256||
        stored.identity_mapping_sha256!==input.identity_mapping_sha256||stored.manifest_sha256!==input.manifest_sha256||
        stored.payload_sha256!==row.payload_sha256||contentHash(stored.source_record)!==row.payload_sha256)fail('reconciliation_mismatch')
    }
    if((await db.query<{n:number}>('SELECT count(*)::int AS n FROM agentstudio.legacy_run_history')).rows[0]?.n!==input.rows.length)fail('batch_incomplete')
    await db.query('COMMIT');begun=false
    return {imported,replayed,reconciled:input.rows.length,source_table:'agent_runs',execution_enabled:false,history_verified:false,production_cutover_allowed:false}
  }catch(e){
    if(begun)await db.query('ROLLBACK').catch(()=>undefined)
    if(e instanceof HistoryImportError)throw e
    return fail('sql_failed')
  }finally{db.release()}
}
