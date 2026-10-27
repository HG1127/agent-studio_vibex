// Import-safe. The original exact disposable Linux CI guard must succeed
// BEFORE dynamically importing DB fixtures, pg or any source/runtime helpers.
import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {requireEphemeralPg18Ci} from '../../src/pg18-ephemeral-ci-guard.mjs'

export function generatedAcceptanceTarget(env=process.env){
  const target=requireEphemeralPg18Ci(env)
  if(process.platform!=='linux'||env.RUNNER_OS!=='Linux')throw Error('refuse_non_ephemeral_pg18_ci')
  return target
}
export async function generatedAcceptanceFixture(env=process.env){
  const target=generatedAcceptanceTarget(env)
  const assessment=await import('./agent-assessment-fixture.mjs')
  const ledger=await import('./agent-review-ledger-fixture.mjs')
  const {AgentGeneratedAcceptanceRepository}=await import('../../src/agent-generated-acceptance-repository.ts')
  const {AgentReviewLedgerRepository}=await import('../../src/agent-review-ledger.ts')
  const {AgentOptimizationRepository}=await import('../../src/agent-optimization-repository.ts')
  const {parseAgentReviewSubmission,agentReviewFees}=await import('../../src/agent-review-contract.ts')
  const {canonicalMcpJson}=await import('../../src/mcp-catalog.ts')
  const {default:pg}=await import('pg')
  const f=await assessment.agentAssessmentTcpFixture(env)
  let adminPool
  try{
    await f.db.exec(f.sql('migrations/pg_v9_058_agent_opinion_read.sql'))
    await f.db.exec(f.sql('migrations/pg_v9_059_agent_generated_acceptance.sql'))
    adminPool=new pg.Pool({...target,max:3,statement_timeout:15000,query_timeout:20000})
    return {...f,adminPool,generated:new AgentGeneratedAcceptanceRepository(f.pool,{allowAcceptance:true}),generatedClosed:new AgentGeneratedAcceptanceRepository(f.pool),
      generatedClasses:{AgentGeneratedAcceptanceRepository,AgentReviewLedgerRepository,AgentOptimizationRepository},
      async complete(options={}){
        const who=options.who??'alice',selected=[]
        for(let i=0;i<(options.feedbackCount??1);i++)selected.push(await ledger.reviewLedgerSource(f,{who}))
        const s=options.targetDistinct?await ledger.reviewLedgerSource(f,{who}):selected[0]
        const purpose=options.purpose??'optimize'
        const state=await f.review.source(s.identity,{purpose,spec_id:s.role.id,run_id:s.runId})
        const role=await f.agents.get(s.identity,s.role.id)
        let reviewBinding=role.spec.model_binding
        if(options.isolatedReviewModel){
          const created=await f.models.create(s.identity,{name:'Independent synthetic generated review model',provider:'openai',base_url:'https://api.openai.com/v1',
            api_key:'synthetic-generated-isolated-never-network',models:['synthetic'],enabled:true})
          const model=await f.models.testConnection(s.identity,created.id,created.revision,async()=>({status:'ok',latency_ms:1,error_code:''}))
          reviewBinding={connection_id:model.id,connection_revision:model.revision,model_id:'synthetic'}
        }
        const feedback=selected.map(item=>({run_id:item.runId,feedback_id:item.feedback.feedback_id,feedback_sha256:item.feedback.feedback_sha256})).sort((a,b)=>a.run_id<b.run_id?-1:1)
        if(options.reverseSources)feedback.reverse()
        const choice={action:'preview',purpose,spec_id:role.id,run_id:s.runId,expected_spec_revision:state.expected_spec_revision,
          expected_spec_sha256:state.expected_spec_sha256,expected_source_sha256:state.expected_source_sha256,model_binding:reviewBinding,
          output_token_limit:16384,feedback_sources:purpose==='optimize'?feedback:[],evaluation_sources:[]}
        const prepared=await f.review.preview(s.identity,choice)
        const raw={...choice,action:'submit',request_id:options.reviewId??randomUUID(),expected_input_sha256:prepared.input_sha256,confirm:true,fee_acknowledgement:agentReviewFees[purpose]}
        const parsed=parseAgentReviewSubmission(raw),receipt=await f.ledger.submit(s.identity,raw)
        const lease=await assessment.assessmentClaim({...f,pool:f.workerPool})
        assert.ok(lease);assert.equal(lease.request_id,raw.request_id)
        const proof=assessment.assessmentProof(lease)
        const result=options.result??(purpose==='optimize'?{descriptive:{goal:'生成目标😀',task_scope:'仅描述配置，保留权限',deliverables:['核对'],task_plan:['执行'],done_criteria:['留证']},tools_note:'No grants',rationale:'Synthetic protected output'}:assessment.assessmentEvaluation())
        await assessment.assessmentReserve({...f,pool:f.dispatchPool},proof)
        const completion=options.status&&options.status!=='succeeded'?{status:options.status,failure_code:'synthetic_'+options.status}:{status:'succeeded',result}
        await assessment.assessmentFinish({...f,pool:f.dispatchPool},proof,completion)
        return {...s,role,selected,choice,prepared,raw,parsed,receipt,proof,result}
      },
      async eraseOpinion(p){return assessment.assessmentErase(f,p)},
      async eraseFeedback(source){return f.feedback.change(source.identity,await ledger.reviewLedgerFeedbackErase(f,source))},
      async snapshot(){
        const tables=['agent_specs','agent_collaboration_proposals','agent_collaboration_revisions','agent_optimization_intents','agent_optimization_links',
          'agent_generated_acceptances','agent_generated_feedback_refs','agent_feedback_receipts','agent_feedback_bodies','agent_feedback_lessons',
          'agent_review_requests','agent_review_inputs','agent_review_feedback_sources','agent_review_jobs','agent_review_controls','agent_review_tombstones',
          'agent_assessment_leases','agent_assessment_effects','agent_assessment_outcomes','agent_assessment_outputs','audit_events','jobs','external_effects']
        const sql=tables.map(name=>"'"+name+"',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb) FROM agentstudio."+name+' r)').join(',')
        const value=(await f.db.query('SELECT jsonb_build_object('+sql+') AS value')).rows[0].value
        return createHash('sha256').update(canonicalMcpJson(value)).digest('hex')
      },
      async close(){await adminPool.end();await f.close()}
    }
  }catch(error){await adminPool?.end();await f.close();throw error}
}
export function generatedAcceptanceChoice(preview,request_id=randomUUID()){
  return {action:'accept',request_id,review_id:preview.source.review_id,spec_id:preview.source.spec_id,target_run_id:preview.source.target_run_id,
    anchor_run_id:preview.anchor.run_id,anchor_feedback_id:preview.anchor.feedback_id,expected_preview_sha256:preview.preview_sha256,expected_result_sha256:preview.source.result_sha256,
    expected_spec_revision:preview.before.revision,expected_spec_sha256:preview.before.source_sha256,expected_candidate_sha256:preview.candidate.candidate_sha256,
    confirm:true,acceptance_acknowledgement:'APPROVE_EXACT_GENERATED_DESCRIPTIVE_ROLE_CHANGE_V1'}
}
// The frozen055 wire parser invokes safeAgentSpec itself. Its output-only
// require_approval flag cannot be sent back as a caller-selected spec field.
export function generatedManualRoleInput(spec){
  const {require_approval,...input}=spec
  assert.equal(require_approval,true,'manual055 fixture starts from a real approval-required normalized candidate')
  return structuredClone(input)
}
// Classify real Node business reads only. Catalog queries may legitimately
// contain a routine/table name as a quoted verification literal.
export function generatedRecoverySourceRead(sql){
  if(/^\s*SELECT\s+agentstudio\.agent_opinion_(?:anchor|body)\(/i.test(sql))return true
  const statement=sql.replace(/'(?:[^']|'')*'/g,"''")
  return /^\s*SELECT\b/i.test(statement)&&/\b(?:FROM|JOIN)\s+agentstudio\.(?:agent_review_inputs|agent_assessment_outputs|model_connections|agent_specs)\b/i.test(statement)
}
export const generatedPreviewChoice=p=>({action:'preview',review_id:p.raw.request_id,spec_id:p.role.id,target_run_id:p.runId})
export const generatedDeferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}
export async function generatedBounded(promise,label,ms=10000){
  let timer
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('generated_pg18_timeout_'+label)),ms)})])}
  finally{clearTimeout(timer)}
}
export function generatedTracedPool(base,{after,before,fault}={}){
  const pid=generatedDeferred(),hit=generatedDeferred(),gate=generatedDeferred(),trace=[]
  let matched=false,clients=0
  return {trace,pid:pid.promise,hit:hit.promise,release:()=>gate.resolve(),pool:{knowledgeSharing:true,async connect(){
    assert.equal(++clients,1,'one generated operation must use exactly one actual client')
    const db=await base.connect()
    try{pid.resolve((await db.query('SELECT pg_backend_pid() AS pid')).rows[0].pid)}catch(error){db.release();throw error}
    return {release:()=>db.release(),async query(sql,values=[]){
      trace.push({sql,values})
      if(before?.test(sql)&&!matched){matched=true;hit.resolve();await gate.promise}
      fault?.(sql,values)
      const value=await db.query(sql,values)
      if(after?.test(sql)&&!matched){matched=true;hit.resolve(value);await gate.promise}
      return value
    }}
  }}}
}
