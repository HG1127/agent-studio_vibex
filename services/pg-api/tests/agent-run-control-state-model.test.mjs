// Actual candidate function/class bodies in state models; no PostgreSQL,
// Native identity or provider result is fabricated as genuine test evidence.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
import * as actualControlData from '../src/agent-run-control.ts'
import * as actualResumeAdmission from '../src/agent-run-control-admission.ts'
import {ownOperationsGuardSql as actualResumeGuardSql} from '../src/own-operations-repository.ts'
import * as actualControlFront from '../../../src/lib/pgNativeAgentRunControl.ts'
import {AutonomousAgentRunRepository as ActualAutonomousRepository} from '../src/autonomous-agent-run-repository.ts'
import {WorkflowV2Worker as ActualWorkflowWorker} from '../src/workflow-v2-worker.ts'
import {createPgNativeDurableRunSession as actualDurableSession} from '../../../src/lib/pgNativeDurableRunSession.ts'
import {PgNativePilotError as ActualPilotError} from '../../../src/lib/pgNativePilotApi.ts'
import {createRequire} from 'node:module'
import * as crypto from 'node:crypto'
import {pathToFileURL,fileURLToPath} from 'node:url'
import path from 'node:path'
const H=path.resolve(fileURLToPath(new URL('../../../',import.meta.url))),ts=createRequire(import.meta.url)('typescript'),source=target=>fs.readFileSync(path.join(H,target),'utf8'),contracts=await import(pathToFileURL(path.join(H,'services/pg-api/src/contracts.ts')).href)
const js=text=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
function load(text,modules={},globals={}){const exports={};return Function('exports','require',...Object.keys(globals),js(text)+'\nreturn exports')(exports,name=>{if(!Object.hasOwn(modules,name))throw Error('unexpected import '+name);return modules[name]},...Object.values(globals))}
const data=actualControlData,front=actualControlFront
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',runId='00000000-0000-4000-8000-000000000003',op='00000000-0000-4000-8000-000000000004',jobId='00000000-0000-4000-8000-000000000005',token='00000000-0000-4000-8000-000000000006'
function repoModel(options={}){
 let row={id:runId,owner_user_id:owner,kind:'agent',status:options.paused?'paused':'running',instruction:'original task',checkpoint:{execution_mode:'agent_native_v2',stage:'agent_v2_effect_started',graph:{nodes:[]},machine:{cursor:3,graph_sha256:'c'.repeat(64)},...(options.paused?{manual_pause:{operation_id:op,return_status:options.returnStatus??'queued'}}:{})},last_error_code:'',result_text:''},job={id:jobId,status:options.paused?'queued':'leased',lease_token:options.paused?null:token,attempts:0,max_attempts:30,lease_version:7},effects=options.effects??[],receipts=[],trace=[]
 const db={async query(sql,args=[]){trace.push(sql)
  if(sql.startsWith('SELECT pg_advisory'))return {rows:[]}
  if(sql.startsWith('SELECT id,status,lease_token'))return {rows:args[1]===owner?[structuredClone(job)]:[]}
  if(sql.startsWith('SELECT id,owner_user_id'))return {rows:args[1]===owner?[structuredClone(row)]:[]}
  if(sql.startsWith('SELECT metadata FROM'))return {rows:receipts.filter(v=>v.operation_id===args[1]).map(metadata=>({metadata}))}
  if(sql.startsWith('SELECT status FROM agentstudio.external_effects'))return {rows:effects.map(status=>({status}))}
  if(sql.startsWith('UPDATE agentstudio.jobs')){job={...job,status:'queued',lease_token:null,lease_version:job.lease_version+1};return {rows:[{id:job.id}]}}
  if(sql===actualResumeGuardSql)return {rows:[{ok:!options.badResumeGuard}]}
  if(sql==='SELECT agentstudio.agent_memory_outcome_epoch() AS epoch')return {rows:[{epoch:options.disabled?null:'1'}]}
  if(sql.startsWith('SELECT status FROM agentstudio.users'))throw Object.assign(Error('original users row-lock privilege refusal'),{code:'42501'})
  if(sql.startsWith('SELECT status,reason_code')||sql.startsWith('SELECT a.status,a.reason_code'))return {rows:options.approval?[options.approval]:[]}
  if(sql.startsWith('UPDATE agentstudio.runs')){row={...row,status:args[2],checkpoint:JSON.parse(args[3]),last_error_code:args[4]};return {rows:[structuredClone(row)]}}
  throw Error('unexpected model SQL '+sql)
 }}
 let tail=Promise.resolve()
 const withActor=async(_pool,identity,body)=>{const wait=tail;let release;tail=new Promise(done=>{release=done});await wait;const before={row:structuredClone(row),job:structuredClone(job),receipts:structuredClone(receipts)};try{return await body(db,identity.subject)}catch(error){row=before.row;job=before.job;receipts.splice(0,receipts.length,...before.receipts);throw error}finally{release()}}
 class Parent{constructor(pool,_mode,opts={}){this.pool=pool;this.allowHumanInput=opts.allowHumanInput===true}async checkMcpAdmission(){trace.push('CHECK_MCP');if(options.mcpFail)throw new contracts.HttpError(409,'mcp_execution_not_enabled')}async assemble(_db,_owner,value,replayed){return {run:structuredClone(value),replayed,run_control:{state_sha256:data.agentRunControlStateHash(value)}}}}
 const modules={'./contracts.ts':contracts,'./repository.ts':{withActor,assertOwnedAdmissionContext:async()=>trace.push('OWNED_CONTEXT')},'./workflow-v2-run-repository.ts':{WorkflowV2RunRepository:Parent,workflowV2RunColumns:'id,owner_user_id,checkpoint',checkedWorkflowV2StoredState:value=>structuredClone(value),workflowV2ExecutionRequest:()=>options.pending??null,verifyWorkflowV2Snapshot:async()=>{trace.push('VERIFY_FULL_SOURCE_RESOURCES');if(options.sourceFail)throw new contracts.HttpError(409,'agent_revision_changed')},auditWorkflowV2:async(_db,_owner,_id,_action,value)=>{trace.push('AUDIT');receipts.push(structuredClone(value))}},'./workflow-v2-machine.ts':{inspectWorkflowV2Checkpoint:()=>({pending:null})},'./autonomous-agent-graph.ts':{},'node:crypto':crypto,'./agent-run-control.ts':data,'./knowledge-observation-policy.ts':{currentKnowledgeObservations:async()=>{trace.push('VERIFY_KNOWLEDGE');return !options.knowledgeFail}},'./agent-run-control-admission.ts':actualResumeAdmission,'./agent-human-input-policy.ts':{agentHumanContext:()=>options.humanPending?{pending_input:{question:'original pending question'}}:null},'./agent-memory-context-policy.ts':{},'./agent-memory-context.ts':{},'./agent-memory-outcome-contract.ts':{},'./agent-memory-outcome-repository.ts':{AgentMemoryOutcomeRepository:class{async hasOwned(){return false}}}}
 const globals=Object.fromEntries(Object.entries(Object.assign({},...Object.values(modules))).filter(([name])=>name!=='default')),names=Object.keys(globals),method=ActualAutonomousRepository.prototype.runControl.toString().replace(/^async runControl\(/,'async function runControl('),probe=Function(...names,method+'\nreturn runControl')(...Object.values(globals)),repo=new ActualAutonomousRepository({},{}),body=()=>({operation_id:op,expected_state_sha256:data.agentRunControlStateHash(row)})
 repo.runControl=probe;repo.assemble=Parent.prototype.assemble;repo.checkMcpAdmission=Parent.prototype.checkMcpAdmission
 return {repo,body,trace,receipts,row:()=>row,job:()=>job,identity:{issuer:'synthetic-state-model',subject:owner},foreign:{issuer:'synthetic-state-model',subject:other}}
}
test('closed request/pause fields reject forged callbacks, inherited fields, symbols and invalid operation identities',()=>{
 const request={operation_id:op,expected_state_sha256:'a'.repeat(64)};assert.equal(data.safeAgentRunControlRequest(request).operation_id,op)
 for(const raw of [{...request,force:true},{...request,operation_id:'x'},Object.create(request),{...request,[Symbol('x')]:1}])assert.throws(()=>data.safeAgentRunControlRequest(raw))
 let reads=0;const getter={expected_state_sha256:request.expected_state_sha256};Object.defineProperty(getter,'operation_id',{enumerable:true,get(){reads++;return op}});assert.throws(()=>data.safeAgentRunControlRequest(getter));assert.equal(reads,0)
 assert.throws(()=>data.checkedAgentRunPause({operation_id:op,return_status:'running'}));assert.equal(Object.isFrozen(data.checkedAgentRunPause({operation_id:op,return_status:'queued'})),true)
})
test('state hash is stable across JSONB key order and binds checkpoint, status and unknown error state',()=>{
 const row={id:runId,status:'paused',last_error_code:'',checkpoint:{b:2,a:{z:1,x:2}}},same={...row,checkpoint:{a:{x:2,z:1},b:2}};assert.equal(data.agentRunControlStateHash(row),data.agentRunControlStateHash(same))
 for(const changed of [{...row,status:'queued'},{...row,last_error_code:'unknown'},{...row,checkpoint:{...row.checkpoint,manual_pause:{operation_id:op,return_status:'queued'}}}])assert.notEqual(data.agentRunControlStateHash(changed),data.agentRunControlStateHash(row))
})
test('pause after committed started effect retains original lease and checkpoint; no external executor or effect replay path exists',async()=>{
 const m=repoModel({effects:['started']}),lease=m.job().lease_token,out=await m.repo.changeRunControl(m.identity,runId,'pause',m.body());assert.equal(out.run.status,'paused');assert.equal(m.job().lease_token,lease);assert.equal(m.trace.some(sql=>sql.startsWith('UPDATE agentstudio.jobs')),false);assert.equal(m.row().checkpoint.machine.cursor,3);assert.equal(m.receipts.length,1);assert.ok(m.trace.findIndex(s=>s.startsWith('SELECT id,status'))<m.trace.findIndex(s=>s.startsWith('SELECT id,owner')))
})
test('pause before an effect revokes the unstarted lease and version; same-operation doubleclick writes one receipt',async()=>{
 const m=repoModel(),body=m.body(),out=await Promise.all([m.repo.changeRunControl(m.identity,runId,'pause',body),m.repo.changeRunControl(m.identity,runId,'pause',body)]);assert.equal(m.job().lease_token,null);assert.equal(m.job().lease_version,8);assert.equal(m.receipts.length,1);assert.deepEqual(out.map(x=>x.replayed),[false,true]);assert.equal(out[0].run.id,runId)
 await assert.rejects(m.repo.changeRunControl(m.identity,runId,'resume',body),e=>e.code==='agent_run_control_operation_conflict')
})
test('lost-ACK confirmation is read-only, returns exact original receipt and never applies a missing intent',async()=>{
 const m=repoModel(),body=m.body();await m.repo.changeRunControl(m.identity,runId,'pause',body);const count=m.trace.length,out=await m.repo.confirmRunControl(m.identity,runId,'pause',body);assert.equal(out.control_confirmed,true);assert.equal(out.run_control_confirmation.operation_id,op);assert.equal(m.trace.slice(count).some(s=>s.startsWith('UPDATE')),false)
 const empty=repoModel(),before=empty.row(),r=await empty.repo.confirmRunControl(empty.identity,runId,'pause',empty.body());assert.equal(r.control_confirmed,false);assert.equal(empty.row(),before);assert.equal(empty.receipts.length,0)
})
test('owner and expected-state mismatch refuse before any durable change',async()=>{
 const m=repoModel();await assert.rejects(m.repo.changeRunControl(m.foreign,runId,'pause',m.body()),e=>e.status===404);await assert.rejects(m.repo.changeRunControl(m.identity,runId,'pause',{...m.body(),expected_state_sha256:'0'.repeat(64)}),e=>e.code==='agent_run_control_state_changed');assert.equal(m.row().status,'running');assert.equal(m.receipts.length,0)
})
test('resume keeps same run and machine; fresh governance, source/resources and all knowledge checks precede queue admission',async()=>{
 const m=repoModel({paused:true}),out=await m.repo.changeRunControl(m.identity,runId,'resume',m.body());assert.equal(out.run.id,runId);assert.equal(out.run.status,'queued');assert.equal(out.run.checkpoint.machine.cursor,3);assert.equal(out.run.checkpoint.manual_pause,undefined);for(const guard of ['CHECK_MCP','VERIFY_FULL_SOURCE_RESOURCES','VERIFY_KNOWLEDGE'])assert.ok(m.trace.indexOf(guard)<m.trace.findIndex(s=>s.startsWith('UPDATE agentstudio.runs')));assert.equal(m.trace.some(s=>s.startsWith('INSERT INTO agentstudio.runs')),false)
})
test('started or unknown effects, disabled employee, stale source, revoked knowledge and missing current runtime permissions prevent resume',async()=>{
 for(const options of [{effects:['started']},{effects:['unknown']},{disabled:true},{sourceFail:true},{knowledgeFail:true},{mcpFail:true}]){const m=repoModel({paused:true,...options});await assert.rejects(m.repo.changeRunControl(m.identity,runId,'resume',m.body()));assert.equal(m.row().status,'paused');assert.equal(m.receipts.length,0);assert.equal(m.trace.some(s=>s.startsWith('UPDATE agentstudio.runs')),false)}
})
function method(name){return ActualWorkflowWorker.prototype[name].toString().replace(new RegExp('^async '+name+'\\('),'async function '+name+'(')}
async function workerFinish({unknown=false,knownFailure=false,agent=true}={}){
 const trace=[],state={manual_pause:{operation_id:op,return_status:'queued'},graph:{},machine:{cursor:4},agent_state:{round:1},agent_dispatch:{}},request={kind:'model',step_key:'wf2_00002_agent_a01m',input_sha256:'a'.repeat(64),node_id:'agent',...(agent?{agent_context:{parent_step_key:'wf2_00002_agent',round:1}}:{})},job={id:jobId,run_id:runId,owner_user_id:owner,lease_token:token,lease_version:7},row={checkpoint:state,instruction:'task'},db={async query(sql,args){trace.push([sql,args]);return {rows:sql.startsWith('SELECT ')?[row]:[{step_key:request.step_key}]}}},globals={tx:async(_pool,body)=>body(db),lockLease:async(_db,original,worker)=>{assert.equal(original,job);assert.equal(worker,'worker');trace.push(['ORIGINAL_LEASE']);return job},actor:async()=>{},workflowV2RunColumns:'checkpoint,instruction',checkedWorkflowV2StoredState:value=>structuredClone(value),workflowV2ExecutionRequest:()=>request,inspectWorkflowV2Checkpoint:()=>({pending:request}),recordWorkflowAgentResult:(old,_p,out)=>({...old,last:out}),recordWorkflowV2EffectResult:(_g,old,out)=>({...old,last:out}),stepRows:async()=>trace.push(['STEP_RESULT']),auditWorkflowV2:async()=>trace.push(['AUDIT']),acknowledge:async(_db,original,worker,status)=>{assert.equal(original,job);assert.equal(worker,'worker');trace.push(['ACK',status])},advanceWorkflowV2Checkpoint:()=>{throw Error('must not advance after owner pause')},HttpError:contracts.HttpError},name=knownFailure?'finishKnownFailure':'finish',fn=Function(...Object.keys(globals),js(method(name))+'\nreturn '+name)(...Object.values(globals)),worker={pool:{},workerId:'worker',async persist(_db,_job,next,status,error){trace.push(['PERSIST',status,error,next])}},tick=await fn.call(worker,job,request,knownFailure?'provider_known_failure':unknown?undefined:'original saved output');return {trace,tick}
}
test('actual Worker finish stores original known output and releases original lease while remaining paused; no next step runs',async()=>{
 for(const agent of [true,false]){const {trace,tick}=await workerFinish({agent});assert.equal(tick.status,'paused');assert.ok(trace.some(r=>r[0].startsWith?.('UPDATE agentstudio.external_effects')&&r[1][3]==='succeeded'));const persist=trace.find(r=>r[0]==='PERSIST');assert.equal(persist[1],'paused');assert.equal((agent?persist[3].agent_state:persist[3].machine).last.output,'original saved output');assert.deepEqual(trace.find(r=>r[0]==='ACK'),['ACK','queued'])}
})
test('actual unknown finish preserves unknown and failed queue; known child failure is recorded without advancing the paused Agent',async()=>{
 const u=await workerFinish({unknown:true});assert.equal(u.tick.status,'paused');assert.ok(u.trace.some(r=>r[0].startsWith?.('UPDATE agentstudio.external_effects')&&r[1][3]==='unknown'));assert.deepEqual(u.trace.find(r=>r[0]==='ACK'),['ACK','failed']);const known=await workerFinish({knownFailure:true});assert.equal(known.tick.status,'paused');assert.equal(known.trace.find(r=>r[0]==='PERSIST')[3].agent_state.last.code,'provider_known_failure')
})
const PilotError=ActualPilotError
function uiModel({lost=false,hold=false}={}){
 const detail={execution_mode:'agent_native_v2',replayed:false,run:{id:runId,status:'running',instruction:'own task',result_text:''},steps:[],approvals:[],pending_effect:null,run_control:{state_sha256:'a'.repeat(64),manually_paused:false,in_flight:true,outcome_unknown:false,can_pause:true,can_resume:false}},calls=[];let release
 const gate=hold?new Promise(resolve=>{release=resolve}):Promise.resolve(),api={async list(){return []},async get(){return structuredClone(detail)},async submit(){throw Error('no submit')},async decide(){throw Error('no approve')},async cancel(){throw Error('no cancel')},async controlRun(id,action,body){calls.push(['change',id,action,body]);await gate;const receipt={operation_id:body.operation_id,action,run_id:id,request_sha256:data.agentRunControlFingerprint(id,action,body),outcome_status:'paused'};if(lost)throw Error('lost committed reply');return {...structuredClone(detail),control_confirmed:true,run_control_confirmation:receipt}},async confirmRunControl(id,action,body){calls.push(['confirm',id,action,body]);return {...structuredClone(detail),control_confirmed:true,run_control_confirmation:{operation_id:body.operation_id,action,run_id:id,request_sha256:data.agentRunControlFingerprint(id,action,body),outcome_status:'paused'}}}}
 const unusedModules={'./pgNativeAgentRunControl.ts':front,'./pgNativePilotApi.ts':{PgNativePilotError:PilotError},'./pgNativeOwnTaskNavigation.ts':{isOwnTaskTarget:()=>false},'./pgNativeAgentHumanInput.ts':{agentHumanProjection:value=>value},'./pgNativeKnowledgeTool.ts':{usesPaidKnowledge:()=>false},'../../services/pg-api/src/knowledge-retrieval-binding.ts':{KNOWLEDGE_TOOL_CHARGE_ACKNOWLEDGEMENT:'existing'}},controller=actualDurableSession(api,{acceptDetail:()=>true,acceptSubmit:()=>true,freezeDraft:x=>x,describe:()=> 'unconfirmed',submittedNotice:'submitted'})
 void unusedModules;return {controller,calls,detail,release}
}
test('actual employee session coalesces doubleclick, blocks other actions and read-refresh cannot clear an uncertain control request',async()=>{
 const m=uiModel({hold:true});m.controller.setActive(true);await m.controller.select(runId);const first=m.controller.controlRun('pause'),second=m.controller.controlRun('pause');assert.equal(first,second);assert.equal(m.controller.navigationBlocked(),true);await Promise.resolve();assert.equal(m.calls.length,1);m.release();await first;assert.equal(m.controller.snapshot().pendingRunControl,null)
 const lost=uiModel({lost:true});lost.controller.setActive(true);await lost.controller.select(runId);await lost.controller.controlRun('pause');const pending=lost.controller.snapshot().pendingRunControl;assert.ok(pending);await lost.controller.refresh();assert.equal(lost.controller.snapshot().pendingRunControl,pending);await lost.controller.cancel();assert.equal(lost.calls.length,1);await lost.controller.confirmRunControl();assert.equal(lost.calls.length,2);assert.equal(lost.calls[1][0],'confirm');assert.equal(lost.calls[0][3],lost.calls[1][3]);assert.equal(lost.controller.snapshot().pendingRunControl,null)
})
test('actual employee lifetime ignores an in-flight control response after disposal and clears its pending private state',async()=>{
 const m=uiModel({hold:true});m.controller.setActive(true);await m.controller.select(runId);const work=m.controller.controlRun('pause');await Promise.resolve();m.controller.dispose();m.release();await work;assert.equal(m.controller.snapshot().detail,null);assert.equal(m.controller.snapshot().pendingRunControl,undefined);assert.equal(m.controller.snapshot().notice,'')
})
test('strict browser receipt binds original UUID/action/run/state hash and refuses extra or mismatched acknowledgements',async()=>{
 const body=front.nativeRunControlRequest({operation_id:op,expected_state_sha256:'a'.repeat(64)}),receipt={operation_id:op,action:'pause',run_id:runId,request_sha256:data.agentRunControlFingerprint(runId,'pause',body),outcome_status:'paused'},raw={control_confirmed:true,run_control_confirmation:receipt};assert.equal(await front.nativeRunControlConfirmed(raw,runId,'pause',body),true)
 for(const bad of [{...receipt,action:'resume'},{...receipt,operation_id:token},{...receipt,secret:'x'}])await assert.rejects(front.nativeRunControlConfirmed({...raw,run_control_confirmation:bad},runId,'pause',body));assert.equal(await front.nativeRunControlConfirmed({control_confirmed:false,run_control_confirmation:null},runId,'pause',body,true),false)
})
test('actual Native route policy keeps new pause/resume default off and original confirmation readable after revocation',()=>{
 const text=source('services/pg-api/src/native-config-uat-policy.ts'),tree=ts.createSourceFile('x.ts',text,ts.ScriptTarget.Latest,true),node=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='permitNativePg18BusinessUatRequest'),decl=tree.statements.filter(n=>ts.isVariableStatement(n)).flatMap(n=>[...n.declarationList.declarations]).find(n=>n.name.getText(tree)==='uuid'),body=decl.getText(tree),fn=node.getText(tree).replace(/^export /,'')
 const entity=tree.statements.filter(n=>ts.isVariableStatement(n)).flatMap(n=>[...n.declarationList.declarations]).find(n=>n.name.getText(tree)==='configEntities'),configured=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='configuredPath')
 const permit=Function(js('const '+body+';\nconst '+entity.getText(tree)+';\n'+configured.getText(tree)+'\n'+fn)+'\nreturn permitNativePg18BusinessUatRequest')()
 for(const action of ['pause','resume']){const route='/api/v2/agent-autonomous-runs/'+runId+'/'+action;assert.equal(permit(route,'POST',{}),false);assert.equal(permit(route,'POST',{configurationWrites:true,autonomousAgentUat:true}),true);assert.equal(permit(route+'-confirm','POST',{}),true);assert.equal(permit(route,'GET',{configurationWrites:true,autonomousAgentUat:true}),false)}
})
test('actual React controls show manual pause and draining/unknown boundaries, with disabled resume and readonly confirmation',()=>{
 const require=createRequire(H+'/package.json'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),Component=load(source('src/pages/PgNativePilot/PgNativeAgentRunControl.tsx'),{'react/jsx-runtime':require('react/jsx-runtime')}).default
 const render=control=>renderToStaticMarkup(React.createElement(Component,{view:{detail:{run:{id:runId},run_control:control},pendingRunControl:null},enabled:true,onControl(){},onConfirm(){}})),initial={state_sha256:'a'.repeat(64),manually_paused:false,in_flight:false,outcome_unknown:false,can_pause:true,can_resume:false}
 assert.match(render(initial),/暂停此任务/);for(const changed of [{in_flight:true},{outcome_unknown:true}]){const html=render({...initial,manually_paused:true,can_pause:false,...changed});assert.match(html,/恢复此任务/);assert.match(html,/disabled/)}
 const waiting=renderToStaticMarkup(React.createElement(Component,{view:{detail:{run:{id:runId}},pendingRunControl:{id:runId,action:'resume',body:{}}},enabled:false,onControl(){},onConfirm(){}}));assert.match(waiting,/核对上次恢复/);assert.match(waiting,/只读取原操作回执/)
})

test('original paid approval cannot resume after losing fee consent; existing confirmed approval is retained without creating another',async()=>{
 const pending={kind:'tool',step_key:'wf2_00002_agent_a01t',input_sha256:'e'.repeat(64),configuration:{knowledge_retrieval:{mode:'semantic'}}}
 for(const knowledge_charge of [false,null,undefined]){const m=repoModel({paused:true,pending,approval:{status:'approved',reason_code:'wf2:'+pending.input_sha256,knowledge_charge}});await assert.rejects(m.repo.changeRunControl(m.identity,runId,'resume',m.body()),e=>e.code==='knowledge_query_charge_confirmation_required');assert.equal(m.receipts.length,0);assert.equal(m.row().status,'paused')}
 const ok=repoModel({paused:true,pending,approval:{status:'approved',reason_code:'wf2:'+pending.input_sha256,knowledge_charge:true}});await ok.repo.changeRunControl(ok.identity,runId,'resume',ok.body());assert.equal(ok.row().status,'queued');assert.equal(ok.trace.some(sql=>sql.startsWith('INSERT INTO agentstudio.approvals')||sql.startsWith('UPDATE agentstudio.approvals')),false)
})
test('resume refuses orphaned waiting approval/input; original matching pending approval and original question remain waiting',async()=>{
 for(const options of [{returnStatus:'awaiting_approval'},{returnStatus:'awaiting_input'},{returnStatus:'awaiting_approval',pending:{kind:'model',step_key:'wf2_00002_agent_a01m',input_sha256:'e'.repeat(64),configuration:{}}}]){const m=repoModel({paused:true,...options});await assert.rejects(m.repo.changeRunControl(m.identity,runId,'resume',m.body()));assert.equal(m.row().status,'paused');assert.equal(m.receipts.length,0)}
 const pending={kind:'model',step_key:'wf2_00002_agent_a01m',input_sha256:'e'.repeat(64),configuration:{}},a=repoModel({paused:true,returnStatus:'awaiting_approval',pending,approval:{status:'pending',reason_code:'wf2:'+pending.input_sha256}});await a.repo.changeRunControl(a.identity,runId,'resume',a.body());assert.equal(a.row().status,'awaiting_approval')
 const h=repoModel({paused:true,returnStatus:'awaiting_input',humanPending:true});await h.repo.changeRunControl(h.identity,runId,'resume',h.body());assert.equal(h.row().status,'awaiting_input')
})

test('actual pause parser requires primitive string status and never invokes array/object coercion',()=>{
 let coercions=0;const hostile={toString(){coercions++;return 'queued'},[Symbol.toPrimitive](){coercions++;return 'queued'}}
 for(const return_status of [['queued'],hostile,1,0,null,undefined,true,new String('queued')])assert.throws(()=>data.checkedAgentRunPause({operation_id:op,return_status}),error=>error.status===409&&error.code==='invalid_agent_run_pause')
 assert.equal(coercions,0)
 for(const return_status of ['queued','awaiting_approval','awaiting_input'])assert.deepEqual(data.checkedAgentRunPause({operation_id:op,return_status}),{operation_id:op,return_status})
})
test('actual receipt parser requires primitive string outcome and never accepts coercible receipt status',()=>{
 const request={operation_id:op,expected_state_sha256:'a'.repeat(64)},receipt={operation_id:op,action:'pause',run_id:runId,request_sha256:data.agentRunControlFingerprint(runId,'pause',request),outcome_status:'paused'};let coercions=0
 const hostile={toString(){coercions++;return 'paused'},[Symbol.toPrimitive](){coercions++;return 'paused'}}
 for(const outcome_status of [['paused'],hostile,1,0,null,undefined,false,new String('paused')])assert.throws(()=>data.checkedAgentRunControlReceipt({...receipt,outcome_status},runId,'pause',request),error=>error.status===409&&error.code==='agent_run_control_operation_conflict')
 assert.equal(coercions,0)
 for(const outcome_status of ['paused','queued','awaiting_approval','awaiting_input'])assert.equal(data.checkedAgentRunControlReceipt({...receipt,outcome_status},runId,'pause',request).outcome_status,outcome_status)
})

test('resume preserves the original minimal API role: audited052 employee epoch guard replaces forbidden users row lock',async()=>{
 const model=repoModel({paused:true}),reply=await model.repo.changeRunControl(model.identity,runId,'resume',model.body());assert.equal(reply.run.status,'queued')
 assert.equal(model.trace.filter(sql=>sql===actualResumeGuardSql).length,1);assert.equal(model.trace.filter(sql=>sql==='SELECT agentstudio.agent_memory_outcome_epoch() AS epoch').length,1)
 assert.equal(model.trace.some(sql=>sql.startsWith('SELECT status FROM agentstudio.users')),false)
 const bad=repoModel({paused:true,badResumeGuard:true});await assert.rejects(bad.repo.changeRunControl(bad.identity,runId,'resume',bad.body()),error=>error.code==='agent_run_resume_guard_unavailable');assert.equal(bad.row().status,'paused');assert.equal(bad.receipts.length,0)
})
test('actual052 resume admission rejects missing/tampered guard, disabled employee and coercible/unsafe epoch without granting table rights',async()=>{
 for(const guard of [[],[{ok:false}],[{ok:true},{ok:true}]])await assert.rejects(actualResumeAdmission.requireAgentRunResumeEmployee({query:async sql=>({rows:sql===actualResumeGuardSql?guard:[{epoch:'1'}]})}),error=>error.code==='agent_run_resume_guard_unavailable')
 for(const epoch of [undefined,['1'],{},false,'0','1.5',0,NaN,Infinity,Number.MAX_SAFE_INTEGER])await assert.rejects(actualResumeAdmission.requireAgentRunResumeEmployee({query:async sql=>({rows:sql===actualResumeGuardSql?[{ok:true}]:[{epoch}]})}),error=>error.code==='agent_run_resume_guard_unavailable')
 await assert.rejects(actualResumeAdmission.requireAgentRunResumeEmployee({query:async sql=>({rows:sql===actualResumeGuardSql?[{ok:true}]:[{epoch:null}]})}),error=>error.code==='employee_disabled')
 for(const epoch of ['1',1])await assert.doesNotReject(actualResumeAdmission.requireAgentRunResumeEmployee({query:async sql=>({rows:sql===actualResumeGuardSql?[{ok:true}]:[{epoch}]})}))
})
test('actual resume failure observation is closed phase/SQLSTATE data only; getters and sink errors cannot replace failure or reveal private material',()=>{
 const file=source('services/pg-api/src/agent-run-control-admission.ts'),tree=ts.createSourceFile('admission.ts',file,ts.ScriptTarget.Latest,true),node=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='observeResumeGuardFailure'),events=[]
 assert.ok(node);const observe=load(node.getText(tree)+'\nexport {observeResumeGuardFailure}',{}, {process:{stderr:{write:text=>events.push(JSON.parse(text))}}}).observeResumeGuardFailure
 observe('employee_epoch',{code:'42501',cookie:'private cookie',query:'private SQL',stack:'private stack'});assert.deepEqual(events[0],{event:'agent_run_resume_guard_failure_observation',phase:'employee_epoch',sqlstate:'42501',observed_data_only:true})
 observe('guard_catalog',{code:'arbitrary private text'});assert.equal(events[1].sqlstate,null)
 const getter={};Object.defineProperty(getter,'code',{get(){throw Error('must not invoke')}});assert.doesNotThrow(()=>observe('employee_epoch',getter));assert.equal(events[2].sqlstate,null)
 const n=events.length;observe('private phase / Cookie',{});assert.equal(events.length,n)
 const broken=load(node.getText(tree)+'\nexport {observeResumeGuardFailure}',{}, {process:{stderr:{write(){throw Error('sink')}}}}).observeResumeGuardFailure;assert.doesNotThrow(()=>broken('employee_epoch',{code:'42501'}))
})
