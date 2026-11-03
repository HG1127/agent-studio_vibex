// Real isolated SQLite + verified employee auth + Worker processes. Synthetic
// providers prove transport/recovery only, never real model research quality.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { randomBytes,createHash } from 'node:crypto'
import { spawnHeadlessPocketBase, stopHeadlessPocketBase } from './helpers/headless-pocketbase.mjs'

const root = process.cwd(), binary = path.join(root,'vibex-local/bin/windows/pocketbase.exe')
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'agentstudio-result-test-'))
const setupKey = randomBytes(32).toString('hex'), workerKey = randomBytes(32).toString('hex')
const freePort = () => new Promise(resolve => { const s = net.createServer(); s.listen(0,'127.0.0.1',() => { const p=s.address().port;s.close(() => resolve(p)) }) })
const port = await freePort(), origin = `http://127.0.0.1:${port}`
let fixturePrefix=String.fromCharCode(34,92,10).repeat(2667).slice(0,8000)
for(const [offset,marker] of [[300,'EVIDENCE_300'],[3000,'EVIDENCE_3000'],[7900,'RANGE_END_8000']])
  fixturePrefix=fixturePrefix.slice(0,offset)+marker+fixturePrefix.slice(offset+marker.length)
const sourceText=fixturePrefix+'b'.repeat(2400)+'EVIDENCE_10000'
let queue = [], prompts = [], upstreamCalls = 0, jsonCalls=0, readonlyCalls=0, truncatedOutput=false, pb, logs = '', currentResult = ''
const upstream = createServer(async(req,res) => {
  const reply = body => {res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(body))}
  if (req.url === '/v1/models') return reply({data:[{id:'fixture-model'}]})
  if (req.url === '/source') { upstreamCalls++; res.writeHead(200,{'Content-Type':'text/plain'});res.end(sourceText);return }
  if (req.url === '/json-source'){
    jsonCalls++
    if(truncatedOutput){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"fact":');return}
    return reply({authorization_hint:'Bearer fixture_synthetic_credential',fact:'z'.repeat(11000)+'LATE_JSON_EVIDENCE'})
  }
  let raw = ''; for await (const chunk of req) raw += chunk
  const payload = JSON.parse(raw || '{}')
  if(req.url==='/readonly-mcp'){
    if(payload.method==='tools/list')return reply({jsonrpc:'2.0',id:payload.id,result:{tools:[
      {name:'fixture_lookup',description:'Synthetic read adapter',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false},outputSchema:{type:'object',required:['answer'],properties:{answer:{type:'string'}}}},
      {name:'fixture_write',description:'Untrusted self-reported readonly hint',inputSchema:{type:'object'},annotations:{readOnlyHint:true}}]}})
    if(payload.method==='tools/call'){readonlyCalls++;return reply({jsonrpc:'2.0',id:payload.id,result:{content:[{type:'text',text:'READ_FIXTURE '+payload.params.arguments.query}],structuredContent:{answer:'READ_FIXTURE '+payload.params.arguments.query}}})}
    return reply({jsonrpc:'2.0',id:payload.id,result:{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}}})
  }
  prompts.push(JSON.stringify(payload.messages))
  const isPlanning=(payload.messages || []).some(m=>m.role==='system'&&typeof m.content==='string'&&m.content.includes('助手执行引擎'))
  if(!isPlanning)return reply({choices:[{message:{role:'assistant',content:'Synthetic context summary only; original evidence remains in durable results.'}}]})
  const item = queue.shift()
  const decision = typeof item === 'function' ? item() : item
  reply({choices:[{message:{role:'assistant',content:JSON.stringify(decision || {action:'final',final_answer:'fixture complete'})}}]})
})
await new Promise(resolve => upstream.listen(0,'127.0.0.1',resolve))
const remote = `http://127.0.0.1:${upstream.address().port}`
const environment = {AGENT_STUDIO_AUTH_MODE:'standalone',AGENT_STUDIO_ALLOW_ANON:'false',
  NODE_ENV:'test',AGENT_STUDIO_CAPABILITY_TEST_ONLY:'true',AGENT_STUDIO_CAPABILITY_TEST_ORIGIN:remote,
  AGENT_STUDIO_BOOTSTRAP_SECRET:setupKey,AGENT_STUDIO_WORKER_TOKEN:workerKey,
  AGENT_STUDIO_BACKGROUND_WORKER:'true',AGENT_STUDIO_WORKER_INTERNAL_URL:origin}
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms))
async function startPB() {
  pb = spawnHeadlessPocketBase(binary,['serve',`--http=127.0.0.1:${port}`,`--dir=${temp}`,`--hooksDir=${path.join(root,'pocketbase/pb_hooks')}`],{cwd:path.join(root,'pocketbase'),env:environment})
  pb.stdout.on('data',b => {logs=(logs+b).slice(-18000)});pb.stderr.on('data',b => {logs=(logs+b).slice(-18000)})
  for (let n=0;n<150;n++) {try {if ((await fetch(origin+'/api/health')).ok)return}catch{};await sleep(100)}
  throw Error('isolated PB not ready: '+logs.slice(-5000))
}
async function api(method,route,body,token='',headers={}) {
  const res = await fetch(origin+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:token}:{}),...headers},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)})
  return {status:res.status,data:await res.json()}
}
async function ok(method,route,body,token='',status=200,headers={}) {
  const r=await api(method,route,body,token,headers);assert.equal(r.status,status,route+' '+JSON.stringify(r));return r.data
}
let workerCycles=0
async function workerOnce() {
  const cycle=++workerCycles
  await new Promise((resolve,reject) => {
    const child = spawn(process.execPath,['worker/run.mjs','--once','--quiet'],{cwd:root,windowsHide:true,
      env:{...process.env,AGENT_STUDIO_WORKER_URL:origin,AGENT_STUDIO_WORKER_TOKEN:workerKey}})
    let output='';child.stdout.on('data',b=>{output+=b});child.stderr.on('data',b=>{output+=b})
    child.once('error',reject);child.once('close',code => code===0?resolve():reject(Error('worker cycle '+cycle+' failed: '+output)))
  })
}
async function jobStep(){return ok('POST','/api/internal/worker/jobs-step',{},'',200,{'X-Agent-Studio-Worker-Token':workerKey})}
async function completeJob(token,jobId){
  for(let n=0;n<20;n++){
    const state=await ok('GET',`/api/business/jobs/${jobId}`,undefined,token)
    if(!['queued','running'].includes(state.status))return state
    await jobStep()
  }
  throw Error('Job did not terminate within its bounded test budget')
}
async function modelConnection(token) {
  const c=await ok('POST','/api/model-connections',{name:'isolated fixture',provider:'openai',api_key:'fixture-only-key',base_url:remote+'/v1',models:['fixture-model']},token)
  const probe=await ok('POST','/api/model-connections/test',{connection_id:c.item.id},token)
  assert.equal(probe.ok,true);return c.item.id
}
async function run(token,connId,tools,baseIds=[],caseId,maxSteps=20,budget,questionId) {
  const spec=await ok('POST','/api/agent_specs',{name:'Result recovery fixture',spec:{goal:'Keep source evidence',task_scope:'Synthetic only',tools,
    deliverables:['Evidence'],task_plan:['Read','Verify','Deliver'],done_criteria:['Evidence located'],knowledge_base_ids:baseIds}},token)
  return (await ok('POST','/api/agent-runs/start',{spec_id:spec.id,instruction:'Result recovery fixture',model:'fixture-model',config:{case_id:caseId,max_steps:maxSteps,execution_budget:budget,question_id:questionId,tools:Object.fromEntries(tools.map(t=>[t,true])),custom_model:{connection_id:connId,model_id:'fixture-model'}}},token)).run_id
}
try {
  await startPB()
  await ok('POST','/api/studio/bootstrap',{email:'owner@example.test',password:'Fixture-Password-2026',display_name:'Owner'},'',201,{'X-Agent-Studio-Setup-Key':setupKey})
  const token=(await ok('POST','/api/collections/studio_users/auth-with-password',{identity:'owner@example.test',password:'Fixture-Password-2026'})).token
  await ok('POST','/api/studio/users',{email:'reader@example.test',password:'Fixture-Password-2026',display_name:'Reader',role:'employee'},token,201)
  const readerToken=(await ok('POST','/api/collections/studio_users/auth-with-password',{identity:'reader@example.test',password:'Fixture-Password-2026'})).token
  const connId=await modelConnection(token)
  const unsupportedSpec=await ok('POST','/api/agent_specs',{name:'Unimplemented capability fixture',spec:{goal:'People Intelligence：OCR、关系图、持续监测；冻结事实集输出 PDF。',tools:['business_record_write','business_material_read','business_job_submit','business_report_render'],task_plan:['Collect','Verify','Deliver']}},token)
  const dependencyPlan=await ok('GET',`/api/agent_specs/${unsupportedSpec.id}/capability-plan`,undefined,token)
  assert.equal(dependencyPlan.ready_for_release,false)
  for(const feature of ['ocr','relation_graph'])assert.equal(dependencyPlan.requirements.find(item=>item.id===feature).state,'development_required')
  assert.equal(dependencyPlan.requirements.find(item=>item.id==='monitoring').state,'configuration_required')
  assert.equal(dependencyPlan.requirements.find(item=>item.id==='office_reports').state,'configuration_required')
  assert.ok(dependencyPlan.input_contract.required.includes('case_id'))
  assert.equal((await api('GET',`/api/agent_specs/${unsupportedSpec.id}/capability-plan`,undefined,readerToken)).status,404)
  const unsupportedVersion=await ok('POST','/api/spec-versions',{spec_id:unsupportedSpec.id,note:'Synthetic unimplemented dependency fixture'},token)
  assert.equal((await api('POST',`/api/spec-versions/${unsupportedVersion.item.id}/publish`,{},token)).status,409)
  const market=await ok('POST','/api/market/connect',{url:remote+'/readonly-mcp',name:'Scoped read fixture',headers:[]},token)
  assert.equal(market.ok,true,JSON.stringify(market))
  const readTool=`mkt__${market.connection.id}__fixture_lookup`,fakeWrite=`mkt__${market.connection.id}__fixture_write`
  queue=[{action:'tool',tool:readTool,tool_input:{query:'one'}},{action:'tool',tool:readTool,tool_input:{query:'two'}},
    {action:'tool',tool:readTool,tool_input:{query:'three'}},{action:'tool',tool:readTool,tool_input:{query:'two'}}]
  const grantRun=await run(token,connId,[readTool])
  const grantPath=`/api/agent-runs/${grantRun}/tool-grants`
  await ok('POST',`/api/llm/agent-engine/${grantRun}/tick`,{},token)
  assert.equal((await ok('GET',`/api/agent-runs/${grantRun}/detail`,undefined,token)).run.status,'awaiting_approval')
  assert.equal(readonlyCalls,0,'No invocation before employee approval/grant')
  const eligibility=await ok('GET',grantPath,undefined,token)
  const eligible=eligibility.eligible_tools.find(item=>item.tool===readTool)
  assert.ok(eligible)
  assert.equal((await api('GET',grantPath,undefined,readerToken)).status,404)
  const grantInput={tool:readTool,config_hash:eligible.config_hash,allowed_inputs:[{query:'one'},{query:'two'},{query:'three'}],max_calls:2,expires_in_minutes:10,amount_limit_minor:0,idempotency_key:'read-batch'}
  const scoped=await ok('POST',grantPath,grantInput,token)
  assert.equal((await ok('POST',grantPath,grantInput,token)).grant_id,scoped.grant_id)
  assert.equal((await api('POST',grantPath,{...grantInput,max_calls:3},token)).status,409)
  assert.equal((await api('POST',grantPath,grantInput,'',{'X-Rh-User-Id':'forged'})).status,401)
  await ok('POST',`/api/agent-runs/${grantRun}/approve`,{decision:'approve'},token)
  await ok('POST',`/api/llm/agent-engine/${grantRun}/tick`,{},token)
  assert.equal(readonlyCalls,1)
  await ok('POST',`/api/llm/agent-engine/${grantRun}/tick`,{},token)
  assert.equal(readonlyCalls,2,'Next reviewed read request executes without another approval')
  assert.equal((await ok('GET',grantPath,undefined,token)).items[0].reserved_calls,2)
  await ok('POST',`/api/llm/agent-engine/${grantRun}/tick`,{},token)
  assert.equal(readonlyCalls,2,'Exhausted call allowance blocks automatic invocation')
  assert.equal((await ok('GET',`/api/agent-runs/${grantRun}/detail`,undefined,token)).run.status,'awaiting_approval')
  const renewal=await ok('POST',grantPath,{...grantInput,max_calls:2,allowed_inputs:[{query:'three'},{query:'two'}],idempotency_key:'renewed-reviewed-batch'},token)
  await ok('POST',`/api/agent-runs/${grantRun}/approve`,{decision:'approve'},token)
  await ok('POST',`/api/llm/agent-engine/${grantRun}/tick`,{},token)
  assert.equal(readonlyCalls,3)
  await ok('POST',grantPath+`/${renewal.grant_id}/revoke`,{},token)
  await ok('POST',`/api/llm/agent-engine/${grantRun}/tick`,{},token)
  assert.equal(readonlyCalls,3,'Revocation blocks a matching request with unused allowance')
  assert.equal((await ok('GET',`/api/agent-runs/${grantRun}/detail`,undefined,token)).run.status,'awaiting_approval')
  await ok('POST',`/api/agent-runs/${grantRun}/cancel`,{},token)
  const unknownGrantRun=await run(token,connId,[fakeWrite])
  const unknownGrantPath=`/api/agent-runs/${unknownGrantRun}/tool-grants`
  assert.equal((await ok('GET',unknownGrantPath,undefined,token)).eligible_tools.length,0)
  assert.equal((await api('POST',unknownGrantPath,{...grantInput,tool:fakeWrite},token)).status,403,'A self-reported readOnlyHint is not a trusted effect adapter')
  await ok('POST',`/api/agent-runs/${unknownGrantRun}/cancel`,{},token)
  const tool=await ok('POST','/api/tool-connections',{name:'EvidenceSource',description:'Fixture source',method:'GET',url:remote+'/source',headers:[]},token)
  assert.equal((await ok('POST','/api/tool-connections/test',{connection_id:tool.item.id},token)).ok,true)
  upstreamCalls=0;prompts=[]
  queue=[{action:'tool',tool:'EvidenceSource',tool_input:{}},
    ...Array.from({length:8},(_,i)=>({action:'tool',tool:'calculate',tool_input:{expression:`${i}+1`}})),
    ()=>({action:'tool',tool:'result_read',tool_input:{result_id:currentResult,offset:10000,limit:1000}}),
    ()=>({action:'tool',tool:'result_read',tool_input:{result_id:currentResult,offset:0,limit:8000}}),
    {action:'final',final_answer:'Evidence located: EVIDENCE_10000; synthetic transport fixture.'}]
  const id=await run(token,connId,['EvidenceSource','calculate'])
  await workerOnce()
  const list=await ok('GET',`/api/agent-runs/${id}/tool-results`,undefined,token)
  assert.equal(list.items.length,1,logs.slice(-2000))
  currentResult=list.items[0].result_id
  const endpoint=`/api/agent-runs/${id}/tool-results/${currentResult}`
  const full=await ok('GET',endpoint+'?view=envelope',undefined,token)
  assert.equal(full.envelope.text,sourceText)
  for (const offset of [300,3000,10000]) {
    const part=await ok('GET',endpoint+`?offset=${offset}&limit=1000`,undefined,token)
    assert.equal(part.text,sourceText.slice(offset,offset+1000));assert.equal(part.offset,offset)
  }
  assert.equal((await api('GET',endpoint,undefined,'',{'X-Rh-User-Id':'forged'})).status,401)
  assert.equal((await api('GET',endpoint,undefined,readerToken)).status,404)
  assert.equal((await api('GET',`/api/agent-runs/${id}/tool-results`,undefined,readerToken)).status,404)
  for (const query of ['offset=-1','offset=1.5','limit=0','limit=8001','offset=999999','field=sql'])
    assert.equal((await api('GET',endpoint+'?'+query,undefined,token)).status,400,query)
  // Restart both the server process and independent Worker; no in-memory result cache.
  await stopHeadlessPocketBase(pb); await startPB()
  assert.equal((await ok('GET',endpoint+'?offset=10000&limit=1000',undefined,token)).text,sourceText.slice(10000))
  for(let i=0;i<11;i++) await workerOnce()
  const detail=await ok('GET',`/api/agent-runs/${id}/detail`,undefined,token)
  assert.equal(detail.run.status,'succeeded',JSON.stringify(detail.run))
  assert.equal(upstreamCalls,1,'Worker restart must not resubmit the source read')
  const planningPrompts=prompts.filter(raw=>JSON.parse(raw).some(m=>m.role==='system'&&typeof m.content==='string'&&m.content.includes('助手执行引擎')))
  assert.match(planningPrompts.at(-1),/EVIDENCE_10000/,'Requested late evidence must reach the next planner in full')
  assert.match(planningPrompts.at(-1),/RANGE_END_8000/,'JSON escaping must not truncate the requested range in the checkpoint')
  assert.ok(detail.events.some(e=>e.event_type==='tool_result'&&e.content.result_id===currentResult))
  assert.equal((await ok('GET',endpoint+'?view=envelope',undefined,token)).content_hash,full.content_hash)
  const jsonTool=await ok('POST','/api/tool-connections',{name:'EvidenceJsonSource',description:'JSON preservation fixture',method:'GET',url:remote+'/json-source',headers:[]},token)
  const contractPath=`/api/tool-connections/${jsonTool.item.id}/contract`
  const contract=await ok('PUT',contractPath,{input_schema:{type:'object',required:['query'],properties:{query:{type:'string',minLength:1}},additionalProperties:false},
    output_schema:{type:'object',required:['fact'],properties:{fact:{type:'string',minLength:10000}}}},token)
  assert.equal(contract.retest_required,true)
  assert.equal((await api('GET',contractPath,undefined,readerToken)).status,404)
  assert.equal((await api('PUT',contractPath,{input_schema:{pattern:'unsafe'}},token)).status,422)
  const beforeBadProbe=jsonCalls
  assert.equal((await api('POST','/api/tool-connections/test',{connection_id:jsonTool.item.id,input:'{"query":3}'},token)).status,422)
  assert.equal(jsonCalls,beforeBadProbe,'Invalid probe arguments must be rejected before HTTP')
  assert.equal((await ok('POST','/api/tool-connections/test',{connection_id:jsonTool.item.id,input:'{"query":"fixture"}'},token)).ok,true)
  queue=[{action:'tool',tool:'EvidenceJsonSource',tool_input:{query:3}},{action:'tool',tool:'EvidenceJsonSource',tool_input:{query:'fixture'}}]
  const jsonRun=await run(token,connId,['EvidenceJsonSource'])
  const beforeBadAgent=jsonCalls
  await ok('POST',`/api/llm/agent-engine/${jsonRun}/tick`,{},token)
  assert.equal(jsonCalls,beforeBadAgent,'Invalid model arguments must be rejected before HTTP')
  await ok('POST',`/api/llm/agent-engine/${jsonRun}/tick`,{},token)
  const jsonRef=(await ok('GET',`/api/agent-runs/${jsonRun}/tool-results`,undefined,token)).items[0]
  const jsonResult=await ok('GET',`/api/agent-runs/${jsonRun}/tool-results/${jsonRef.result_id}?view=envelope`,undefined,token)
  assert.match(JSON.parse(jsonResult.envelope.text).fact,/LATE_JSON_EVIDENCE/,'Redacting a token must not swallow the remaining JSON fields')
  assert.match(jsonResult.envelope.structuredContent.fact,/LATE_JSON_EVIDENCE/)
  assert.doesNotMatch(JSON.stringify(jsonResult),/fixture_synthetic_credential/)
  assert.equal(jsonResult.envelope.validation.status,'valid')
  truncatedOutput=true
  queue=[{action:'tool',tool:'EvidenceJsonSource',tool_input:{query:'truncated'}}]
  await ok('POST',`/api/llm/agent-engine/${jsonRun}/tick`,{},token)
  const invalidRef=(await ok('GET',`/api/agent-runs/${jsonRun}/tool-results`,undefined,token)).items.at(-1)
  assert.equal((await api('GET',`/api/agent-runs/${jsonRun}/tool-results/${invalidRef.result_id}`,undefined,token)).status,422)
  const invalidAudit=await ok('GET',`/api/agent-runs/${jsonRun}/tool-results/${invalidRef.result_id}?view=envelope`,undefined,token)
  assert.equal(invalidAudit.envelope.validation.status,'invalid')
  assert.equal(invalidAudit.envelope.text,'{"fact":')
  truncatedOutput=false
  await ok('POST',`/api/agent-runs/${jsonRun}/cancel`,{},token)
  // G02: stable identities and immutable optimistic versions across Runs.
  const businessCase=await ok('POST','/api/business/cases',{title:'Three questions <script>fixture()</script>',data_space:'DEMO',questions:['Who?','Current role?','What is unknown?']},token,201)
  const missingCaseSpec=await ok('POST','/api/agent_specs',{name:'Requires business case',spec:{goal:'Save formal records',tools:['business_record_write']}},token)
  const beforeRejectedStart=prompts.length
  const missingCase=await api('POST','/api/agent-runs/start',{spec_id:missingCaseSpec.id,instruction:'Must not start without case',model:'fixture-model',config:{custom_model:{connection_id:connId,model_id:'fixture-model'}}},token)
  assert.equal(missingCase.status,409);assert.equal(missingCase.data.error,'business_case_required')
  assert.equal(prompts.length,beforeRejectedStart,'Missing binding must not cause a model request')
  const casePath=`/api/business/cases/${businessCase.case_id}`
  assert.equal((await api('GET',casePath,undefined,readerToken)).status,404)
  const {pdfFixture,xlsxFixture}=await import('./helpers/material-fixtures.mjs')
  const pdfBytes=await pdfFixture(),xlsxBytes=await xlsxFixture()
  const pdfUpload={filename:'source.pdf',base64:pdfBytes.toString('base64'),idempotency_key:'pdf-original'}
  const pdfMaterial=await ok('POST',casePath+'/materials',pdfUpload,token)
  const xlsxMaterial=await ok('POST',casePath+'/materials',{filename:'people.xlsx',base64:xlsxBytes.toString('base64'),idempotency_key:'xlsx-original'},token)
  const brokenMaterial=await ok('POST',casePath+'/materials',{filename:'broken.pdf',base64:Buffer.from('not PDF bytes').toString('base64'),idempotency_key:'bad-original'},token)
  assert.equal((await ok('POST',casePath+'/materials',pdfUpload,token)).material_id,pdfMaterial.material_id)
  assert.equal((await api('POST',casePath+'/jobs',{type:'material.parse.v1',material_id:pdfMaterial.material_id,idempotency_key:'resubmit-same-file'},token)).status,409,'A new key must not create another parse of the same immutable original')
  assert.equal((await api('POST',casePath+'/materials',{...pdfUpload,filename:'changed.pdf'},token)).status,409)
  assert.equal((await api('POST',casePath+'/materials',{...pdfUpload,base64:'YR==',idempotency_key:'invalid-base64'},token)).status,400)
  assert.equal((await api('GET',`/api/business/materials/${pdfMaterial.material_id}/original`,undefined,readerToken)).status,404)
  assert.equal((await api('GET',`/api/business/materials/${pdfMaterial.material_id}/read?segment_id=page:1`,undefined,token)).status,409)
  assert.equal((await api('POST','/api/internal/worker/material-jobs/claim',{},token)).status,401)
  await stopHeadlessPocketBase(pb);await startPB()
  await workerOnce();await workerOnce();await workerOnce()
  const parsedPdf=await ok('GET',`/api/business/materials/${pdfMaterial.material_id}`,undefined,token)
  const parsedXlsx=await ok('GET',`/api/business/materials/${xlsxMaterial.material_id}`,undefined,token)
  assert.equal(parsedPdf.job_status,'succeeded',JSON.stringify(parsedPdf))
  assert.equal(parsedPdf.parse.coverage.pages_total,2)
  assert.equal(parsedPdf.parse.coverage.extraction_complete,false)
  assert.ok(parsedPdf.parse.coverage.omissions.some(item=>item.locator.page===2))
  assert.equal(parsedXlsx.parse.coverage.formulas_recalculated,false)
  const original=await ok('GET',`/api/business/materials/${pdfMaterial.material_id}/original`,undefined,token)
  assert.equal(original.base64,pdfBytes.toString('base64'))
  assert.equal(parsedPdf.parse.binary_sha256,createHash('sha256').update(pdfBytes).digest('hex'))
  const pdfPassage=await ok('GET',`/api/business/materials/${pdfMaterial.material_id}/read?segment_id=page:1`,undefined,token)
  assert.match(pdfPassage.text,/TEXT_PDF_EVIDENCE/);assert.equal(pdfPassage.locator.page,1)
  const cellPassage=await ok('GET',`/api/business/materials/${xlsxMaterial.material_id}/read?segment_id=sheet:1:cell:A2`,undefined,token)
  assert.equal(cellPassage.text,'XLSX_PERSON_EVIDENCE');assert.equal(cellPassage.locator.cell,'A2')
  const badParse=await ok('GET',`/api/business/materials/${brokenMaterial.material_id}`,undefined,token)
  assert.equal(badParse.job_status,'failed');assert.equal(badParse.parse,null)
  assert.equal((await ok('GET',`/api/business/materials/${brokenMaterial.material_id}/original`,undefined,token)).base64,Buffer.from('not PDF bytes').toString('base64'))
  const cancelledMaterial=await ok('POST',casePath+'/materials',{filename:'cancelled.txt',base64:Buffer.from('text parse cancellation fixture').toString('base64'),idempotency_key:'cancelled-material'},token)
  const claimParse=await ok('POST','/api/internal/worker/material-jobs/claim',{},'',200,{'X-Agent-Studio-Worker-Token':workerKey})
  assert.equal(claimParse.job.job_id,cancelledMaterial.job_id)
  assert.equal((await ok('POST','/api/internal/worker/material-jobs/claim',{},'',200,{'X-Agent-Studio-Worker-Token':workerKey})).job.idle,true)
  await ok('POST',`/api/business/jobs/${cancelledMaterial.job_id}/cancel`,{},token)
  assert.equal((await api('POST','/api/internal/worker/material-jobs/complete',{job_id:cancelledMaterial.job_id,lease_token:claimParse.job.lease_token,ok:false,error:'fixture_cancel'},'',{'X-Agent-Studio-Worker-Token':workerKey})).status,409)
  const entityInput={schema_id:'research.entity.v1',expected_version:0,idempotency_key:'entity-one',payload:{canonical_name:'Same Name',entity_type:'PERSON',aliases:[],identity_status:'CONFIRMED'},source_refs:[]}
  const entity=await ok('POST',casePath+'/records',entityInput,token)
  const materialRefs=[{material_id:pdfMaterial.material_id,segment_id:'page:1',start:0,end:pdfPassage.text.length,quote:pdfPassage.text},
    {material_id:xlsxMaterial.material_id,segment_id:'sheet:1:cell:A2',start:0,end:cellPassage.text.length,quote:cellPassage.text}]
  const materialEntity=await ok('POST',casePath+'/records',{...entityInput,idempotency_key:'material-entity',payload:{...entityInput.payload,canonical_name:'Material fixture person'},source_refs:materialRefs},token)
  assert.equal(materialEntity.source_refs.length,2)
  assert.equal((await api('POST',casePath+'/records',{...entityInput,idempotency_key:'bad-material-quote',source_refs:[{...materialRefs[0],quote:'invented'}]},token)).status,422)
  queue=[{action:'tool',tool:'business_material_read',tool_input:{material_id:xlsxMaterial.material_id,segment_id:'sheet:1:cell:A2'}}]
  const materialRun=await run(token,connId,['business_material_read'],[],businessCase.case_id)
  await ok('POST',`/api/llm/agent-engine/${materialRun}/tick`,{},token)
  const materialResult=(await ok('GET',`/api/agent-runs/${materialRun}/tool-results`,undefined,token)).items[0]
  const materialEnvelope=await ok('GET',`/api/agent-runs/${materialRun}/tool-results/${materialResult.result_id}?view=envelope`,undefined,token)
  assert.match(materialEnvelope.envelope.structuredContent.text,/XLSX_PERSON_EVIDENCE/)
  await ok('POST',`/api/agent-runs/${materialRun}/cancel`,{},token)
  const same=await ok('POST',casePath+'/records',entityInput,token)
  assert.equal(same.record_id,entity.record_id)
  const otherEntity=await ok('POST',casePath+'/records',{...entityInput,idempotency_key:'entity-two'},token)
  assert.notEqual(otherEntity.record_id,entity.record_id,'Same names must never auto-merge')
  assert.equal((await api('POST',casePath+'/records',{...entityInput,payload:{...entityInput.payload,canonical_name:'Changed'}},token)).status,409)
  const updated=await ok('POST',casePath+'/records',{...entityInput,record_id:entity.record_id,expected_version:1,idempotency_key:'entity-update',payload:{...entityInput.payload,aliases:['Alias']}},token)
  assert.equal(updated.version,2)
  assert.equal((await ok('GET',casePath+`/records/${entity.record_id}?version=1`,undefined,token)).payload.aliases.length,0)
  assert.equal((await api('POST',casePath+'/records',{...entityInput,record_id:entity.record_id,expected_version:1,idempotency_key:'stale-write'},token)).status,409)
  assert.equal((await api('POST',casePath+'/query',{schema_id:'research.entity.v1',sql:'DROP TABLE agent_runs'},token)).status,400)
  const sourceRef={run_id:id,result_id:currentResult,start:10000,end:sourceText.length,quote:sourceText.slice(10000)}
  const claimInput={schema_id:'research.claim.v1',expected_version:0,idempotency_key:'claim-one',payload:{subject_id:entity.record_id,predicate:'fixture_statement',object_value:'Late evidence',valid_from:null,valid_to:null,status:'SOURCE_SUPPORTED',missing:['Semantic review not performed']},source_refs:[sourceRef]}
  assert.equal((await api('POST',casePath+'/records',{...claimInput,source_refs:[{...sourceRef,quote:'invented quote'}]},token)).status,422)
  const claim=await ok('POST',casePath+'/records',claimInput,token)
  assert.equal(claim.relation_versions[0].version,2)
  for(const [index,question] of businessCase.questions.entries()) {
    await ok('POST',casePath+'/records',{schema_id:'research.answer.v1',expected_version:0,idempotency_key:'answer-'+index,
      payload:{question_id:question.question_id,answer:index===0?'Late source evidence; meaning needs review':'Unknown',
        status:index===0?'PARTIAL':'UNKNOWN',claim_ids:index===0?[claim.record_id]:[],missing:['Current time and real research quality not verified'],as_of:'2026-10-29'},source_refs:[]},token)
  }
  const needsReview=await ok('GET',casePath+'/quality',undefined,token)
  assert.equal(needsReview.delivery_completeness,'complete')
  assert.equal(needsReview.business_quality,'needs_review','Anchors and JSON must not pass semantic review')
  assert.equal(needsReview.free_text_report_quality,'unverified')
  assert.equal((await api('POST',casePath+'/reviews',{record_id:claim.record_id,record_version:1,decision:'accepted',rationale:'forged'},'',{'X-Rh-User-Id':'forged'})).status,401)
  await ok('POST',casePath+'/reviews',{record_id:claim.record_id,record_version:1,decision:'accepted',rationale:'Synthetic fixture reviewer confirms this test quote only; no live quality claim.'},token,201)
  assert.equal((await ok('GET',casePath+'/quality',undefined,token)).business_quality,'qualified_partial')
  await ok('POST',casePath+'/reviews',{record_id:claim.record_id,record_version:1,decision:'rejected',rationale:'Synthetic counterexample reviewer rejects semantic support.'},token,201)
  assert.equal((await ok('GET',casePath+'/quality',undefined,token)).business_quality,'failed')
  await ok('POST',casePath+'/reviews',{record_id:claim.record_id,record_version:1,decision:'accepted',rationale:'Synthetic fixture review restored for continuation checks.'},token,201)
  const liveCase=await ok('POST','/api/business/cases',{title:'No demo contamination',data_space:'LIVE',questions:['Role?']},token,201)
  const liveEntity=await ok('POST',`/api/business/cases/${liveCase.case_id}/records`,entityInput,token)
  assert.equal((await api('POST',`/api/business/cases/${liveCase.case_id}/records`,{...entityInput,idempotency_key:'demo-material-in-live',source_refs:materialRefs},token)).status,422)
  assert.equal((await api('POST',`/api/business/cases/${liveCase.case_id}/records`,{...claimInput,payload:{...claimInput.payload,subject_id:liveEntity.record_id}},token)).status,422)
  // The same formal object is updated by two independent Agent Runs, not memory text.
  for(const [n,version] of [[1,2],[2,3]]) {
    queue=[{action:'tool',tool:'business_record_write',tool_input:{...entityInput,record_id:entity.record_id,expected_version:version,idempotency_key:'run-update-'+n,payload:{...entityInput.payload,aliases:['run-'+n]}}}]
    const recordRun=await run(token,connId,['business_record_write'],[],businessCase.case_id)
    await ok('POST',`/api/llm/agent-engine/${recordRun}/tick`,{},token)
    const after=await ok('GET',casePath+`/records/${entity.record_id}`,undefined,token)
    assert.equal(after.version,version+1);assert.equal(after.run_id,recordRun)
    await ok('POST',`/api/agent-runs/${recordRun}/cancel`,{},token)
  }
  queue=[{action:'final',final_answer:'Synthetic text with all headings; not a certified research report.'}]
  const finalRun=await run(token,connId,['business_record_write'],[],businessCase.case_id)
  await ok('POST',`/api/llm/agent-engine/${finalRun}/tick`,{},token)
  const finalDetail=await ok('GET',`/api/agent-runs/${finalRun}/detail`,undefined,token)
  assert.equal(finalDetail.run.status,'succeeded')
  assert.equal(finalDetail.run.checkpoint.business_quality.business_quality,'qualified_partial')
  assert.equal(finalDetail.run.checkpoint.business_quality.free_text_report_quality,'unverified','Model final must not certify its own text')
  queue=[{action:'tool',tool:'calculate',tool_input:{expression:'1+1'}}]
  const stoppedRun=await run(token,connId,['calculate'],[],businessCase.case_id,1)
  await ok('POST',`/api/llm/agent-engine/${stoppedRun}/tick`,{},token)
  const stopped=await ok('GET',`/api/agent-runs/${stoppedRun}/detail`,undefined,token)
  assert.equal(stopped.run.status,'failed','Budget termination must not masquerade as full success')
  assert.equal(stopped.run.checkpoint.delivery.state,'partial')
  assert.equal(stopped.run.checkpoint.delivery.generated_without_model,true)
  assert.match(stopped.run.result,/部分交付/);assert.match(stopped.run.result,/正式记录/)
  assert.equal(stopped.run.checkpoint.business_quality.free_text_report_quality,'unverified')
  const budgetQuestion=businessCase.questions[0].question_id
  const callsBeforeBudget=upstreamCalls
  queue=[{action:'tool',tool:'EvidenceSource',tool_input:{}}]
  const noToolRun=await run(token,connId,['EvidenceSource'],[],businessCase.case_id,20,{tool_calls:0},budgetQuestion)
  await ok('POST',`/api/llm/agent-engine/${noToolRun}/tick`,{},token)
  assert.equal(upstreamCalls,callsBeforeBudget,'Zero tool allowance must stop before outbound HTTP')
  const noToolDetail=await ok('GET',`/api/agent-runs/${noToolRun}/detail`,undefined,token)
  assert.equal(noToolDetail.run.status,'failed');assert.match(noToolDetail.run.result,/部分交付/)
  const noToolUsage=await ok('GET',`/api/agent-runs/${noToolRun}/budget`,undefined,token)
  assert.equal(noToolUsage.usage.tool_intents,0);assert.equal(noToolUsage.question_id,budgetQuestion)
  assert.equal((await api('GET',`/api/agent-runs/${noToolRun}/budget`,undefined,readerToken)).status,404)
  queue=[{action:'tool',tool:'calculate',tool_input:{expression:'1+1'}},{action:'final',final_answer:'Reserved closing draft; synthetic only.'}]
  const closingRun=await run(token,connId,['calculate'],[],businessCase.case_id,20,{model_calls:2,closing_model_calls:1},budgetQuestion)
  await ok('POST',`/api/llm/agent-engine/${closingRun}/tick`,{},token)
  await stopHeadlessPocketBase(pb);await startPB()
  await ok('POST',`/api/llm/agent-engine/${closingRun}/tick`,{},token)
  const closingDetail=await ok('GET',`/api/agent-runs/${closingRun}/detail`,undefined,token)
  assert.equal(closingDetail.run.status,'failed');assert.match(closingDetail.run.result,/部分交付/)
  assert.equal(closingDetail.run.checkpoint.closing_draft,'Reserved closing draft; synthetic only.')
  const closingUsage=await ok('GET',`/api/agent-runs/${closingRun}/budget`,undefined,token)
  assert.equal(closingUsage.usage.model_intents,2);assert.equal(closingUsage.usage.closing_intents,1)
  queue=[{action:'tool',tool:'EvidenceSource',tool_input:{}}]
  const closingOnly=await run(token,connId,['EvidenceSource'],[],businessCase.case_id,20,{model_calls:1,closing_model_calls:1})
  await ok('POST',`/api/llm/agent-engine/${closingOnly}/tick`,{},token)
  assert.equal(upstreamCalls,callsBeforeBudget,'A closing-only model response cannot dispatch tools')
  assert.equal((await ok('GET',`/api/agent-runs/${closingOnly}/budget`,undefined,token)).usage.tool_intents,0)
  const beforeZeroModels=prompts.length
  const noModel=await run(token,connId,['calculate'],[],businessCase.case_id,20,{model_calls:0,closing_model_calls:0})
  await ok('POST',`/api/llm/agent-engine/${noModel}/tick`,{},token)
  assert.equal(prompts.length,beforeZeroModels,'Zero total model allowance sends no provider request')
  // G03/G09: the real Worker advances a registered job with the same identity
  // after server/process restart; no model or provider request is repeated.
  assert.equal((await api('POST','/api/internal/worker/jobs-step',{},token)).status,401)
  assert.equal((await api('POST',casePath+'/jobs',{type:'arbitrary.script',idempotency_key:'bad'},token)).status,400)
  const jobInput={type:'research.freeze.v1',idempotency_key:'freeze-one'}
  const job=await ok('POST',casePath+'/jobs',jobInput,token)
  assert.equal((await ok('POST',casePath+'/jobs',jobInput,token)).job_id,job.job_id)
  assert.equal((await api('GET',`/api/business/jobs/${job.job_id}`,undefined,readerToken)).status,404)
  await workerOnce()
  const progress=await ok('GET',`/api/business/jobs/${job.job_id}`,undefined,token)
  assert.equal(progress.status,'running');assert.equal(progress.progress.schema_index,1)
  const callsBeforeRestart=upstreamCalls
  await stopHeadlessPocketBase(pb);await startPB()
  await workerOnce();await workerOnce();await workerOnce()
  const completed=await ok('GET',`/api/business/jobs/${job.job_id}`,undefined,token)
  assert.equal(completed.status,'succeeded',JSON.stringify(completed))
  assert.equal(upstreamCalls,callsBeforeRestart,'Resuming a job must reuse saved evidence')
  const factId=completed.artifact.fact_set_id
  const fact=await ok('GET',casePath+`/fact-sets/${factId}`,undefined,token)
  assert.equal(fact.payload.records.find(r=>r.record_id===entity.record_id).version,4)
  assert.equal(fact.payload.reference_records.find(r=>r.record_id===entity.record_id).version,2,'Historical relation versions must remain explicit in the frozen set')
  const renderInput={fact_set_id:factId,template_id:'research.brief.v1',format:'html',idempotency_key:'report-one'}
  const report=await ok('POST',casePath+'/reports',renderInput,token)
  assert.equal(report.file_ready,true);assert.equal(report.manifest.data_space,'DEMO')
  assert.equal((await ok('POST',casePath+'/reports',renderInput,token)).report_id,report.report_id)
  assert.equal((await api('POST',casePath+'/reports',{...renderInput,format:'md'},token)).status,409)
  assert.equal((await api('POST',casePath+'/reports',{...renderInput,format:'exe',idempotency_key:'unsupported-format'},token)).status,400)
  const downloadPath=casePath+`/reports/${report.report_id}/download`
  const download=await fetch(origin+downloadPath,{headers:{Authorization:token}})
  assert.equal(download.status,200);assert.match(download.headers.get('content-type'),/text\/html/)
  assert.match(download.headers.get('content-disposition'),/attachment/)
  const reportContent=await download.text()
  assert.match(reportContent,/&lt;script&gt;fixture\(\)&lt;\/script&gt;/);assert.doesNotMatch(reportContent,/<script>/)
  assert.match(reportContent,/引文节选/)
  assert.ok(report.manifest.excerpted_fields.includes(currentResult))
  assert.equal((await fetch(origin+downloadPath,{headers:{Authorization:readerToken}})).status,404)
  const fullReport=await ok('POST',casePath+'/reports',{...renderInput,template_id:'research.full.v1',format:'md',idempotency_key:'report-full'},token)
  assert.equal(fullReport.fact_set_id,report.fact_set_id)
  const fullFile=await fetch(origin+casePath+`/reports/${fullReport.report_id}/download`,{headers:{Authorization:token}})
  assert.equal(fullFile.status,200);assert.match(await fullFile.text(),/EVIDENCE_10000/,'Full report must retain late source evidence')
  const cancelled=await ok('POST',casePath+'/jobs',{type:'research.freeze.v1',idempotency_key:'cancel-me'},token)
  assert.equal((await ok('POST',`/api/business/jobs/${cancelled.job_id}/cancel`,{},token)).status,'cancelled')
  await jobStep()
  assert.equal((await ok('GET',`/api/business/jobs/${cancelled.job_id}`,undefined,token)).status,'cancelled')
  assert.equal((await ok('POST',`/api/business/jobs/${job.job_id}/cancel`,{},token)).status,'succeeded','Cancellation must not erase finished artifacts')
  await ok('POST',casePath+'/records',{...claimInput,record_id:claim.record_id,expected_version:1,idempotency_key:'claim-v2'},token)
  assert.equal((await ok('GET',casePath+'/quality',undefined,token)).business_quality,'failed','An answer bound to an old claim must not validate a new version silently')
  const oldDownload=await fetch(origin+downloadPath,{headers:{Authorization:token}})
  assert.equal(await oldDownload.text(),reportContent,'Later records must not silently change a rendered file')
  assert.equal((await ok('GET',casePath+`/fact-sets/${factId}`,undefined,token)).content_hash,fact.content_hash)
  const newerJob=await ok('POST',casePath+'/jobs',{type:'research.freeze.v1',idempotency_key:'freeze-two'},token)
  const newer=await completeJob(token,newerJob.job_id)
  assert.equal(newer.status,'succeeded')
  assert.notEqual(newer.artifact.fact_set_id,factId)
  const newerFact=await ok('GET',casePath+`/fact-sets/${newer.artifact.fact_set_id}`,undefined,token)
  assert.equal(newerFact.payload.quality.business_quality,'failed')
  assert.equal(newerFact.payload.reference_records.find(r=>r.record_id===claim.record_id).version,1,'An answer must retain its bound claim, not silently use latest')
  if(process.argv.includes('--browser')) {
    queue=[{action:'tool',tool:readTool,tool_input:{query:'browser-reviewed-request'}}]
    const browserGrantRun=await run(token,connId,[readTool])
    await ok('POST',`/api/llm/agent-engine/${browserGrantRun}/tick`,{},token)
    const {verifyToolResultsBrowser}=await import('./helpers/tool-results-browser.mjs')
    await verifyToolResultsBrowser({root,backendOrigin:origin,runId:id,resultId:currentResult,caseId:businessCase.case_id,recordId:entity.record_id,grantRunId:browserGrantRun,workerOnce})
    await ok('POST',`/api/agent-runs/${browserGrantRun}/cancel`,{},token)
  }
  // Shared source permissions are checked again on each result read, not cached at ingestion.
  const base=await ok('POST','/api/knowledge-bases/manage',{action:'create',name:'Revocable fixture'},token)
  await ok('POST','/api/knowledge-bases/documents',{action:'upload',base_id:base.id,filename:'fixture.md',content:'revocation fixture source evidence '.repeat(20)},token)
  const grant=await ok('POST','/api/knowledge-bases/access',{action:'grant',base_id:base.id,recipient_email:'reader@example.test',role:'viewer'},token)
  const readerConn=await modelConnection(readerToken)
  queue=[{action:'tool',tool:'knowledge_search',tool_input:{query:'revocation fixture'}}]
  const sharedId=await run(readerToken,readerConn,['knowledge_search'],[base.id])
  await ok('POST',`/api/llm/agent-engine/${sharedId}/tick`,{},readerToken)
  const shared=(await ok('GET',`/api/agent-runs/${sharedId}/tool-results`,undefined,readerToken)).items[0]
  assert.ok(shared,'Shared retrieval must create a durable result')
  const sharedEndpoint=`/api/agent-runs/${sharedId}/tool-results/${shared.result_id}`
  const structured=await ok('GET',sharedEndpoint+'?view=envelope',undefined,readerToken)
  assert.ok(structured.envelope.structuredContent.items[0].document_id)
  const derivedCase=await ok('POST','/api/business/cases',{title:'Shared derived fact',data_space:'DEMO',questions:['Source?']},readerToken,201)
  const derivedPath=`/api/business/cases/${derivedCase.case_id}`
  // Even an uncited candidate copied from a shared-KB Run retains that Run's
  // source ACL. Querying it in another Run must not launder the dependency.
  const uncitedCase=await ok('POST','/api/business/cases',{title:'Uncited model-derived candidate',data_space:'DEMO',questions:['Identity?']},readerToken,201),uncitedPath=`/api/business/cases/${uncitedCase.case_id}`
  queue=[{action:'tool',tool:'business_record_write',tool_input:{...entityInput,idempotency_key:'uncited-candidate',payload:{...entityInput.payload,canonical_name:'Synthetic private candidate',identity_status:'CANDIDATE'}}}]
  const uncitedRun=await run(readerToken,readerConn,['knowledge_search','business_record_write'],[base.id],uncitedCase.case_id)
  await ok('POST',`/api/llm/agent-engine/${uncitedRun}/tick`,{},readerToken)
  const uncitedRecord=(await ok('POST',uncitedPath+'/query',{schema_id:'research.entity.v1'},readerToken)).items[0];assert.ok(uncitedRecord);assert.equal(uncitedRecord.source_refs.length,0)
  queue=[{action:'tool',tool:'business_record_query',tool_input:{schema_id:'research.entity.v1'}}]
  const copiedRun=await run(readerToken,readerConn,['business_record_query'],[],uncitedCase.case_id)
  await ok('POST',`/api/llm/agent-engine/${copiedRun}/tick`,{},readerToken)
  const copiedResult=(await ok('GET',`/api/agent-runs/${copiedRun}/tool-results`,undefined,readerToken)).items[0];assert.ok(copiedResult)
  const sharedUpload={filename:'team-evidence.md',base64:Buffer.from('TEAM_MATERIAL_EVIDENCE').toString('base64'),knowledge_base_id:base.id,idempotency_key:'team-material'}
  assert.equal((await api('POST',derivedPath+'/materials',sharedUpload,readerToken)).status,404,'Existing ACL hides editor-only access from a viewer')
  await ok('POST','/api/knowledge-bases/access',{action:'grant',base_id:base.id,recipient_email:'reader@example.test',role:'editor'},token)
  const sharedMaterial=await ok('POST',derivedPath+'/materials',sharedUpload,readerToken)
  const {advanceMaterialJob}=await import('../worker/material-jobs.mjs')
  assert.equal((await advanceMaterialJob(origin,workerKey)).status,'succeeded')
  const teamMaterialRef={material_id:sharedMaterial.material_id,segment_id:'block:1',start:0,end:22,quote:'TEAM_MATERIAL_EVIDENCE'}
  teamMaterialRef.end=teamMaterialRef.quote.length
  const derivedEntity=await ok('POST',derivedPath+'/records',{...entityInput,source_refs:[teamMaterialRef]},readerToken)
  const derivedRef={run_id:sharedId,result_id:shared.result_id,start:0,end:Math.min(200,structured.envelope.text.length),quote:structured.envelope.text.slice(0,200)}
  const derivedClaim=await ok('POST',derivedPath+'/records',{...claimInput,payload:{...claimInput.payload,subject_id:derivedEntity.record_id},source_refs:[derivedRef]},readerToken)
  const derivedJob=await ok('POST',derivedPath+'/jobs',{type:'research.freeze.v1',idempotency_key:'revoked-report'},readerToken)
  const derivedFreeze=await completeJob(readerToken,derivedJob.job_id)
  assert.equal(derivedFreeze.status,'succeeded')
  const derivedReport=await ok('POST',derivedPath+'/reports',{...renderInput,fact_set_id:derivedFreeze.artifact.fact_set_id},readerToken)
  queue=[{action:'tool',tool:'business_record_query',tool_input:{schema_id:'research.claim.v1'}}]
  const derivedRun=await run(readerToken,readerConn,['business_record_query'],[],derivedCase.case_id)
  await ok('POST',`/api/llm/agent-engine/${derivedRun}/tick`,{},readerToken)
  const derivedResult=(await ok('GET',`/api/agent-runs/${derivedRun}/tool-results`,undefined,readerToken)).items[0]
  assert.ok(derivedResult)
  await ok('POST','/api/knowledge-bases/access',{action:'revoke',base_id:base.id,recipient_id:grant.recipient_id},token)
  assert.equal((await api('GET',uncitedPath+`/records/${uncitedRecord.record_id}`,undefined,readerToken)).status,403)
  assert.equal((await api('GET',`/api/agent-runs/${copiedRun}/tool-results/${copiedResult.result_id}`,undefined,readerToken)).status,403)
  assert.equal((await api('GET',`/api/business/materials/${sharedMaterial.material_id}`,undefined,readerToken)).status,403)
  assert.equal((await api('GET',`/api/business/materials/${sharedMaterial.material_id}/original`,undefined,readerToken)).status,403)
  assert.equal((await api('GET',`/api/business/materials/${sharedMaterial.material_id}/read?segment_id=block:1`,undefined,readerToken)).status,403)
  assert.equal((await api('GET',derivedPath+`/fact-sets/${derivedFreeze.artifact.fact_set_id}`,undefined,readerToken)).status,403)
  assert.equal((await fetch(origin+derivedPath+`/reports/${derivedReport.report_id}/download`,{headers:{Authorization:readerToken}})).status,403)
  assert.equal((await ok('GET',`/api/business/jobs/${derivedJob.job_id}`,undefined,readerToken)).status,'blocked')
  assert.equal((await api('GET',sharedEndpoint,undefined,readerToken)).status,403)
  assert.equal((await api('GET',sharedEndpoint+'?view=envelope',undefined,readerToken)).status,403)
  assert.equal((await ok('GET',`/api/agent-runs/${sharedId}/tool-results`,undefined,readerToken)).items.length,0)
  assert.equal((await api('GET',derivedPath+`/records/${derivedClaim.record_id}`,undefined,readerToken)).status,403)
  assert.equal((await api('GET',`/api/agent-runs/${derivedRun}/tool-results/${derivedResult.result_id}`,undefined,readerToken)).status,403)
  const deniedDetail=await ok('GET',`/api/agent-runs/${derivedRun}/detail`,undefined,readerToken)
  assert.equal(deniedDetail.run.source_access_revoked,true)
  assert.equal(deniedDetail.run.result,'')
  assert.equal(deniedDetail.run.config,null)
  assert.equal(deniedDetail.spec_snapshot,null)
  assert.ok(deniedDetail.events.every(event=>event.content.source_access_revoked===true))
  assert.equal((await api('POST',`/api/llm/agent-engine/${derivedRun}/tick`,{},readerToken)).status,403)
  assert.equal((await api('POST',`/api/agent-runs/${derivedRun}/evaluate`,{},readerToken)).status,403)
  console.log('PASS tool results: late evidence, 8 intervening steps, Worker/server restart, current employee ACL, revoked shared source, typed ranges; synthetic quality only')
} catch(err) { console.error(logs.slice(-6000));throw err }
finally {
  await stopHeadlessPocketBase(pb)
  await new Promise(resolve=>upstream.close(resolve))
  fs.rmSync(temp,{recursive:true,force:true})
}
