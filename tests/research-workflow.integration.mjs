// Actual disposable PocketBase/SQLite, employee auth and Node Worker. Model
// responses are synthetic: this verifies orchestration, not research quality.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import {createServer} from 'node:http'
import {spawn} from 'node:child_process'
import {randomBytes} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from './helpers/headless-pocketbase.mjs'
const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'agentstudio-stages-test-'))
const setupKey=randomBytes(32).toString('hex'),workerKey=randomBytes(32).toString('hex')
const freePort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
const port=await freePort(),origin=`http://127.0.0.1:${port}`
let pb,logs='',calls=0,queue=[]
const upstream=createServer(async(req,res)=>{
  const reply=value=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(value))}
  if(req.url==='/v1/models')return reply({data:[{id:'fixture-model'}]})
  let raw='';for await(const chunk of req)raw+=chunk
  const body=JSON.parse(raw||'{}'),planning=body.messages?.some(m=>m.role==='system'&&m.content?.includes('助手执行引擎'))
  if(planning)calls++
  const decision=planning?(queue.shift()||{action:'final',final_answer:'Synthetic stage output. Semantic quality unverified.'}):{action:'final',final_answer:'Probe'}
  reply({choices:[{message:{role:'assistant',content:JSON.stringify(decision)}}]})
})
await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve))
const environment={NODE_ENV:'test',AGENT_STUDIO_AUTH_MODE:'standalone',AGENT_STUDIO_ALLOW_ANON:'false',AGENT_STUDIO_BOOTSTRAP_SECRET:setupKey,AGENT_STUDIO_WORKER_TOKEN:workerKey,AGENT_STUDIO_BACKGROUND_WORKER:'true',AGENT_STUDIO_WORKER_INTERNAL_URL:origin}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function startPB(){
  pb=spawnHeadlessPocketBase(path.join(root,'vibex-local/bin/windows/pocketbase.exe'),['serve',`--http=127.0.0.1:${port}`,`--dir=${temp}`,`--hooksDir=${path.join(root,'pocketbase/pb_hooks')}`],{cwd:path.join(root,'pocketbase'),env:environment})
  pb.stdout.on('data',b=>{logs=(logs+b).slice(-22000)});pb.stderr.on('data',b=>{logs=(logs+b).slice(-22000)})
  for(let n=0;n<150;n++){try{if((await fetch(origin+'/api/health')).ok)return}catch{};await sleep(100)}
  throw Error('isolated PB not ready: '+logs.slice(-5000))
}
async function api(method,route,body,token='',headers={}){
  const res=await fetch(origin+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:token}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)})
  return {status:res.status,data:await res.json()}
}
async function ok(method,route,body,token='',status=200,headers={}){const r=await api(method,route,body,token,headers);assert.equal(r.status,status,route+' '+JSON.stringify(r));return r.data}
async function workerOnce(){
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['worker/run.mjs','--once','--quiet'],{cwd:root,windowsHide:true,env:{...process.env,AGENT_STUDIO_WORKER_URL:origin,AGENT_STUDIO_WORKER_TOKEN:workerKey}})
    let output='';child.stdout.on('data',b=>{output+=b});child.stderr.on('data',b=>{output+=b});child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error(output)))
  })
}
try{
  await startPB()
  await ok('POST','/api/studio/bootstrap',{email:'stages@example.test',password:'Fixture-Password-2026',display_name:'Stages'},'',201,{'X-Agent-Studio-Setup-Key':setupKey})
  const token=(await ok('POST','/api/collections/studio_users/auth-with-password',{identity:'stages@example.test',password:'Fixture-Password-2026'})).token
  await ok('POST','/api/studio/users',{email:'other@example.test',password:'Fixture-Password-2026',display_name:'Other',role:'employee'},token,201)
  const otherToken=(await ok('POST','/api/collections/studio_users/auth-with-password',{identity:'other@example.test',password:'Fixture-Password-2026'})).token
  const conn=(await ok('POST','/api/model-connections',{name:'stage fixture',provider:'openai',api_key:'fixture-only-key',base_url:`http://127.0.0.1:${upstream.address().port}/v1`,models:['fixture-model']},token)).item.id
  assert.equal((await ok('POST','/api/model-connections/test',{connection_id:conn},token)).ok,true)
  const spec=await ok('POST','/api/agent_specs',{name:'Durable research stage fixture',spec:{goal:'Synthetic orchestration',task_scope:'Fixtures only',tools:['calculate'],task_plan:['Answer'],deliverables:['Technical output'],done_criteria:['Finish']}},token)
  const business=await ok('POST','/api/business/cases',{title:'Stage integration',data_space:'DEMO',questions:['Fixture question?']},token,201)
  const q=business.questions[0].question_id
  const custom={connection_id:conn,model_id:'fixture-model'}
  const budget={model_calls:12,closing_model_calls:0,tool_calls:12,wall_ms:300000}
  function graph(parallel=false){
    const nodes=[{id:'start',type:'start',data:{title:'Start'}},{id:'one',type:'agent',data:{title:'One',spec_id:spec.id,prompt:'{{input}}'}},{id:'two',type:'agent',data:{title:'Two',spec_id:spec.id,prompt:'{{input}}'}},{id:'end',type:'end',data:{title:'End'}}]
    const links=parallel?[['start','one'],['start','two'],['one','end'],['two','end']]:[['start','one'],['one','two'],['two','end']]
    return {nodes:nodes.map((n,i)=>({...n,position:{x:i*240,y:100}})),edges:links.map(([source,target],i)=>({id:'e'+i,source,target}))}
  }
  async function launch(profile={},parallel=false){
    const wf=await ok('POST','/api/workflow-studio/create',{name:'Stage fixture',graph:graph(parallel)},token)
    return (await ok('POST','/api/workflow-runs/start',{workflow_id:wf.id,instruction:'Synthetic stage request',research:{case_id:business.case_id,custom_model:custom,budget,stages:{one:{acceptance:'execution_only'},two:{acceptance:'execution_only'}},...profile}},token)).run_id
  }
  const tick=id=>ok('POST',`/api/llm/workflow-engine/${id}/tick`,{},token)
  const detail=id=>ok('GET',`/api/workflow-runs/${id}/research`,undefined,token)
  const childTick=id=>ok('POST',`/api/llm/agent-engine/${id}/tick`,{},token)
  const childDetail=id=>ok('GET',`/api/agent-runs/${id}/detail`,undefined,token)
  async function complete(id){
    for(let n=0;n<20;n++){
      await tick(id);const d=await detail(id)
      if(['failed','succeeded','cancelled'].includes(d.status))return d
      for(const s of d.stages){const c=await childDetail(s.child_run_id);if(c.run.status==='running')await childTick(s.child_run_id)}
    }
    throw Error('stage run did not complete')
  }
  // Real child Run creation, owner fencing, idempotent start, restart and DAG.
  const first=await launch()
  await tick(first)
  let d=await detail(first);assert.equal(d.stages.length,1)
  const childId=d.stages[0].child_run_id
  assert.equal((await api('GET',`/api/workflow-runs/${first}/research`,undefined,otherToken)).status,404)
  assert.equal((await api('POST','/api/agent-runs/start',{spec_id:spec.id,instruction:'Forged',research_stage_link_id:'fake',research_child_run_id:childId},token)).status,403)
  const db=new DatabaseSync(path.join(temp,'data.db'),{readOnly:true})
  const link=db.prepare('SELECT * FROM agent_studio_research_stages WHERE child_run_id=?').get(childId);db.close()
  const payload={...JSON.parse(link.start_payload),research_stage_link_id:link.id,research_child_run_id:childId}
  const workerHeaders={'X-Agent-Studio-Worker-Token':workerKey,'X-Rh-User-Id':link.owner_uid}
  assert.equal((await ok('POST','/api/agent-runs/start',payload,'',200,workerHeaders)).deduplicated,true)
  assert.equal((await api('POST','/api/agent-runs/start',{...payload,instruction:'Payload changed'},'',workerHeaders)).status,403)
  await stopHeadlessPocketBase(pb);pb=null;await startPB()
  await tick(first);assert.equal((await detail(first)).stages[0].child_run_id,childId)
  d=await complete(first);assert.equal(d.status,'succeeded');assert.equal(d.stages.length,2)
  assert.equal(d.budgets.find(b=>b.scope==='parent').usage.model_intents,2)
  assert.equal(d.stages[0].artifact.free_text_quality,'unverified')
  console.log('PASS durable children, exact payload authorization, owner isolation, restart, dependency order')
  // Pause and cancellation propagate to durable children and prohibit new calls.
  const paused=await launch({},true);await tick(paused);await tick(paused)
  d=await detail(paused);assert.equal(d.stages.length,2)
  await ok('POST',`/api/agent-runs/${d.stages[0].child_run_id}/pause`,{},token)
  await ok('POST',`/api/workflow-runs/${paused}/pause`,{},token)
  const callsBefore=calls
  for(const s of d.stages){assert.equal((await childDetail(s.child_run_id)).run.status,'paused');await childTick(s.child_run_id)}
  assert.equal(calls,callsBefore)
  assert.equal((await api('POST',`/api/agent-runs/${d.stages[1].child_run_id}/resume`,{},token)).status,409)
  await ok('POST',`/api/workflow-runs/${paused}/resume`,{},token)
  assert.equal((await childDetail(d.stages[0].child_run_id)).run.status,'paused')
  assert.equal((await childDetail(d.stages[1].child_run_id)).run.status,'running')
  await ok('POST',`/api/workflow-runs/${paused}/cancel`,{},token)
  for(const s of d.stages)assert.equal((await childDetail(s.child_run_id)).run.status,'cancelled')
  assert.equal((await detail(paused)).status,'cancelled')
  assert.equal((await api('POST',`/api/workflow-runs/${paused}/cancel`,{},token)).status,409)
  console.log('PASS parent pause/resume preserves manual pause; cancel stops unfinished children')
  // Parent/question totals deny a second stage before network; failed scopes
  // do not commit counters at any of the other levels.
  for(const scope of ['parent','question']){
    const options=scope==='parent'?{budget:{...budget,model_calls:1}}:{stages:{one:{acceptance:'execution_only',question_id:q},two:{acceptance:'execution_only',question_id:q}},question_budgets:{[q]:{...budget,model_calls:1}}}
    const before=calls,id=await launch(options)
    if(scope==='parent'){
      await tick(id);const active=await detail(id);await childTick(active.stages[0].child_run_id);await tick(id)
      await stopHeadlessPocketBase(pb);pb=null;await startPB()
      assert.equal((await detail(id)).budgets.find(b=>b.scope==='parent').usage.model_intents,1)
    }
    const result=await complete(id)
    assert.equal(result.status,'failed');assert.equal(calls-before,1)
    assert.equal(result.budgets.find(b=>b.scope==='parent').usage.model_intents,1)
    assert.equal(result.budgets.some(b=>b.scope==='stage:two'),false)
  }
  console.log('PASS atomic parent/question/stage budgets survive stage creation without counter reset')
  const partial=await complete(await launch({stages:{one:{acceptance:'results_present',allow_partial:true},two:{acceptance:'execution_only'}}}))
  assert.equal(partial.status,'succeeded');const partialStage=partial.stages.find(s=>s.stage_id==='one')
  assert.equal(partialStage.state,'partial');assert.equal(partialStage.artifact.acceptance_outcome,'incomplete');assert.ok(partialStage.artifact.gaps.length)
  const separate=graph(true);separate.nodes.push({id:'end_two',type:'end',data:{title:'End two'}});separate.edges=separate.edges.map(e=>e.source==='two'?{...e,target:'end_two'}:e)
  const multiWf=await ok('POST','/api/workflow-studio/create',{name:'Multiple ends',graph:separate},token)
  const multi=(await ok('POST','/api/workflow-runs/start',{workflow_id:multiWf.id,instruction:'Multiple ends fixture',research:{case_id:business.case_id,custom_model:custom,budget,stages:{one:{acceptance:'execution_only'},two:{acceptance:'execution_only'}}}},token)).run_id
  await tick(multi);await tick(multi);d=await detail(multi)
  await childTick(d.stages.find(s=>s.stage_id==='one').child_run_id);await tick(multi);await tick(multi)
  assert.equal((await detail(multi)).status,'running','A completed end must not finish a still-active parallel branch')
  assert.equal((await complete(multi)).status,'succeeded')
  // Semantic review waits without another model call and revalidates its pins.
  const casePath=`/api/business/cases/${business.case_id}`,text='SYNTHETIC_REVIEW_EVIDENCE'
  const material=await ok('POST',casePath+'/materials',{filename:'review.txt',base64:Buffer.from(text).toString('base64'),idempotency_key:'review-source'},token)
  await workerOnce()
  const segments=await ok('GET',`/api/business/materials/${material.material_id}/segments`,undefined,token)
  const entity=await ok('POST',casePath+'/records',{schema_id:'research.entity.v1',expected_version:0,idempotency_key:'review-entity',payload:{canonical_name:'Synthetic identity',entity_type:'PERSON',aliases:[],identity_status:'CONFIRMED'},source_refs:[]},token)
  const claim=await ok('POST',casePath+'/records',{schema_id:'research.claim.v1',expected_version:0,idempotency_key:'review-claim',payload:{subject_id:entity.record_id,predicate:'synthetic_fixture',object_value:'Fixture only',valid_from:'2026-10-29',valid_to:null,status:'SOURCE_SUPPORTED',missing:[]},source_refs:[{material_id:material.material_id,segment_id:segments.items[0].segment_id,start:0,end:text.length,quote:text}]},token)
  await ok('POST',casePath+'/records',{schema_id:'research.answer.v1',expected_version:0,idempotency_key:'review-answer',payload:{question_id:q,answer:'Partial fixture',status:'PARTIAL',claim_ids:[claim.record_id],missing:['Real research not performed'],as_of:'2026-10-29'},source_refs:[]},token)
  const reviewed=await launch({stages:{one:{acceptance:'research.evidence.v1'},two:{acceptance:'execution_only'}}})
  await tick(reviewed);d=await detail(reviewed);await childTick(d.stages[0].child_run_id);await tick(reviewed)
  d=await detail(reviewed);assert.equal(d.stages[0].state,'awaiting_review');assert.ok(d.stages[0].artifact.records.length)
  const reviewCalls=calls;await tick(reviewed);await tick(reviewed);assert.equal(calls,reviewCalls);assert.equal((await detail(reviewed)).stages.length,1)
  await ok('POST',casePath+'/reviews',{record_id:claim.record_id,record_version:1,decision:'accepted',rationale:'Synthetic review of the fixed test passage; no real model quality assertion.'},token,201)
  assert.equal((await complete(reviewed)).status,'succeeded')
  // A source that disappears after a stage starts prevents downstream work.
  const kb=await ok('POST','/api/knowledge-bases/manage',{action:'create',name:'Stage revocable source'},token)
  const scopedSpec=await ok('POST','/api/agent_specs',{name:'Scoped stage',spec:{goal:'Source scope fixture',tools:['knowledge_search'],knowledge_base_ids:[kb.id]}},token)
  const scopedGraph=graph();scopedGraph.nodes=scopedGraph.nodes.map(n=>n.type==='agent'?{...n,data:{...n.data,spec_id:scopedSpec.id}}:n)
  const scopedWf=await ok('POST','/api/workflow-studio/create',{name:'Source-revoked stage',graph:scopedGraph},token)
  const scoped=(await ok('POST','/api/workflow-runs/start',{workflow_id:scopedWf.id,instruction:'Source revocation fixture',research:{case_id:business.case_id,custom_model:custom,budget,stages:{one:{acceptance:'execution_only'},two:{acceptance:'execution_only'}}}},token)).run_id
  await tick(scoped);await ok('POST','/api/knowledge-bases/manage',{action:'delete',id:kb.id},token)
  const beforeRevocation=calls;await tick(scoped);assert.equal(calls,beforeRevocation)
  assert.equal((await api('GET',`/api/workflow-runs/${scoped}/research`,undefined,token)).status,403)
  assert.equal((await api('GET',`/api/workflow-runs/${scoped}/detail`,undefined,token)).status,403)
  console.log('PASS multiple terminal branches, no model calls while human review waits, source removal blocks downstream and hides derived detail')
  // Ordinary Worker picks up a research parent and its real Agent children.
  const workerRun=await launch();for(let n=0;n<12;n++){await workerOnce();if((await detail(workerRun)).status==='succeeded')break}
  assert.equal((await detail(workerRun)).status,'succeeded')
  const unsupported=await ok('POST','/api/workflow-studio/create',{name:'Only missing unsupported',graph:graph()},token)
  assert.equal((await api('POST','/api/workflow-runs/start',{workflow_id:unsupported.id,instruction:'Fixture',research:{case_id:business.case_id,custom_model:custom,only_missing:true}},token)).status,409)
  for(const only_missing of ['true','false',1,null])assert.equal((await api('POST','/api/workflow-runs/start',{workflow_id:unsupported.id,instruction:'Fixture',research:{case_id:business.case_id,custom_model:custom,only_missing}},token)).status,400)
  console.log('PASS real Node Worker drives the DAG/Run path; only-missing start requires its actual source execution')
  // Only-missing revisions reuse fixed accepted receipts, retain old files and
  // spend the original root ledger. Shared stages cannot rewrite other answers.
  const repairCase=await ok('POST','/api/business/cases',{title:'Two-object recovery',data_space:'DEMO',questions:['Verified first object?','Missing second object?']},token,201)
  const repairPath=`/api/business/cases/${repairCase.case_id}`,q1=repairCase.questions[0].question_id,q2=repairCase.questions[1].question_id
  const repairEntity=await ok('POST',repairPath+'/records',{schema_id:'research.entity.v1',expected_version:0,idempotency_key:'repair-entity',payload:{canonical_name:'Synthetic recovery entity',entity_type:'PERSON',aliases:[],identity_status:'CONFIRMED'},source_refs:[]},token)
  const repairClaim=await ok('POST',repairPath+'/records',{schema_id:'research.claim.v1',expected_version:0,idempotency_key:'repair-claim',payload:{subject_id:repairEntity.record_id,predicate:'synthetic_recovery',object_value:'Fixture evidence',valid_from:'2026-10-29',valid_to:null,status:'SOURCE_SUPPORTED',missing:[]},source_refs:[{material_id:material.material_id,segment_id:segments.items[0].segment_id,start:0,end:text.length,quote:text}]},token)
  await ok('POST',repairPath+'/reviews',{record_id:repairClaim.record_id,record_version:1,decision:'accepted',rationale:'Synthetic recovery fixture review only.'},token,201)
  const answer1={schema_id:'research.answer.v1',expected_version:0,idempotency_key:'repair-answer-one',payload:{question_id:q1,answer:'Already verified fixture',status:'ANSWERED',claim_ids:[repairClaim.record_id],missing:[],as_of:'2026-10-29'},source_refs:[]}
  const saved1=await ok('POST',repairPath+'/records',answer1,token)
  const answer2={schema_id:'research.answer.v1',expected_version:0,idempotency_key:'repair-answer-two',payload:{question_id:q2,answer:'Unknown second fixture',status:'UNKNOWN',claim_ids:[],missing:['Second object evidence missing'],as_of:'2026-10-29'},source_refs:[]}
  const saved2=await ok('POST',repairPath+'/records',answer2,token)
  const repairSpec=await ok('POST','/api/agent_specs',{name:'Only-missing fixture',spec:{goal:'Repair only selected questions',tools:['business_record_write','calculate']}},token)
  const repairGraph=graph();repairGraph.nodes=repairGraph.nodes.map(n=>n.type==='agent'?{...n,data:{...n.data,spec_id:repairSpec.id}}:n)
  const repairWf=await ok('POST','/api/workflow-studio/create',{name:'Only missing recovery',graph:repairGraph},token)
  const stopped=(await ok('POST','/api/workflow-runs/start',{workflow_id:repairWf.id,instruction:'Two-object recovery fixture',research:{case_id:repairCase.case_id,custom_model:custom,budget:{...budget,model_calls:4},stages:{one:{question_id:q1,acceptance:'answer_present'},two:{acceptance:'execution_only'}}}},token)).run_id
  await tick(stopped);d=await detail(stopped);await childTick(d.stages[0].child_run_id);await tick(stopped);await tick(stopped)
  await ok('POST',`/api/workflow-runs/${stopped}/cancel`,{},token)
  const frozenJob=await ok('POST',repairPath+'/jobs',{type:'research.freeze.v1',idempotency_key:'before-replan'},token)
  for(let n=0;n<4;n++)await workerOnce()
  const frozenState=await ok('GET',`/api/business/jobs/${frozenJob.job_id}`,undefined,token);assert.equal(frozenState.status,'succeeded')
  const frozenId=frozenState.artifact.fact_set_id,frozen=await ok('GET',repairPath+`/fact-sets/${frozenId}`,undefined,token)
  const oldReport=await ok('POST',repairPath+'/reports',{fact_set_id:frozenId,template_id:'research.brief.v1',format:'html',idempotency_key:'before-replan-report'},token)
  const oldBytes=Buffer.from(await (await fetch(origin+repairPath+`/reports/${oldReport.report_id}/download`,{headers:{Authorization:token}})).arrayBuffer())
  const repairRequest={question_ids:[q2]},previewRoute=`/api/workflow-runs/${stopped}/replan-preview`,createRoute=`/api/workflow-runs/${stopped}/replan`
  let preview=await ok('POST',previewRoute,repairRequest,token)
  assert.equal((await api('POST',previewRoute,{question_ids:[]},token)).status,400)
  for(const invalid of [{...repairRequest,additional_budget:{model_calls:500}},{...repairRequest,additional_budget:{model_calls:-1}},{...repairRequest,additional_question_budgets:{[q1]:{model_calls:1}}}])assert.equal((await api('POST',previewRoute,invalid,token)).status,400)
  assert.equal(preview.can_start,true);assert.equal(preview.decisions.find(s=>s.stage_id==='one').action,'reuse');assert.equal(preview.decisions.find(s=>s.stage_id==='two').action,'run');assert.equal(preview.root_usage.model_intents,1)
  assert.equal((await api('POST',previewRoute,repairRequest,otherToken)).status,404)
  const changed2=await ok('POST',repairPath+'/records',{...answer2,record_id:saved2.record_id,expected_version:1,idempotency_key:'repair-preflight-edit',payload:{...answer2.payload,missing:['Updated missing evidence']}},token)
  assert.equal((await api('POST',createRoute,{idempotency_key:'replan-stale',preview_hash:preview.preview_hash,request:repairRequest},token)).status,409)
  preview=await ok('POST',previewRoute,repairRequest,token)
  const createBody={idempotency_key:'replan-exact',preview_hash:preview.preview_hash,request:repairRequest}
  assert.equal((await api('POST',createRoute,createBody,'',workerHeaders)).status,401,'A trusted execution Worker cannot authorize a budget revision')
  const repaired=await ok('POST',createRoute,createBody,token),repairId=repaired.run_id
  assert.equal((await ok('POST',createRoute,createBody,token)).run_id,repairId)
  assert.equal((await api('POST',createRoute,{...createBody,idempotency_key:'replan-duplicate-branch'},token)).status,409)
  await tick(repairId);await tick(repairId);d=await detail(repairId)
  const freshChild=d.stages.find(s=>s.stage_id==='two').child_run_id
  const badWrite={...answer1,record_id:saved1.record_id,expected_version:1,idempotency_key:'unselected-answer-attack',payload:{...answer1.payload,answer:'Must not overwrite the other question'}}
  const goodWrite={...answer2,record_id:saved2.record_id,expected_version:changed2.version,idempotency_key:'selected-answer-update',payload:{...answer2.payload,answer:'Partial evidence preserved after recovery',status:'PARTIAL',claim_ids:[repairClaim.record_id],missing:['Actual live research not performed']}}
  queue=[{action:'tool',tool:'business_record_write',tool_input:badWrite},{action:'tool',tool:'business_record_write',tool_input:goodWrite},{action:'final',final_answer:'Only the selected question was updated; fixture only.'}]
  await childTick(freshChild)
  await stopHeadlessPocketBase(pb);pb=null;await startPB()
  await childTick(freshChild);await childTick(freshChild)
  assert.equal((await complete(repairId)).status,'succeeded')
  assert.equal((await ok('GET',repairPath+`/records/${saved1.record_id}`,undefined,token)).version,1)
  assert.equal((await ok('GET',repairPath+`/records/${saved2.record_id}`,undefined,token)).version,3)
  const rootBudgetAfter=await detail(stopped)
  assert.equal(rootBudgetAfter.budgets.find(b=>b.scope==='parent').usage.model_intents,4,'Replanning must retain cumulative old and new calls')
  assert.equal((await ok('GET',repairPath+`/fact-sets/${frozenId}`,undefined,token)).content_hash,frozen.content_hash)
  assert.deepEqual(Buffer.from(await (await fetch(origin+repairPath+`/reports/${oldReport.report_id}/download`,{headers:{Authorization:token}})).arrayBuffer()),oldBytes)
  const exhaustedPreview=await ok('POST',`/api/workflow-runs/${repairId}/replan-preview`,repairRequest,token)
  assert.ok(exhaustedPreview.blocked.some(b=>b.code==='research_model_budget_required'))
  const addRequest={...repairRequest,additional_budget:{model_calls:2}},addPreview=await ok('POST',`/api/workflow-runs/${repairId}/replan-preview`,addRequest,token)
  assert.equal(addPreview.root_usage.model_intents,4);assert.equal(addPreview.root_limits.parent.model_calls,6)
  const addedRun=await ok('POST',`/api/workflow-runs/${repairId}/replan`,{idempotency_key:'replan-budget-topup',preview_hash:addPreview.preview_hash,request:addRequest},token)
  assert.equal((await complete(addedRun.run_id)).status,'succeeded')
  assert.equal((await detail(stopped)).budgets.find(b=>b.scope==='parent').usage.model_intents,5)
  assert.equal((await ok('POST',`/api/workflow-runs/${addedRun.run_id}/replan-preview`,repairRequest,token)).decisions.find(s=>s.stage_id==='two').action,'run','A model final must not hide the remaining scoped business gap')
  console.log('PASS only-missing immutable revisions, stale preview and branch fencing, cumulative budgets/topups, selected-question write guard, restart, unchanged old fact set and report bytes')
  const uncertainRun=await launch();await tick(uncertainRun);const uncertainChild=(await detail(uncertainRun)).stages[0].child_run_id;await ok('POST',`/api/workflow-runs/${uncertainRun}/cancel`,{},token)
  // Inject an interrupted external-write journal in this disposable fixture;
  // never fabricate a successful remote write or erase its outcome.
  const uncertainDb=new DatabaseSync(path.join(temp,'data.db'))
  uncertainDb.prepare("INSERT INTO agent_studio_side_effects(kind,run_id,step_key,tool_name,args_hash,idempotency_key,status,result_text,created_ms,updated_ms) VALUES('agent',?,'1','synthetic_external_write','fixture-hash','fixture-unknown','unknown','',1,1)").run(uncertainChild);uncertainDb.close()
  const unknownPlan=await ok('POST',`/api/workflow-runs/${uncertainRun}/replan-preview`,{},token)
  assert.equal(unknownPlan.can_start,false);assert.ok(unknownPlan.blocked.some(b=>b.code==='research_write_reconciliation_required'))
  const revisedClaim=await ok('POST',casePath+'/records',{schema_id:'research.claim.v1',record_id:claim.record_id,expected_version:1,idempotency_key:'pending-review-version-two',payload:{subject_id:entity.record_id,predicate:'synthetic_fixture',object_value:'Updated fixture needs new human review',valid_from:'2026-10-29',valid_to:null,status:'SOURCE_SUPPORTED',missing:[]},source_refs:[{material_id:material.material_id,segment_id:segments.items[0].segment_id,start:0,end:text.length,quote:text}]},token)
  const priorAnswer=(await ok('POST',casePath+'/query',{schema_id:'research.answer.v1',limit:50},token)).items[0]
  await ok('POST',casePath+'/records',{schema_id:'research.answer.v1',record_id:priorAnswer.record_id,expected_version:priorAnswer.version,idempotency_key:'answer-pending-second-review',payload:{...priorAnswer.payload,claim_ids:[revisedClaim.record_id]},source_refs:[]},token)
  const reviewStop=await launch({stages:{one:{acceptance:'research.evidence.v1'},two:{acceptance:'execution_only'}}});await tick(reviewStop);await childTick((await detail(reviewStop)).stages[0].child_run_id);await tick(reviewStop);await ok('POST',`/api/workflow-runs/${reviewStop}/cancel`,{},token)
  const reviewPreview=await ok('POST',`/api/workflow-runs/${reviewStop}/replan-preview`,{},token)
  assert.equal(reviewPreview.decisions.find(s=>s.stage_id==='one').action,'review')
  const resumedReview=await ok('POST',`/api/workflow-runs/${reviewStop}/replan`,{idempotency_key:'resume-human-review',preview_hash:reviewPreview.preview_hash,request:{}},token)
  const beforeReviewWait=calls;await tick(resumedReview.run_id);await tick(resumedReview.run_id);assert.equal(calls,beforeReviewWait)
  await ok('POST',casePath+'/reviews',{record_id:claim.record_id,record_version:2,decision:'accepted',rationale:'Synthetic fixture second-version review.'},token,201)
  assert.equal((await complete(resumedReview.run_id)).status,'succeeded');assert.equal(calls-beforeReviewWait,1,'Only the unfinished second stage may request a model')
  console.log('PASS unknown external outcomes block replanning and restored review waits never repeat completed model work')
  const dependencyRun=(await ok('POST','/api/workflow-runs/start',{workflow_id:repairWf.id,instruction:'Missing prerequisite fixture',research:{case_id:repairCase.case_id,custom_model:custom,budget,stages:{one:{question_id:q1,acceptance:'answer_present'},two:{question_id:q2,acceptance:'answer_present'}}}},token)).run_id
  await ok('POST',`/api/workflow-runs/${dependencyRun}/cancel`,{},token)
  const dependencyPlan=await ok('POST',`/api/workflow-runs/${dependencyRun}/replan-preview`,{question_ids:[q2]},token)
  assert.equal(dependencyPlan.can_start,false);assert.ok(dependencyPlan.blocked.some(b=>b.code==='research_dependency_outside_scope'))
  if(process.argv.includes('--browser')){
    await ok('POST','/api/workflow-studio/create',{name:'Browser research launch',graph:graph()},token)
    const {verifyResearchWorkflowBrowser}=await import('./helpers/research-workflow-browser.mjs')
    await verifyResearchWorkflowBrowser({root,backendOrigin:origin,caseId:business.case_id,onStarted:tick})
  }
}catch(error){console.error(logs.slice(-12000));throw error}
finally{if(pb)await stopHeadlessPocketBase(pb);await new Promise(resolve=>upstream.close(resolve));if(path.dirname(fs.realpathSync(temp))!==fs.realpathSync(os.tmpdir())||!path.basename(temp).startsWith('agentstudio-stages-test-'))throw Error('unsafe_stage_test_cleanup');fs.rmSync(temp,{recursive:true,force:true})}
