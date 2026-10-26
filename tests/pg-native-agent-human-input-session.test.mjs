import test from 'node:test'
import assert from 'node:assert/strict'
import {createPgNativeAutonomousAgentSession} from '../src/lib/pgNativeAutonomousAgentSession.ts'
import {createPgNativePilotApi,PgNativePilotError} from '../src/lib/pgNativePilotApi.ts'
import {agentHumanReceipt,agentHumanProjection,agentHumanHistory} from '../src/lib/pgNativeAgentHumanInput.ts'
const run='11111111-1111-4111-8111-111111111111',agent='22222222-2222-4222-8222-222222222222',request='33333333-3333-4333-8333-333333333333'
const pending={pending_step_key:'wf2_00002_agent_a01m_input',pending_sha256:'a'.repeat(64),source_sha256:'b'.repeat(64),kind:'clarification',question:'Which deadline?',draft:'',round:1}
const detail=()=>({execution_mode:'agent_native_v2',replayed:false,run:{id:run,agent_spec_id:agent,workflow_id:null,kind:'agent',instruction:'Owned task',status:'awaiting_input',result_text:'',checkpoint:{spec_revision:1,max_steps:3}},
  approvals:[],steps:[],pending_effect:null,human_input_current:true,human_input:{...pending}})
const receipt=(choice,replayed=false)=>({run_id:run,request_id:choice.request_id,pending_step_key:choice.pending_step_key,pending_sha256:choice.pending_sha256,source_sha256:choice.source_sha256,decision:choice.decision,recorded:true,status:'queued',replayed})
const choice={request_id:request,pending_step_key:pending.pending_step_key,pending_sha256:pending.pending_sha256,source_sha256:pending.source_sha256,decision:'reply',answer:'Owned deadline',confirm:true}
async function opened(changes={}){
  let current=detail(),responses=0,confirmations=0,cancels=0,submissions=0
  const api={listAutonomousAgentRuns:async()=>[],getAutonomousAgentRun:async()=>current,submitAutonomousAgentRun:async()=>{submissions++;throw Error('unexpected submit')},
    decideAutonomousAgentNode:async()=>{throw Error('no fee approval')},cancelAutonomousAgentRun:async()=>{cancels++;throw Error('unexpected cancel')},
    respondAutonomousAgent:async(id,body)=>{responses++;assert.equal(id,run);current={...current,run:{...current.run,status:'queued'},human_input_current:false,human_input:null};return receipt(body)},
    confirmAutonomousAgentResponse:async(id,body)=>{confirmations++;assert.equal(id,run);return receipt(body,true)},...changes}
  const model=createPgNativeAutonomousAgentSession(api,{responseKey:()=>request});model.setActive(true);await model.refresh();await model.select(run)
  return {api,model,set:value=>{current=value},calls:()=>({responses,confirmations,cancels,submissions})}
}
test('lost owner reply keeps one immutable original request across navigation; recovery only reads the receipt and never approves a next model',async()=>{
  const f=await opened(),original=f.api.respondAutonomousAgent
  f.api.respondAutonomousAgent=async(...args)=>{await original(...args);throw new PgNativePilotError(0,'synthetic_committed_reply_lost')}
  await f.model.respond('reply','Owned deadline',false);assert.equal(f.calls().responses,0)
  await f.model.respond('approve','',true);assert.equal(f.calls().responses,0)
  await f.model.respond('reply','Owned deadline',true)
  const frozen=f.model.snapshot().pendingHumanResponse;assert.deepEqual(frozen,{runId:run,choice})
  assert.equal(Object.isFrozen(frozen.choice),true)
  await f.model.respond('reply','Must not replace the original',true);await f.model.cancel();await f.model.submit({agentId:agent,revision:1,instruction:'Another task',maxSteps:3})
  assert.deepEqual(f.calls(),{responses:1,confirmations:0,cancels:0,submissions:0})
  f.model.setActive(false);assert.equal(f.model.snapshot().detail,null);assert.equal(f.model.snapshot().pendingHumanResponse,frozen)
  f.model.setActive(true);await f.model.refresh();assert.equal(f.model.snapshot().pendingHumanResponse,frozen)
  await f.model.retryHumanResponse();assert.equal(f.model.snapshot().pendingHumanResponse,null)
  assert.deepEqual(f.calls(),{responses:1,confirmations:1,cancels:0,submissions:0});assert.equal(f.model.snapshot().detail.run.status,'queued')
  f.model.dispose();assert.equal(f.model.snapshot().detail,null);assert.equal(f.model.snapshot().pendingHumanResponse,null)
})
test('a missing original receipt clears the uncertain reply without submitting it; mismatched acknowledgements stay uncertain and logout destroys private text',async()=>{
  const f=await opened({respondAutonomousAgent:async()=>receipt({...choice,pending_sha256:'c'.repeat(64)})})
  await f.model.respond('reply','Owned deadline',true);assert.ok(f.model.snapshot().pendingHumanResponse)
  f.api.confirmAutonomousAgentResponse=async()=>{throw new PgNativePilotError(404,'agent_human_response_not_found')}
  await f.model.retryHumanResponse();assert.equal(f.model.snapshot().pendingHumanResponse,null);assert.equal(f.model.snapshot().detail.run.status,'awaiting_input')
  await f.model.respond('reply','Owned deadline',true)
  f.api.confirmAutonomousAgentResponse=async()=>{throw new PgNativePilotError(401,'expired')}
  await f.model.retryHumanResponse();assert.equal(f.model.snapshot().pendingHumanResponse,null);assert.equal(f.model.snapshot().detail,null)
  assert.equal(JSON.stringify(f.model.snapshot()).includes('Owned deadline'),false)
})
test('SDK binds minimal owner receipt, same-origin CSRF and exact pending projection; confirmation cannot accept a newly applied response',async()=>{
  const seen=[];let result=receipt(choice)
  const api=createPgNativePilotApi(async(path,options)=>{seen.push({path,options});return new Response(JSON.stringify(result),{status:200})},'')
  assert.equal((await api.respondAutonomousAgent(run,choice)).recorded,true)
  assert.equal(seen[0].path,'/api/v2/agent-autonomous-runs/'+run+'/respond')
  assert.equal(seen[0].options.credentials,'same-origin');assert.equal(seen[0].options.headers['X-AgentStudio-Request'],'1')
  for(const altered of [{run_id:agent},{request_id:agent},{pending_step_key:'wf2_00002_agent_a02m_input'},{pending_sha256:'c'.repeat(64)},{source_sha256:'c'.repeat(64)},{decision:'approve'},{status:'succeeded'},{recorded:false},{replayed:1},{private_answer:'Unexpected private echo'}])
    assert.throws(()=>agentHumanReceipt({...result,...altered},run,choice))
  await assert.rejects(api.confirmAutonomousAgentResponse(run,choice),e=>e.code==='unconfirmed_agent_human_response')
  result=receipt(choice,true);assert.equal((await api.confirmAutonomousAgentResponse(run,choice)).replayed,true)
  assert.equal(seen.at(-1).path,'/api/v2/agent-autonomous-runs/'+run+'/respond-confirm')
  const before=seen.length
  await assert.rejects(api.respondAutonomousAgent(run,{...choice,owner_user_id:agent}),e=>e.status===400);assert.equal(seen.length,before)
  assert.equal(agentHumanProjection(detail()).human_input.question,pending.question)
  for(const altered of [{human_input_current:false},{human_input:null},{pending_effect:{}},{human_input:{...pending,kind:'approve'}},{human_input:{...pending,question:''}},{human_input:{...pending,private_checkpoint:{}}}])
    assert.throws(()=>agentHumanProjection({...detail(),...altered}))
  assert.throws(()=>agentHumanProjection({run:{status:'awaiting_input'},pending_effect:null}))
})
test('editing owner role goal, knowledge, model, HTTP or MCP bindings preserves explicit plan-review settings without inserting a default into old roles',async()=>{
  let flag=true;const written=[]
  const api=createPgNativePilotApi(async(path,options)=>{
    const old={id:agent,name:'Owner role',revision:1,spec:{goal:'Owned goal',task_scope:'Owner scope',tools:[],...(flag===undefined?{}:{require_plan_review:flag})}}
    if(options.method==='GET')return new Response(JSON.stringify({item:old}),{status:200})
    const body=JSON.parse(options.body);written.push(body.spec)
    return new Response(JSON.stringify({item:{...old,spec:body.spec,revision:2}}),{status:200})
  },'')
  for(const value of [true,false,undefined]){
    flag=value
    await api.updateAgent(agent,1,'Owner role','Changed goal')
    await api.updateAgentKnowledgeBases(agent,1,[])
    await api.bindAgentModel(agent,1,null)
    await api.updateAgentHttpTools(agent,1,[])
    await api.updateAgentMcpTools(agent,1,[])
    for(const spec of written.splice(0)){
      assert.equal(spec.require_plan_review,value);assert.equal(Object.hasOwn(spec,'require_plan_review'),value!==undefined)
    }
  }
})
test('owner human history validates exact run, private content boundaries and page cursors without granting a response or accepting hidden provider journals',async()=>{
  const item={request_id:request,step_key:pending.pending_step_key,parent_step_key:'wf2_00002_agent',node_id:'agent',node_title:'Owner role',kind:'clarification',question:'Which deadline?',draft:'',round:1,decision:'reply',answer:'Owned deadline'}
  const page={run_id:run,available:true,items:[item],next_after:item.step_key}
  assert.equal(agentHumanHistory(page,run,'',1).items[0].answer,'Owned deadline')
  for(const change of [{run_id:agent},{available:false},{next_after:'wf2_00002_agent_a02m_input'},{items:[item,item]},{items:[{...item,round:2}]},{items:[{...item,decision:'approve'}]},{items:[{...item,private_model_results:[]}]},{items:[{...item,answer:'x'.repeat(1601)}]}])
    assert.throws(()=>agentHumanHistory({...page,...change},run,'',1))
  assert.throws(()=>agentHumanHistory(page,run,item.step_key,1))
  const seen=[];const api=createPgNativePilotApi(async(path,options)=>{seen.push({path,options});return new Response(JSON.stringify(page),{status:200})},'')
  assert.equal((await api.getAutonomousAgentHumanHistory(run,'',1)).items.length,1)
  assert.equal(seen[0].options.method,'GET');assert.equal(seen[0].options.body,undefined)
  await assert.rejects(api.getAutonomousAgentHumanHistory(run,'',21),e=>e.status===400);assert.equal(seen.length,1)
})
