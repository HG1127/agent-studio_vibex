import {NativeMonitorCaptureDispatcher} from '../src/native-monitor-live-capture.ts'
import {NativeMonitorGetTransport} from '../src/native-monitor-live-transport.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import {Readable} from 'node:stream'
import {readFileSync} from 'node:fs'
import {createWorkflowAgentState,inspectWorkflowAgentState,recordWorkflowAgentResult} from '../src/workflow-v2-agent-machine.ts'
import {safeNativeMonitorBusinessSpec} from '../src/native-monitor-business-contract.ts'
import {parseMonitorAgentBinding} from '../src/native-monitor-agent-binding.ts'
import {createNativeMonitorLiveHttp} from '../src/native-monitor-live-http.ts'
import {selectNativeMonitorLive} from '../src/native-monitor-live-runtime.ts'
import {NativeMonitorWorker} from '../src/native-monitor-worker.ts'
import {NativeMonitorOriginalExecutor} from '../src/native-monitor-original-executor.ts'
import {monitorCanonical} from '../src/native-monitor-source-contract.ts'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),owner=id(1),caseId=id(2),check=id(3),monitor=id(4),specId=id(5),model=id(6),event=id(7),run=id(8),result=id(9)
const binding={protocol:'monitor_live_business_v1',check_id:check,case_id:caseId,definition_hash:'a'.repeat(64)}
const parent={step_key:'wf2_00002_agent',node_id:'agent',kind:'agent',input:'Declared source only',input_sha256:'b'.repeat(64),configuration:{title:'Owned collector',agent_binding:{spec_id:specId,spec_revision:1},model_binding:{connection_id:model,connection_revision:1,model_id:'synthetic'},max_steps:6},missing:[]}
const rawSpec=()=>({goal:'collect and write supported relation',tools:['web_fetch','business_case_get','business_record_query','business_record_write','result_read'],knowledge_base_ids:[]})
function apply(state,value){const p=inspectWorkflowAgentState(state,parent).pending;return recordWorkflowAgentResult(state,parent,{step_key:p.step_key,input_sha256:p.input_sha256,output:typeof value==='string'?value:JSON.stringify(value)})}
test('optional original Agent machine seals its server binding and replays the actual business subeffect',()=>{
 const spec=safeNativeMonitorBusinessSpec(rawSpec(),true)
 assert.throws(()=>createWorkflowAgentState(parent,spec))
 let state=createWorkflowAgentState(parent,spec,undefined,{monitorBusiness:binding})
 state=apply(state,{action:'tool',tool:'business_case_get',params:{}})
 const pending=inspectWorkflowAgentState(state,parent).pending
 assert.equal(pending.configuration.tool,'business_case_get');assert.equal(pending.agent_context.parent_step_key,parent.step_key)
 state=apply(state,JSON.stringify({case_id:caseId,title:'Actual owned case'}))
 assert.match(inspectWorkflowAgentState(state,parent).pending.input,/Actual owned case/)
 assert.throws(()=>inspectWorkflowAgentState({...state,monitor_business:{...binding,case_id:id(20)}},parent))
 for(const extra of [{owner_user_id:owner},{approval:'accepted'},{definition_hash:'forged'}])assert.throws(()=>parseMonitorAgentBinding({...binding,...extra}))
 const denied=apply(createWorkflowAgentState(parent,spec,undefined,{monitorBusiness:binding}),{action:'tool',tool:'monitor_review',params:{decision:'accepted'}})
 assert.equal(inspectWorkflowAgentState(denied,parent).error_code,'workflow_agent_tool_not_allowed')
})
test('business model arguments cannot inject owner, case or employee review into a permitted tool',()=>{
 const spec=safeNativeMonitorBusinessSpec(rawSpec(),true)
 for(const tool of ['business_case_get','business_record_query','result_read']){
  const state=createWorkflowAgentState(parent,spec,undefined,{monitorBusiness:binding})
  assert.throws(()=>apply(state,{action:'tool',tool,params:{owner_user_id:owner,case_id:caseId,actor_uid:owner}}))
 }
})
const identity={issuer:'urn:agentstudio:local:v1',subject:'server-cookie-identity'}
function req(path,{method='GET',body='',headers={}}={}){
 return Object.assign(Readable.from(body?[Buffer.from(body)]:[]),{url:path,method,headers:{origin:'https://localhost:7443',cookie:'__Host-agentstudio_session='+'a'.repeat(43),'sec-fetch-site':'same-origin','x-agentstudio-expected-employee':owner,...(method==='POST'?{'x-agentstudio-request':'1','content-type':'application/json','content-length':String(Buffer.byteLength(body))}:{}),...headers}})
}
const response=()=>({writeHead(status,headers){this.status=status;this.headers=headers},end(raw){this.body=JSON.parse(raw)}})
test('unchanged page actions route to the concrete service contract without accepting a caller identity',async()=>{
 const calls=[],repository=new Proxy({}, {get(_target,name){return async(...args)=>{calls.push({name,args});return name==='ack'?{ok:true}:{ok:true}}}})
 const http=createNativeMonitorLiveHttp({repository,allowWrites:true,allowedOrigin:'https://localhost:7443',authenticateRequest:async()=>identity}),base='/api/v2/original-ui/business'
 const routes=[
  [base+'/cases','POST','{}','caseCreate'],[base+'/cases/'+caseId,'GET','','caseGet'],
  [base+'/cases/'+caseId+'/query','POST','{}','query'],[base+'/cases/'+caseId+'/reviews','POST','{}','recordReview'],
  [base+'/cases/'+caseId+'/monitors/preview','POST','{}','preview'],[base+'/cases/'+caseId+'/monitors','POST','{}','save'],
  [base+'/monitors/'+monitor+'/definition','POST','{}','update'],[base+'/monitors/'+monitor+'/control','POST','{}','control'],
  [base+'/monitors/'+monitor+'/checks?limit=20','GET','','history'],[base+'/monitors/'+monitor+'/events/'+event,'GET','','eventGet'],
  [base+'/monitor-checks/'+check+'/review-preview','GET','','reviewPreview'],[base+'/monitor-checks/'+check+'/review','POST','{}','review'],
  [base+'/monitor-checks/'+check+'/discard','POST','{}','discard'],[base+'/runs/'+run+'/results/'+result+'?field=text&offset=5000&limit=4000','GET','','result'],
  ['/api/v2/original-ui/monitor-events/'+event+'/read','POST','{}','ack'],
 ]
 for(const [path,method,body,name] of routes){const out=response();assert.equal(await http(req(path,{method,body}),out),true);assert.equal(out.status,200,name);assert.equal(calls.at(-1).name,name);assert.deepEqual(calls.at(-1).args[0],identity);assert.equal(out.headers['Cache-Control'],'no-store')}
 const unread=req('/unrelated',{method:'POST',body:'original body'});assert.equal(await http(unread,response()),false);let text='';for await(const chunk of unread)text+=chunk;assert.equal(text,'original body')
})
test('Cookie is rechecked after each POST body, and unknown/duplicate/query or spoofed requests never mutate',async()=>{
 let authCalls=0,mutations=0
 const repository={caseCreate:async()=>{mutations++;return{ok:true}},ack:async()=>{mutations++;return{ok:true}}}
 const http=createNativeMonitorLiveHttp({repository,allowWrites:true,allowedOrigin:'https://localhost:7443',authenticateRequest:async()=>++authCalls%2?identity:{...identity,subject:'changed'}}),out=response()
 await http(req('/api/v2/original-ui/business/cases',{method:'POST',body:'{}'}),out)
 assert.equal(out.status,409);assert.equal(mutations,0)
 const steady=createNativeMonitorLiveHttp({repository,allowWrites:true,allowedOrigin:'https://localhost:7443',authenticateRequest:async()=>identity})
 for(const request of [
  req('/api/v2/original-ui/business/cases',{method:'POST',body:'{}',headers:{cookie:undefined,'x-rh-user-id':owner}}),
  req('/api/v2/original-ui/business/cases',{method:'POST',body:'{}',headers:{'x-agentstudio-request':undefined}}),
  req('/api/v2/original-ui/monitor-events/'+event+'/read',{method:'POST',body:'{"owner_user_id":"'+owner+'"}'}),
  req('/api/v2/original-ui/business/cases',{method:'POST',body:'{"x":1,"x":2}'}),
  req('/api/v2/original-ui/business/monitors/'+monitor+'/checks?limit=20&limit=20'),
  req('/api/v2/original-ui/business/cases/'+caseId+'?owner_id='+owner),
 ]){const value=response();await steady(request,value);assert.notEqual(value.status,200)}
 assert.equal(mutations,0)
})
test('runtime, coordinator and executor remain default-off and never perform SQL, GET or a provider operation',async()=>{
 const empty={connect:async()=>assert.fail('default-off SQL')},worker=new NativeMonitorWorker(empty,'synthetic')
 assert.deepEqual(await worker.tick(),{status:'disabled'})
 assert.deepEqual(selectNativeMonitorLive({},true,'https://localhost'),{enabled:false,execution:false})
 for(const env of [{AGENT_STUDIO_PG18_MONITOR_LIVE_ENABLED:'true'},{AGENT_STUDIO_PG18_MONITOR_LIVE_EXECUTION_APPROVED:'APPROVE_DISPOSABLE_PG18_MONITOR_LIVE_EXECUTION_ONLY'}])assert.throws(()=>selectNativeMonitorLive(env,true,'https://localhost'))
 const env={AGENT_STUDIO_PG18_MONITOR_LIVE_ENABLED:'true',AGENT_STUDIO_PG18_MONITOR_LIVE_APPROVED:'APPROVE_DISPOSABLE_PG18_MONITOR_LIVE_ONLY',AGENT_STUDIO_PG18_ORIGINAL_MONITOR_INBOX_ENABLED:'true'}
 assert.deepEqual(selectNativeMonitorLive(env,true,'https://localhost'),{enabled:true,execution:false})
 assert.throws(()=>selectNativeMonitorLive(env,true,'http://localhost'))
 let delegated=0;const executor=new NativeMonitorOriginalExecutor(empty,{execute:async()=>{delegated++;return'ordinary original result'}},{capture:async()=>assert.fail('source GET')})
 assert.equal(await executor.execute({kind:'model'},{execution_mode:'agent_native_v2',signal:new AbortController().signal}),'ordinary original result');assert.equal(delegated,1)
})
test('authored SQL independently binds source capture to the actual approved leased step and bounds every business/model slot',()=>{
 const sql=readFileSync(new URL('../../../db/postgres/migrations/pg_v9_074_monitor_live.sql',import.meta.url),'utf8')
 for(const literal of ['CREATE TABLE agentstudio.monitor_live_effect_slots','auth_slot_id uuid NOT NULL','monitor_live_requests_authority_fk',"a.status='approved'","a.reason_code='wf2:'","j.lease_token=(authority.claim->>'lease_token')::uuid","mode='model'","model_calls=model_calls+1","tool_calls=tool_calls+1","source_definition"] )assert(sql.includes(literal),literal)
 assert.match(sql,/IF EXISTS\(SELECT 1 FROM agentstudio.monitor_live_effect_slots WHERE run_id=c.run_id AND step_key=/)
 const source=readFileSync(new URL('../src/native-monitor-original-executor.ts',import.meta.url),'utf8')
 assert.match(source,/verifyWorkflowEffectLease\(db,owner,r,/);assert(source.indexOf('monitor_live_effect_authorize')<source.indexOf('this.dispatcher.capture'))
 assert.doesNotMatch(source,/setTimeout|setInterval|new Pool|process\.env/)
 const author=sql.slice(sql.indexOf('CREATE FUNCTION agentstudio.monitor_live_author('))
 assert.match(author,/PERFORM agentstudio.monitor_live_employee/);assert.match(author,/schedule_control\(s.id,s.revision,'pause'\)/)
 assert.match(author,/monitor_schedule_reauthorization_required/);assert.doesNotMatch(author,/schedule_activate\(/)
})

test('shutdown aborts transport authority and closes capture/executor before any new SQL or network',async()=>{
 const pool={connect:async()=>assert.fail('closed SQL')},transport=new NativeMonitorGetTransport(pool,Buffer.alloc(32,1),{monitorHttp:async()=>assert.fail('closed GET'),monitorWebFetch:async()=>assert.fail('closed GET')})
 transport.close();await assert.rejects(()=>transport.captureDeclared({},new AbortController().signal),e=>e.code==='monitor_source_material_unavailable')
 let closed=0;const dispatcher=new NativeMonitorCaptureDispatcher(pool,{captureDeclared:async()=>assert.fail('closed transport'),close:()=>closed++});dispatcher.close();dispatcher.close();assert.equal(closed,1)
 await assert.rejects(()=>dispatcher.capture({check_id:check,lease_token:id(20),lease_version:1},'source'),e=>e.code==='monitor_capture_closed')
 const executor=new NativeMonitorOriginalExecutor(pool,{execute:async()=>assert.fail('closed provider')},dispatcher,{executionApproved:true});executor.close();await assert.rejects(()=>executor.execute({kind:'model'},{execution_mode:'agent_native_v2'}),e=>e.code==='monitor_original_executor_closed')
})

test('an enabled HTTP read surface cannot grant employee mutations without the separate write gate',async()=>{let writes=0;const http=createNativeMonitorLiveHttp({repository:{caseCreate:async()=>{writes++;return{ok:true}}},allowedOrigin:'https://localhost:7443',authenticateRequest:async()=>identity}),out=response();await http(req('/api/v2/original-ui/business/cases',{method:'POST',body:'{}'}),out);assert.equal(out.status,403);assert.equal(writes,0)})
