// Import-safe guard/helpers for a dedicated, empty Linux GitHub PG18 service.
// Authored only; importing this file opens no DB and imports no runtime/pg.
import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {generatedAcceptanceTarget} from './agent-generated-acceptance-fixture.mjs'

export const descriptivePatchTarget=(env=process.env)=>generatedAcceptanceTarget(env)
export const descriptivePatchDeferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}
export async function descriptivePatchBounded(promise,label,ms=10000){
  let timer
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('descriptive_patch_pg18_timeout_'+label)),ms)})])}
  finally{clearTimeout(timer)}
}

// Observe the REAL client/result, including pg.Result[] from multi-SET simple
// queries. Proxy unknown pool/client properties and bind original receivers.
// No fake row/catalog/DML result and no result copying or normalization.
export function descriptivePatchTracedPool(base,{before,after,fault,afterFault}={}){
  const pid=descriptivePatchDeferred(),hit=descriptivePatchDeferred(),gate=descriptivePatchDeferred(),trace=[]
  let matched=false,clients=0
  const pool=new Proxy(base,{get(target,key){
    if(key!=='connect'){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}
    return async()=>{
      assert.equal(++clients,1,'one operation must reuse exactly one real admission client')
      const client=await target.connect()
      try{pid.resolve((await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid)}catch(error){client.release();throw error}
      return new Proxy(client,{get(db,key){
        if(key!=='query'){const value=Reflect.get(db,key,db);return typeof value==='function'?value.bind(db):value}
        return async(sql,values)=>{
          trace.push({sql,values})
          if(before?.test(sql)&&!matched){matched=true;hit.resolve();await gate.promise}
          fault?.(sql,values)
          const result=await db.query(sql,values)
          afterFault?.(sql,values,result)
          if(after?.test(sql)&&!matched){matched=true;hit.resolve(result);await gate.promise}
          return result
        }
      }})
    }
  }})
  return {pool,trace,pid:pid.promise,hit:hit.promise,release:()=>gate.resolve()}
}

export async function descriptivePatchFixture(env=process.env){
  descriptivePatchTarget(env) // MUST precede ALL dynamic DB/runtime imports.
  const [legacy,contract,source,repository,generatedAudit,opinionAudit,optimizationAudit,audit,contracts,acceptance]=await Promise.all([
    import('./agent-generated-acceptance-fixture.mjs'),import('../../src/agent-descriptive-patch-contract.ts'),
    import('../../src/agent-descriptive-patch-source.ts'),import('../../src/repository.ts'),
    import('../../src/agent-generated-audit.ts'),import('../../src/agent-opinion-audit.ts'),import('../../src/agent-optimization-audit.ts'),
    import('../../src/agent-descriptive-patch-audit.ts'),import('../../src/contracts.ts'),import('../../src/agent-descriptive-patch-acceptance-repository.ts')
  ])
  assert.equal(typeof audit.verifyAgentDescriptivePatchCredentials,'function','mandatory new FULL auditor must exist; no skip/core fallback')
  assert.equal(typeof audit.inspectAgentDescriptivePatchSchema,'function')
  const f=await legacy.generatedAcceptanceFixture(env)
  try{
    assert.equal(await audit.inspectAgentDescriptivePatchSchema(f.pool),false,'genuinely absent optional060 does not advertise capability')
    // Actual dedicated admin client, with the real authored060 DDL. Existing
    // helper installs genuine055/058/059 unchanged. No fake catalog/DDL runner.
    // Preserve exact authored UTF8 body/newlines for the new literal prosrc pins.
    const ddl=readFileSync(new URL('../../../../db/postgres/migrations/pg_v9_060_agent_descriptive_patch.sql',import.meta.url),'utf8')
    const installer=await f.adminPool.connect()
    try{await installer.query(ddl)}
    catch(error){await installer.query('ROLLBACK').catch(()=>{});throw error}
    finally{installer.release()}
    const h={...legacy,...contract,...source,...repository,...generatedAudit,...opinionAudit,...optimizationAudit,...audit,...contracts,...acceptance}
    const full=async db=>assert.equal(await audit.verifyAgentDescriptivePatchCredentials(db),true)
    const prepare=async(p,{pool=f.pool}={})=>repository.withActor(pool,p.identity,async(db,owner)=>{
      assert.equal(owner,p.owner);await full(db)
      return new source.AgentDescriptivePatchSourceRepository(pool).prepareOnClient(p.identity,db,owner,{review_id:p.raw.request_id,spec_id:p.role.id,target_run_id:p.runId})
    })
    const original=(preview,request_id=randomUUID())=>contract.freezeAgentDescriptivePatchOriginal({action:'accept',request_id,review_id:preview.source.review_id,spec_id:preview.source.spec_id,target_run_id:preview.source.target_run_id,anchor_run_id:preview.anchor.run_id,anchor_feedback_id:preview.anchor.feedback_id,
      expected_preview_sha256:preview.preview_sha256,expected_result_sha256:preview.source.result_sha256,expected_patch_sha256:preview.model_patch.patch_sha256,expected_spec_revision:preview.before.revision,expected_spec_sha256:preview.before.source_sha256,expected_candidate_sha256:preview.candidate.candidate_sha256,confirm:true,acceptance_acknowledgement:contract.agentDescriptivePatchAcknowledgement})
    // Actual unmounted production repository; no test substitute for its
    // fresh gate,551/original recovery, Source or protected SQL checks.
    const accept=async(p,raw,{pool=f.pool}={})=>new acceptance.AgentDescriptivePatchAcceptanceRepository(pool,{allowAcceptance:true}).accept(p.identity,raw)
    const directAccept=async(identity,raw,{pool=f.pool}={})=>repository.withActor(pool,identity,async db=>{
      const value=(await db.query('SELECT agentstudio.agent_descriptive_patch_accept($1::jsonb) AS value',[JSON.stringify(raw)])).rows[0].value
      return contract.parseAgentDescriptivePatchReceipt(value,raw)
    })
    const receipt=async(identity,id,selector,{pool=f.pool,expected}={})=>repository.withActor(pool,identity,async db=>{
      await full(db)
      const value=(await db.query('SELECT agentstudio.agent_descriptive_patch_receipt($1::uuid,$2::text) AS value',[id,selector])).rows[0].value
      return value===null?null:contract.parseAgentDescriptivePatchReceipt(value,expected)
    })
    const tables=['agent_specs','model_connections','agent_collaboration_proposals','agent_collaboration_revisions','agent_optimization_intents','agent_optimization_links',
      'agent_generated_acceptances','agent_generated_feedback_refs','agent_descriptive_patch_acceptances','agent_descriptive_patch_feedback_refs',
      'agent_feedback_receipts','agent_feedback_bodies','agent_feedback_lessons','agent_review_requests','agent_review_inputs','agent_review_feedback_sources','agent_review_jobs','agent_review_controls','agent_review_tombstones',
      'agent_assessment_leases','agent_assessment_effects','agent_assessment_outcomes','agent_assessment_outputs','audit_events','jobs','external_effects']
    const snapshot=async()=>{
      const sql=tables.map(name=>"'"+name+"',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb) FROM agentstudio."+name+' r)').join(',')
      const value=(await f.db.query('SELECT jsonb_build_object('+sql+') AS value')).rows[0].value
      return createHash('sha256').update(JSON.stringify(value)).digest('hex')
    }
    return {...f,h,patchInstalledSqlSha256:createHash('sha256').update(ddl,'utf8').digest('hex'),patchClosed:new acceptance.AgentDescriptivePatchAcceptanceRepository(f.pool),patchPrepare:prepare,patchOriginal:original,patchAccept:accept,patchDirectAccept:directAccept,patchReceipt:receipt,patchSnapshot:snapshot,patchSnapshotTables:Object.freeze(tables),
      async patchReady({descriptive,requestId,...options}={}){
        const who=options.who??'alice',role=await f.agents.get(f.identities[who],f.resources[who].spec.id)
        const patch=typeof descriptive==='function'?descriptive(role.spec):descriptive??{goal:'合成部分描述 '+randomUUID()}
        const p=await f.complete({...options,result:{descriptive:patch,tools_note:'No resource change',rationale:'Actual synthetic protected output'}})
        const internal=await prepare(p),preview=internal.preview
        return {...p,internal,preview,original:original(preview,requestId)}
      }
    }
  }catch(error){await f.close();throw error}
}
