// No network transport/CLI: integration supplies an explicitly approved local stage pool.
import type {SqlPool,SqlClient} from './contracts.ts'
import {requireVerified,refuse,sha,inventoryHash,kinds,type ContentBatch,type ArchiveRow} from './stage-kb-content-import-source.ts'
export {loadKbContentSnapshot} from './stage-kb-content-import-source.ts'
const archive={document:'legacy_kb_document_archive',chunk:'legacy_kb_chunk_archive',vector:'legacy_kb_vector_archive'}
export async function importKbContentArchive(pool:SqlPool,batch:ContentBatch){
  requireVerified(batch)
  const db=await pool.connect()
  let begun=false
  try{
    await db.query('BEGIN');begun=true
    const result=await archiveKbContentInTransaction(db,batch)
    await db.query('COMMIT');begun=false
    return result
  }catch(error){
    if(begun){
      try{await db.query('ROLLBACK')}catch{refuse('rollback_failed')}
    }
    // SQL diagnostics can contain source content. Never surface them.
    if(error instanceof Error&&/^kb_content_[a-zA-Z0-9_]+$/.test(error.message))throw error
    return refuse('sql_failed')
  }finally{db.release()}
}

// Transaction participant shared by the atomic W2/W6 entry point. The caller
// owns BEGIN/COMMIT/ROLLBACK and the connection; this helper never ends it.
export async function archiveKbContentInTransaction(db:SqlClient,batch:ContentBatch){
    requireVerified(batch)
    const guard=await db.query<{database:string;login:string;role:string;admin:boolean;version:number}>(
      "SELECT current_database() AS database,session_user AS login,current_user AS role,"+
      "(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS admin,current_setting('server_version_num')::integer AS version")
    const g=guard.rows[0]
    if(g?.database!=='agentstudio_stage'||g.login!=='agentstudio_admin'||g.role!=='agentstudio_admin'||g.admin!==true||
      !(g.version>=170000&&g.version<180000))refuse('refuse_nonisolated_pg17_admin')
    // Local deterministic timeout; locks serialize snapshots and freeze prerequisites during verification.
    await db.query("SET LOCAL lock_timeout='5s'")
    await db.query("SET LOCAL statement_timeout='30s'")
    const ready=await db.query<{n:string}>("SELECT count(*)::text AS n FROM agentstudio.schema_migrations WHERE version IN ('pg_v8_007','pg_v8_010')")
    if(ready.rows[0]?.n!=='2')refuse('missing_archive_migration')
    await db.query('LOCK TABLE agentstudio.jobs,agentstudio.legacy_knowledge_base_imports,agentstudio.knowledge_bases,agentstudio.users IN SHARE ROW EXCLUSIVE MODE')
    await db.query('LOCK TABLE agentstudio.legacy_kb_content_snapshots,agentstudio.legacy_kb_document_archive,agentstudio.legacy_kb_chunk_archive,agentstudio.legacy_kb_vector_archive IN EXCLUSIVE MODE')
    const jobs=await db.query<{n:string}>("SELECT count(*)::text AS n FROM agentstudio.jobs WHERE status IN ('queued','leased')")
    if(jobs.rows[0]?.n!=='0')refuse('active_jobs')
    const foreign=await db.query<{n:string}>("SELECT count(*)::text AS n FROM agentstudio.legacy_knowledge_base_imports WHERE source_snapshot_sha256<>$1",[batch.snapshot])
    if(foreign.rows[0]?.n!=='0')refuse('different_W2_snapshot')
    const cross=await db.query<{legacy_base_id:string;owner_user_id:string;target_base_id:string;payload_sha256:string;name:string;description:string;visibility:string;team_id:string|null;created_ms:string;updated_ms:string}>(
      'SELECT m.legacy_base_id,m.owner_user_id,m.target_base_id,m.payload_sha256,b.name,b.description,b.visibility,b.team_id,'+
      '(extract(epoch FROM b.created_at)*1000)::bigint::text AS created_ms,'+
      '(extract(epoch FROM b.updated_at)*1000)::bigint::text AS updated_ms FROM agentstudio.legacy_knowledge_base_imports m '+
      'JOIN agentstudio.knowledge_bases b ON b.id=m.target_base_id AND b.owner_user_id=m.owner_user_id WHERE m.source_snapshot_sha256=$1',[batch.snapshot])
    const bases=new Map(cross.rows.map(r=>[r.legacy_base_id,r]))
    for(const row of batch.rows)if(bases.get(row.base)?.owner_user_id!==row.owner)refuse('missing_or_cross_tenant_W2_reference')
    for(const expected of batch.bases){
      const actual=bases.get(expected.legacy_id)
      if(actual?.payload_sha256!==expected.payload_sha256||actual.name!==expected.name||actual.description!==expected.description||
        actual.owner_user_id!==expected.owner_user_id||actual.visibility!=='private'||actual.team_id!==null||
        Number(actual.created_ms)!==Date.parse(expected.created_at)||Number(actual.updated_ms)!==Date.parse(expected.updated_at))
        refuse('W2_metadata_drift')
    }
    const old=await db.query<{source_snapshot_sha256:string;inventory_sha256:string;mapping_sha256:string;approved_mapping:string;document_count:string;chunk_count:string;vector_count:string}>(
      'SELECT * FROM agentstudio.legacy_kb_content_snapshots')
    const counts=kinds.map(k=>batch.rows.filter(r=>r.kind===k).length)
    let replay=false
    if(old.rows.length){
      const o=old.rows[0]!
      if(old.rows.length!==1||o.source_snapshot_sha256!==batch.snapshot||o.inventory_sha256!==batch.inventory||
        o.mapping_sha256!==batch.mappingHash||o.approved_mapping!==batch.mapping||
        [o.document_count,o.chunk_count,o.vector_count].some((n,i)=>Number(n)!==counts[i]))refuse('snapshot_or_payload_conflict')
      replay=true
    }else{
      await db.query('INSERT INTO agentstudio.legacy_kb_content_snapshots '+
        '(source_snapshot_sha256,inventory_sha256,mapping_sha256,approved_mapping,document_count,chunk_count,vector_count) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [batch.snapshot,batch.inventory,batch.mappingHash,batch.mapping,...counts])
      for(const r of batch.rows){
        const columns=r.kind==='document'?'':',legacy_document_id'
        const values:unknown[]=[batch.snapshot,r.id,r.base,r.owner,bases.get(r.base)!.target_base_id,r.raw,r.hash]
        if(r.kind!=='document')values.push(r.document)
        await db.query('INSERT INTO agentstudio.'+archive[r.kind]+
          '(source_snapshot_sha256,legacy_id,legacy_base_id,owner_user_id,target_base_id,raw_payload,payload_sha256'+columns+
          ') VALUES('+values.map((_,i)=>'$'+(i+1)).join(',')+')',values)
      }
    }
    const persisted:ArchiveRow[]=[]
    for(const kind of kinds){
      const result=await db.query<{source_snapshot_sha256:string;legacy_id:string;legacy_base_id:string;legacy_document_id?:string;owner_user_id:string;target_base_id:string;raw_payload:string;payload_sha256:string}>(
        'SELECT * FROM agentstudio.'+archive[kind]+' ORDER BY legacy_id COLLATE "C"')
      if(result.rows.length!==counts[kinds.indexOf(kind)])refuse('reconciliation_count')
      for(const r of result.rows){
        if(r.source_snapshot_sha256!==batch.snapshot||sha(r.raw_payload)!==r.payload_sha256||
          r.target_base_id!==bases.get(r.legacy_base_id)?.target_base_id)refuse('reconciliation_payload')
        persisted.push({kind,id:r.legacy_id,base:r.legacy_base_id,document:r.legacy_document_id??null,owner:r.owner_user_id,raw:r.raw_payload,hash:r.payload_sha256})
      }
    }
    if(inventoryHash(persisted)!==batch.inventory)refuse('reconciliation_inventory')
    return {stage_only:true,archive_only:true,rag_enabled:false,production_cutover_allowed:false,
      imported:replay?0:batch.rows.length,replayed:replay?batch.rows.length:0,reconciled:batch.rows.length}
}
