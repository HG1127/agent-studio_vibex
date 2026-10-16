// Offline DBA library only. No connector, CLI, operator route or worker wiring.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {contentHash} from './stage-agent-import.ts'
import {isUuid,type SqlPool} from './contracts.ts'

export class ExecutionFenceImportError extends Error {}
function fail(code:string):never {throw new ExecutionFenceImportError('execution_fence_'+code)}
const sha=/^[a-f0-9]{64}$/,id=/^[A-Za-z0-9]{15}$/
const digest=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const root=new URL('../../../',import.meta.url)
const migration=new URL('db/postgres/migrations/pg_v9_017_legacy_execution_fence_archive.sql',root)
// Hash normalized LF SQL with ONLY receipt values zeroed (avoids self-reference).
export const executionFenceSqlSha256='e86d0fd6685c7c82e2ed67afa8e63869dd769b2178ab402e07e6cfcca8a401e1'
function checkSql(){
  const sql=fs.readFileSync(migration,'utf8').replace(/\r\n/g,'\n')
  const normalized=sql.replace(/execution_fence_sql_sha256:[a-f0-9]{64}/g,'execution_fence_sql_sha256:'+'0'.repeat(64))
  if(createHash('sha256').update(normalized).digest('hex')!==executionFenceSqlSha256||
    sql.split('execution_fence_sql_sha256:'+executionFenceSqlSha256).length!==3)fail('sql_content_hash')
}
const schemas={
  agent_studio_run_leases:"CREATE TABLE agent_studio_run_leases (kind TEXT NOT NULL CHECK(kind IN ('agent','workflow')),run_id TEXT NOT NULL,lease_token TEXT NOT NULL,acquired_ms INTEGER NOT NULL,expires_ms INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(kind,run_id))",
  agent_studio_side_effects:"CREATE TABLE agent_studio_side_effects (kind TEXT NOT NULL CHECK(kind IN ('agent','workflow')),run_id TEXT NOT NULL,step_key TEXT NOT NULL,tool_name TEXT NOT NULL,args_hash TEXT NOT NULL,idempotency_key TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('started','succeeded','unknown')),result_text TEXT NOT NULL DEFAULT '',created_ms INTEGER NOT NULL,updated_ms INTEGER NOT NULL,PRIMARY KEY(kind,run_id,step_key))",
} as const
const fields={
  agent_studio_run_leases:['kind','run_id','lease_token','acquired_ms','expires_ms','attempts'],
  agent_studio_side_effects:['kind','run_id','step_key','tool_name','args_hash','idempotency_key','status','result_text','created_ms','updated_ms'],
} as const
type Table=keyof typeof schemas
type Raw=Record<string,unknown>
type Parent={source_table:'agent_runs'|'workflow_runs';legacy_run_id:string;legacy_owner_id:string;owner_user_id:string;payload_sha256:string}
type Row={source_table:Table;kind:string;legacy_run_id:string;step_key:string;legacy_owner_id:string;owner_user_id:string;parent_payload_sha256:string;source_record:Raw;payload_sha256:string}
export type ExecutionFenceImportPlan={source_snapshot_sha256:string;identity_mapping_sha256:string;manifest_sha256:string;source_review_sha256:string;parents:Parent[];rows:Row[]}
const issued=new WeakMap<ExecutionFenceImportPlan,string>()
const numeric=new Set(['acquired_ms','expires_ms','attempts','created_ms','updated_ms'])
const badUnicode=/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u
const secret=/(?:password|passwd|secret|credential|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|authorization|bearer\s|-----BEGIN|\bsk-[\w-]{12,}|eyJ[\w-]+\.eyJ|\bAKIA[A-Z0-9]{16}\b|\bgh[pousr]_[\w]{20,}|https?:\/\/[^\s]+:[^\s]+@)/i
function text(v:unknown,max:number):v is string {
  return typeof v==='string'&&Buffer.byteLength(v,'utf8')<=max&&
    !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v)&&!badUnicode.test(v)
}
function approved(r:Raw,independentOf:Set<string>=new Set()){
  return r&&text(r.reviewed_by,120)&&r.reviewed_by.trim().length>=2&&!independentOf.has(r.reviewed_by)&&
    typeof r.reviewed_at==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(r.reviewed_at)&&
    Number.isFinite(Date.parse(r.reviewed_at))
}
function metadata(p:string){
  if(fs.statSync(p).size>5_000_000)fail('metadata_limit')
  const bytes=fs.readFileSync(p),s=bytes.toString('utf8')
  if(!Buffer.from(s,'utf8').equals(bytes))fail('metadata_encoding')
  const value=JSON.parse(s)
  // Conservative JSON subset: roundtrip rejects duplicate keys, lossy numbers,
  // escaped spellings and prototype-like keys before approving any rows.
  const compact=s.replace(/("(?:\\.|[^"\\])*")|\s+/g,(_m,q:string|undefined)=>q??'')
  if(compact!==JSON.stringify(value))fail('metadata_not_canonical')
  contentHash(value)
  return value
}
export function prepareExecutionFenceImport(snapshotPath:string,manifestPath:string,mappingPath:string,
  reviewPath:string,trustedReviewSha256:string):ExecutionFenceImportPlan {
  try{return prepare(snapshotPath,manifestPath,mappingPath,reviewPath,trustedReviewSha256)}catch(e){
    if(e instanceof ExecutionFenceImportError)throw e
    return fail('source_invalid')
  }
}
function prepare(snapshotPath:string,manifestPath:string,mappingPath:string,reviewPath:string,trusted:string):ExecutionFenceImportPlan {
  checkSql()
  const files=[snapshotPath,manifestPath,mappingPath,reviewPath].map(p=>fs.realpathSync(p))
  const livePath=fileURLToPath(new URL('pocketbase/pb_data',root))
  const live=(fs.existsSync(livePath)?fs.realpathSync(livePath):livePath).toLowerCase()
  for(const p of files)if(!fs.statSync(p).isFile()||p.toLowerCase()===live||p.toLowerCase().startsWith(live+path.sep))fail('live_source_forbidden')
  if(new Set(files.map(p=>p.toLowerCase())).size!==4||new Set(files.map(p=>{const s=fs.statSync(p);return s.dev+':'+s.ino})).size!==4)fail('duplicate_paths')
  const [snapshot,manifest,mapping,reviewFile]=files as [string,string,string,string]
  const sidecars=()=>['-wal','-shm','-journal'].some(s=>fs.existsSync(snapshot+s))
  if(sidecars())fail('source_not_frozen')
  const before=files.map(digest)
  if(!sha.test(trusted)||trusted!==before[3])fail('untrusted_review')
  const info=metadata(manifest),identity=metadata(mapping),review=metadata(reviewFile)
  if(info.format!=='agent-studio-sqlite-snapshot-v1'||info.sha256!==before[0]||info.bytes!==fs.statSync(snapshot).size||
    !info.tables||typeof info.tables!=='object'||Array.isArray(info.tables))fail('manifest_invalid')
  if(identity.schema_version!=='studio-approved-identity-map-v2'||identity.source_sha256!==before[0]||!Array.isArray(identity.records))fail('mapping_invalid')
  const reviewers=new Set<string>(identity.records.map((r:Raw)=>String(r.verified_by)))
  if(review.format!=='studio-execution-fence-source-review-v1'||review.source_sha256!==before[0]||
    review.identity_mapping_sha256!==before[2]||review.manifest_sha256!==before[1]||review.credentials_absent!==true||
    review.inert_opaque_text!==true||!approved(review,reviewers)||!review.tables||typeof review.tables!=='object'||Array.isArray(review.tables))fail('source_review_required')
  const db=new DatabaseSync(snapshot,{readOnly:true})
  try{
    db.exec('BEGIN')
    if(Object.values(db.prepare('PRAGMA quick_check').get()??{})[0]!=='ok')fail('sqlite_integrity')
    const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name").all().map(r=>String(r.name))
    if(contentHash([...Object.keys(info.tables)].sort())!==contentHash(tables))fail('manifest_inventory')
    for(const table of tables){
      const n=info.tables[table]
      if(!/^[A-Za-z_][A-Za-z0-9_]{0,120}$/.test(table)||!Number.isSafeInteger(n)||n<0||
        db.prepare('SELECT count(*) AS n FROM "'+table+'"').get()?.n!==n)fail('manifest_count_mismatch')
    }
    const required=['agent_studio_run_leases','agent_studio_side_effects','agent_runs','workflow_runs']
    if(required.some(t=>!tables.includes(t))||!tables.includes('studio_users')||
      contentHash(Object.keys(review.tables).sort())!==contentHash([...required].sort()))fail('missing_table_or_review')
    const users=new Set(db.prepare('SELECT id FROM studio_users').all().map(r=>String(r.id)))
    const owners=new Map<string,string>(),targets=new Set<string>()
    for(const r of identity.records){
      if(!r||!id.test(r.old_id)||!users.has(r.old_id)||!isUuid(r.new_studio_user_id)||
        !approved({reviewed_by:r.verified_by,reviewed_at:r.approved_at}))fail('mapping_unreviewed')
      const target=r.new_studio_user_id.toLowerCase()
      if(owners.has(r.old_id)||targets.has(target))fail('mapping_collision')
      owners.set(r.old_id,target);targets.add(target)
    }
    if(!users.size||owners.size!==users.size)fail('mapping_incomplete')
    const selected=new Map<string,Raw[]>()
    for(const table of required){
      const n=info.tables[table],att=review.tables[table]
      if(n>5000||!att||!approved(att,reviewers)||att.credentials_absent!==true||att.inert_opaque_text!==true||
        !Array.isArray(att.rows)||att.rows.length!==n)fail('table_review_required')
      const hashes=new Set<string>()
      for(const r of att.rows){
        if(!approved(r,reviewers)||r.credentials_absent!==true||r.inert_opaque_text!==true||!sha.test(r.row_sha256)||hashes.has(r.row_sha256))fail('row_review_required')
        hashes.add(r.row_sha256)
      }
      // Verify all TEXT bytes separately: node:sqlite truncates embedded NUL.
      const cols=db.prepare('PRAGMA table_info("'+table+'")').all().map(r=>String(r.name))
      if(cols.some(c=>!/^[a-z_]+$/.test(c)))fail('schema_invalid')
      const projection=cols.flatMap(c=>['"'+c+'"','typeof("'+c+'") AS "_type_'+c+'"','hex(CAST("'+c+'" AS BLOB)) AS "_bytes_'+c+'"'])
      const rows=db.prepare('SELECT '+projection.join(',')+' FROM '+table).all().map(selected=>{
        const raw:Raw={}
        for(const c of cols){
          const v=selected[c];raw[c]=v
          if(selected['_type_'+c]==='text'&&(typeof v!=='string'||badUnicode.test(v)||Buffer.from(v,'utf8').toString('hex').toUpperCase()!==selected['_bytes_'+c]))fail('text_not_lossless')
          if(selected['_type_'+c]==='blob'||(typeof v==='number'&&!Number.isSafeInteger(v)))fail('value_not_lossless')
        }
        if(!hashes.delete(contentHash(raw)))fail('row_review_mismatch')
        return raw
      })
      if(hashes.size)fail('row_review_mismatch')
      selected.set(table,rows)
    }
    const parents:Parent[]=[],parentIndex=new Map<string,Parent>()
    for(const table of ['agent_runs','workflow_runs'] as const)for(const raw of selected.get(table)!){
      if(typeof raw.id!=='string'||!id.test(raw.id)||typeof raw.rh_user_id!=='string'||!owners.has(raw.rh_user_id))fail('parent_identity')
      const key=table+':'+raw.id
      if(parentIndex.has(key))fail('duplicate_parent')
      const p:Parent={source_table:table,legacy_run_id:raw.id,legacy_owner_id:raw.rh_user_id,owner_user_id:owners.get(raw.rh_user_id)!,payload_sha256:contentHash(raw)}
      parents.push(p);parentIndex.set(key,p)
    }
    const rows:Row[]=[],keys=new Set<string>()
    for(const table of Object.keys(schemas) as Table[]){
      // Ignore SQL keyword case/spacing, never alter CHECK/default literals.
      const normalize=(s:string)=>s.replace(/^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+/i,'CREATE TABLE ')
        .replace(/('(?:''|[^'])*')|(\s+)|([A-Za-z_]+)/g,(_m,literal:string|undefined,ws:string|undefined,word:string|undefined)=>literal??(ws?'':word!.toLowerCase()))
      const actual=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table)?.sql
      if(typeof actual!=='string'||normalize(actual)!==normalize(schemas[table]))fail('exact_schema_required')
      for(const raw of selected.get(table)!){
        if(contentHash(Object.keys(raw).sort())!==contentHash([...fields[table]].sort()))fail('exact_schema_required')
        for(const [k,v] of Object.entries(raw)){
          if(numeric.has(k)){
            if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||Object.is(v,-0))fail('integer_invalid')
          }else if(!text(v,k==='result_text'?8192:k==='run_id'?15:256)||secret.test(v))fail('unsafe_text')
        }
        if(!['agent','workflow'].includes(String(raw.kind))||!id.test(String(raw.run_id))||
          (table==='agent_studio_side_effects'&&!['started','succeeded','unknown'].includes(String(raw.status))))fail('source_value_invalid')
        const parent=parentIndex.get((raw.kind==='agent'?'agent_runs':'workflow_runs')+':'+raw.run_id)
        if(!parent)fail('orphan_run')
        const step=table==='agent_studio_run_leases'?'':String(raw.step_key)
        const key=JSON.stringify([table,raw.kind,raw.run_id,step])
        if(keys.has(key))fail('duplicate_row');keys.add(key)
        rows.push({source_table:table,kind:String(raw.kind),legacy_run_id:String(raw.run_id),step_key:step,
          legacy_owner_id:parent.legacy_owner_id,owner_user_id:parent.owner_user_id,parent_payload_sha256:parent.payload_sha256,
          source_record:raw,payload_sha256:contentHash(raw)})
      }
    }
    if(!rows.length||rows.length>5000)fail('batch_size')
    if(sidecars()||files.some((p,i)=>digest(p)!==before[i]))fail('source_changed')
    const plan={source_snapshot_sha256:before[0]!,identity_mapping_sha256:before[2]!,manifest_sha256:before[1]!,source_review_sha256:before[3]!,parents,rows}
    issued.set(plan,contentHash(plan));return plan
  }finally{db.close()}
}

export async function importLegacyExecutionFenceToStage(pool:SqlPool,plan:ExecutionFenceImportPlan){
  try{checkSql();if(!issued.has(plan)||issued.get(plan)!==contentHash(plan))fail('unverified_or_mutated_plan')}
  catch(e){if(e instanceof ExecutionFenceImportError)throw e;return fail('invalid_plan')}
  const input=structuredClone(plan)
  const db=await (async()=>{try{return await pool.connect()}catch{return fail('sql_failed')}})()
  let begun=false
  try{
    await db.query('BEGIN');begun=true
    await db.query("SET LOCAL lock_timeout='5s'")
    await db.query("SET LOCAL statement_timeout='30s'")
    const g=(await db.query<{database:string;login:string;role:string;admin:boolean;version:number}>(
      "SELECT current_database() AS database,session_user AS login,current_user AS role,(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS admin,current_setting('server_version_num')::integer AS version")).rows[0]
    if(!g||g.database!=='agentstudio_stage'||g.login!=='agentstudio_admin'||g.role!==g.login||g.admin!==true||g.version<170000||g.version>=180000)fail('wrong_stage_database_or_version')
    await db.query('LOCK TABLE agentstudio.legacy_execution_fence_archive,agentstudio.legacy_run_history,agentstudio.legacy_workflow_history,agentstudio.legacy_user_imports,agentstudio.users,agentstudio.schema_migrations,agentstudio.jobs,agentstudio.runs,agentstudio.schedules IN EXCLUSIVE MODE')
    const receipt=(await db.query<{description:string}>("SELECT description FROM agentstudio.schema_migrations WHERE version='pg_v9_017'")).rows
    if(receipt.length!==1||receipt[0]?.description!=='execution_fence_sql_sha256:'+executionFenceSqlSha256)fail('sql_receipt_mismatch')
    if((await db.query("SELECT 1 FROM agentstudio.jobs UNION ALL SELECT 1 FROM agentstudio.runs WHERE status IN ('queued','running','awaiting_approval','paused') UNION ALL SELECT 1 FROM agentstudio.schedules WHERE enabled=true")).rows.length)fail('stage_execution_not_drained')
    if((await db.query('SELECT 1 FROM agentstudio.legacy_execution_fence_archive WHERE source_snapshot_sha256<>$1 OR identity_mapping_sha256<>$2 OR manifest_sha256<>$3 OR source_review_sha256<>$4',
      [input.source_snapshot_sha256,input.identity_mapping_sha256,input.manifest_sha256,input.source_review_sha256])).rows.length)fail('snapshot_or_review_conflict')
    // Check every reviewed source parent, including parents with no fence row.
    for(const p of input.parents){
      if((await db.query('SELECT 1 FROM agentstudio.legacy_user_imports m JOIN agentstudio.users u ON u.id=m.target_user_id '+
        'WHERE m.legacy_user_id=$1 AND m.target_user_id=$2::uuid AND m.source_snapshot_sha256=$3 AND m.reviewed_mapping_sha256=$4 '+
        "AND m.reviewed_idp_sha256 ~ '^[a-f0-9]{64}$' AND m.active_automatically=false AND u.status IN ('active','disabled')",
        [p.legacy_owner_id,p.owner_user_id,input.source_snapshot_sha256,input.identity_mapping_sha256])).rows.length!==1)fail('target_identity_unverified')
      const table=p.source_table==='agent_runs'?'legacy_run_history':'legacy_workflow_history'
      const stored=(await db.query<Raw>('SELECT * FROM agentstudio.'+table+' WHERE source_table=$1 AND legacy_id=$2',[p.source_table,p.legacy_run_id])).rows
      const s=stored[0]
      if(stored.length!==1||!s||s.owner_user_id!==p.owner_user_id||s.executable!==false||
        s.source_snapshot_sha256!==input.source_snapshot_sha256||s.identity_mapping_sha256!==input.identity_mapping_sha256||s.manifest_sha256!==input.manifest_sha256||
        s.payload_sha256!==p.payload_sha256||contentHash(s.source_record)!==p.payload_sha256||
        (s.source_record as Raw).id!==p.legacy_run_id||(s.source_record as Raw).rh_user_id!==p.legacy_owner_id)fail('parent_source_or_owner_mismatch')
    }
    let imported=0,replayed=0
    for(const row of input.rows){
      const key=[row.source_table,row.kind,row.legacy_run_id,row.step_key]
      const find='SELECT * FROM agentstudio.legacy_execution_fence_archive WHERE source_table=$1 AND kind=$2 AND legacy_run_id=$3 AND step_key=$4'
      if((await db.query(find,key)).rows.length)replayed++
      else{
        await db.query('INSERT INTO agentstudio.legacy_execution_fence_archive(source_snapshot_sha256,identity_mapping_sha256,manifest_sha256,source_review_sha256,source_table,kind,legacy_run_id,step_key,legacy_owner_id,owner_user_id,parent_payload_sha256,source_record,payload_sha256) '+
          'VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::uuid,$11,$12::jsonb,$13)',
          [input.source_snapshot_sha256,input.identity_mapping_sha256,input.manifest_sha256,input.source_review_sha256,...key,row.legacy_owner_id,row.owner_user_id,row.parent_payload_sha256,JSON.stringify(row.source_record),row.payload_sha256]);imported++
      }
      const s=(await db.query<Raw>(find,key)).rows[0]
      if(!s||s.executable!==false||s.evidence_status!=='historical_unverified'||
        ['source_snapshot_sha256','identity_mapping_sha256','manifest_sha256','source_review_sha256'].some(k=>s[k]!==input[k as keyof typeof input])||
        Object.keys(row).filter(k=>k!=='source_record').some(k=>s[k]!==row[k as keyof Row])||contentHash(s.source_record)!==row.payload_sha256)fail('reconciliation_mismatch')
    }
    if((await db.query<{n:number}>('SELECT count(*)::int AS n FROM agentstudio.legacy_execution_fence_archive')).rows[0]?.n!==input.rows.length)fail('batch_incomplete')
    await db.query('COMMIT');begun=false
    return {imported,replayed,reconciled:input.rows.length,execution_enabled:false,runtime_jobs_created:0,side_effects_created:0,production_cutover_allowed:false}
  }catch(e){
    if(begun)await db.query('ROLLBACK').catch(()=>undefined)
    if(e instanceof ExecutionFenceImportError)throw e
    return fail('sql_failed')
  }finally{try{db.release()}catch{/* No driver diagnostics or source values. */}}
}
