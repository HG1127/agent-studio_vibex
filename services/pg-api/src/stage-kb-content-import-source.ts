// Offline, allowlisted SQLite reader. Never reads credentials or activates jobs.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {isUuid} from './contracts.ts'
import {normalizeLegacyKb,type LegacyKbRow} from './stage-knowledge-base-import.ts'

export function refuse(code:string):never { throw new Error('kb_content_'+code) }
export const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex')
export const fields={
  document:['id','base_id','rh_user_id','filename','size_chars','chunk_count','created_ms'],
  chunk:['id','base_id','document_id','rh_user_id','chunk_index','text_content'],
  vector:['chunk_id','rh_user_id','base_id','document_id','connection_id','model_name','dimensions','vector_json','indexed_ms'],
} as const
export type Kind=keyof typeof fields
export const kinds:Kind[]=['document','chunk','vector']
const tables={document:'agent_studio_kb_documents',chunk:'agent_studio_kb_chunks',vector:'agent_studio_kb_vectors'}
export type ArchiveRow={kind:Kind;id:string;base:string;document:string|null;owner:string;raw:string;hash:string}
export type ContentBatch={snapshot:string;mapping:string;mappingHash:string;bases:readonly (LegacyKbRow & {has_related_data:boolean})[];rows:readonly ArchiveRow[];inventory:string}
const verified=new WeakSet<ContentBatch>()
// Remember only identities, never bodies or credentials. Even stripping a W6
// row's marker must not turn known content into an ordinary metadata-only batch.
const contentBasesBySnapshot=new Map<string,ReadonlySet<string>>()
export function isKnownContentBase(snapshot:string,legacyId:string){
  return contentBasesBySnapshot.get(snapshot)?.has(legacyId)===true
}
export function requireVerified(batch:ContentBatch){
  if(!verified.has(batch))refuse('verified_offline_batch_required')
}
const id=(x:unknown):x is string=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(x)
function file(input:string){
  const real=fs.realpathSync(input)
  const live=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../pocketbase/pb_data')
  const actual=fs.existsSync(live)?fs.realpathSync(live):live
  const norm=(s:string)=>process.platform==='win32'?s.toLowerCase():s
  if(norm(real)===norm(actual)||norm(real).startsWith(norm(actual+path.sep))||!fs.statSync(real).isFile())
    refuse('live_or_invalid_input')
  return real
}
function object(input:string):Record<string,unknown>{
  const parsed:unknown=JSON.parse(input)
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))refuse('invalid_metadata')
  return parsed as Record<string,unknown>
}
export function inventoryHash(rows:readonly ArchiveRow[]){
  return sha(JSON.stringify(rows.map(r=>[r.kind,r.id,r.base,r.document,r.owner,r.hash])))
}
export function loadKbContentSnapshot(options:{snapshot:string;manifest:string;mapping:string}):ContentBatch{
  const paths=[file(options.snapshot),file(options.manifest),file(options.mapping)]
  if(new Set(paths.map(x=>x.toLowerCase())).size!==3)refuse('input_paths_not_distinct')
  const source=paths[0]!,manifestFile=paths[1]!,mappingFile=paths[2]!
  const noSidecars=()=>{
    for(const suffix of ['-wal','-shm','-journal'])if(fs.existsSync(source+suffix))refuse('snapshot_sidecar_present')
  }
  noSidecars()
  if(fs.statSync(manifestFile).size>5_000_000||fs.statSync(mappingFile).size>5_000_000)refuse('metadata_too_large')
  const manifestText=fs.readFileSync(manifestFile,'utf8'),mappingText=fs.readFileSync(mappingFile,'utf8')
  const manifest=object(manifestText),mapping=object(mappingText)
  const sourceBytes=fs.readFileSync(source),snapshot=sha(sourceBytes)
  if(manifest.format!=='agent-studio-sqlite-snapshot-v1'||manifest.sha256!==snapshot||
    manifest.bytes!==sourceBytes.length||!manifest.tables||typeof manifest.tables!=='object'||Array.isArray(manifest.tables))
    refuse('manifest_mismatch')
  if(mapping.schema_version!=='studio-approved-identity-map-v2'||mapping.source_sha256!==snapshot||!Array.isArray(mapping.records))
    refuse('approved_mapping_required')
  const db=new DatabaseSync(source,{readOnly:true})
  const rows:ArchiveRow[]=[]
  const baseMetadata:(LegacyKbRow & {has_related_data:boolean})[]=[]
  const approved:Record<string,string>[]=[]
  try{
    db.exec('PRAGMA trusted_schema=OFF; BEGIN')
    if(Object.values(db.prepare('PRAGMA quick_check').get()||{})[0]!=='ok')refuse('sqlite_integrity')
    noSidecars()
    const names=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>String(r.name)))
    const counts=manifest.tables as Record<string,unknown>
    const required=['studio_users','agent_studio_kb_bases','model_connections',...Object.values(tables)]
    for(const table of required)if(!names.has(table)||!Object.hasOwn(counts,table))refuse('required_table_or_count_missing')
    for(const [table,n] of Object.entries(counts)){
      if(!/^[A-Za-z_][A-Za-z0-9_]{0,119}$/.test(table)||!names.has(table)||!Number.isSafeInteger(n)||
        (n as number)<0||db.prepare('SELECT count(*) AS n FROM "'+table+'"').get()?.n!==n)
        refuse('row_count_mismatch')
    }
    // These relations have no frozen archive representation yet. Do not silently
    // drop ACL, approval history, queued work or embedding configuration.
    for(const table of ['agent_studio_kb_access','agent_studio_kb_access_events',
      'agent_studio_kb_embedding_queue','agent_studio_kb_embedding_settings']){
      if(names.has(table)&&db.prepare('SELECT 1 FROM "'+table+'" LIMIT 1').get())
        refuse('unsupported_acl_or_embedding_state')
    }
    const users=new Set(db.prepare('SELECT id FROM studio_users').all().map(r=>String(r.id)))
    const owners=new Map<string,string>(),targets=new Set<string>()
    for(const unknownRecord of mapping.records){
      const r=unknownRecord as Record<string,unknown>
      if(!r||!id(r.old_id)||!users.has(r.old_id)||!isUuid(r.new_studio_user_id)||
        typeof r.verified_by!=='string'||r.verified_by.trim().length<2||typeof r.approved_at!=='string'||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(r.approved_at)||!Number.isFinite(Date.parse(r.approved_at)))
        refuse('unapproved_identity')
      const target=String(r.new_studio_user_id).toLowerCase()
      if(owners.has(r.old_id)||targets.has(target))refuse('ambiguous_identity')
      owners.set(r.old_id,target);targets.add(target)
      approved.push({old_id:r.old_id,new_studio_user_id:target,verified_by:r.verified_by,approved_at:r.approved_at})
    }
    if(owners.size!==users.size)refuse('incomplete_identity_mapping')
    approved.sort((a,b)=>a.old_id! < b.old_id! ? -1 : 1)
    const baseColumns=['id','rh_user_id','name','description','created_ms','updated_ms']
    const actualBaseColumns=db.prepare('PRAGMA table_info(agent_studio_kb_bases)').all().map(r=>String(r.name))
    if(actualBaseColumns.length!==baseColumns.length||actualBaseColumns.some(c=>!baseColumns.includes(c)))
      refuse('unknown_or_missing_base_field')
    const baseRecords=db.prepare('SELECT '+baseColumns.join(',')+' FROM agent_studio_kb_bases ORDER BY id COLLATE BINARY').all()
    if(baseRecords.length<1||baseRecords.length>3000)refuse('base_batch_size')
    const bases=new Map(baseRecords.map(r=>[r.id,r.rh_user_id]))
    // Explicit projection: api_key, URLs, model config and token fields are NEVER read.
    const connections=new Map(db.prepare('SELECT id,rh_user_id FROM model_connections').all().map(r=>[r.id,r.rh_user_id]))
    const docs=new Map<string,Record<string,unknown>>(),chunks=new Map<string,Record<string,unknown>>()
    for(const kind of kinds){
      const table=tables[kind],cols=fields[kind]
      const actual=db.prepare('PRAGMA table_info("'+table+'")').all().map(r=>String(r.name))
      if(actual.length!==cols.length||actual.some(c=>!(cols as readonly string[]).includes(c)))refuse('unknown_or_missing_source_field')
      const records=db.prepare('SELECT '+cols.join(',')+' FROM '+table+' ORDER BY '+(kind==='vector'?'chunk_id':'id')+' COLLATE BINARY').all()
      if(records.length>100000)refuse('batch_too_large')
      for(const r of records){
        const legacy=r[kind==='vector'?'chunk_id':'id'],uid=r.rh_user_id
        if(!id(legacy)||!id(r.base_id)||!id(uid)||!owners.has(uid)||bases.get(r.base_id)!==uid)refuse('base_or_owner_reference')
        for(const [key,value] of Object.entries(r)){
          if(typeof value==='string'){if(value.includes('\0'))refuse('unrepresentable_text')}
          else if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)refuse('unrepresentable_number')
          if(['filename','text_content','model_name','vector_json'].includes(key)&&typeof value!=='string')refuse('invalid_text')
        }
        for(const key of kind==='document'?['size_chars','chunk_count','created_ms']:kind==='chunk'?['chunk_index']:['dimensions','indexed_ms'])
          if(typeof r[key]!=='number')refuse('invalid_number')
        if(kind==='document')docs.set(legacy,r)
        else{
          const d=docs.get(String(r.document_id))
          if(!d||d.base_id!==r.base_id||d.rh_user_id!==uid)refuse('document_reference')
          if(kind==='chunk')chunks.set(legacy,r)
          else{
            const c=chunks.get(legacy)
            if(!c||c.base_id!==r.base_id||c.document_id!==r.document_id||c.rh_user_id!==uid)refuse('chunk_reference')
            if(connections.get(r.connection_id)!==uid)refuse('connection_reference')
            let vector:unknown
            try{vector=JSON.parse(String(r.vector_json))}catch{refuse('invalid_vector')}
            if(!Array.isArray(vector)||vector.length!==r.dimensions||vector.length===0||
              vector.some(v=>typeof v!=='number'||!Number.isFinite(v)))refuse('invalid_vector')
          }
        }
        const raw=JSON.stringify(r)
        rows.push(Object.freeze({kind,id:legacy,base:r.base_id,document:kind==='document'?null:String(r.document_id),owner:owners.get(uid)!,raw,hash:sha(raw)}))
      }
    }
    const sequences=new Map<string,Set<unknown>>()
    for(const chunk of chunks.values()){
      const docId=String(chunk.document_id),seq=sequences.get(docId)??new Set<unknown>()
      if(seq.has(chunk.chunk_index))refuse('document_chunk_count_or_sequence')
      seq.add(chunk.chunk_index);sequences.set(docId,seq)
    }
    for(const [docId,d] of docs)if((sequences.get(docId)?.size??0)!==d.chunk_count)refuse('document_chunk_count_or_sequence')
    const usedBases=new Set(rows.map(r=>r.base))
    for(const base of baseRecords){
      // Include EMPTY bases too: W2 batch completeness and atomic reconciliation
      // cover the entire same-SHA snapshot. Ordinary W2 still rejects content.
      baseMetadata.push(Object.freeze({...normalizeLegacyKb(base,owners),
        has_related_data:usedBases.has(String(base.id))}))
    }
    noSidecars()
  }finally{db.close()}
  if(sha(fs.readFileSync(source))!==snapshot||fs.readFileSync(manifestFile,'utf8')!==manifestText||
    fs.readFileSync(mappingFile,'utf8')!==mappingText)refuse('input_changed')
  noSidecars()
  const mappingPayload=JSON.stringify({schema_version:mapping.schema_version,source_sha256:snapshot,records:approved})
  const batch:ContentBatch=Object.freeze({snapshot,mapping:mappingPayload,mappingHash:sha(mappingPayload),
    bases:Object.freeze(baseMetadata),rows:Object.freeze(rows),inventory:inventoryHash(rows)})
  verified.add(batch)
  contentBasesBySnapshot.set(snapshot,new Set(batch.bases.filter(b=>b.has_related_data).map(b=>b.legacy_id)))
  return batch
}
