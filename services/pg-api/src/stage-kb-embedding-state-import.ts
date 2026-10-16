// W16 offline archive only. No CLI, transport, model SDK or runtime importer.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {isUuid,type SqlPool,type SqlClient} from './contracts.ts'

function fail(code:string):never{throw new Error('kb_embedding_archive_'+code)}
export const sha256=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex')
const columns={
  agent_studio_kb_embedding_settings:['rh_user_id','connection_id','model_name','updated_ms'],
  agent_studio_kb_embedding_queue:['rh_user_id','base_id','attempts','next_attempt_ms','lease_until_ms','last_error','updated_ms'],
} as const
type SourceTable=keyof typeof columns
type Row=Readonly<{table:SourceTable;id:string;legacyOwner:string;owner:string;base:string|null;raw:string;hash:string}>
type Base=Readonly<{id:string;legacyOwner:string;owner:string}>
export type EmbeddingArchiveBatch=Readonly<{snapshot:string;mapping:string;mappingHash:string;inventory:string;bases:readonly Base[];rows:readonly Row[]}>
const verified=new WeakSet<EmbeddingArchiveBatch>()
const identifier=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(v)
// Reject rather than redact: an archive must never silently change source fields.
function text(v:unknown):v is string{
  return typeof v==='string'&&!v.includes('\0')&&v.length<=1_000_000&&
    !/(?:[a-z][a-z0-9+.-]*:\/\/|www\.|\bBearer\s|\bsk-[A-Za-z0-9_-]{8,}|api[_ -]?key\s*[:=]|authorization\s*:|password\s*[:=])/i.test(v)
}
function inputFile(p:string){
  const resolved=path.resolve(p),real=fs.realpathSync(resolved)
  const live=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../pocketbase/pb_data')
  const norm=(s:string)=>process.platform==='win32'?s.toLowerCase():s
  const actual=fs.existsSync(live)?fs.realpathSync(live):live
  if(norm(real)!==norm(resolved)||fs.lstatSync(resolved).isSymbolicLink()||!fs.statSync(real).isFile()||
    norm(real)===norm(actual)||norm(real).startsWith(norm(actual+path.sep)))fail('offline_regular_file_required')
  return real
}
function metadata(s:string):Record<string,unknown>{
  const v:unknown=JSON.parse(s)
  if(!v||typeof v!=='object'||Array.isArray(v))fail('invalid_metadata')
  return v as Record<string,unknown>
}
const inventory=(bases:readonly Base[],rows:readonly Row[])=>sha256(JSON.stringify({bases,rows}))

export function loadKbEmbeddingStateSnapshot(options:{snapshot:string;manifest:string;mapping:string}):EmbeddingArchiveBatch{
  try{return load(options)}catch(error){
    if(error instanceof Error&&/^kb_embedding_archive_[a-z0-9_]+$/.test(error.message))throw error
    return fail('source_invalid') // Never expose SQLite diagnostics, paths or payloads.
  }
}
function load(options:{snapshot:string;manifest:string;mapping:string}):EmbeddingArchiveBatch{
  const source=inputFile(options.snapshot),mf=inputFile(options.manifest),mp=inputFile(options.mapping)
  if(new Set([source,mf,mp].map(p=>p.toLowerCase())).size!==3)fail('distinct_files_required')
  const sidecars=()=>{for(const suffix of ['-wal','-shm','-journal'])if(fs.existsSync(source+suffix))fail('snapshot_sidecar')}
  sidecars()
  if(fs.statSync(source).size>512_000_000||fs.statSync(mf).size>5_000_000||fs.statSync(mp).size>5_000_000)fail('input_too_large')
  const bytes=fs.readFileSync(source),snapshot=sha256(bytes),manifestText=fs.readFileSync(mf,'utf8'),mapText=fs.readFileSync(mp,'utf8')
  const manifest=metadata(manifestText),mapping=metadata(mapText)
  if(manifest.format!=='agent-studio-sqlite-snapshot-v1'||manifest.sha256!==snapshot||manifest.bytes!==bytes.length||
    !manifest.tables||typeof manifest.tables!=='object'||Array.isArray(manifest.tables))fail('manifest_mismatch')
  if(mapping.schema_version!=='studio-approved-identity-map-v2'||mapping.source_sha256!==snapshot||!Array.isArray(mapping.records))fail('approved_mapping_required')
  const db=new DatabaseSync(source,{readOnly:true}),bases:Base[]=[],rows:Row[]=[],approved:Record<string,string>[]=[]
  try{
    db.exec('PRAGMA trusted_schema=OFF; PRAGMA query_only=ON; BEGIN')
    if(Object.values(db.prepare('PRAGMA quick_check').get()??{})[0]!=='ok')fail('sqlite_integrity')
    const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>String(r.name))
    const counts=manifest.tables as Record<string,unknown>
    if(names.length!==Object.keys(counts).length)fail('manifest_table_inventory')
    for(const table of names){
      if(!/^[A-Za-z_][A-Za-z0-9_]{0,119}$/.test(table)||!Object.hasOwn(counts,table)||!Number.isSafeInteger(counts[table])||
        db.prepare('SELECT count(*) AS n FROM "'+table+'"').get()?.n!==counts[table])fail('manifest_count')
    }
    for(const t of ['studio_users','model_connections','agent_studio_kb_bases',...Object.keys(columns)])if(!names.includes(t))fail('missing_source_table')
    const sourceUsers=db.prepare('SELECT id FROM studio_users').all()
    const users=new Set(sourceUsers.map(r=>r.id))
    if(users.size!==sourceUsers.length||sourceUsers.some(r=>!identifier(r.id)))fail('invalid_source_users')
    const owners=new Map<string,string>(),targets=new Set<string>()
    for(const u of mapping.records){
      const r=u as Record<string,unknown>
      if(!r||!identifier(r.old_id)||!users.has(r.old_id)||!isUuid(r.new_studio_user_id)||
        !text(r.verified_by)||r.verified_by.trim().length<2||typeof r.approved_at!=='string'||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(r.approved_at)||!Number.isFinite(Date.parse(r.approved_at)))fail('unapproved_owner')
      const owner=String(r.new_studio_user_id).toLowerCase()
      if(owners.has(r.old_id)||targets.has(owner))fail('ambiguous_owner')
      owners.set(r.old_id,owner);targets.add(owner)
      approved.push({old_id:r.old_id,new_studio_user_id:owner,verified_by:r.verified_by,approved_at:r.approved_at})
    }
    if(owners.size!==users.size)fail('missing_owner_mapping')
    approved.sort((a,b)=>a.old_id!<b.old_id!?-1:1)
    // Only identity projections, never credentials, URLs or model configuration.
    const connectionRows=db.prepare('SELECT id,rh_user_id FROM model_connections').all()
    const connections=new Map(connectionRows.map(r=>[r.id,r.rh_user_id]))
    if(connections.size!==connectionRows.length)fail('ambiguous_connection')
    for(const b of db.prepare('SELECT id,rh_user_id FROM agent_studio_kb_bases ORDER BY id COLLATE BINARY').all()){
      if(!identifier(b.id)||!identifier(b.rh_user_id)||!owners.has(b.rh_user_id)||bases.some(x=>x.id===b.id))fail('base_owner_reference')
      bases.push(Object.freeze({id:b.id,legacyOwner:b.rh_user_id,owner:owners.get(b.rh_user_id)!}))
    }
    if(bases.length>100000)fail('batch_too_large')
    for(const [table,cols] of Object.entries(columns) as [SourceTable,readonly string[]][]){
      const actual=db.prepare('PRAGMA table_xinfo('+table+')').all()
      if(actual.length!==cols.length||actual.some(r=>!cols.includes(String(r.name))||r.hidden!==0))fail('unsupported_source_columns')
      const textColumns=cols.filter(k=>!['updated_ms','attempts','next_attempt_ms','lease_until_ms'].includes(k))
      const projection=[...cols,...textColumns.map(k=>'CAST('+k+' AS BLOB) AS __bytes_'+k)]
      const records=db.prepare('SELECT '+projection.join(',')+' FROM '+table+' ORDER BY rh_user_id COLLATE BINARY'+(table.endsWith('queue')?',base_id COLLATE BINARY':'')).all()
      if(records.length>100000)fail('batch_too_large')
      const seen=new Set<string>()
      for(const r of records){
        // node:sqlite can truncate TEXT at NUL. Compare original UTF-8 bytes
        // before serializing so malformed/truncated text cannot pass as lossless.
        for(const key of textColumns){
          const bytes=r['__bytes_'+key],value=r[key]
          if(typeof value!=='string'||!(bytes instanceof Uint8Array)||!Buffer.from(bytes).equals(Buffer.from(value,'utf8')))fail('unrepresentable_source_text')
          delete r['__bytes_'+key]
        }
        const uid=r.rh_user_id,queue=table.endsWith('queue')
        if(!identifier(uid)||!owners.has(uid))fail('owner_reference')
        for(const [key,value] of Object.entries(r)){
          if(['updated_ms','attempts','next_attempt_ms','lease_until_ms'].includes(key)){
            if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)fail('invalid_historical_integer')
          }else if(!text(value))fail('unsafe_or_invalid_text')
        }
        const base=queue?r.base_id:null
        if(queue&&(!identifier(base)||!bases.some(b=>b.id===base&&b.legacyOwner===uid)))fail('base_owner_reference')
        if(!queue&&(!identifier(r.connection_id)||connections.get(r.connection_id)!==uid))fail('connection_owner_reference')
        const rowId=JSON.stringify(queue?[uid,base]:[uid])
        if(seen.has(rowId))fail('duplicate_source_key')
        seen.add(rowId)
        // Decimal fields remain exact JSON numbers inside an inert TEXT envelope;
        // additional SQL historical_* TEXT columns cannot be scheduled or leased.
        const raw=JSON.stringify(r)
        rows.push(Object.freeze({table,id:rowId,legacyOwner:uid,owner:owners.get(uid)!,base:base as string|null,raw,hash:sha256(raw)}))
      }
    }
  }finally{db.close()}
  sidecars()
  if(inputFile(source)!==source||sha256(fs.readFileSync(source))!==snapshot||fs.readFileSync(mf,'utf8')!==manifestText||fs.readFileSync(mp,'utf8')!==mapText)fail('input_changed')
  const mappingPayload=JSON.stringify({schema_version:'studio-approved-identity-map-v2',source_sha256:snapshot,records:approved})
  const batch=Object.freeze({snapshot,mapping:mappingPayload,mappingHash:sha256(mappingPayload),bases:Object.freeze(bases),rows:Object.freeze(rows),inventory:inventory(bases,rows)})
  verified.add(batch)
  return batch
}

export async function importKbEmbeddingStateArchive(pool:SqlPool,batch:EmbeddingArchiveBatch){
  if(!verified.has(batch))fail('verified_offline_batch_required')
  const db=await pool.connect().catch(()=>fail('connect_failed'))
  let begun=false
  try{
    await db.query('BEGIN');begun=true
    const result=await archiveKbEmbeddingStateInTransaction(db,batch)
    await db.query('COMMIT');begun=false
    return result
  }catch(error){
    if(begun)try{await db.query('ROLLBACK')}catch{fail('rollback_failed')}
    if(error instanceof Error&&/^kb_embedding_archive_[a-z0-9_]+$/.test(error.message))throw error
    return fail('sql_failed')
  }finally{db.release()}
}

// Reader-minted capability bound to file bytes and canonical approved identities.
export function requireEmbeddingSnapshot(batch:EmbeddingArchiveBatch,snapshot:string,mapping:string){
  if(!verified.has(batch)||batch.snapshot!==snapshot||batch.mapping!==mapping)fail('same_verified_snapshot_required')
}
// Caller owns the transaction and connection; never begins, commits or releases.
export async function archiveKbEmbeddingStateInTransaction(db:SqlClient,batch:EmbeddingArchiveBatch){
  if(!verified.has(batch))fail('verified_offline_batch_required')
    const g=(await db.query<{database:string;login:string;role:string;admin:boolean;version:number}>(
      "SELECT current_database() AS database,session_user AS login,current_user AS role,(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS admin,current_setting('server_version_num')::integer AS version")).rows[0]
    if(g?.database!=='agentstudio_stage'||g.login!=='agentstudio_admin'||g.role!=='agentstudio_admin'||g.admin!==true||!Number.isInteger(g.version)||g.version<170000||g.version>=180000)fail('pg17_stage_dba_required')
    await db.query("SET LOCAL lock_timeout='5s'")
    await db.query("SET LOCAL statement_timeout='30s'")
    const ready=await db.query<{n:string}>("SELECT count(*)::text AS n FROM agentstudio.schema_migrations WHERE version IN ('pg_v8_005','pg_v8_013')")
    if(ready.rows[0]?.n!=='2')fail('schema_version')
    await db.query('LOCK TABLE agentstudio.jobs,agentstudio.users IN SHARE ROW EXCLUSIVE MODE')
    await db.query('LOCK TABLE agentstudio.legacy_kb_embedding_snapshots,agentstudio.legacy_kb_embedding_base_refs,agentstudio.legacy_kb_embedding_state_archive IN EXCLUSIVE MODE')
    if((await db.query<{n:string}>("SELECT count(*)::text AS n FROM agentstudio.jobs WHERE status IN ('queued','leased')")).rows[0]?.n!=='0')fail('active_jobs')
    const users=new Set((await db.query<{id:string}>('SELECT id FROM agentstudio.users')).rows.map(r=>r.id))
    const mapping=JSON.parse(batch.mapping) as {records:{new_studio_user_id:string}[]}
    if(mapping.records.some(r=>!users.has(r.new_studio_user_id)))fail('owner_not_preprovisioned')
    const old=await db.query<{source_snapshot_sha256:string;inventory_sha256:string;mapping_sha256:string;approved_mapping:string}>('SELECT * FROM agentstudio.legacy_kb_embedding_snapshots')
    const replay=old.rows.length!==0
    if(replay){
      const o=old.rows[0]!
      if(old.rows.length!==1||o.source_snapshot_sha256!==batch.snapshot||o.inventory_sha256!==batch.inventory||o.mapping_sha256!==batch.mappingHash||o.approved_mapping!==batch.mapping)fail('source_or_payload_conflict')
    }else{
      await db.query('INSERT INTO agentstudio.legacy_kb_embedding_snapshots(source_snapshot_sha256,inventory_sha256,mapping_sha256,approved_mapping) VALUES($1,$2,$3,$4)',[batch.snapshot,batch.inventory,batch.mappingHash,batch.mapping])
      for(const b of batch.bases)await db.query('INSERT INTO agentstudio.legacy_kb_embedding_base_refs(source_snapshot_sha256,legacy_base_id,legacy_owner_id,owner_user_id) VALUES($1,$2,$3,$4)',[batch.snapshot,b.id,b.legacyOwner,b.owner])
      for(const r of batch.rows)await db.query('INSERT INTO agentstudio.legacy_kb_embedding_state_archive(source_snapshot_sha256,source_table,legacy_row_id,legacy_owner_id,owner_user_id,legacy_base_id,raw_payload,payload_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[batch.snapshot,r.table,r.id,r.legacyOwner,r.owner,r.base,r.raw,r.hash])
    }
    const baseResult=await db.query<{source_snapshot_sha256:string;legacy_base_id:string;legacy_owner_id:string;owner_user_id:string}>('SELECT * FROM agentstudio.legacy_kb_embedding_base_refs ORDER BY legacy_base_id COLLATE "C"')
    const persistedBases:Base[]=baseResult.rows.map(b=>{
      if(b.source_snapshot_sha256!==batch.snapshot)fail('reconciliation_source')
      return {id:b.legacy_base_id,legacyOwner:b.legacy_owner_id,owner:b.owner_user_id}
    })
    const result=await db.query<{source_snapshot_sha256:string;source_table:SourceTable;legacy_row_id:string;legacy_owner_id:string;owner_user_id:string;legacy_base_id:string|null;raw_payload:string;payload_sha256:string}>('SELECT * FROM agentstudio.legacy_kb_embedding_state_archive ORDER BY source_table COLLATE "C",legacy_owner_id COLLATE "C",legacy_base_id COLLATE "C"')
    const persisted:Row[]=result.rows.map(r=>{
      if(r.source_snapshot_sha256!==batch.snapshot||sha256(r.raw_payload)!==r.payload_sha256)fail('reconciliation_payload')
      return {table:r.source_table,id:r.legacy_row_id,legacyOwner:r.legacy_owner_id,owner:r.owner_user_id,base:r.legacy_base_id,raw:r.raw_payload,hash:r.payload_sha256}
    })
    // Source iteration settings then queue differs from lexical table order.
    const sort=(a:Row,b:Row)=>a.table===b.table?(a.id<b.id?-1:a.id>b.id?1:0):(a.table.endsWith('settings')?-1:1)
    persisted.sort(sort)
    if(inventory(persistedBases,persisted)!==batch.inventory)fail('reconciliation_inventory')
    return {stage_only:true,archive_only:true,embedding_enabled:false,jobs_created:0,production_cutover_allowed:false,imported:replay?0:batch.rows.length,replayed:replay?batch.rows.length:0}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  process.stderr.write('kb_embedding_archive_no_cli_execution\n');process.exitCode=1
}
