// W18 offline DBA-only orchestration. No CLI, connection discovery or worker.
import type {SqlPool} from './contracts.ts'
import {loadKbContentSnapshot,type ContentBatch} from './stage-kb-content-import-source.ts'
import {loadKbEmbeddingStateSnapshot,type EmbeddingArchiveBatch,archiveKbEmbeddingStateInTransaction} from './stage-kb-embedding-state-import.ts'
import {importVerifiedKbMetadataInTransaction} from './stage-knowledge-base-import.ts'
import {archiveKbContentInTransaction} from './stage-kb-content-import.ts'

export type CombinedKbBatch=Readonly<{snapshot:string}>
const verified=new WeakMap<CombinedKbBatch,{content:ContentBatch;embedding:EmbeddingArchiveBatch}>()
function fail(code:string):never{throw new Error('kb_combined_'+code)}

export function loadKbCombinedSnapshot(options:{snapshot:string;manifest:string;mapping:string}):CombinedKbBatch{
  try{
    const embedding=loadKbEmbeddingStateSnapshot(options)
    const content=loadKbContentSnapshot(options,embedding)
    if(content.snapshot!==embedding.snapshot||content.mapping!==embedding.mapping||
      content.bases.length!==embedding.bases.length||content.bases.some((b,i)=>
        b.legacy_id!==embedding.bases[i]?.id||b.owner_user_id!==embedding.bases[i]?.owner))fail('source_conflict')
    const batch=Object.freeze({snapshot:content.snapshot})
    verified.set(batch,{content,embedding})
    return batch
  }catch{ return fail('source_invalid') }
}

export async function importKbCombinedAtomic(pool:SqlPool,batch:CombinedKbBatch){
  const parts=verified.get(batch)
  if(!parts)fail('verified_offline_batch_required')
  const db=await pool.connect().catch(()=>fail('connect_failed'))
  let begun=false
  try{
    await db.query('BEGIN');begun=true
    const g=(await db.query<{database:string;login:string;role:string;admin:boolean;version:number}>(
      "SELECT current_database() AS database,session_user AS login,current_user AS role,(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS admin,current_setting('server_version_num')::integer AS version")).rows[0]
    if(g?.database!=='agentstudio_stage'||g.login!=='agentstudio_admin'||g.role!=='agentstudio_admin'||g.admin!==true||
      !Number.isInteger(g.version)||g.version<170000||g.version>=180000)fail('pg17_stage_dba_required')
    await db.query("SET LOCAL lock_timeout='5s'")
    await db.query("SET LOCAL statement_timeout='30s'")
    // Shared lock order with W2/W6, then W16. Existing participants recheck all
    // guards and acquire these same locks on this connection, without nesting.
    await db.query('LOCK TABLE agentstudio.jobs,agentstudio.legacy_knowledge_base_imports,agentstudio.knowledge_bases,agentstudio.users IN SHARE ROW EXCLUSIVE MODE')
    await db.query('LOCK TABLE agentstudio.legacy_kb_content_snapshots,agentstudio.legacy_kb_document_archive,agentstudio.legacy_kb_chunk_archive,agentstudio.legacy_kb_vector_archive IN EXCLUSIVE MODE')
    await db.query('LOCK TABLE agentstudio.legacy_kb_embedding_snapshots,agentstudio.legacy_kb_embedding_base_refs,agentstudio.legacy_kb_embedding_state_archive IN EXCLUSIVE MODE')
    const state=await db.query<{metadata:string;content:string;embedding:string}>(
      'SELECT (SELECT count(*) FROM agentstudio.legacy_knowledge_base_imports)::text AS metadata,'+
      '(SELECT count(*) FROM agentstudio.legacy_kb_content_snapshots)::text AS content,'+
      '(SELECT count(*) FROM agentstudio.legacy_kb_embedding_snapshots)::text AS embedding')
    const s=state.rows[0]
    if(!s||[Number(s.metadata)>0,Number(s.content)>0,Number(s.embedding)>0].some(v=>v!==(Number(s.metadata)>0)))fail('partial_domain_state')
    const metadata=await importVerifiedKbMetadataInTransaction(db,parts.content)
    const content=await archiveKbContentInTransaction(db,parts.content)
    const embedding=await archiveKbEmbeddingStateInTransaction(db,parts.embedding)
    await db.query('COMMIT');begun=false
    return {stage_only:true,archive_only:true,production_cutover_allowed:false,
      rag_enabled:false,embedding_enabled:false,acl_activated:false,jobs_created:0,
      metadata,content,embedding}
  }catch{
    if(begun)try{await db.query('ROLLBACK')}catch{fail('rollback_failed')}
    return fail('import_failed') // No SQL diagnostics, source bodies or connection details.
  }finally{db.release()}
}
