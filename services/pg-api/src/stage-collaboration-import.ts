// Offline archive only. Never mount on HTTP or translate these records to RBAC.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {contentHash} from './stage-agent-import.ts'
import {isUuid,type SqlPool} from './contracts.ts'

import {isApprovedStageMigrationOwner} from './stage-migration-identity.ts'
export class CollaborationImportError extends Error {}
function fail(code:string):never {throw new CollaborationImportError('collaboration_'+code)}
const schemas:Record<string,string[]>={
  agent_studio_spec_access:['spec_id','owner_uid','member_uid','role','created_ms','updated_ms'],
  agent_studio_kb_access:['base_id','owner_uid','recipient_uid','role','created_ms','updated_ms','semantic_allowed'],
  agent_studio_spec_proposals:['id','spec_id','owner_uid','author_uid','base_hash','proposed_spec_json','comment','status','created_ms','reviewed_ms','reviewer_uid'],
  agent_studio_kb_access_events:['id','base_id','owner_uid','recipient_uid','action','role','occurred_ms'],
  agent_studio_spec_collab_audit:['id','spec_id','owner_uid','actor_uid','member_uid','proposal_id','action','occurred_ms'],
  agent_studio_spec_revisions:['id','spec_id','owner_uid','actor_uid','kind','proposal_id','source_revision_id','spec_hash','safe_spec_json','note','occurred_ms'],
}
type Row={source_table:string;legacy_key:string;legacy_resource_id:string;resource_kind:string;
  owner_user_id:string;identities:Record<string,string>;source_record:Record<string,unknown>;
  review_reasons:string[];payload_sha256:string}
export type CollaborationImportPlan={source_snapshot_sha256:string;mapping_sha256:string;rows:Row[]}
const issued=new WeakMap<CollaborationImportPlan,string>()
const digest=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')

export function prepareCollaborationImport(snapshotPath:string,manifestPath:string,mappingPath:string){
  try {return readVerifiedCollaborationSnapshot(snapshotPath,manifestPath,mappingPath)}
  catch(e){if(e instanceof CollaborationImportError)throw e;fail('offline_preflight_failed')}
}
function readVerifiedCollaborationSnapshot(snapshotPath:string,manifestPath:string,mappingPath:string){
  const files=[snapshotPath,manifestPath,mappingPath].map(p=>fs.realpathSync(path.resolve(p)))
  const livePath=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../pocketbase/pb_data')
  const live=(fs.existsSync(livePath)?fs.realpathSync(livePath):livePath).toLowerCase()
  if(new Set(files.map(p=>p.toLowerCase())).size!==3)fail('duplicate_paths')
  for(const f of files)if(!fs.statSync(f).isFile()||f.toLowerCase().startsWith(live+path.sep)||f.toLowerCase()===live)fail('live_source_forbidden')
  const [snapshot,manifest,mapping]=files as [string,string,string]
  if(['-wal','-shm','-journal'].some(s=>fs.existsSync(snapshot+s)))fail('sqlite_sidecar_forbidden')
  if(files.slice(1).some(f=>fs.statSync(f).size>5_000_000))fail('metadata_too_large')
  const hashes=files.map(digest),info=JSON.parse(fs.readFileSync(manifest,'utf8'))
  if(info.format!=='agent-studio-sqlite-snapshot-v1'||info.sha256!==hashes[0]||
    info.bytes!==fs.statSync(snapshot).size||!info.tables||typeof info.tables!=='object'||Array.isArray(info.tables))fail('manifest_invalid')
  const identity=JSON.parse(fs.readFileSync(mapping,'utf8'))
  if(identity.schema_version!=='studio-approved-identity-map-v2'||identity.source_sha256!==info.sha256||!Array.isArray(identity.records))fail('mapping_snapshot_mismatch')
  const db=new DatabaseSync(snapshot,{readOnly:true})
  try {
    if(Object.values(db.prepare('PRAGMA quick_check').get()??{})[0]!=='ok')fail('sqlite_integrity_failed')
    const required=['studio_users','agent_specs','agent_studio_kb_bases',...Object.keys(schemas)]
    if(required.some(t=>!Object.hasOwn(info.tables,t)))fail('manifest_missing_table')
    // Future collaboration tables must be explicitly supported, even if empty.
    for(const r of db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all())
      if(/^agent_studio_(spec_|kb_access)/.test(String(r.name))&&!Object.hasOwn(schemas,String(r.name)))fail('unsupported_history_table')
    for(const [t,n] of Object.entries(info.tables)){
      if(!/^[A-Za-z_][A-Za-z0-9_]{0,120}$/.test(t)||!Number.isSafeInteger(n)||Number(n)<0)fail('manifest_invalid_count')
      if(db.prepare('SELECT count(*) AS n FROM "'+t+'"').get()?.n!==n)fail('manifest_count_mismatch')
    }
    if(Object.keys(schemas).reduce((n,t)=>n+Number(info.tables[t]),0)>20000)fail('batch_too_large')
    const sourceUsers=db.prepare('SELECT id FROM studio_users').all()
    const users=new Set(sourceUsers.map(r=>String(r.id)))
    if(users.size!==sourceUsers.length||[...users].some(id=>!/^[A-Za-z0-9]{15}$/.test(id)))fail('source_users_invalid')
    const owners=new Map<string,string>(),targets=new Set<string>()
    for(const r of identity.records){
      if(!r||typeof r.old_id!=='string'||!/^[A-Za-z0-9]{15}$/.test(r.old_id)||!users.has(r.old_id)||!isUuid(r.new_studio_user_id)||
        typeof r.verified_by!=='string'||r.verified_by.trim().length<2||r.verified_by.length>120||
        typeof r.approved_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(r.approved_at)||!Number.isFinite(Date.parse(r.approved_at)))fail('mapping_unapproved')
      const target=r.new_studio_user_id.toLowerCase()
      if(owners.has(r.old_id)||targets.has(target))fail('mapping_collision')
      owners.set(r.old_id,target);targets.add(target)
    }
    if(!users.size||owners.size!==users.size)fail('mapping_incomplete')
    const resources=new Map<string,string>()
    for(const [t,kind] of [['agent_specs','agent'],['agent_studio_kb_bases','kb']]){
      for(const r of db.prepare('SELECT id,rh_user_id FROM "'+t+'"').all()){
        const key=kind+':'+String(r.id)
        if(resources.has(key))fail('duplicate_resource')
        resources.set(key,String(r.rh_user_id))
      }
    }
    const rows:Row[]=[],seen=new Set<string>()
    for(const [table,columns] of Object.entries(schemas)){
      const found=db.prepare('PRAGMA table_info("'+table+'")').all().map(r=>String(r.name))
      // Pre-semantic-consent KB schemas are allowed, with absence preserved.
      const requiredColumns=columns.filter(c=>c!=='semantic_allowed')
      if(found.some(c=>!columns.includes(c))||requiredColumns.some(c=>!found.includes(c)))fail('source_schema_unsupported')
      for(const raw of db.prepare('SELECT * FROM "'+table+'"').all()){
        for(const [c,value] of Object.entries(raw)){
          const numeric=c.endsWith('_ms')||c==='semantic_allowed'
          if(numeric?(typeof value!=='number'||!Number.isSafeInteger(value)):
            (typeof value!=='string'||value.includes('\0')))fail('source_value_unsupported')
        }
        const identities:Record<string,string>={}
        for(const c of columns.filter(c=>c.endsWith('_uid'))){
          const value=raw[c]
          if(value===''&&['reviewer_uid','member_uid'].includes(c)&&table!=='agent_studio_spec_access')continue
          if(typeof value!=='string'||!owners.has(value))fail('identity_not_mapped')
          identities[c]=owners.get(value)!
        }
        const kind=Object.hasOwn(raw,'spec_id')?'agent':'kb',resource=String(raw.spec_id??raw.base_id)
        if(resources.get(kind+':'+resource)!==raw.owner_uid)fail('source_resource_owner_mismatch')
        const legacy_key=contentHash(Object.hasOwn(raw,'id')?[raw.id]:[resource,raw.member_uid??raw.recipient_uid])
        const key=table+':'+legacy_key
        if(seen.has(key))fail('duplicate_source_key');seen.add(key)
        // All legacy semantics require a separate human RBAC design/review.
        const review_reasons=['legacy_permissions_disabled','manual_rbac_review_required']
        if(Object.hasOwn(raw,'role'))review_reasons.push('archived_role_requires_review')
        if(Object.hasOwn(raw,'semantic_allowed'))review_reasons.push('semantic_consent_not_activated')
        if(Object.hasOwn(raw,'proposal_id')||Object.hasOwn(raw,'source_revision_id'))review_reasons.push('historical_links_require_review')
        const value={source_table:table,legacy_key,legacy_resource_id:resource,resource_kind:kind,
          owner_user_id:identities.owner_uid!,identities,source_record:{...raw},review_reasons}
        rows.push({...value,payload_sha256:contentHash(value)})
        if(rows.length>20000)fail('batch_too_large')
      }
    }
    if(files.some((f,i)=>digest(f)!==hashes[i]))fail('source_changed')
    const plan={source_snapshot_sha256:info.sha256 as string,mapping_sha256:hashes[2]!,rows}
    issued.set(plan,contentHash(plan));return plan
  } finally {db.close()}
}

export async function importLegacyCollaborationsToStage(pool:SqlPool,plan:CollaborationImportPlan){
  if(!issued.has(plan)||issued.get(plan)!==contentHash(plan))fail('unverified_or_mutated_plan')
  const {rows,source_snapshot_sha256:source,mapping_sha256:mapping}=structuredClone(plan)
  const db=await pool.connect();let begun=false
  try {
    await db.query('BEGIN');begun=true
    await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='30s'")
    const guard=(await db.query<{database:string;login:string;admin:boolean;version:number}>(
      "SELECT current_database() AS database,session_user AS login,(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS admin,current_setting('server_version_num')::integer AS version")).rows[0]
    if(!guard||guard.database!=='agentstudio_stage'||guard.login!=='agentstudio_admin'||guard.admin!==true||!Number.isInteger(guard.version)||guard.version<170000||guard.version>=180000)fail('refuse_nonisolated_database')
    await db.query('LOCK TABLE agentstudio.legacy_collaboration_imports,agentstudio.legacy_agent_imports,agentstudio.legacy_knowledge_base_imports,agentstudio.agent_specs,agentstudio.knowledge_bases,agentstudio.users IN EXCLUSIVE MODE')
    if((await db.query("SELECT version FROM agentstudio.schema_migrations WHERE version='pg_v8_009'")).rows.length!==1)fail('missing_import_schema')
    if((await db.query('SELECT 1 FROM agentstudio.legacy_collaboration_imports WHERE source_snapshot_sha256<>$1 OR mapping_sha256<>$2 UNION ALL SELECT 1 FROM agentstudio.legacy_agent_imports WHERE source_snapshot_sha256<>$1 UNION ALL SELECT 1 FROM agentstudio.legacy_knowledge_base_imports WHERE source_snapshot_sha256<>$1',[source,mapping])).rows.length)fail('snapshot_or_mapping_conflict')
    let imported=0,replayed=0
    for(const row of rows){
      for(const uuid of new Set(Object.values(row.identities)))
        if(!await isApprovedStageMigrationOwner(db,uuid,source))
          fail('identity_missing_or_disabled')
      const agent=row.resource_kind==='agent',cross=agent?'legacy_agent_imports':'legacy_knowledge_base_imports',table=agent?'agent_specs':'knowledge_bases',legacy=agent?'legacy_spec_id':'legacy_base_id',target=agent?'target_spec_id':'target_base_id'
      const resource=(await db.query<{id:string;owner_user_id:string;name:string;spec:unknown;description:string;created_at:string|Date;updated_at:string|Date;payload_sha256:string}>(`SELECT t.*,m.payload_sha256 FROM agentstudio.${cross} m JOIN agentstudio.${table} t ON t.id=m.${target} AND t.owner_user_id=m.owner_user_id WHERE m.${legacy}=$1 AND m.owner_user_id=$2::uuid AND m.source_snapshot_sha256=$3 AND t.visibility='private' AND t.team_id IS NULL`,[row.legacy_resource_id,row.owner_user_id,source])).rows[0]
      if(!resource)fail('resource_crosswalk_missing_or_owner_mismatch')
      const resourcePayload={legacy_id:row.legacy_resource_id,owner_user_id:resource.owner_user_id,name:resource.name,
        ...(agent?{spec:resource.spec}:{description:resource.description}),created_at:new Date(resource.created_at).toISOString(),updated_at:new Date(resource.updated_at).toISOString()}
      if(contentHash(resourcePayload)!==resource.payload_sha256)fail('resource_crosswalk_payload_mismatch')
      const archive={...row,resource_payload_sha256:resource.payload_sha256,target_spec_id:agent?resource.id:null,target_base_id:agent?null:resource.id,source_snapshot_sha256:source,mapping_sha256:mapping,permissions_enabled:false,review_status:'pending_manual_review'}
      const storedHash=contentHash(archive)
      const prior=(await db.query<{archive:unknown;archive_sha256:string}>('SELECT archive,archive_sha256 FROM agentstudio.legacy_collaboration_imports WHERE source_table=$1 AND legacy_key=$2',[row.source_table,row.legacy_key])).rows[0]
      if(prior){if(prior.archive_sha256!==storedHash||contentHash(prior.archive)!==storedHash)fail('existing_mismatch');replayed++}
      else {
        await db.query('INSERT INTO agentstudio.legacy_collaboration_imports(source_table,legacy_key,source_snapshot_sha256,mapping_sha256,owner_user_id,target_spec_id,target_base_id,archive,archive_sha256) VALUES($1,$2,$3,$4,$5::uuid,$6::uuid,$7::uuid,$8::jsonb,$9)',[row.source_table,row.legacy_key,source,mapping,row.owner_user_id,archive.target_spec_id,archive.target_base_id,JSON.stringify(archive),storedHash]);imported++
      }
      const check=(await db.query<{archive:unknown;archive_sha256:string;owner_user_id:string;target_spec_id:string|null;target_base_id:string|null;source_snapshot_sha256:string;mapping_sha256:string;permissions_enabled:boolean;review_status:string}>('SELECT * FROM agentstudio.legacy_collaboration_imports WHERE source_table=$1 AND legacy_key=$2',[row.source_table,row.legacy_key])).rows[0]
      if(!check||check.archive_sha256!==storedHash||contentHash(check.archive)!==storedHash||check.owner_user_id!==row.owner_user_id||check.target_spec_id!==archive.target_spec_id||check.target_base_id!==archive.target_base_id||check.source_snapshot_sha256!==source||check.mapping_sha256!==mapping||check.permissions_enabled!==false||check.review_status!=='pending_manual_review')fail('reconciliation_mismatch')
    }
    if((await db.query<{n:number}>('SELECT count(*)::int AS n FROM agentstudio.legacy_collaboration_imports')).rows[0]?.n!==rows.length)fail('batch_incomplete')
    await db.query('COMMIT');begun=false
    return {stage_only:true,imported,replayed,reconciled:rows.length,permissions_enabled:false,production_cutover_allowed:false}
  }catch(e){if(begun)await db.query('ROLLBACK').catch(()=>undefined);if(e instanceof CollaborationImportError)throw e;fail('import_sql_failed')}
  finally {db.release()}
}
