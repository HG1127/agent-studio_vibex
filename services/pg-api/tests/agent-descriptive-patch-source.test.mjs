// Strict same-client composition/lock-order doubles only. No SQL engine,
// PGlite, fixture, server or provider. Successful mocked Source preparation is
// NOT proof of actual schema/resource/identity validation or PostgreSQL locks.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {AgentDescriptivePatchSourceRepository} from '../src/agent-descriptive-patch-source.ts'
import {AgentReviewSourceRepository} from '../src/agent-review-source.ts'
import {HttpError,safeAgentSpec} from '../src/contracts.ts'
import {prepareAgentReviewInput} from '../src/agent-review-input.ts'
import {parseAgentReviewPreview,parseAgentReviewSubmission,agentReviewFees} from '../src/agent-review-contract.ts'
import {agentAssessmentOutputHash} from '../src/agent-assessment-contract.ts'
import {deriveAgentDescriptivePatchCandidate,parseAgentDescriptivePatchPreview,agentDescriptivePatchKeys as D} from '../src/agent-descriptive-patch-contract.ts'

const clone=v=>structuredClone(v),id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),sha=c=>c.repeat(64)
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v)
const H=v=>createHash('sha256').update(canonical(v),'utf8').digest('hex')
const equal=(a,b)=>assert.equal(canonical(a),canonical(b))
const unavailable=e=>e.status===409&&e.code==='agent_descriptive_patch_source_unavailable'
const code=expected=>e=>e.code===expected&&e.message===expected
const identity={issuer:'urn:agentstudio:local:v1',subject:'synthetic-s1-source'},owner=id(90)
const keys=()=>({review_id:id(1),spec_id:id(2),target_run_id:id(20)})
const all={goal:'新目标😀',task_scope:'新范围',deliverables:['新交付'],task_plan:['新计划'],done_criteria:['新验收']}
function fixture(descriptive={goal:all.goal},feedbackRuns=[30,10,20]){
  const spec=safeAgentSpec({goal:'原目标😀',task_scope:'原范围',deliverables:['原交付'],task_plan:['原计划'],done_criteria:['原验收'],tools:['summarize','knowledge_search','http_review','mcp_review'],knowledge_base_ids:[id(7)],
    knowledge_retrieval:{mode:'hybrid',profile_id:id(8),profile_revision:2,consent_revision:3},http_tools:[{name:'http_review',description:'synthetic binding only',connection_id:id(5),connection_revision:6}],
    mcp_tools:[{name:'mcp_review',connection_id:id(6),connection_revision:7,tool_name:'synthetic_review',catalog_sha256:sha('d')}],model_binding:{connection_id:id(40),connection_revision:7,model_id:'synthetic'},require_plan_review:true})
  const role={id:id(2),name:'Synthetic source retained role',spec,revision:41,requires_approval:true,source_sha256:sha('6')}
  // Stored choice remains unsorted and target is also an actual feedback run.
  const refs=feedbackRuns.map((n,i)=>({run_id:id(n),feedback_id:id(n+100),feedback_sha256:sha((i+1).toString(16)),feedback_revision:i+2,feedback_source_sha256:sha((i+4).toString(16)),statement_sha256:sha((i+6).toString(16))}))
  const choice=parseAgentReviewPreview({action:'preview',purpose:'optimize',spec_id:role.id,run_id:id(20),expected_source_sha256:sha('a'),expected_spec_revision:41,expected_spec_sha256:role.source_sha256,model_binding:{connection_id:id(42),connection_revision:8,model_id:'synthetic-review'},output_token_limit:2048,feedback_sources:refs.map(({run_id,feedback_id,feedback_sha256})=>({run_id,feedback_id,feedback_sha256})),evaluation_sources:[]})
  const content=prepareAgentReviewInput(choice,{role:{name:role.name,spec,revision:role.revision,source_sha256:role.source_sha256},run:{id:id(20),spec_id:role.id,status:'cancelled',instruction:'',result_text:'',source_sha256:choice.expected_source_sha256},feedback:choice.feedback_sources.map(s=>({...s,rating:'down',tags:['核对'],comment:'PRIVATE_FEEDBACK_MATERIAL'})),evaluations:[]})
  const prepared={...content,protocol:'agent_paid_review_prepared_input_v1',choice:clone(choice),content_sha256:content.input_sha256,input_sha256:H({protocol:'agent_paid_review_prepared_input_v1',owner,owner_epoch:5,source_protocol:'employee_statement_anchor_v1',content_sha256:content.input_sha256}),source_protocol:'employee_statement_anchor_v1',owner_epoch:5,recorded:false}
  const review=id(1),result={descriptive:clone(descriptive),tools_note:'PRIVATE_TOOLS_NOTE',rationale:'PRIVATE_RATIONALE'},result_sha256=agentAssessmentOutputHash(review,'optimize',prepared.input_sha256,result)
  const submission=parseAgentReviewSubmission({...choice,action:'submit',request_id:review,expected_input_sha256:prepared.input_sha256,confirm:true,fee_acknowledgement:agentReviewFees.optimize})
  const anchor={protocol:'agent_paid_review_read_anchor_v1',request_id:review,spec_id:role.id,run_id:id(20),purpose:'optimize',request_sha256:submission.request_sha256,input_sha256:prepared.input_sha256,content_sha256:prepared.content_sha256,owner_epoch:5,source_protocol:'employee_statement_anchor_v1',created_at:'2026-10-27T01:00:00.000Z',job_state:'pending',lease_state:'succeeded',outcome:{status:'succeeded',completion_sha256:H({protocol:'agent_paid_review_completion_v1',request_id:review,effect_id:id(70),completion:{status:'succeeded',result}}),result_sha256,failure_code:null,created_at:'2026-10-27T01:01:00.000Z'},body_erased:false,choice}
  return {role,refs,prepared,anchor,body:{request_id:review,purpose:'optimize',input_sha256:prepared.input_sha256,result_sha256,result}}
}
function resealIntent(f){const a=f.anchor;a.request_sha256=parseAgentReviewSubmission({...a.choice,action:'submit',request_id:a.request_id,expected_input_sha256:a.input_sha256,confirm:true,fee_acknowledgement:agentReviewFees[a.purpose]}).request_sha256}

function harness(f,options={}){
  const events=[],lockKeys=[...new Set([f.anchor.run_id,...(f.anchor.choice?.feedback_sources??[]).map(r=>r.run_id)])].sort().map(run=>owner+':'+run)
  let locks=0,roleLocked=false,sourceCalls=0,bodyReads=0,feedbackReads=0,compatReads=0,poolCalls=0,releases=0
  const pool={async connect(){poolCalls++;throw Error('must_not_open_another_client')}}
  const db={async query(sql,values){
    events.push({kind:'query',sql,values:clone(values)})
    assert.match(sql,/^SELECT /);assert.doesNotMatch(sql,/;|\b(BEGIN|COMMIT|ROLLBACK|INSERT|UPDATE agentstudio|DELETE|CREATE|ALTER|DROP|SET ROLE)\b/)
    if(sql==="SELECT current_user='agentstudio_api' AND agentstudio.actor_id()=$1::uuid AS ok"){
      equal(values,[owner]);return {rows:[{ok:options.contextOk??true}]}
    }
    if(sql==='SELECT agentstudio.agent_memory_outcome_epoch() AS epoch'){assert.equal(values,undefined);return {rows:[{epoch:Object.hasOwn(options,'epoch')?options.epoch:'5'}]}}
    if(sql==='SELECT agentstudio.agent_opinion_anchor($1::uuid) AS value'){equal(values,[id(1)]);if(options.anchorError)throw options.anchorError;return {rows:options.missingAnchorRow?[]:[{value:Object.hasOwn(options,'anchor')?clone(options.anchor):clone(f.anchor)}]}}
    if(sql==='SELECT pg_advisory_xact_lock(hashtextextended($1::text,540))'){
      assert.equal(roleLocked,false);equal(values,[lockKeys[locks++]]);return {rows:[]}
    }
    if(sql.startsWith('SELECT id FROM agentstudio.runs ')){
      assert.equal(locks,lockKeys.length);equal(values,[id(20),owner,id(2)])
      assert.match(sql,/owner_user_id=\$2::uuid AND agent_spec_id=\$3::uuid AND kind='agent' AND status IN\('succeeded','failed','cancelled'\) AND finished_at IS NOT NULL FOR SHARE$/)
      return {rows:Object.hasOwn(options,'task')?(options.task===null?[]:[clone(options.task)]):[{id:id(20)}]}
    }
    if(sql.startsWith('SELECT id,name,spec,revision,requires_approval,')){
      assert.equal(locks,lockKeys.length);equal(values,[id(2),owner]);assert.match(sql,/agentstudio\.agent_optimization_role_sha\(id,owner_user_id,name,revision,spec\) AS source_sha256 FROM agentstudio\.agent_specs WHERE id=\$1::uuid AND owner_user_id=\$2::uuid FOR UPDATE$/)
      roleLocked=true;return {rows:Object.hasOwn(options,'role')?(options.role===null?[]:[clone(options.role)]):[{...clone(f.role),revision:'41'}]}
    }
    if(sql==='SELECT agentstudio.identity_user_id($1::text,$2::text) AS id'){
      equal(values,[identity.issuer,identity.subject]);assert.equal(roleLocked,true);return {rows:[{id:options.mappedOwner??owner}]}
    }
    if(sql==='SELECT agentstudio.agent_opinion_body($1::uuid,$2::text,$3::text) AS value'){
      assert.equal(locks,lockKeys.length);assert.equal(roleLocked,true);assert.equal(sourceCalls,1);bodyReads++
      equal(values,[id(1),f.anchor.input_sha256,f.anchor.outcome.result_sha256]);return {rows:[{value:Object.hasOwn(options,'body')?clone(options.body):clone(f.body)}]}
    }
    if(sql.startsWith('SELECT r.run_id,r.request_id AS feedback_id,r.feedback_sha256,r.revision AS feedback_revision,')){
      assert.equal(bodyReads,1);const selected=f.anchor.choice.feedback_sources[feedbackReads++]
      equal(values,[owner,id(2),selected.run_id,selected.feedback_id,selected.feedback_sha256])
      for(const fragment of ["JOIN agentstudio.agent_feedback_bodies b ON b.owner_user_id=r.owner_user_id AND b.feedback_id=r.request_id","t.id=r.run_id AND t.owner_user_id=r.owner_user_id AND t.agent_spec_id=r.spec_id","r.owner_user_id=$1::uuid AND r.spec_id=$2::uuid AND r.run_id=$3::uuid AND r.request_id=$4::uuid AND r.action='submit' AND r.feedback_sha256=$5","t.kind='agent' AND t.status IN('succeeded','failed','cancelled') AND t.finished_at IS NOT NULL","agentstudio.agent_feedback_statement_sha256(r.spec_id,r.run_id,r.source_sha256,b.rating,b.tags,b.comment)=r.statement_sha256","later.action<>'forget_lesson' AND later.revision>r.revision"])assert.ok(sql.includes(fragment),fragment)
      const row=options.feedback?options.feedback(selected,feedbackReads):f.refs.find(r=>r.feedback_id===selected.feedback_id)
      return {rows:row===null?[]:[{...clone(row),feedback_revision:String(row.feedback_revision)}]}
    }
    if(sql==='SELECT agentstudio.agent_optimization_candidate_sha($1::text,$2::jsonb) AS sha'){
      compatReads++;assert.equal(feedbackReads,f.refs.length);assert.equal(values[0],f.role.name)
      equal(JSON.parse(values[1]),{...f.role.spec,...f.body.result.descriptive})
      if(options.compatError)throw Error('PRIVATE_DB_ERROR_MUST_NOT_ESCAPE')
      return {rows:[{sha:options.compatSha??H({protocol:'agent_feedback_role_candidate_v1',name:values[0],spec:JSON.parse(values[1])})}]}
    }
    throw Error('unexpected_mock_query:'+sql)
  },release(){releases++;throw Error('must_not_release_callers_client')}}
  const install=t=>t.mock.method(AgentReviewSourceRepository.prototype,'prepareOnClient',async function(actualIdentity,actualDb,actualOwner,choice){
    sourceCalls++;events.push({kind:'production_source_call'})
    assert.strictEqual(this.pool,pool);assert.equal(this.evaluationReader,undefined);assert.strictEqual(actualDb,db);assert.strictEqual(actualIdentity,identity);assert.equal(actualOwner,owner)
    assert.equal(locks,lockKeys.length);assert.equal(roleLocked,true);assert.equal(bodyReads,0);equal(choice,f.anchor.choice)
    if(options.sourceError)throw options.sourceError
    return clone(options.prepared??f.prepared)
  })
  return {pool,db,events,install,kernel:new AgentDescriptivePatchSourceRepository(pool),state:()=>({locks,sourceCalls,bodyReads,feedbackReads,compatReads,poolCalls,releases})}
}
async function runMocked(t,f,options={},body=async(h)=>h.kernel.prepareOnClient(identity,h.db,owner,keys())){
  const h=harness(f,options),spy=h.install(t)
  try{return await body(h)}finally{spy.mock.restore();assert.equal(h.state().poolCalls,0);assert.equal(h.state().releases,0)}
}

test('actual production Source method is composed on exactly the caller client after sorted complete540 and role UPDATE',async t=>{
  const f=fixture(),saved=clone(f)
  await runMocked(t,f,{},async h=>{
    const result=await h.kernel.prepareOnClient(identity,h.db,owner,keys())
    equal(h.state(),{locks:3,sourceCalls:1,bodyReads:1,feedbackReads:3,compatReads:1,poolCalls:0,releases:0})
    equal(h.events.filter(e=>e.sql?.includes('pg_advisory_xact_lock')).map(e=>e.values[0]),[10,20,30].map(n=>owner+':'+id(n)))
    const at=pattern=>h.events.findIndex(e=>e.sql?.includes(pattern))
    assert.ok(at('agent_opinion_anchor')<at('pg_advisory_xact_lock'));assert.ok(at('FOR UPDATE')<h.events.findIndex(e=>e.kind==='production_source_call'));assert.ok(h.events.findIndex(e=>e.kind==='production_source_call')<at('agent_opinion_body'))
    equal(result.candidate,{...f.role.spec,goal:all.goal});equal(result.preview.model_patch.provided_keys,['goal']);equal(result.preview.changed_keys,['goal'])
    equal(result.role,f.role);equal(f,saved);equal(parseAgentDescriptivePatchPreview(result.preview,{action:'preview',...keys()}),result.preview)
    assert.notEqual(result.preview.candidate.candidate_sha256,result.optimization_candidate_sha256)
    equal(result.preview.feedback_sources.map(r=>r.run_id),[10,20,30].map(id));assert.equal(result.preview.anchor.run_id,id(10));assert.notEqual(result.preview.anchor.run_id,result.preview.source.target_run_id)
  })
})

test('actual body may provide1..5 keys, explicit empties and unchanged provided fields without fabricating complete output',async t=>{
  const patches=[{goal:all.goal},{task_scope:'',deliverables:[]},{goal:'原目标😀',done_criteria:[]},{goal:all.goal,task_scope:all.task_scope,deliverables:[],task_plan:[]},all]
  for(const patch of patches)await runMocked(t,fixture(patch),{},async h=>{
    const result=await h.kernel.prepareOnClient(identity,h.db,owner,keys()),provided=D.filter(k=>Object.hasOwn(patch,k))
    equal(result.preview.model_patch.provided_keys,provided);equal(result.preview.model_patch.descriptive,patch)
    for(const k of Object.keys(result.role.spec))if(!Object.hasOwn(patch,k))equal(result.candidate[k],result.role.spec[k])
    equal(result.preview.changed_keys,D.filter(k=>canonical(result.role.spec[k])!==canonical(result.candidate[k])))
  })
})

test('distinct target plus all1..8 feedback runs are acquired, including the maximum nine unique540 locks',async t=>{
  for(const runs of [[30],[90,10,80,30,70,40,60,50]]){
    const f=fixture({goal:all.goal},runs)
    await runMocked(t,f,{},async h=>{
      const result=await h.kernel.prepareOnClient(identity,h.db,owner,keys())
      assert.equal(h.state().locks,runs.length+1);assert.equal(h.state().feedbackReads,runs.length)
      equal(h.events.filter(e=>e.sql?.includes('pg_advisory_xact_lock')).map(e=>e.values[0]),[20,...runs].sort((a,b)=>a-b).map(n=>owner+':'+id(n)))
      equal(result.preview.feedback_sources.map(r=>r.run_id),[...runs].sort((a,b)=>a-b).map(id))
    })
  }
})

test('closed three-ID target and Native identity are rejected before any client IO; getters are not invoked',async()=>{
  const h=harness(fixture()),raw=keys();let reads=0
  const accessor={...raw};Object.defineProperty(accessor,'review_id',{enumerable:true,get(){reads++;return id(1)}})
  const hidden={...raw};Object.defineProperty(hidden,'review_id',{enumerable:false,value:id(1)})
  for(const value of [null,[],{},Object.create(raw),accessor,hidden,{...raw,[Symbol('extra')]:true},{...raw,review_id:'bad'},{...raw,action:'preview'},{...raw,owner_user_id:owner},{...raw,result:{}},{...raw,role:fixture().role},{...raw,descriptive:{goal:'client'}},{...raw,selected_keys:['goal']}])await assert.rejects(h.kernel.prepareOnClient(identity,h.db,owner,value),e=>e.status===400)
  for(const bad of [null,{}, {...identity,issuer:'foreign'},{...identity,subject:''},{...identity,subject:7}])await assert.rejects(h.kernel.prepareOnClient(bad,h.db,owner,raw),e=>e.status===403)
  await assert.rejects(h.kernel.prepareOnClient(identity,h.db,'not-an-owner',raw),e=>e.status===400)
  assert.equal(reads,0);assert.equal(h.events.length,0);assert.equal(h.state().poolCalls,0)
})

test('actual admission context and epoch gates fail before anchor/body/resource preparation',async t=>{
  for(const options of [{contextOk:false},{epoch:null},{epoch:undefined},{epoch:0},{epoch:'01'},{epoch:'5.0'},{epoch:true},{epoch:Number.MAX_SAFE_INTEGER}])await runMocked(t,fixture(),options,async h=>{
    await assert.rejects(h.kernel.prepareOnClient(identity,h.db,owner,keys()),e=>e.status===403||unavailable(e))
    assert.equal(h.state().sourceCalls,0);assert.equal(h.state().bodyReads,0);assert.equal(h.events.some(e=>e.sql?.includes('agent_opinion_anchor')),false)
  })
})

test('anchor selection/source/disposition/paid intent and unsupported prior scope fail before any540/body locks',async t=>{
  for(const mutate of [a=>{a.request_id=id(999)},a=>{a.spec_id=id(999)},a=>{a.run_id=id(999)},a=>{a.owner_epoch++},a=>{a.source_protocol='current_task_delivery_v1'},a=>{a.request_sha256=sha('f')},a=>{a.job_state='cancelled';a.choice=null},a=>{a.job_state='erased';a.body_erased=true;a.choice=null},a=>{a.lease_state='paused'},a=>{a.outcome=null;a.choice=null},a=>{a.outcome={status:'failed',completion_sha256:sha('e'),result_sha256:null,failure_code:'synthetic_failed',created_at:'2026-10-27T01:01:00.000Z'};a.choice=null},a=>{a.choice=null},a=>{a.choice.evaluation_sources=[{run_id:id(80),review_id:id(81),result_sha256:sha('e')}]},a=>{a.choice.feedback_sources=[]}]){
    const f=fixture();mutate(f.anchor);await runMocked(t,f,{},async h=>{await assert.rejects(h.kernel.prepareOnClient(identity,h.db,owner,keys()),unavailable);assert.equal(h.state().locks,0);assert.equal(h.state().sourceCalls,0);assert.equal(h.state().bodyReads,0)})
  }
  const f=fixture();f.anchor.purpose='evaluate';f.anchor.source_protocol='current_task_delivery_v1';f.anchor.choice.purpose='evaluate';f.anchor.choice.feedback_sources=[];resealIntent(f)
  await runMocked(t,f,{},async h=>{await assert.rejects(h.kernel.prepareOnClient(identity,h.db,owner,keys()),unavailable);assert.equal(h.state().locks,0)})
  await runMocked(t,fixture(),{anchor:null},async h=>{await assert.rejects(h.kernel.prepareOnClient(identity,h.db,owner,keys()),e=>e.status===404&&e.code==='agent_descriptive_patch_review_not_found');assert.equal(h.state().locks,0)})
  await runMocked(t,fixture(),{missingAnchorRow:true},async h=>assert.rejects(h.kernel.prepareOnClient(identity,h.db,owner,keys()),unavailable))
})

test('only the exact protected058 not-found exception maps to404 before locks or private reads',async t=>{
  const exact=Object.assign(Error('agent_opinion_not_found'),{code:'P0001'})
  const others=[Object.assign(Error('agent_opinion_source_unavailable'),{code:'P0001'}),Object.assign(Error('agent_opinion_not_found'),{code:'XX000'}),Error('agent_opinion_not_found'),Object.assign(Error('agent_opinion_not_found PRIVATE_DB_DETAIL'),{code:'P0001'})]
  for(const error of [exact,...others])await runMocked(t,fixture(),{anchorError:error},async h=>{
    await assert.rejects(h.kernel.prepareOnClient(identity,h.db,owner,keys()),error===exact
      ?e=>e.status===404&&e.code==='agent_descriptive_patch_review_not_found'&&e.message===e.code
      :unavailable)
    const state=h.state();assert.equal(state.locks,0);assert.equal(state.sourceCalls,0);assert.equal(state.bodyReads,0);assert.equal(state.feedbackReads,0);assert.equal(state.compatReads,0)
  })
})

test('missing/wrong terminal target, unsafe role and stale exact revision refuse before real Source/body preparation',async t=>{
  for(const options of [{task:null},{task:{id:id(999)}},{role:null}])await runMocked(t,fixture(),options,async h=>{await assert.rejects(h.kernel.prepareOnClient(identity,h.db,owner,keys()),unavailable);assert.equal(h.state().sourceCalls,0);assert.equal(h.state().bodyReads,0)})
  for(const mutate of [r=>{r.id=id(999)},r=>{r.requires_approval=false},r=>{r.spec.require_approval=false},r=>{r.spec.tools.push('summarize')},r=>{r.spec.goal=' trimmed '},r=>{r.spec.secret='forbidden'}]){
    const f=fixture(),role=clone(f.role);mutate(role);await runMocked(t,f,{role},async h=>{await assert.rejects(h.kernel.prepareOnClient(identity,h.db,owner,keys()),unavailable);assert.equal(h.state().sourceCalls,0)})
  }
  for(const patch of [{revision:42},{source_sha256:sha('f')}]){const f=fixture();await runMocked(t,f,{role:{...f.role,...patch}},async h=>{await assert.rejects(h.kernel.prepareOnClient(identity,h.db,owner,keys()),code('agent_descriptive_patch_role_changed'));assert.equal(h.state().sourceCalls,0)})}
})

test('existing real Source refusal and every prepared epoch/source/input/content/choice mismatch stop before private output',async t=>{
  for(const reason of ['agent_review_source_schema_required','agent_review_model_unavailable','agent_review_feedback_changed','agent_review_source_unavailable','agent_review_evaluation_source_unavailable'])await runMocked(t,fixture(),{sourceError:new HttpError(409,reason)},async h=>{await assert.rejects(h.kernel.prepareOnClient(identity,h.db,owner,keys()),unavailable);assert.equal(h.state().sourceCalls,1);assert.equal(h.state().bodyReads,0)})
  for(const mutate of [p=>{p.owner_epoch++},p=>{p.source_protocol='current_task_delivery_v1'},p=>{p.input_sha256=sha('f')},p=>{p.content_sha256=sha('f')},p=>{p.choice.expected_source_sha256=sha('f')},p=>{p.choice.model_binding.connection_revision++},p=>{p.choice.feedback_sources.reverse()}]){
    const f=fixture(),prepared=clone(f.prepared);mutate(prepared);await runMocked(t,f,{prepared},async h=>{await assert.rejects(h.kernel.prepareOnClient(identity,h.db,owner,keys()),unavailable);assert.equal(h.state().bodyReads,0)})
  }
  await runMocked(t,fixture(),{sourceError:new HttpError(403,'owned_admission_context_required')},async h=>assert.rejects(h.kernel.prepareOnClient(identity,h.db,owner,keys()),e=>e.status===403&&e.code==='owned_admission_context_required'))
})

test('unstubbed production Source actually rechecks mapped Native identity on the supplied client',async()=>{
  const h=harness(fixture(),{mappedOwner:id(999)})
  await assert.rejects(h.kernel.prepareOnClient(identity,h.db,owner,keys()),e=>e.status===403&&e.code==='owned_admission_context_required')
  assert.ok(h.events.some(e=>e.sql==='SELECT agentstudio.identity_user_id($1::text,$2::text) AS id'))
  assert.equal(h.state().locks,3);assert.equal(h.state().bodyReads,0);assert.equal(h.state().poolCalls,0);assert.equal(h.state().releases,0)
})

test('protected058 body identity/result digest and actual model shape are mandatory; missing fields are never read from a caller result',async t=>{
  for(const mutate of [b=>{b.request_id=id(999)},b=>{b.purpose='evaluate'},b=>{b.input_sha256=sha('f')},b=>{b.result_sha256=sha('f')},b=>{b.result.descriptive.goal='swapped'},b=>{b.result.descriptive.tools=[]},b=>{b.result.descriptive={}},b=>{b.result.rationale=' unnormalized '}]){
    const f=fixture(),body=clone(f.body);mutate(body);await runMocked(t,f,{body},async h=>{await assert.rejects(h.kernel.prepareOnClient(identity,h.db,owner,keys()),unavailable);assert.equal(h.state().feedbackReads,0)})
  }
  await runMocked(t,fixture(),{body:null},async h=>assert.rejects(h.kernel.prepareOnClient(identity,h.db,owner,keys()),unavailable))
  // A different valid result digest is still not the bound anchor outcome.
  const f=fixture(),body=clone(f.body);body.result.descriptive={task_scope:'other result'};body.result_sha256=agentAssessmentOutputHash(body.request_id,body.purpose,body.input_sha256,body.result)
  await runMocked(t,f,{body},async h=>assert.rejects(h.kernel.prepareOnClient(identity,h.db,owner,keys()),unavailable))
})

test('all current feedback metadata and old055 compatibility digest must agree; new candidate domain is not055 authority',async t=>{
  await runMocked(t,fixture(),{feedback:()=>null},async h=>{await assert.rejects(h.kernel.prepareOnClient(identity,h.db,owner,keys()),code('agent_descriptive_patch_feedback_changed'));assert.equal(h.state().compatReads,0)})
  for(const mutate of [r=>{r.run_id=id(999)},r=>{r.feedback_id=id(999)},r=>{r.feedback_sha256=sha('f')},r=>{r.feedback_revision='1.5'},r=>{r.statement_sha256='bad'},r=>{r.raw_comment='never copied'}]){
    const f=fixture();await runMocked(t,f,{feedback:s=>{const r=clone(f.refs.find(r=>r.feedback_id===s.feedback_id));mutate(r);return r}},async h=>assert.rejects(h.kernel.prepareOnClient(identity,h.db,owner,keys()),unavailable))
  }
  const f=fixture(),newSha=deriveAgentDescriptivePatchCandidate(f.role.name,f.role.spec,f.body.result).candidate_sha256
  for(const options of [{compatSha:sha('f')},{compatSha:newSha},{compatError:true}])await runMocked(t,fixture(),options,async h=>{await assert.rejects(h.kernel.prepareOnClient(identity,h.db,owner,keys()),unavailable);assert.equal(h.state().compatReads,1)})
})

test('public projection exposes no prepared messages/full resources/private body and return values are detached',async t=>{
  const f=fixture({goal:all.goal,deliverables:[]}),saved=clone(f)
  await runMocked(t,f,{},async h=>{
    const result=await h.kernel.prepareOnClient(identity,h.db,owner,keys()),publicJson=JSON.stringify(result.preview)
    assert.doesNotMatch(publicJson,/PRIVATE_FEEDBACK_MATERIAL|PRIVATE_RATIONALE|PRIVATE_TOOLS_NOTE|messages|model_binding|http_tools|mcp_tools|knowledge_retrieval|optimization_candidate_sha256/)
    assert.equal(publicJson.includes(id(42)),false);equal(Object.keys(result),['preview','role','candidate','optimization_candidate_sha256']);assert.equal(result.preview.recorded,false)
    result.candidate.http_tools[0].description='caller changed';result.preview.feedback_sources[0].feedback_revision=99;result.role.spec.deliverables.push('caller')
    equal(f,saved);assert.equal(h.events.some(e=>e.sql?.includes('agent_generated_accept')),false)
  })
})

test('all-no-op actual patch stays unaccepted and cannot become a valid fresh preview',async t=>{
  await runMocked(t,fixture({goal:'原目标😀'}),{},async h=>{
    await assert.rejects(h.kernel.prepareOnClient(identity,h.db,owner,keys()),code('agent_descriptive_patch_change_required'))
    assert.equal(h.state().compatReads,0);assert.equal(h.state().poolCalls,0)
  })
})
