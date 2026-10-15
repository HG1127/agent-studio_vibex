// W9/W11: deliberately disconnected from HTTP, workers and connection configuration.
import fs from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {createHash} from 'node:crypto'
import {contentHash, normalizeLegacyAgent} from './stage-agent-import.ts'
import {normalizeLegacyWorkflow} from './stage-workflow-import.ts'
import {normalizeLegacyKb} from './stage-knowledge-base-import.ts'
import {prepareDisabledUserProvision} from './stage-user-import.ts'
import type {SqlPool, SqlClient} from './contracts.ts'

type Row = Record<string, unknown>
type Domain = {source:string; target:string; version:string; archive?:boolean; filter?:string}
const domains:readonly Domain[] = [
  {source:'studio_users',target:'legacy_user_imports',version:'pg_v8_011'},
  {source:'agent_specs',target:'legacy_agent_imports',version:'pg_v8_005'},
  {source:'workflows',target:'legacy_workflow_imports',version:'pg_v8_006'},
  {source:'agent_studio_kb_bases',target:'legacy_knowledge_base_imports',version:'pg_v8_007'},
  {source:'agent_studio_kb_documents',target:'legacy_kb_document_archive',version:'pg_v8_010',archive:true},
  {source:'agent_studio_kb_chunks',target:'legacy_kb_chunk_archive',version:'pg_v8_010',archive:true},
  {source:'agent_studio_kb_vectors',target:'legacy_kb_vector_archive',version:'pg_v8_010',archive:true},
  {source:'agent_studio_schedules',target:'legacy_schedule_imports',version:'pg_v8_008'},
  ...['agent_studio_spec_access','agent_studio_kb_access','agent_studio_spec_proposals',
    'agent_studio_kb_access_events','agent_studio_spec_collab_audit','agent_studio_spec_revisions']
    .map(source=>({source,target:'legacy_collaboration_imports',version:'pg_v8_009',archive:true,filter:source})),
  {source:'agent_runs',target:'legacy_run_history',version:'pg_v8_012',archive:true},
]
const targetFields:Record<string,string[]>={
  legacy_user_imports:['legacy_user_id','target_user_id','reviewed_mapping_sha256','reviewed_idp_sha256','identity_row_sha256','active_automatically'],
  legacy_agent_imports:['legacy_spec_id','owner_user_id','target_spec_id','payload_sha256'],
  legacy_workflow_imports:['legacy_workflow_id','owner_user_id','target_workflow_id','payload_sha256','source_record','execution_enabled'],
  legacy_knowledge_base_imports:['legacy_base_id','owner_user_id','target_base_id','payload_sha256'],
  legacy_schedule_imports:['legacy_schedule_id','owner_user_id','target_schedule_id','payload_sha256','projection_sha256','identity_mapping_sha256','source_record','quarantine_only','execution_enabled'],
  legacy_collaboration_imports:['legacy_key','mapping_sha256','owner_user_id','target_spec_id','target_base_id','permissions_enabled','review_status','archive','archive_sha256'],
  legacy_run_history:['legacy_id','source_table','owner_user_id','identity_mapping_sha256','manifest_sha256','source_record','payload_sha256','evidence_status','executable'],
}
for(const name of ['legacy_kb_document_archive','legacy_kb_chunk_archive','legacy_kb_vector_archive'])
  targetFields[name]=['legacy_id','legacy_base_id','owner_user_id','target_base_id','raw_payload','payload_sha256',
    ...(name==='legacy_kb_document_archive'?[]:['legacy_document_id'])]
export type ReconciliationResult = {
  domain:string; source_count:number|null; target_count:number|null;
  blockers:string[]; association_anomalies:number; status:'success'|'failed'|'unsupported'
}
export type ReconciliationInput = {
  snapshot:string; manifest:string; mapping:string;
  // Optional reviewed OIDC evidence from W7. Without it identity fidelity is
  // unsupported, never inferred from a crosswalk's self-reported hash.
  reviewed_idp?:string;
  // This is operator approval evidence, not an authentication credential.
  approval:{source_sha256:string; approved_by:string; approved_at:string}
}
const hex=/^[a-f0-9]{64}$/
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
class Refused extends Error {}
function refuse(code:string):never {throw new Refused(code)}
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex')
function fileHash(filename:string){
  const fd=fs.openSync(filename,'r'),digest=createHash('sha256'),buffer=Buffer.alloc(1024*1024)
  try{let n:number;while((n=fs.readSync(fd,buffer))>0)digest.update(buffer.subarray(0,n))}
  finally{fs.closeSync(fd)}
  return digest.digest('hex')
}
function approved(by:unknown,at:unknown){
  return typeof by==='string' && by.trim().length>=2 && by.length<=120 &&
    typeof at==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(at) &&
    Number.isFinite(Date.parse(at))
}
function file(name:string){
  const real=fs.realpathSync(name)
  // Refuse all PocketBase data directories, including a symlink into one.
  if(real.split(/[\\/]/).some(part=>part.toLowerCase()==='pb_data'))refuse('live_source_forbidden')
  if(!fs.statSync(real).isFile())refuse('invalid_offline_file')
  return real
}
function load(input:ReconciliationInput){
  const files=[input.snapshot,input.manifest,input.mapping,...(input.reviewed_idp===undefined?[]:[input.reviewed_idp])].map(file)
  if(new Set(files.map(x=>x.toLowerCase())).size!==files.length)refuse('duplicate_input')
  const snapshot=files[0]!,manifest=files[1]!,mapping=files[2]!
  if(['-wal','-shm','-journal'].some(s=>fs.existsSync(snapshot+s)))refuse('snapshot_not_frozen')
  if(files.slice(1).some(p=>fs.statSync(p).size>5_000_000))refuse('metadata_limit_exceeded')
  const metadata=files.slice(1).map(p=>fs.readFileSync(p))
  const digests=[fileHash(snapshot),...metadata.map(hash)]
  const info=JSON.parse(metadata[0]!.toString()) as Row
  const map=JSON.parse(metadata[1]!.toString()) as Row
  if(info.format!=='agent-studio-sqlite-snapshot-v1' || info.sha256!==digests[0] ||
    info.bytes!==fs.statSync(snapshot).size || !hex.test(String(info.sha256)) ||
    !info.tables || typeof info.tables!=='object' || Array.isArray(info.tables))refuse('invalid_manifest')
  if(!input.approval || input.approval.source_sha256!==info.sha256 ||
    !approved(input.approval.approved_by,input.approval.approved_at))refuse('snapshot_not_approved')
  if(map.schema_version!=='studio-approved-identity-map-v2' || map.source_sha256!==info.sha256 ||
    !Array.isArray(map.records))refuse('identity_not_approved')
  const owners=new Map<string,string>(),targets=new Set<string>()
  for(const value of map.records){
    const r=value as Row
    if(!r || typeof r.old_id!=='string' || !/^[A-Za-z0-9_-]{1,120}$/.test(r.old_id) ||
      typeof r.new_studio_user_id!=='string' || !uuid.test(r.new_studio_user_id) ||
      !approved(r.verified_by,r.approved_at))refuse('identity_not_approved')
    const dest=r.new_studio_user_id.toLowerCase()
    if(owners.has(r.old_id)||targets.has(dest))refuse('identity_collision')
    owners.set(r.old_id,dest); targets.add(dest)
  }
  const db=new DatabaseSync(snapshot,{readOnly:true})
  const tables=new Map<string,{columns:string[]; rows:Row[]; count:number}>()
  try{
    if(Object.values(db.prepare('PRAGMA quick_check').get()??{})[0]!=='ok')refuse('sqlite_integrity_failed')
    const names=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>String(r.name)))
    for(const [name,n] of Object.entries(info.tables as Row)){
      if(!/^[A-Za-z_][A-Za-z0-9_]{0,120}$/.test(name)||!names.has(name)||
        !Number.isSafeInteger(n)||Number(n)<0)refuse('manifest_count_invalid')
      if(Number(db.prepare(`SELECT count(*) AS n FROM "${name}"`).get()?.n)!==n)refuse('manifest_count_mismatch')
    }
    for(const d of domains){
      if(!names.has(d.source))continue
      if(!Object.hasOwn(info.tables,d.source))refuse('manifest_table_missing')
      const count=Number(db.prepare(`SELECT count(*) AS n FROM "${d.source}"`).get()?.n)
      if(!Number.isSafeInteger(count)||count>100000)refuse('source_limit_exceeded')
      const columns=db.prepare(`PRAGMA table_info("${d.source}")`).all().map(r=>String(r.name))
      // Only supported configuration domains are loaded. Employee credentials,
      // unsupported document content, schedules and history stay unread.
      const rows=['agent_specs','workflows','agent_studio_kb_bases'].includes(d.source)?
        db.prepare(`SELECT * FROM "${d.source}"`).all() as Row[]:
        d.source==='studio_users'&&columns.includes('id')?db.prepare('SELECT id FROM studio_users').all() as Row[]:[]
      tables.set(d.source,{columns,rows,count})
    }
    const users=tables.get('studio_users')
    if(!users?.columns.includes('id') || users.rows.length!==owners.size ||
      users.rows.some(r=>typeof r.id!=='string'||!owners.has(r.id)) ||
      new Set(users.rows.map(r=>r.id)).size!==owners.size)refuse('identity_incomplete')
  }finally{db.close()}
  const verify=()=>{
    if(files.some((p,i)=>fileHash(p)!==digests[i]) ||
      ['-wal','-shm','-journal'].some(s=>fs.existsSync(snapshot+s)))refuse('input_changed')
  }
  // Reuse W7's exact issuer/subject/reviewer normalization and row SHA256.
  // This prepares evidence only; never invoke the provisioning/write function.
  let identityPlan:ReturnType<typeof prepareDisabledUserProvision>|undefined
  if(input.reviewed_idp!==undefined){
    try{identityPlan=prepareDisabledUserProvision(snapshot,manifest,mapping,files[3]!)}
    catch{refuse('identity_evidence_invalid')}
  }
  verify()
  return {sha:String(info.sha256),mappingSha:digests[2]!,tables,owners,verify,identityPlan}
}
function result(domain:string):ReconciliationResult {
  return {domain,source_count:null,target_count:null,blockers:[],association_anomalies:0,status:'failed'}
}
async function read(db:SqlClient,table:string):Promise<Row[]>{
  // Callers use only compile-time table names from this module.
  return (await db.query<Row>(`SELECT * FROM agentstudio.${table}`)).rows
}
function sameDate(value:unknown){return value instanceof Date?value.toISOString():new Date(String(value)).toISOString()}


// Offline planning does not create or receive any PostgreSQL connection.
// The output is deliberately limited to domain counts and fixed status codes.
export function planOfflineReconciliation(input:ReconciliationInput):{
  state:'source_verified'|'source_blocked';
  source_sha256:string|null;
  domains:{domain:string;source_count:number|null}[];
  blockers:string[];
  complete_source_coverage:false;
  production_cutover_allowed:false;
} {
  try{
    const snapshot=load(input)
    snapshot.verify()
    return {
      state:'source_verified',
      source_sha256:snapshot.sha,
      domains:domains.map(d=>({
        domain:d.source,
        source_count:snapshot.tables.get(d.source)?.count??null,
      })),
      blockers:['target_reconciliation_not_run','unmapped_source_domains_not_verified'],
      complete_source_coverage:false,
      production_cutover_allowed:false,
    }
  }catch(error){
    return {
      state:'source_blocked',
      source_sha256:null,
      domains:[],
      blockers:[error instanceof Refused?error.message:'offline_preflight_failed'],
      complete_source_coverage:false,
      production_cutover_allowed:false,
    }
  }
}
/** No socket creation, URLs, env credentials, CLI or logger. Dedicated offline
 * operator harness supplies one isolated connection. Never use an API pool. */
export async function reconcileStage(input:ReconciliationInput,pool:SqlPool):Promise<ReconciliationResult[]> {
  const fatal=result('preflight')
  let db:SqlClient|undefined, begun=false
  try{
    const source=load(input) // validate before acquiring any PG connection
    db=await pool.connect()
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); begun=true
    const g=(await db.query<Row>("SELECT current_database() AS database, session_user AS login, current_user AS role, "+
      "current_setting('server_version_num')::integer AS version, current_setting('transaction_read_only') AS readonly, "+
      "(SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=session_user) AS admin")).rows[0]
    if(!g||g.database!=='agentstudio_stage'||g.login!=='agentstudio_admin'||g.role!==g.login||
      g.admin!==true||!Number.isSafeInteger(Number(g.version))||Number(g.version)<170000||Number(g.version)>=180000||g.readonly!=='on')refuse('unsafe_target')
    const versions=new Set((await read(db,'schema_migrations')).map(r=>r.version))
    const columns=(await db.query<{table_name:string;column_name:string}>(
      "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='agentstudio'")).rows
    const has=(table:string,cols:string[])=>cols.every(c=>columns.some(r=>r.table_name===table&&r.column_name===c))
    if(!has('jobs',['status']))refuse('jobs_schema_missing')
    const jobs=(await db.query<{n:string}>("SELECT count(*)::text AS n FROM agentstudio.jobs WHERE status IN ('queued','leased')")).rows[0]
    if(!jobs||Number(jobs.n)!==0)refuse('active_jobs')
    const output:ReconciliationResult[]=[]
    let identities:Row[]=[]
    if(has('legacy_user_imports',['legacy_user_id','target_user_id','source_snapshot_sha256','reviewed_mapping_sha256','reviewed_idp_sha256','active_automatically']))
      identities=await read(db,'legacy_user_imports')
    const identityFields=['id','status','external_issuer','external_subject','display_name']
    const users=has('users',['id','status'])?(await db.query<Row>(
      `SELECT ${identityFields.filter(c=>has('users',[c])).join(',')} FROM agentstudio.users`)).rows:[]
    const verifiedIdentities=new Set<string>()
    if(source.identityPlan && has('users',identityFields) && has('legacy_user_imports',targetFields.legacy_user_imports!)){
      for(const expected of source.identityPlan.rows){
        const matches=identities.filter(r=>r.legacy_user_id===expected.legacy_id)
        const targets=users.filter(r=>r.id===expected.target_user_id)
        const m=matches[0],u=targets[0]
        if(matches.length!==1||targets.length!==1||!m||!u)continue
        const actual=contentHash({legacy_id:expected.legacy_id,target_user_id:u.id,
          issuer:u.external_issuer,subject:u.external_subject,
          reviewed_by:expected.reviewed_by,reviewed_at:expected.reviewed_at})
        if(m.target_user_id===expected.target_user_id && m.source_snapshot_sha256===source.sha &&
          m.reviewed_mapping_sha256===source.mappingSha &&
          m.reviewed_idp_sha256===source.identityPlan.reviewed_idp_sha256 &&
          m.identity_row_sha256===expected.identity_sha256 && actual===expected.identity_sha256 &&
          m.active_automatically===false && u.status==='disabled' && u.display_name==='' &&
          identities.filter(r=>r.target_user_id===u.id).length===1 &&
          users.filter(r=>r.external_issuer===u.external_issuer&&r.external_subject===u.external_subject).length===1)
          verifiedIdentities.add(expected.legacy_id)
      }
    }
    const identityOK=(legacy:unknown,target:unknown)=>versions.has('pg_v8_011')&&identities.filter(r=>r.legacy_user_id===legacy &&
      r.target_user_id===target && r.source_snapshot_sha256===source.sha &&
      r.reviewed_mapping_sha256===source.mappingSha && hex.test(String(r.reviewed_idp_sha256)) &&
      r.active_automatically===false).length===1 && users.some(r=>r.id===target&&r.status==='disabled') &&
      (!source.identityPlan||verifiedIdentities.has(String(legacy)))
    for(const d of domains){
      const out=result(d.source), src=source.tables.get(d.source)
      output.push(out); out.source_count=src?.count??null
      if(!src)out.blockers.push('source_table_missing')
      const wanted=['source_snapshot_sha256',...(d.filter?['source_table']:[])]
      if(!versions.has(d.version)||!has(d.target,wanted)){
        out.blockers.push('target_schema_missing');continue
      }
      // Archive contents are not needed for this minimal supported slice.
      // Select their real crosswalk/safety fields without materializing text.
      const inventoryColumns=[...new Set([...wanted,...(targetFields[d.target]??[])])]
        .filter(c=>!['source_record','archive','raw_payload'].includes(c)&&has(d.target,[c]))
      let mapped=['agent_specs','workflows'].includes(d.source)?await read(db,d.target):
        (await db.query<Row>(`SELECT ${inventoryColumns.join(',')} FROM agentstudio.${d.target}`)).rows
      if(d.filter)mapped=mapped.filter(r=>r.source_table===d.filter)
      out.target_count=mapped.length
      if(!has(d.target,targetFields[d.target]??[]))out.blockers.push('target_fields_missing')
      if(mapped.some(r=>r.source_snapshot_sha256!==source.sha))out.blockers.push('mixed_snapshot')
      if(src&&src.count!==mapped.length)out.blockers.push('count_mismatch')
      if(d.source==='studio_users'){
        // W7 migrates only the ID -> reviewed disabled OIDC identity subset.
        // PB passwords/profile fields are deliberately outside this contract.
        out.target_count=users.length
        if(users.length!==mapped.length)out.blockers.push('untracked_targets')
        for(const r of mapped){
          if(source.owners.get(String(r.legacy_user_id))!==r.target_user_id ||
            !identityOK(r.legacy_user_id,r.target_user_id))out.association_anomalies++
        }
        if(source.identityPlan){
          if(!has('users',identityFields))out.blockers.push('target_fields_missing')
          if(verifiedIdentities.size!==src?.count)out.blockers.push('identity_checksum_mismatch')
        }else out.blockers.push('reviewed_idp_evidence_required')
        if(new Set(mapped.map(r=>r.legacy_user_id)).size!==mapped.length||
          new Set(mapped.map(r=>r.target_user_id)).size!==mapped.length)out.blockers.push('duplicate_target')
        if(out.association_anomalies)out.blockers.push('identity_or_association_invalid')
        out.status=out.blockers.length===0?'success':
          out.blockers.length===1&&out.blockers[0]==='reviewed_idp_evidence_required'?'unsupported':'failed'
        continue
      }
      if(d.source==='workflows'||d.source==='agent_studio_kb_bases'){
        const workflow=d.source==='workflows'
        const required=workflow?['id','rh_user_id','name','graph','require_approval','created','updated']:
          ['id','rh_user_id','name','description','created_ms','updated_ms']
        const known=workflow?[...required,'description','source','spec_id']:required
        if(!src||required.some(c=>!src.columns.includes(c))||src.columns.some(c=>!known.includes(c))){
          out.blockers.push('source_fields_unmapped');continue
        }
        const table=workflow?'workflows':'knowledge_bases'
        const legacyKey=workflow?'legacy_workflow_id':'legacy_base_id'
        const targetKey=workflow?'target_workflow_id':'target_base_id'
        const fields=['id','owner_user_id','name','created_at','updated_at','visibility','team_id','revision',
          ...(workflow?['graph']:['description'])]
        if(!has(table,fields)||!has(d.target,targetFields[d.target]!)){
          out.blockers.push('target_fields_missing');continue
        }
        const targets=await read(db,table)
        out.target_count=targets.length
        let workflowReferences:Row[]=[]
        if(workflow){
          if(!has('runs',['workflow_id'])||!has('schedules',['workflow_id'])){
            out.blockers.push('execution_safety_schema_missing')
          }else{
            workflowReferences=(await db.query<Row>('SELECT workflow_id FROM agentstudio.runs WHERE workflow_id IS NOT NULL')).rows
              .concat((await db.query<Row>('SELECT workflow_id FROM agentstudio.schedules WHERE workflow_id IS NOT NULL')).rows)
          }
        }
        if(targets.length!==mapped.length)out.blockers.push('untracked_targets')
        const expectedHashes:string[]=[],actualHashes:string[]=[],crosswalkHashes:string[]=[]
        const sourceIds=new Set<unknown>()
        for(const raw of src.rows){
          try{
            if(sourceIds.has(raw.id))throw new Error('duplicate')
            sourceIds.add(raw.id)
            const row=workflow?normalizeLegacyWorkflow(raw,source.owners):normalizeLegacyKb(raw,source.owners)
            const matches=mapped.filter(r=>r[legacyKey]===row.legacy_id),m=matches[0]
            const candidates=targets.filter(r=>r.id===m?.[targetKey]),t=candidates[0]
            if(matches.length!==1||candidates.length!==1||!m||!t||
              m.owner_user_id!==row.owner_user_id||t.owner_user_id!==row.owner_user_id||
              !uuid.test(String(t.id))||!identityOK(raw.rh_user_id,row.owner_user_id)||
              t.visibility!=='private'||t.team_id!==null||Number(t.revision)!==1||
              (workflow&&(m.execution_enabled!==false||workflowReferences.some(r=>r.workflow_id===t.id)))){
              out.association_anomalies++;continue
            }
            const projection={legacy_id:row.legacy_id,owner_user_id:t.owner_user_id,name:t.name,
              created_at:sameDate(t.created_at),updated_at:sameDate(t.updated_at),
              ...(workflow?{graph:t.graph,source_record:m.source_record}:{description:t.description})}
            expectedHashes.push(row.payload_sha256);crosswalkHashes.push(String(m.payload_sha256))
            const actual=contentHash(projection);actualHashes.push(actual)
            // Workflow payload includes the original SQLite record, including
            // missing-vs-empty fields and the lexical graph string. KB base
            // normalization covers all six allowlisted source metadata fields.
            if(actual!==row.payload_sha256||m.payload_sha256!==row.payload_sha256||
              (workflow&&contentHash(m.source_record)!==contentHash(raw)))out.blockers.push('checksum_mismatch')
          }catch{out.association_anomalies++}
        }
        if(out.association_anomalies)out.blockers.push('identity_or_association_invalid')
        if(new Set(mapped.map(r=>r[targetKey])).size!==mapped.length||
          new Set(mapped.map(r=>r[legacyKey])).size!==mapped.length)out.blockers.push('duplicate_target')
        const sum=(values:string[])=>contentHash(values.sort())
        if(expectedHashes.length!==src.count||sum(expectedHashes)!==sum(actualHashes)||
          sum(expectedHashes)!==sum(crosswalkHashes))out.blockers.push('checksum_mismatch')
        if(!source.identityPlan)out.blockers.push('reviewed_idp_evidence_required')
        out.blockers=[...new Set(out.blockers)]
        // Success means frozen Workflow configuration / KB metadata only.
        // Execution, ACL, content and RAG retain their separate blocked domains.
        out.status=out.blockers.length===0?'success':
          out.blockers.length===1&&out.blockers[0]==='reviewed_idp_evidence_required'?'unsupported':'failed'
        continue
      }
      if(d.source!=='agent_specs'){
        for(const r of mapped){
          const target=r.owner_user_id??r.target_user_id
          const legacy=[...source.owners].find(([,id])=>id===target)?.[0]
          if(!legacy||!identityOK(legacy,target)||r.permissions_enabled===true||
            r.execution_enabled===true||r.executable===true||r.active_automatically===true)
            out.association_anomalies++
        }
        if(out.association_anomalies)out.blockers.push('identity_or_association_invalid')
        // Counts never establish payload fidelity or live feature equivalence.
        out.blockers.push(d.archive?'archive_only_live_unsupported':'field_reconciliation_unsupported')
        out.status=out.blockers.length===1?'unsupported':'failed'
        continue
      }
      const required=['id','rh_user_id','name','spec','created','updated']
      const known=[...required,'source','template_key']
      if(!src||required.some(c=>!src.columns.includes(c))||src.columns.some(c=>!known.includes(c))){
        out.blockers.push('source_fields_unmapped');continue
      }
      if(!has(d.target,['legacy_spec_id','owner_user_id','target_spec_id','payload_sha256'])||
        !has('agent_specs',['id','owner_user_id','name','spec','requires_approval','created_at','updated_at'])){
        out.blockers.push('target_fields_missing');continue
      }
      const targets=await read(db,'agent_specs')
      out.target_count=targets.length
      if(targets.length!==mapped.length)out.blockers.push('untracked_targets')
      const expectedHashes:string[]=[],actualHashes:string[]=[],crosswalkHashes:string[]=[]
      for(const raw of src.rows){
        try{
          const row=normalizeLegacyAgent(raw,source.owners)
          const matches=mapped.filter(r=>r.legacy_spec_id===row.legacy_id)
          const m=matches[0]
          const candidates=targets.filter(r=>r.id===m?.target_spec_id)
          const t=candidates[0]
          if(matches.length!==1||candidates.length!==1||!m||!t||
            m.owner_user_id!==row.owner_user_id||t.owner_user_id!==row.owner_user_id||
            !identityOK(raw.rh_user_id,row.owner_user_id)||t.requires_approval!==true){
            out.association_anomalies++;continue
          }
          expectedHashes.push(row.payload_sha256)
          crosswalkHashes.push(String(m.payload_sha256))
          const actual=contentHash({legacy_id:row.legacy_id,owner_user_id:t.owner_user_id,
            name:t.name,spec:t.spec,created_at:sameDate(t.created_at),updated_at:sameDate(t.updated_at)})
          actualHashes.push(actual)
          if(actual!==row.payload_sha256||m.payload_sha256!==row.payload_sha256)
            if(!out.blockers.includes('checksum_mismatch'))out.blockers.push('checksum_mismatch')
        }catch{out.association_anomalies++}
      }
      if(out.association_anomalies)out.blockers.push('identity_or_association_invalid')
      if(new Set(mapped.map(r=>r.target_spec_id)).size!==mapped.length)out.blockers.push('duplicate_target')
      const sum=(values:string[])=>contentHash(values.sort())
      if((sum(expectedHashes)!==sum(actualHashes)||sum(expectedHashes)!==sum(crosswalkHashes))&&
        !out.blockers.includes('checksum_mismatch'))out.blockers.push('checksum_mismatch')
      out.status=out.blockers.length?'failed':'success'
    }
    // v8_009 archives only named collaboration audit tables. There is no
    // general source audit crosswalk in v8_005..012. Never infer completeness.
    const audit=result('audit')
    if(has('audit_events',['id','owner_user_id','actor_user_id'])){
      const rows=(await db.query<Row>('SELECT id,owner_user_id,actor_user_id FROM agentstudio.audit_events')).rows;audit.target_count=rows.length
      audit.association_anomalies=rows.filter(r=>!users.some(u=>u.id===r.owner_user_id)||
        !users.some(u=>u.id===r.actor_user_id)).length
    }
    audit.blockers=['audit_migration_unsupported']
    if(audit.target_count===null)audit.blockers.push('target_schema_missing')
    if(audit.association_anomalies)audit.blockers.push('identity_or_association_invalid')
    audit.status=audit.blockers.length===1?'unsupported':'failed';output.push(audit)
    source.verify()
    return output
  }catch(error){
    fatal.blockers=[error instanceof Refused?error.message:'reconciliation_failed']
    return [fatal]
  }finally{
    if(db){
      try{if(begun)await db.query('ROLLBACK')}
      catch{fatal.blockers=['readonly_cleanup_failed'];return [fatal]}
      finally{try{db.release()}catch{fatal.blockers=['readonly_cleanup_failed'];return [fatal]}}
    }
  }
}
