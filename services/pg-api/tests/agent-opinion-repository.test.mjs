// Hosted serial synthetic SQL only. Result rows are produced by protected057
// claim/reserve/finish; this suite opens no listener and calls no provider.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {agentAssessmentFixture,assessmentRequest,assessmentClaim,assessmentProof,assessmentReserve,assessmentFinish,assessmentPause,
  assessmentCancel,assessmentErase,assessmentFeedbackErase,assessmentRows,assessmentCounts,assessmentOutputHash,assessmentEvaluation,assessmentOptimization} from './helpers/agent-assessment-fixture.mjs'
import {reviewLedgerCounts,reviewLedgerRow} from './helpers/agent-review-ledger-fixture.mjs'
import {AgentOpinionRepository} from '../src/agent-opinion-repository.ts'
import {KnowledgeAccessRepository} from '../src/knowledge-access-repository.ts'
import {safeAgentSpec} from '../src/contracts.ts'
import {agentDescriptiveLimits as limits} from '../../../shared/agent-role-limits.mjs'

const serial={concurrency:false}
const requestKeys=['request_id','spec_id','run_id','purpose','request_sha256','input_sha256','content_sha256','owner_epoch','source_protocol','created_at']
const privateFields=/"choice"|"messages"|"identity"|"owner_user_id"|"model_binding"|"lease_token"|"worker_id"|"feedback_sources"|"evaluation_sources"|api_key|syntheticReviewLedgerTask|syntheticReviewLedgerFeedback|private_checkpoint/
const unavailable=error=>error.status===409&&error.code==='agent_opinion_source_unavailable'&&error.message===error.code
const denied=error=>error.status===403&&error.code==='agent_opinion_native_employee_required'&&error.message===error.code
const notFound=error=>error.status===404&&error.code==='agent_opinion_not_found'&&error.message===error.code
async function fixture({installed=true}={}){
  const f=await agentAssessmentFixture()
  try{
    if(installed)await f.db.exec(f.sql('migrations/pg_v9_058_agent_opinion_read.sql'))
    return {...f,opinions:new AgentOpinionRepository(f.pool)}
  }catch(error){await f.close();throw error}
}
async function claim(f,p){const lease=await assessmentClaim(f);assert.ok(lease);assert.equal(lease.request_id,p.raw.request_id);return assessmentProof(lease)}
async function completed(f,options={}){
  const p=await assessmentRequest(f,options),proof=await claim(f,p),result=p.raw.purpose==='evaluate'?assessmentEvaluation():assessmentOptimization()
  if(options.fullCapacity)for(const [key,char] of [['deliverables','交'],['task_plan','计'],['done_criteria','验']])result.descriptive[key]=Array(limits.list_items).fill(char.repeat(limits.list_item))
  await assessmentReserve(f,proof);await assessmentFinish(f,proof,{status:'succeeded',result})
  return {...p,proof,result}
}
const counts=async f=>({review:await reviewLedgerCounts(f),assessment:await assessmentCounts(f)})
async function readonly(f,operation){const before=await counts(f);try{return await operation()}finally{assert.deepEqual(await counts(f),before,'reads/refusals cannot create requests, controls, effects, outcomes, role edits or audit rows')}}
const read=(f,p,identity=p.identity)=>readonly(f,()=>f.opinions.getCurrent(identity,p.raw.request_id))
function sealed(v,p,{lease='succeeded',status='succeeded',job='pending',erased=false,available=true}={}){
  assert.deepEqual(Object.keys(v).sort(),['protocol','request','execution','body_erased','available','result'].sort())
  assert.equal(v.protocol,'agent_paid_review_view_v1')
  assert.deepEqual(Object.keys(v.request).sort(),requestKeys.toSorted())
  assert.deepEqual(v.request,Object.fromEntries(requestKeys.map(key=>[key,p.receipt[key]])))
  assert.deepEqual(Object.keys(v.execution).sort(),['job_state','lease_state','outcome'].sort())
  assert.equal(v.execution.job_state,job);assert.equal(v.execution.lease_state,lease)
  if(status===null)assert.equal(v.execution.outcome,null)
  else{
    const o=v.execution.outcome
    assert.deepEqual(Object.keys(o).sort(),['status','completion_sha256','result_sha256','failure_code','created_at'].sort())
    assert.equal(o.status,status);assert.match(o.completion_sha256,/^[a-f0-9]{64}$/)
    assert.equal(new Date(o.created_at).toISOString(),o.created_at)
    if(status==='succeeded'){assert.equal(o.result_sha256,assessmentOutputHash(p,p.result));assert.equal(o.failure_code,null)}
    else{assert.equal(o.result_sha256,null);assert.equal(o.failure_code,'synthetic_'+status)}
  }
  assert.equal(v.body_erased,erased);assert.equal(v.available,available);assert.deepEqual(v.result,available?p.result:null)
  assert.doesNotMatch(JSON.stringify(v),privateFields)
}
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}

test('real057 zero-score and full-capacity results share the verified source/body transaction and are delivered only after COMMIT; commit failure publishes nothing',serial,async()=>{
  const f=await fixture()
  try{
    for(const purpose of ['evaluate','optimize']){
      const p=await completed(f,{purpose,outputTokenLimit:purpose==='optimize'?16384:2048,fullCapacity:purpose==='optimize'}),before=await counts(f)
      const rows=await assessmentRows(f,p.raw.request_id,p.owner),role=await f.agents.get(p.identity,p.role.id)
      const connect=f.pool.connect.bind(f.pool),reached=deferred(),gate=deferred(),trace=[]
      let clients=0,published=false,pending
      f.pool.connect=async()=>{
        assert.equal(++clients,1,'prepareOnClient and protected read must reuse the owner transaction')
        const client=await connect()
        return {release:()=>client.release(),async query(sql,values=[]){
          trace.push({sql,values})
          if(sql==='COMMIT'){reached.resolve();await gate.promise}
          return client.query(sql,values)
        }}
      }
      try{
        pending=f.opinions.getCurrent(p.identity,p.raw.request_id)
        pending.then(()=>{published=true},()=>{})
        await Promise.race([reached.promise,pending.then(()=>{throw Error('opinion_returned_without_commit')})])
        assert.equal(published,false,'a prepared result cannot escape before transaction commit')
        gate.resolve();sealed(await pending,p)
      }finally{gate.resolve();await pending?.catch(()=>{});f.pool.connect=connect}
      assert.equal(clients,1);assert.equal(trace[0].sql,'BEGIN');assert.equal(trace.at(-1).sql,'COMMIT')
      assert.equal(trace.some(q=>q.sql==='ROLLBACK'),false)
      const at=re=>trace.findIndex(q=>re.test(q.sql))
      const epoch=at(/^SELECT agentstudio\.agent_memory_outcome_epoch\(\) AS epoch$/),anchor=at(/^SELECT agentstudio\.agent_opinion_anchor\(/)
      const lock=at(/^SELECT pg_advisory_xact_lock\(hashtextextended\(\$1::text,540\)\)/),body=at(/^SELECT agentstudio\.agent_opinion_body\(/)
      assert.ok(epoch>=0&&anchor>epoch&&lock>anchor&&body>lock)
      assert.deepEqual(trace.filter(q=>/^SELECT pg_advisory_xact_lock\(hashtextextended\(\$1::text,540\)\)/.test(q.sql)).map(q=>q.values[0]),[p.owner+':'+p.runId])
      assert.deepEqual(trace[body].values,[p.raw.request_id,p.prepared.input_sha256,assessmentOutputHash(p,p.result)])
      assert.ok(at(/^SELECT revision,enabled,status,models,provider,base_url FROM agentstudio\.model_connections/)>lock)
      assert.deepEqual(await counts(f),before);assert.deepEqual(await assessmentRows(f,p.raw.request_id,p.owner),rows)
      assert.deepEqual(await f.agents.get(p.identity,p.role.id),role,'reading optimization never accepts a role patch')
      if(purpose==='evaluate'){assert.equal(p.result.score,0);assert.ok(p.result.dimensions.every(d=>d.score===0))}
      else{
        assert.equal(p.result.descriptive.goal.length,limits.goal);assert.equal(p.result.descriptive.task_scope.length,limits.task_scope)
        for(const key of ['deliverables','task_plan','done_criteria']){assert.equal(p.result.descriptive[key].length,limits.list_items);assert.ok(p.result.descriptive[key].every(item=>item.length===limits.list_item))}
      }
      let commitFault=false
      f.setFault(sql=>{if(sql==='COMMIT'){commitFault=true;throw Error('synthetic_opinion_commit_failure')}})
      try{await assert.rejects(read(f,p),/synthetic_opinion_commit_failure/)}finally{f.setFault(undefined)}
      assert.equal(commitFault,true,'failure must occur at the actual commit boundary')
      assert.deepEqual(await assessmentRows(f,p.raw.request_id,p.owner),rows);sealed(await read(f,p),p)
    }
  }finally{f.setFault(undefined);await f.close()}
})

test('pending/claimed/reserved/paused/failed/unknown controls and historical completion remain truthful, including erased and governance-ABA metadata',serial,async()=>{
  const f=await fixture()
  try{
    const p=await assessmentRequest(f)
    sealed(await read(f,p),p,{lease:null,status:null,available:false})
    const proof=await claim(f,p)
    sealed(await read(f,p),p,{lease:'claimed',status:null,available:false})
    await assessmentReserve(f,proof);sealed(await read(f,p),p,{lease:'reserved',status:null,available:false})
    await assessmentPause(f,proof);sealed(await read(f,p),p,{lease:'paused',status:null,available:false})
    for(const status of ['failed','unknown']){
      const next=await assessmentRequest(f),lease=await claim(f,next)
      await assessmentReserve(f,lease);await assessmentFinish(f,lease,{status,failure_code:'synthetic_'+status})
      sealed(await read(f,next),next,{lease:status,status,available:false})
    }
    const done=await completed(f)
    await assessmentCancel(f,done)
    sealed(await read(f,done),done,{job:'cancelled',available:false})
    assert.equal((await assessmentRows(f,done.raw.request_id,done.owner)).outputs.length,1)
    await assessmentErase(f,done);sealed(await read(f,done),done,{job:'erased',erased:true,available:false})
    assert.equal((await assessmentRows(f,done.raw.request_id,done.owner)).outputs.length,0)
    const epoch=await completed(f)
    await f.db.query('UPDATE agentstudio_auth.accounts SET governance_revision=governance_revision+2 WHERE user_id=$1',[epoch.owner])
    sealed(await read(f,epoch),epoch,{available:false})
    assert.equal((await read(f,epoch)).request.owner_epoch,epoch.receipt.owner_epoch,'receipt records the original epoch without authorizing old body delivery')
    await f.db.query('UPDATE agentstudio_auth.accounts SET enabled=false WHERE user_id=$1',[epoch.owner])
    await assert.rejects(read(f,epoch),denied)
  }finally{await f.close()}
})

test('equal request UUIDs resolve by actual Native owner; cross-owner missing reads and invalid caller identities fail closed without direct private-table access',serial,async()=>{
  const f=await fixture()
  try{
    const id=randomUUID(),alice=await completed(f,{requestId:id}),bob=await completed(f,{who:'bob',purpose:'optimize',requestId:id,outputTokenLimit:16384})
    f.setFault(sql=>{if(/\b(?:FROM|JOIN)\s+agentstudio\.(?:agent_review_inputs|agent_assessment_outputs)\b/i.test(sql))throw Error('opinion_api_direct_private_read_forbidden')})
    try{sealed(await read(f,alice),alice);sealed(await read(f,bob),bob)}finally{f.setFault(undefined)}
    assert.notEqual(alice.owner,bob.owner);assert.notEqual(alice.prepared.input_sha256,bob.prepared.input_sha256)
    const unique=await completed(f)
    await assert.rejects(read(f,unique,f.identities.bob),notFound)
    const connect=f.pool.connect.bind(f.pool);let clients=0
    f.pool.connect=async()=>{clients++;throw Error('invalid_opinion_caller_reached_database')}
    try{
      for(const identity of [null,{}, {...alice.identity,issuer:'https://untrusted.example.test'}])await assert.rejects(f.opinions.getCurrent(identity,id),denied)
      for(const raw of [null,undefined,'invalid',id+' ',{}, {request_id:id,owner_user_id:alice.owner}])
        await assert.rejects(f.opinions.getCurrent(alice.identity,raw),error=>error.status===400&&error.code==='agent_opinion_invalid_read')
      assert.equal(clients,0)
    }finally{f.pool.connect=connect}
    sealed(await readonly(f,()=>f.opinions.getCurrent(alice.identity,id.toUpperCase())),alice)
    await assessmentErase(f,alice);sealed(await read(f,alice),alice,{job:'erased',erased:true,available:false});sealed(await read(f,bob),bob)
  }finally{f.setFault(undefined);await f.close()}
})

test('current role and selected model changes block old opinions through the actual source repository and expose only the closed source-unavailable error',serial,async()=>{
  const f=await fixture()
  try{
    const roleOpinion=await completed(f),current=await f.agents.get(roleOpinion.identity,roleOpinion.role.id),{require_approval:_,...spec}=current.spec
    await f.agents.update(roleOpinion.identity,current.id,current.name,safeAgentSpec({...spec,goal:'Synthetic ordinary role changed after paid review'}),current.revision)
    await assert.rejects(read(f,roleOpinion),unavailable)
    const modelOpinion=await completed(f,{purpose:'optimize'}),id=modelOpinion.choice.model_binding.connection_id
    const original=(await f.db.query('SELECT enabled,revision,status,models FROM agentstudio.model_connections WHERE id=$1',[id])).rows[0]
    for(const mutation of [
      ()=>f.db.query('UPDATE agentstudio.model_connections SET enabled=false,revision=revision+1 WHERE id=$1',[id]),
      ()=>f.db.query("UPDATE agentstudio.model_connections SET status='error' WHERE id=$1",[id]),
      ()=>f.db.query("UPDATE agentstudio.model_connections SET models='[]'::jsonb WHERE id=$1",[id])
    ]){
      try{await mutation();await assert.rejects(read(f,modelOpinion),unavailable)}
      finally{await f.db.query('UPDATE agentstudio.model_connections SET enabled=$2,revision=$3,status=$4,models=$5::jsonb WHERE id=$1',[id,original.enabled,original.revision,original.status,JSON.stringify(original.models)])}
      sealed(await read(f,modelOpinion),modelOpinion)
    }
  }finally{await f.close()}
})

test('current task/checkpoint and original/current KB access are revalidated; statement-only optimization survives task checkpoint pruning without reading old delivery',serial,async()=>{
  const f=await fixture()
  try{
    for(const purpose of ['evaluate','optimize']){
      const p=await completed(f,{purpose})
      await f.db.query("UPDATE agentstudio.runs SET checkpoint='{}'::jsonb WHERE id=$1",[p.runId])
      if(purpose==='evaluate')await assert.rejects(read(f,p),unavailable)
      else sealed(await read(f,p),p)
    }
    const access=new KnowledgeAccessRepository(f.pool,async()=>({id:f.users.alice,display_name:'Synthetic Alice'})),kb=f.resources.bob.kb.id
    const grant=await access.change(f.identities.bob,kb,{action:'grant',request_id:randomUUID(),expected_revision:0,recipient_email:'alice@example.test',role:'viewer',semantic_allowed:false})
    const current=await f.agents.get(f.identities.alice,f.resources.alice.spec.id),{require_approval:_,...spec}=current.spec
    await f.agents.update(f.identities.alice,current.id,current.name,safeAgentSpec({...spec,knowledge_base_ids:[kb]}),current.revision)
    const p=await completed(f)
    sealed(await read(f,p),p)
    await access.change(f.identities.bob,kb,{action:'revoke',request_id:randomUUID(),recipient_id:f.users.alice,expected_revision:grant.item.revision})
    await assert.rejects(read(f,p),unavailable)
  }finally{await f.close()}
})

test('forgetting only a lesson preserves statement-based opinion; same-text correction, feedback erasure and explicit erasure remove bodies and cannot be undone by old057/056 replay',serial,async()=>{
  const f=await fixture()
  try{
    const remembered=await completed(f,{purpose:'optimize',remember:true})
    assert.equal(remembered.feedback.lesson_result.decision,'stored')
    await f.feedback.change(remembered.identity,{action:'forget_lesson',request_id:randomUUID(),spec_id:remembered.role.id,run_id:remembered.runId,
      feedback_id:remembered.feedback.feedback_id,expected_content_sha256:remembered.feedback.lesson_result.content_sha256,confirm:true})
    sealed(await read(f,remembered),remembered)
    for(const action of ['same_text_correction','feedback_erasure','explicit_erasure']){
      const p=await completed(f,{purpose:'optimize'}),original=await assessmentRows(f,p.raw.request_id,p.owner)
      if(action==='same_text_correction'){
        const state=await f.feedback.status(p.identity,p.runId)
        const corrected=await f.feedback.change(p.identity,{...p.feedbackRaw,request_id:randomUUID(),expected_revision:state.revision})
        assert.equal(corrected.statement_sha256,p.feedback.statement_sha256);assert.notEqual(corrected.feedback_sha256,p.feedback.feedback_sha256)
      }else if(action==='feedback_erasure')await assessmentFeedbackErase(f,p)
      else await assessmentErase(f,p)
      sealed(await read(f,p),p,{job:'erased',erased:true,available:false})
      const row=await reviewLedgerRow(f,p,p.raw.request_id),erased=await assessmentRows(f,p.raw.request_id,p.owner)
      assert.equal(row.body,null);assert.equal(erased.outputs.length,0);assert.deepEqual(erased.effects,original.effects);assert.deepEqual(erased.outcomes,original.outcomes)
      await readonly(f,async()=>{
        await assessmentFinish(f,p.proof,{status:'succeeded',result:p.result})
        assert.equal((await f.closed.submit(p.identity,p.raw)).body_erased,true)
        assert.equal((await f.closed.confirm(p.identity,p.raw)).body_erased,true)
      })
      sealed(await read(f,p),p,{job:'erased',erased:true,available:false})
      assert.equal((await reviewLedgerRow(f,p,p.raw.request_id)).body,null)
      assert.deepEqual(await assessmentRows(f,p.raw.request_id,p.owner),erased)
    }
  }finally{await f.close()}
})

test('missing optional058 and live credential-boundary drift prevent result delivery; restored exact schema permits the same genuinely completed output',serial,async()=>{
  const f=await fixture({installed:false})
  try{
    const p=await completed(f)
    await assert.rejects(read(f,p),error=>error.status===409&&error.code==='agent_opinion_schema_required')
    await f.db.exec(f.sql('migrations/pg_v9_058_agent_opinion_read.sql'));sealed(await read(f,p),p)
    await f.db.exec('REVOKE EXECUTE ON FUNCTION agentstudio.agent_opinion_body(uuid,text,text) FROM agentstudio_api')
    try{await assert.rejects(read(f,p),/unsafe_agent_opinion_privileges/)}
    finally{await f.db.exec('GRANT EXECUTE ON FUNCTION agentstudio.agent_opinion_body(uuid,text,text) TO agentstudio_api')}
    sealed(await read(f,p),p)
  }finally{await f.close()}
})
