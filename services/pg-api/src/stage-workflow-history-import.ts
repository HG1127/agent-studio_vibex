// Offline library only. Never mount in API/Operator or import a worker/provider.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {contentHash} from './stage-agent-import.ts'
import {isUuid,type SqlPool} from './contracts.ts'

export class WorkflowHistoryImportError extends Error {}
function fail(code:string):never {throw new WorkflowHistoryImportError('workflow_history_'+code)}
const id=/^[A-Za-z0-9]{15}$/
const fields={
  workflow_runs:['id','rh_user_id','workflow_id','workflow_name','instruction','status','graph_snapshot','checkpoint','result','error','done_nodes','total_nodes','created','updated'],
  workflow_events:['id','run_id','node_id','seq','event_type','content','created','updated'],
} as const
type Table=keyof typeof fields
type Row={source_table:Table;legacy_id:string;owner_user_id:string;legacy_run_id:string;legacy_workflow_id:string;source_record:Record<string,unknown>;payload_sha256:string}
export type WorkflowHistoryImportPlan={source_snapshot_sha256:string;identity_mapping_sha256:string;manifest_sha256:string;rows:Row[]}
const issued=new WeakMap<WorkflowHistoryImportPlan,string>()
const digest=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
function approved(r:Record<string,unknown>){
  return typeof r?.verified_by==='string'&&r.verified_by.trim().length>=2&&r.verified_by.length<=120&&
    typeof r.approved_at==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(r.approved_at)&&Number.isFinite(Date.parse(r.approved_at))
}
const badUnicode=/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u
const secret=/(?:password|passwd|secret|credential|private[_ -]?key|api[_ -]?key|token|authorization|bearer\s|-----BEGIN .*PRIVATE KEY|\bsk-[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]+\.eyJ|\bAKIA[A-Z0-9]{16}\b|\bgh[pousr]_[A-Za-z0-9]{20,}|\bAIza[A-Za-z0-9_-]{30,})/i
// Bounded recursive-descent tokenizer: never builds or executes a graph. Each
// object has its own decoded-key set, before JSON.parse could discard duplicates.
function validateJson(text:string,metadata=false){
  if(Buffer.byteLength(text,'utf8')>(metadata?5_000_000:262_144))fail('json_byte_limit')
  if(text.includes('\0')||badUnicode.test(text))fail('json_unicode')
  let pos=0,elements=0
  const ws=()=>{while(pos<text.length&&/[\x20\t\r\n]/.test(text[pos]!))pos++}
  const string=()=>{
    const start=pos++
    while(pos<text.length){
      const c=text[pos++]!
      if(c==='"'){
        const value=JSON.parse(text.slice(start,pos)) as string
        if(value.includes('\0')||badUnicode.test(value))fail('json_unicode')
        if(!metadata&&secret.test(value))fail('possible_secret')
        return value
      }
      if(c.charCodeAt(0)<32)fail('json_invalid')
      if(c==='\\'){
        const escape=text[pos++]
        if(escape==='u'){
          if(!/^[a-fA-F0-9]{4}$/.test(text.slice(pos,pos+4)))fail('json_invalid')
          pos+=4
        }else if(!escape||!'"\\/bfnrt'.includes(escape))fail('json_invalid')
      }
    }
    return fail('json_invalid')
  }
  const value=(depth:number):void=>{
    if(++elements>(metadata?200_000:10_000))fail('json_element_limit')
    ws();const c=text[pos]
    if(c==='{'||c==='['){
      if(depth>=32)fail('json_depth_limit')
      const object=c==='{',end=object?'}':']',keys=new Set<string>()
      pos++;ws();if(text[pos]===end){pos++;return}
      while(true){
        if(object){
          if(text[pos]!=='"')fail('json_invalid')
          const key=string()
          if(keys.has(key))fail('json_duplicate_key')
          keys.add(key);ws();if(text[pos++]!==':')fail('json_invalid')
        }
        value(depth+1);ws()
        if(text[pos]===end){pos++;return}
        if(text[pos++]!==',')fail('json_invalid')
        ws()
      }
    }
    if(c==='"'){string();return}
    for(const literal of ['true','false','null'])if(text.startsWith(literal,pos)){pos+=literal.length;return}
    // Regex is only the JSON number token grammar, not a JSON/duplicate detector.
    const number=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(pos))
    if(!number)fail('json_invalid')
    pos+=number[0].length
  }
  value(0);ws();if(pos!==text.length)fail('json_invalid')
}
function historyJson(v:unknown):boolean{
  if(v===null)return false
  if(typeof v!=='string'||v.length>2_000_000)fail('json_unsupported')
  // Keep W22 empty/null spelling and limits compatible.
  if(/^\s*(?:null|\{\s*\}|\[\s*\])\s*$/.test(v))return false
  validateJson(v)
  if(!/^[\x20\t\r\n]*[\[{]/.test(v))fail('json_root_unsupported')
  return true
}
function metadata(p:string){
  const bytes=fs.readFileSync(p),text=bytes.toString('utf8')
  if(!Buffer.from(text,'utf8').equals(bytes))fail('metadata_not_lossless')
  validateJson(text,true)
  return JSON.parse(text)
}
export function prepareWorkflowHistoryImport(snapshotPath:string,manifestPath:string,mappingPath:string):WorkflowHistoryImportPlan {
  try{return prepare(snapshotPath,manifestPath,mappingPath)}catch(e){
    if(e instanceof WorkflowHistoryImportError)throw e
    return fail('source_invalid')
  }
}
function prepare(snapshotPath:string,manifestPath:string,mappingPath:string):WorkflowHistoryImportPlan {
  const files=[snapshotPath,manifestPath,mappingPath].map(p=>fs.realpathSync(p))
  const livePath=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../pocketbase/pb_data')
  const live=(fs.existsSync(livePath)?fs.realpathSync(livePath):livePath).toLowerCase()
  for(const p of files)if(!fs.statSync(p).isFile()||p.toLowerCase()===live||p.toLowerCase().startsWith(live+path.sep))fail('live_source_forbidden')
  if(new Set(files.map(p=>p.toLowerCase())).size!==3)fail('duplicate_paths')
  const [snapshot,manifest,mapping]=files as [string,string,string]
  const sidecars=()=>['-wal','-shm','-journal'].some(s=>fs.existsSync(snapshot+s))
  if(sidecars())fail('source_not_frozen')
  if(fs.statSync(manifest).size>5_000_000||fs.statSync(mapping).size>5_000_000)fail('metadata_too_large')
  const before=files.map(digest),info=metadata(manifest)
  if(info.format!=='agent-studio-sqlite-snapshot-v1'||info.sha256!==before[0]||
    !/^[a-f0-9]{64}$/.test(info.sha256)||info.bytes!==fs.statSync(snapshot).size||
    !info.tables||typeof info.tables!=='object'||Array.isArray(info.tables))fail('manifest_invalid')
  const identity=metadata(mapping)
  if(identity.schema_version!=='studio-approved-identity-map-v2'||identity.source_sha256!==info.sha256||!Array.isArray(identity.records))fail('mapping_invalid')
  const review=info.workflow_history_archive_review
  if(!review||review.source_sha256!==info.sha256||review.identity_mapping_sha256!==before[2]||
    review.credentials_absent!==true||!approved(review)||!review.tables||typeof review.tables!=='object'||
    Object.keys(review.tables).sort().join(',')!=='workflow_events,workflow_runs')fail('content_review_required')
  const structured=info.workflow_history_structured_review
  if(structured!==undefined&&(!structured||structured.source_sha256!==info.sha256||
    structured.identity_mapping_sha256!==before[2]||structured.credentials_absent!==true||!approved(structured)||
    structured.verified_by!==structured.verified_by.trim()||
    new Date(structured.approved_at).toISOString().slice(0,19)!==structured.approved_at.slice(0,19)||
    !structured.tables||Object.keys(structured.tables).sort().join(',')!=='workflow_events,workflow_runs'))fail('structured_review_required')
  const db=new DatabaseSync(snapshot,{readOnly:true})
  try {
    db.exec('BEGIN')
    if(Object.values(db.prepare('PRAGMA quick_check').get()??{})[0]!=='ok')fail('sqlite_integrity')
    const actual=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'").all().map(r=>String(r.name)).sort()
    if(actual.join(',')!==Object.keys(info.tables).sort().join(','))fail('manifest_not_complete')
    for(const table of ['workflow_runs','workflow_events','studio_users','workflows','agent_specs'])
      if(!Object.hasOwn(info.tables,table))fail('manifest_missing_table')
    for(const [table,n] of Object.entries(info.tables)){
      if(!/^[A-Za-z_][A-Za-z0-9_]{0,120}$/.test(table)||!Number.isSafeInteger(n)||Number(n)<0)fail('manifest_count_invalid')
      if(db.prepare('SELECT count(*) AS n FROM "'+table+'"').get()?.n!==n)fail('manifest_count_mismatch')
    }
    for(const table of Object.keys(fields) as Table[]){
      const columns=db.prepare('PRAGMA table_xinfo('+table+')').all()
      if(columns.length!==fields[table].length||columns.some(c=>Number(c.hidden)!==0||!fields[table].includes(String(c.name) as never)))fail('unknown_or_missing_field')
      for(const c of columns){
        const numeric=['done_nodes','total_nodes','seq'].includes(String(c.name))
        const json=['graph_snapshot','checkpoint','content'].includes(String(c.name))
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
    const rows:Row[]=[],runs=new Map<string,Row>()
    for(const table of Object.keys(fields) as Table[]){
      const n=Number(info.tables[table])
      if(n>5000||rows.length+n>10000)fail('batch_size')
      const reviewed=review.tables[table]?.row_sha256
      if(!Array.isArray(reviewed)||reviewed.length!==n||new Set(reviewed).size!==n||reviewed.some(h=>typeof h!=='string'||!/^[a-f0-9]{64}$/.test(h)))fail('review_or_count_mismatch')
      const seen=new Set<string>()
      const complexHashes=new Set<string>()
      // node:sqlite can truncate TEXT at embedded NUL. Verify original SQLite
      // UTF-8 bytes independently, so truncation/replacement never passes review.
      const textFields=fields[table].filter(k=>!['done_nodes','total_nodes','seq'].includes(k))
      const projection=[...fields[table].map(k=>'"'+k+'"'),...textFields.map(k=>'hex(CAST("'+k+'" AS BLOB)) AS "_bytes_'+k+'"')]
      for(const selected of db.prepare('SELECT '+projection.join(',')+' FROM '+table+' ORDER BY id').all()){
        const raw:Record<string,unknown>=Object.fromEntries(fields[table].map(k=>[k,selected[k]]))
        for(const k of textFields){
          const v=raw[k]
          if(typeof v==='string'&&Buffer.from(v,'utf8').toString('hex').toUpperCase()!==selected['_bytes_'+k])fail('text_not_lossless')
        }
        if(typeof raw.id!=='string'||!id.test(raw.id)||seen.has(raw.id))fail('identity_or_reference_invalid')
        seen.add(raw.id)
        let complex=false
        for(const k of fields[table]){
          const v=raw[k]
          if(['done_nodes','total_nodes','seq'].includes(k)){
            if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||Object.is(v,-0))fail('number_not_lossless')
          }else if(['graph_snapshot','checkpoint','content'].includes(k))complex=historyJson(v)||complex
          else if(typeof v!=='string'||v.includes('\0')||v.length>2_000_000||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v))fail('text_not_lossless')
        }
        if(/(?:password|passwd|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|authorization|bearer\s|-----BEGIN .*PRIVATE KEY|\bsk-[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]+\.eyJ)/i.test(JSON.stringify(raw)))fail('possible_secret')
        let owner:string,runId:string,workflowId:string
        if(table==='workflow_runs'){
          if(typeof raw.rh_user_id!=='string'||!owners.has(raw.rh_user_id)||typeof raw.workflow_id!=='string'||!id.test(raw.workflow_id))fail('identity_or_reference_invalid')
          const workflows=db.prepare('SELECT id,rh_user_id,spec_id FROM workflows WHERE id=?').all(raw.workflow_id)
          const w=workflows[0]
          if(workflows.length!==1||w?.rh_user_id!==raw.rh_user_id)fail('workflow_missing_or_foreign')
          if(w.spec_id!==''){
            if(typeof w.spec_id!=='string'||!id.test(w.spec_id))fail('spec_missing_or_foreign')
            const specs=db.prepare('SELECT id,rh_user_id FROM agent_specs WHERE id=?').all(w.spec_id)
            if(specs.length!==1||specs[0]?.rh_user_id!==raw.rh_user_id)fail('spec_missing_or_foreign')
          }
          owner=owners.get(raw.rh_user_id)!;runId=raw.id;workflowId=raw.workflow_id
        }else{
          if(typeof raw.run_id!=='string'||!id.test(raw.run_id))fail('run_missing_or_foreign')
          const run=runs.get(raw.run_id)
          if(!run)fail('run_missing_or_foreign')
          owner=run.owner_user_id;runId=run.legacy_id;workflowId=run.legacy_workflow_id
        }
        const payload=contentHash(raw)
        if(!reviewed.includes(payload))fail('review_or_count_mismatch')
        if(complex){
          if(!structured)fail('structured_review_required')
          complexHashes.add(payload)
        }
        const row:Row={source_table:table,legacy_id:raw.id,owner_user_id:owner,legacy_run_id:runId,legacy_workflow_id:workflowId,source_record:structuredClone(raw),payload_sha256:payload}
        rows.push(row);if(table==='workflow_runs')runs.set(raw.id,row)
      }
      if(seen.size!==n)fail('review_or_count_mismatch')
      if(structured){
        const hashes=structured.tables[table]?.row_sha256
        if(!Array.isArray(hashes)||hashes.length!==complexHashes.size||new Set(hashes).size!==hashes.length||
          hashes.some(h=>typeof h!=='string'||!complexHashes.has(h)))fail('structured_review_hash_mismatch')
      }
    }
    if(sidecars()||files.some((p,i)=>digest(p)!==before[i]))fail('source_changed')
    const plan={source_snapshot_sha256:info.sha256,identity_mapping_sha256:before[2]!,manifest_sha256:before[1]!,rows}
    issued.set(plan,contentHash(plan));return plan
  }finally{db.close()}
}

export async function importLegacyWorkflowHistoryToStage(pool:SqlPool,plan:WorkflowHistoryImportPlan){
  if(!issued.has(plan)||issued.get(plan)!==contentHash(plan))fail('unverified_or_mutated_plan')
  const input=structuredClone(plan),db=await pool.connect().catch(()=>fail('sql_failed'));let begun=false
  try{
    await db.query('BEGIN');begun=true
    await db.query("SET LOCAL lock_timeout='5s'")
    await db.query("SET LOCAL statement_timeout='30s'")
    const g=(await db.query<{database:string;login:string;admin:boolean;version:number}>(
      "SELECT current_database() AS database,session_user AS login,(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS admin,current_setting('server_version_num')::integer AS version")).rows[0]
    if(!g||g.database!=='agentstudio_stage'||g.login!=='agentstudio_admin'||g.admin!==true||g.version<170000||g.version>=180000)fail('wrong_stage_database_or_version')
    await db.query('LOCK TABLE agentstudio.legacy_workflow_history,agentstudio.users,agentstudio.jobs,agentstudio.runs,agentstudio.schedules IN EXCLUSIVE MODE')
    if((await db.query("SELECT version FROM agentstudio.schema_migrations WHERE version='pg_v9_014'")).rows.length!==1)fail('missing_migration')
    if((await db.query("SELECT 1 FROM agentstudio.jobs UNION ALL SELECT 1 FROM agentstudio.runs WHERE status IN ('queued','running','awaiting_approval','paused') UNION ALL SELECT 1 FROM agentstudio.schedules WHERE enabled=true")).rows.length)fail('stage_execution_not_drained')
    // Exact reviewed identity binding is required for active AND disabled users.
    if((await db.query("SELECT version FROM agentstudio.schema_migrations WHERE version='pg_v8_011'")).rows.length!==1)fail('target_identity_unverified')
    await db.query('LOCK TABLE agentstudio.legacy_user_imports IN EXCLUSIVE MODE')
    if((await db.query('SELECT 1 FROM agentstudio.legacy_workflow_history WHERE source_snapshot_sha256<>$1 OR identity_mapping_sha256<>$2 OR manifest_sha256<>$3',
      [input.source_snapshot_sha256,input.identity_mapping_sha256,input.manifest_sha256])).rows.length)fail('snapshot_or_review_conflict')
    let imported=0,replayed=0
    for(const row of input.rows){
      const oldOwner=row.source_table==='workflow_runs'?row.source_record.rh_user_id:
        input.rows.find(r=>r.source_table==='workflow_runs'&&r.legacy_id===row.legacy_run_id)?.source_record.rh_user_id
      if((await db.query('SELECT 1 FROM agentstudio.legacy_user_imports m JOIN agentstudio.users u ON u.id=m.target_user_id '+
        'WHERE m.legacy_user_id=$1 AND m.target_user_id=$2::uuid AND m.source_snapshot_sha256=$3 '+
        "AND m.reviewed_mapping_sha256=$4 AND m.reviewed_idp_sha256 ~ '^[a-f0-9]{64}$' AND m.active_automatically=false AND u.status IN ('active','disabled')",
        [oldOwner,row.owner_user_id,input.source_snapshot_sha256,input.identity_mapping_sha256])).rows.length!==1)fail('target_identity_unverified')
      const key=[row.source_table,row.legacy_id]
      if((await db.query('SELECT archive_id FROM agentstudio.legacy_workflow_history WHERE source_table=$1 AND legacy_id=$2',key)).rows.length)replayed++
      else{
        await db.query('INSERT INTO agentstudio.legacy_workflow_history(source_snapshot_sha256,identity_mapping_sha256,manifest_sha256,source_table,legacy_id,owner_user_id,legacy_run_id,legacy_workflow_id,source_record,payload_sha256) '+
          'VALUES($1,$2,$3,$4,$5,$6::uuid,$7,$8,$9::jsonb,$10)',
          [input.source_snapshot_sha256,input.identity_mapping_sha256,input.manifest_sha256,row.source_table,row.legacy_id,row.owner_user_id,row.legacy_run_id,row.legacy_workflow_id,JSON.stringify(row.source_record),row.payload_sha256]);imported++
      }
      const stored=(await db.query<Record<string,unknown>>('SELECT * FROM agentstudio.legacy_workflow_history WHERE source_table=$1 AND legacy_id=$2',key)).rows[0]
      if(!stored||stored.executable!==false||stored.model_execution_enabled!==false||stored.evidence_status!=='historical_unverified'||
        stored.source_snapshot_sha256!==input.source_snapshot_sha256||stored.identity_mapping_sha256!==input.identity_mapping_sha256||stored.manifest_sha256!==input.manifest_sha256||
        ['source_table','legacy_id','owner_user_id','legacy_run_id','legacy_workflow_id','payload_sha256'].some(k=>stored[k]!==row[k as keyof Row])||
        contentHash(stored.source_record)!==row.payload_sha256)fail('reconciliation_mismatch')
    }
    if((await db.query<{n:number}>('SELECT count(*)::int AS n FROM agentstudio.legacy_workflow_history')).rows[0]?.n!==input.rows.length)fail('batch_incomplete')
    await db.query('COMMIT');begun=false
    return {imported,replayed,reconciled:input.rows.length,execution_enabled:false,model_execution_enabled:false,history_verified:false,runtime_jobs_created:0,side_effects_created:0,production_cutover_allowed:false}
  }catch(e){
    if(begun)await db.query('ROLLBACK').catch(()=>undefined)
    if(e instanceof WorkflowHistoryImportError)throw e
    return fail('sql_failed')
  }finally{db.release()}
}
