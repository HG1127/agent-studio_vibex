import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {originalRunKinds,originalRunDetailTarget,originalRunDetailHref} from '../src/lib/originalRunDetailRoute.ts'
import {projectOriginalRunDetail,originalPublicSteps,originalRunDetailReport} from '../src/lib/originalRunDetailProjection.ts'
import {createOriginalRunDetailSession,originalDetailPending} from '../src/lib/originalRunDetailSession.ts'
import {originalRunDetailApiRoute,createOriginalRunDetailTransport} from '../src/lib/originalRunDetailTransport.ts'
import {PgNativePilotError,createPgNativePilotApi} from '../src/lib/pgNativePilotApi.ts'
const employee='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',id='11111111-1111-4111-8111-111111111111',resource='22222222-2222-4222-8222-222222222222',operation='33333333-3333-4333-8333-333333333333',hash='a'.repeat(64),time='2026-10-30T12:00:00.000Z'
const names={agent_single:'getRun',workflow_safe:'getWorkflowRun',workflow_v2:'getWorkflowV2Run',agent_autonomous:'getAutonomousAgentRun'}
const step={step_key:'wf2_00001_start',status:'succeeded',metadata:{node_id:'start',node_type:'start',raw_prompt:'PRIVATE_PROMPT',provider_response:'PRIVATE_RESPONSE',agent_phase:'model',agent_round:1}}
function fixture(kind,overrides={}){
 const agent=kind.startsWith('agent'),run={id,owner_user_id:employee,kind:agent?'agent':'workflow',...(agent?{agent_spec_id:resource,...(kind==='agent_autonomous'?{workflow_id:null}:{})}:{workflow_id:resource}),status:'running',instruction:'PRIVATE_INSTRUCTION',result_text:'PRIVATE_RESULT',step_count:1,last_error_code:'',created_at:time,updated_at:time,finished_at:null,checkpoint:{[agent?'spec_revision':'workflow_revision']:1,...(kind==='agent_autonomous'?{execution_mode:'agent_native_v2',max_steps:3}:{})}}
 return{run,steps:[structuredClone(step)],approval:null,approvals:[],pending_effect:null,steps_truncated:false,replayed:false,...(kind==='agent_single'?{}:{execution_mode:kind==='agent_autonomous'?'agent_native_v2':kind==='workflow_v2'?'workflow_native_v2':'start_end_only'}),...(kind==='agent_autonomous'?{run_control:{state_sha256:hash,manually_paused:false,in_flight:false,outcome_unknown:false,can_pause:true,can_resume:false}}:{}),...overrides}
}
function apiFor(kind,raw=fixture(kind)){
 const calls=[],api={getConfigCapabilities:async()=>({mode:'native_pg18',config_writes_enabled:true,autonomous_agent_submission_enabled:true,agent_feedback_available:false}),getWorkflowV2Outputs:async()=>{throw new PgNativePilotError(503,'not_available')},listRuns:async()=>[],listWorkflowRuns:async()=>[],listWorkflowV2Runs:async()=>[],listAutonomousAgentRuns:async()=>[],getWorkflowV2Steps:async()=>({items:[step],next_after:null}),getAutonomousAgentSteps:async()=>({items:[step],next_after:null}),controlAutonomousAgentRun:async()=>{throw Error('unconfigured control')},confirmAutonomousAgentRunControl:async()=>{throw Error('unconfigured confirm')},cancelAutonomousAgentRun:async()=>{throw Error('unconfigured cancel')},cancelWorkflowV2Run:async()=>{throw Error('unconfigured cancel')},getAgentFeedback:async()=>{throw Error('unexpected feedback')}}
 for(const [k,name]of Object.entries(names))api[name]=async request=>{calls.push({kind:k,id:request});if(k!==kind)throw new PgNativePilotError(404,'not_found');return structuredClone(raw)}
 return{api,calls}
}
function session(kind,raw=fixture(kind),extra={}){const {api,calls}=apiFor(kind,raw),controller=createOriginalRunDetailSession({employee,api,verifyEmployee:async()=>employee,key:()=>operation,...extra});return{controller,api,calls}}
test('actual detail Native default8s abort settles busy before recovery; negative confirmation preserves exact original operation and state hash',async()=>{
 const raw=fixture('agent_autonomous');raw.run.status='queued';let saved,posts=0,sent=null,signal,aborted=false
 const f=session('agent_autonomous',raw,{recovery:{load:()=>null,save:p=>{saved=p}}})
 const t=createOriginalRunDetailTransport({employeeId:employee,verifyEmployee:async()=>employee,transport:async(_url,init)=>{posts++;sent=JSON.parse(init.body);signal=init.signal;return new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('actual transport abort','AbortError'))},{once:true})})}})
 const actual=createPgNativePilotApi(t.transport);f.api.controlAutonomousAgentRun=(id,action,body)=>actual.controlAutonomousAgentRun(id,action,body)
 try{
  await f.controller.select({id,kind:'agent_autonomous'});const started=Date.now(),pending=f.controller.control('pause')
  for(let n=0;!signal&&n<100;n++)await new Promise(resolve=>setImmediate(resolve))
  assert(signal);assert.equal(f.controller.snapshot().busy,true);const original=f.controller.snapshot().pending;assert.deepEqual(sent,original.body);assert.deepEqual(saved,original);assert.equal(aborted,false)
  await pending;assert(Date.now()-started>=7900,'default Native8s remains active until its actual timer abort');assert.equal(aborted,true);assert.equal(f.controller.snapshot().busy,false);assert.deepEqual(f.controller.snapshot().pending,original)
  let confirms=0;f.api.confirmAutonomousAgentRunControl=async(target,action,body)=>{confirms++;assert.equal(target,id);assert.equal(action,'pause');assert.deepEqual(body,original.body);return{...structuredClone(raw),control_confirmed:false,run_control_confirmation:null}}
  await f.controller.confirmPending();assert.equal(posts,1);assert.equal(confirms,1);assert.deepEqual(f.controller.snapshot().pending,original);assert.deepEqual(saved,original);assert.equal(f.controller.snapshot().run,null);assert(f.controller.snapshot().notice.includes('原事务可能仍在完成'))
 }finally{t.close();f.controller.dispose()}
})
