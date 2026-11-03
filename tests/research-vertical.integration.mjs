// One connected DEMO story, not a collection of independent passing tests.
// Real isolated PB/SQLite, employee auth, Node Workers, parsers and PDF bytes.
// Only the loopback model decisions are synthetic; no research-quality claim.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import net from 'node:net'
import {createServer} from 'node:http'
import {spawn} from 'node:child_process'
import {randomBytes,createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'

// Resolves against the selected checkout, so the overlay can run before merge.
const root=fs.realpathSync(process.cwd())
const hooksDir=fs.realpathSync(process.env.AGENT_STUDIO_RESEARCH_VERTICAL_HOOKS_DIR||path.join(root,'pocketbase/pb_hooks'))
const require=createRequire(path.join(root,'package.json'))
const {spawnHeadlessPocketBase,stopHeadlessPocketBase}=await import(pathToFileURL(path.join(root,'tests/helpers/headless-pocketbase.mjs')).href)
const {Document,Packer,Paragraph,TextRun}=require('docx')
const ExcelJS=require('exceljs')
const {PDFDocument}=require('pdf-lib')
const qaRoot=process.env.AGENT_STUDIO_RESEARCH_VERTICAL_QA_DIR||path.join(root,'.tmp/collab-research-vertical-20261102/qa')
if(qaRoot)assert.equal(path.resolve(qaRoot),path.resolve(root,'.tmp/collab-research-vertical-20261102/qa'),'QA output is restricted to this task isolation directory')
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'agentstudio-vertical-'))
const setupKey=randomBytes(32).toString('hex'),workerKey=randomBytes(32).toString('hex')
const syntheticKey='vertical-fixture-only-key',asOf='2026-11-02'
const sha=value=>createHash('sha256').update(value).digest('hex')
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const freePort=()=>new Promise((resolve,reject)=>{
  const server=net.createServer();server.once('error',reject)
  server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):resolve(port))})
})
const port=await freePort(),origin=`http://127.0.0.1:${port}`
const roleQuote='Avery Demo is research director at Example Institute as of 2026-11-02.'
const longText='SYNTHETIC BACKGROUND. '.repeat(300)+roleQuote
assert.ok(longText.indexOf(roleQuote)>4000&&longText.length<7900)
const email='liaison@example.test'
let pb,logs='',token='',owner='',outsider='',casePath='',business,base,grant
let decisions=[],modelCalls=0,observedLatePrompt=false,workerCount=0,roleRun=''
let sourceResult,entity,roleClaim,projectClaim,contactClaim
const answers=new Map(),workers=new Set(),workerPids=[]
const evidence={schema:'research.vertical.acceptance.v1',data_space:'DEMO',real_model_quality:'not_evaluated',milestones:[],worker_restart:null}
function saveQa(filename,bytes){
  if(!qaRoot)return
  fs.mkdirSync(qaRoot,{recursive:true})
  // Generated case/fact-set IDs make files unique between runs; never overwrite
  // an earlier successful or failed run's evidence.
  const file=path.join(qaRoot,filename);fs.writeFileSync(file,bytes,{flag:'wx'})
  ;(evidence.qa_files||= []).push({path:file,sha256:sha(bytes)})
}
const upstream=createServer(async(req,res)=>{
  const reply=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body))}
  // The fixture rejects unexpected endpoints rather than becoming a proxy.
  if(req.url==='/v1/models'&&req.method==='GET')return reply(200,{data:[{id:'vertical-model'}]})
  if(req.url!=='/v1/chat/completions'||req.method!=='POST')return reply(404,{error:'fixture_route_not_found'})
  try{
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1000000)throw Error('fixture_request_limit')}
    const input=JSON.parse(raw),messages=input.messages||[]
    const planning=messages.some(m=>m.role==='system'&&String(m.content).includes('助手执行引擎'))
    if(!planning)return reply(200,{choices:[{message:{role:'assistant',content:'Synthetic transport probe/context only.'}}]})
    modelCalls++
    const next=decisions.shift()
    if(!next)return reply(500,{error:'unexpected_planning_call_without_story_action'})
    const prompt=JSON.stringify(messages)
    const decision=typeof next==='function'?next(prompt):next
    reply(200,{choices:[{message:{role:'assistant',content:JSON.stringify(decision)}}]})
  }catch(error){reply(500,{error:'fixture_decision_failed',message:String(error.message).slice(0,180)})}
})
const environment={NODE_ENV:'test',AGENT_STUDIO_AUTH_MODE:'standalone',AGENT_STUDIO_ALLOW_ANON:'false',
  AGENT_STUDIO_BOOTSTRAP_SECRET:setupKey,AGENT_STUDIO_WORKER_TOKEN:workerKey,
  AGENT_STUDIO_BACKGROUND_WORKER:'true',AGENT_STUDIO_WORKER_INTERNAL_URL:origin}
async function api(method,route,body,auth=token,headers={}){
  const response=await fetch(origin+route,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:auth}:{}),...headers},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)})
  return {status:response.status,data:await response.json()}
}
async function ok(method,route,body,auth=token,status=200,headers={}){
  const result=await api(method,route,body,auth,headers)
  assert.equal(result.status,status,route+' returned '+result.status+' '+JSON.stringify(result.data).slice(0,700))
  return result.data
}
async function startPB(){
  pb=spawnHeadlessPocketBase(path.join(root,'vibex-local/bin/windows/pocketbase.exe'),[
    'serve',`--http=127.0.0.1:${port}`,`--dir=${temp}`,`--hooksDir=${hooksDir}`,
  ],{cwd:path.join(root,'pocketbase'),env:environment})
  pb.stdout.on('data',b=>{logs=(logs+b).slice(-12000)});pb.stderr.on('data',b=>{logs=(logs+b).slice(-12000)})
  for(let n=0;n<150;n++){
    if(pb.exitCode!==null)throw Error('isolated_pocketbase_exited_before_ready')
    try{if((await fetch(origin+'/api/health',{signal:AbortSignal.timeout(1000)})).ok)return}catch{}
    await sleep(100)
  }
  throw Error('isolated_pocketbase_not_ready')
}
async function workerOnce(){
  assert.ok(++workerCount<=140,'bounded single-story Worker budget exceeded')
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['worker/run.mjs','--once','--quiet'],{cwd:root,windowsHide:true,
      env:{...process.env,AGENT_STUDIO_WORKER_URL:origin,AGENT_STUDIO_WORKER_TOKEN:workerKey}})
    workers.add(child);workerPids.push(child.pid)
    let output='',timedOut=false
    const timer=setTimeout(()=>{timedOut=true;child.kill()},180000)
    child.stdout.on('data',b=>{output=(output+b).slice(-10000)});child.stderr.on('data',b=>{output=(output+b).slice(-10000)})
    child.once('error',error=>{clearTimeout(timer);workers.delete(child);reject(error)})
    child.once('close',code=>{
      clearTimeout(timer);workers.delete(child)
      if(timedOut||code!==0)return reject(Error('owned_worker_failed '+code+' '+output.replaceAll(workerKey,'[redacted]').slice(-2500)))
      resolve(child.pid)
    })
  })
}
async function until(label,read,accept,limit=45){
  for(let n=0;n<limit;n++){
    const value=await read();if(accept(value))return value
    await workerOnce();await refreshRecords()
  }
  throw Error('bounded_story_timeout:'+label)
}
const tool=(name,input)=>({action:'tool',tool:name,tool_input:input})
const final=text=>({action:'final',final_answer:text+' Synthetic DEMO; not live research.'})
const write=(schema,key,payload,refs=[],old)=>tool('business_record_write',{
  schema_id:schema,idempotency_key:key,expected_version:old?old.version:0,
  ...(old?{record_id:old.record_id}:{}),payload,source_refs:refs,
})
function questionAnswer(question,answer,status,claims=[],missing=[]){
  return {question_id:question.question_id,answer,status,claim_ids:claims.map(c=>c.record_id),missing,as_of:asOf}
}
function claim(predicate,value){
  assert.ok(entity,'Agent must first persist the shared stable entity')
  return {subject_id:entity.record_id,predicate,object_value:value,valid_from:asOf,valid_to:null,status:'SOURCE_SUPPORTED',missing:[]}
}
async function refreshRecords(){
  if(!casePath)return
  const query=async schema=>{
    const page=await ok('POST',casePath+'/query',{schema_id:schema,offset:0,limit:50})
    assert.equal(page.has_more,false);return page.items
  }
  entity=(await query('research.entity.v1'))[0]
  const claims=await query('research.claim.v1')
  roleClaim=claims.find(r=>r.payload.predicate==='role')
  projectClaim=claims.find(r=>r.payload.predicate==='projects')
  contactClaim=claims.find(r=>r.payload.predicate==='contact')
  for(const record of await query('research.answer.v1'))answers.set(record.payload.question_id,record)
}
const workflowDetail=id=>ok('GET',`/api/workflow-runs/${id}/research`)
const agentDetail=id=>ok('GET',`/api/agent-runs/${id}/detail`)
async function stageChild(parent,stage){
  const detail=await until('create_stage_'+stage,()=>workflowDetail(parent),d=>{
    assert.notEqual(d.status,'failed',JSON.stringify(d).slice(0,900))
    return d.stages.some(s=>s.stage_id===stage)
  })
  return detail.stages.find(s=>s.stage_id===stage).child_run_id
}
async function finishChild(id){
  const detail=await until('child_'+id,async()=>{
    // Replans reserve a child ID durably before its Run is created by Worker.
    const response=await api('GET',`/api/agent-runs/${id}/detail`)
    if(response.status===404)return {run:{status:'launching'}}
    assert.equal(response.status,200,JSON.stringify(response.data));return response.data
  },d=>['succeeded','failed','cancelled','awaiting_approval','awaiting_input'].includes(d.run.status))
  assert.equal(detail.run.status,'succeeded',JSON.stringify(detail.run).slice(0,900))
  assert.equal(decisions.length,0,'the script must be consumed by the real Agent, not test-side writes')
  return detail
}
async function download(report){
  const response=await fetch(origin+casePath+`/reports/${report.report_id}/download`,{headers:{Authorization:token},signal:AbortSignal.timeout(30000)})
  assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/pdf/)
  const bytes=Buffer.from(await response.arrayBuffer())
  assert.equal(bytes.length,report.manifest.byte_count)
  assert.equal(sha(bytes),report.manifest.binary_sha256)
  return bytes
}
async function freezeAndBrief(key){
  const submitted=await ok('POST',casePath+'/jobs',{type:'research.freeze.v1',idempotency_key:key+'-freeze'})
  const job=await until(key+'_freeze',()=>ok('GET',`/api/business/jobs/${submitted.job_id}`),j=>!['queued','running'].includes(j.status),8)
  assert.equal(job.status,'succeeded',JSON.stringify(job))
  const fact=await ok('GET',casePath+`/fact-sets/${job.artifact.fact_set_id}`)
  const input={fact_set_id:fact.fact_set_id,template_id:'research.brief.v1',format:'pdf',idempotency_key:key+'-brief'}
  const queued=await ok('POST',casePath+'/reports',input)
  assert.equal(queued.file_ready,false,'download must wait for actual rendering')
  assert.equal((await api('GET',casePath+`/reports/${queued.job_id}/download`)).status,404)
  const rendered=await until(key+'_render',()=>ok('GET',`/api/business/jobs/${queued.job_id}`),j=>!['queued','running'].includes(j.status),5)
  assert.equal(rendered.status,'succeeded',JSON.stringify(rendered))
  const receipt=await ok('POST',casePath+'/reports',input)
  assert.equal(receipt.file_ready,true);assert.equal(receipt.manifest.fact_set_hash,fact.content_hash)
  const bytes=await download(receipt),pdf=await PDFDocument.load(bytes)
  assert.equal(pdf.getPageCount(),1,'the bounded three-question story must deliver an actual one-page brief')
  // Extract actual file text, not its renderer manifest or an expected string.
  const pdfjs=await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href)
  const task=pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:false,isEvalSupported:false})
  let text=''
  try{const document=await task.promise;const page=await document.getPage(1);text=(await page.getTextContent()).items.map(i=>i.str).join(' ')}finally{await task.destroy()}
  for(const value of [fact.fact_set_id,fact.content_hash,'director','7','DEMO'])assert.ok(text.includes(value),'actual brief missing '+value)
  saveQa(key+'-'+fact.fact_set_id+'.pdf',bytes)
  return {fact,receipt,bytes,text}
}

try{
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve))
  const remote=`http://127.0.0.1:${upstream.address().port}`
  Object.assign(environment,{AGENT_STUDIO_CAPABILITY_TEST_ONLY:'true',AGENT_STUDIO_CAPABILITY_TEST_ORIGIN:remote})
  await startPB()
  await ok('POST','/api/studio/bootstrap',{email:'source-owner@example.test',password:'Fixture-Password-2026',display_name:'Source owner'},'',201,{'X-Agent-Studio-Setup-Key':setupKey})
  owner=(await ok('POST','/api/collections/studio_users/auth-with-password',{identity:'source-owner@example.test',password:'Fixture-Password-2026'},'')).token
  for(const identity of ['researcher','outsider'])await ok('POST','/api/studio/users',{email:identity+'@example.test',password:'Fixture-Password-2026',display_name:identity,role:'employee'},owner,201)
  token=(await ok('POST','/api/collections/studio_users/auth-with-password',{identity:'researcher@example.test',password:'Fixture-Password-2026'},'')).token
  outsider=(await ok('POST','/api/collections/studio_users/auth-with-password',{identity:'outsider@example.test',password:'Fixture-Password-2026'},'')).token
  base=await ok('POST','/api/knowledge-bases/manage',{action:'create',name:'Revocable vertical sources'},owner)
  grant=await ok('POST','/api/knowledge-bases/access',{action:'grant',base_id:base.id,recipient_email:'researcher@example.test',role:'editor'},owner)
  business=await ok('POST','/api/business/cases',{title:'Avery Demo: research brief',data_space:'DEMO',questions:['Current role?','Projects recorded?','Formal contact?']},token,201)
  casePath=`/api/business/cases/${business.case_id}`
  const [q1,q2,q3]=business.questions
  const word=await Packer.toBuffer(new Document({sections:[{children:[new Paragraph({children:[new TextRun(longText)]})]}]}))
  const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Research')
  sheet.addRow(['Person','Projects','As of','Formal contact']);sheet.addRow(['Avery Demo',7,asOf,email])
  const excel=Buffer.from(await workbook.xlsx.writeBuffer())
  assert.equal(word.subarray(0,2).toString(),'PK');assert.equal(excel.subarray(0,2).toString(),'PK')
  saveQa(business.case_id+'-profile.docx',word);saveQa(business.case_id+'-research.xlsx',excel)
  const upload=async(filename,bytes,key)=>ok('POST',casePath+'/materials',{filename,base64:bytes.toString('base64'),knowledge_base_id:base.id,idempotency_key:key})
  const docx=await upload('profile.docx',word,'profile-original'),xlsx=await upload('research.xlsx',excel,'workbook-original')
  for(const material of [docx,xlsx]){
    const info=await until('parse_'+material.material_id,()=>ok('GET',`/api/business/materials/${material.material_id}`),m=>!['queued','running'].includes(m.job_status),5)
    assert.equal(info.job_status,'succeeded');assert.equal(info.parse.coverage.ocr_performed,false)
    const original=await ok('GET',`/api/business/materials/${material.material_id}/original`)
    assert.equal(sha(Buffer.from(original.base64,'base64')),sha(material===docx?word:excel))
    assert.equal((await api('GET',`/api/business/materials/${material.material_id}/original`,undefined,outsider)).status,404)
  }
  const passage=await ok('GET',`/api/business/materials/${docx.material_id}/read?segment_id=block:1&limit=8000`)
  const quoteStart=passage.text.indexOf(roleQuote);assert.ok(quoteStart>4000)
  const roleRef={material_id:docx.material_id,segment_id:'block:1',start:quoteStart,end:quoteStart+roleQuote.length,quote:roleQuote}
  const cellRef=(cell,quote)=>({material_id:xlsx.material_id,segment_id:'sheet:1:cell:'+cell,start:0,end:quote.length,quote})
  evidence.milestones.push({step:'originals_parsed',materials:[{id:docx.material_id,sha256:sha(word)},{id:xlsx.material_id,sha256:sha(excel)}],late_offset:quoteStart})
  const connection=await ok('POST','/api/model-connections',{name:'Vertical synthetic decisions',provider:'openai',api_key:syntheticKey,base_url:remote+'/v1',models:['vertical-model']})
  assert.equal((await ok('POST','/api/model-connections/test',{connection_id:connection.item.id})).ok,true)
  const spec=await ok('POST','/api/agent_specs',{name:'Single-target research story',spec:{goal:'Answer three questions from private originals',task_scope:'Synthetic DEMO only',tools:['business_material_read','business_record_write','calculate'],task_plan:['Read evidence','Persist formal facts','Keep unknowns explicit'],deliverables:['Frozen brief'],done_criteria:['Three explicit answers; evidence and review required']}})
  const stages=['role','projects','contact']
  const nodes=[{id:'start',type:'start',data:{title:'Start'}},...stages.map(id=>({id,type:'agent',data:{title:id,spec_id:spec.id,prompt:'{{input}}'}})),{id:'end',type:'end',data:{title:'End'}}].map((node,i)=>({...node,position:{x:i*200,y:100}}))
  const workflow=await ok('POST','/api/workflow-studio/create',{name:'One connected research story',graph:{nodes,edges:['start',...stages].map((source,i)=>({id:'edge-'+i,source,target:[...stages,'end'][i]}))}})
  const research={case_id:business.case_id,custom_model:{connection_id:connection.item.id,model_id:'vertical-model'},budget:{model_calls:70,tool_calls:65,closing_model_calls:0,wall_ms:1800000},stages:Object.fromEntries(stages.map((id,i)=>[id,{question_id:business.questions[i].question_id,max_steps:24,acceptance:'answer_present'}]))}
  const parent=(await ok('POST','/api/workflow-runs/start',{workflow_id:workflow.id,instruction:'Research Avery Demo using only the two private original materials.',research})).run_id
  roleRun=await stageChild(parent,'role')
  decisions=[tool('business_material_read',{material_id:docx.material_id,segment_id:'block:1',offset:0,limit:8000})]
  const resultList=await until('first_durable_material_read',()=>ok('GET',`/api/agent-runs/${roleRun}/tool-results`),list=>list.items.some(r=>r.tool==='business_material_read'),10)
  const beforeRestartPid=workerPids.at(-1)
  assert.equal(decisions.length,0)
  sourceResult=resultList.items.find(r=>r.tool==='business_material_read');assert.ok(sourceResult)
  const endpoint=`/api/agent-runs/${roleRun}/tool-results/${sourceResult.result_id}`
  const stored=await ok('GET',endpoint+'?limit=8000'),resultOffset=stored.text.indexOf(roleQuote)
  assert.ok(resultOffset>4000,'late source must really be late in the persisted tool output')
  const beforeSteps=(await agentDetail(roleRun)).run.checkpoint.steps.length
  // Both workerOnce and its pipes have CLOSED before restarting PB and a fresh
  // Worker. This verifies checkpoint-boundary recovery, not an in-flight kill.
  await stopHeadlessPocketBase(pb);pb=null;await startPB()
  assert.equal((await workflowDetail(parent)).stages.find(s=>s.stage_id==='role').child_run_id,roleRun)
  assert.equal((await agentDetail(roleRun)).run.checkpoint.steps.length,beforeSteps)
  assert.equal((await ok('GET',endpoint+'?limit=8000')).content_hash,stored.content_hash)
  decisions=[
    ()=>write('research.entity.v1','target-identity',{canonical_name:'Avery Demo',entity_type:'PERSON',aliases:[],identity_status:'CONFIRMED',identity_basis:'Synthetic fixture identity only.'},[roleRef]),
    ...Array.from({length:8},(_,i)=>tool('calculate',{expression:`${i}+1`})),
    ()=>tool('result_read',{result_id:sourceResult.result_id,offset:resultOffset,limit:roleQuote.length}),
    prompt=>{
      assert.ok(prompt.includes(roleQuote),'late range must reach the next real planner after eight intervening steps')
      observedLatePrompt=true
      return write('research.claim.v1','role-fact',claim('role','research director'),[roleRef,{run_id:roleRun,result_id:sourceResult.result_id,start:resultOffset,end:resultOffset+roleQuote.length,quote:roleQuote}])
    },
    ()=>write('research.answer.v1','role-answer',questionAnswer(q1,'Research director.','ANSWERED',[roleClaim])),
    final('Role evidence retained.'),
  ]
  const afterRestartPid=await workerOnce();await refreshRecords()
  assert.notEqual(afterRestartPid,beforeRestartPid)
  evidence.worker_restart={before_pid:beforeRestartPid,after_pid:afterRestartPid,child_run_id:roleRun,result_id:sourceResult.result_id,content_hash:stored.content_hash,mode:'closed_worker_checkpoint_then_server_restart'}
  await finishChild(roleRun);assert.equal(observedLatePrompt,true)
  assert.equal((await ok('GET',`/api/agent-runs/${roleRun}/tool-results`)).items.filter(r=>r.tool==='business_material_read').length,1,'restart must reuse the original material read')
  const projectsRun=await stageChild(parent,'projects')
  decisions=[tool('business_material_read',{material_id:xlsx.material_id,segment_id:'sheet:1:cell:B2'}),
    ()=>write('research.claim.v1','projects-fact',claim('projects','7'),[cellRef('B2','7')]),
    ()=>write('research.answer.v1','projects-answer',questionAnswer(q2,'7 projects.','ANSWERED',[projectClaim])),final('Project count stored.')]
  await finishChild(projectsRun)
  const contactRun=await stageChild(parent,'contact')
  decisions=[write('research.answer.v1','contact-unknown',questionAnswer(q3,'Not yet verified.','UNKNOWN',[],['Formal contact cell has not been read.'])),final('Contact remains an explicit gap.')]
  await finishChild(contactRun)
  const firstDone=await until('first_parent',()=>workflowDetail(parent),d=>['succeeded','failed'].includes(d.status))
  assert.equal(firstDone.status,'succeeded')
  const qualityBeforeReview=await ok('GET',casePath+'/quality')
  assert.equal(qualityBeforeReview.business_quality,'needs_review','model final cannot approve its own facts')
  for(const record of [roleClaim,projectClaim])await ok('POST',casePath+'/reviews',{record_id:record.record_id,record_version:record.version,decision:'accepted',rationale:'Synthetic test reviewer matched the fixed source passage/cell; not real employee UAT.'},token,201)
  assert.equal((await ok('GET',casePath+'/quality')).business_quality,'qualified_partial')
  const first=await freezeAndBrief('initial')
  assert.ok(first.text.includes('Not yet verified.'))
  const initialPins=[entity,roleClaim,projectClaim,answers.get(q1.question_id),answers.get(q2.question_id)].map(r=>({id:r.record_id,version:r.version,payload:r.payload}))
  evidence.milestones.push({step:'initial_partial_brief',parent_run_id:parent,fact_set_id:first.fact.fact_set_id,report_id:first.receipt.report_id,pdf_sha256:sha(first.bytes),pages:1})
  const request={question_ids:[q3.question_id]}
  const preview=await ok('POST',`/api/workflow-runs/${parent}/replan-preview`,request)
  assert.equal(preview.can_start,true,JSON.stringify(preview.blocked))
  assert.deepEqual(preview.decisions.map(d=>[d.stage_id,d.action]),[['role','reuse'],['projects','reuse'],['contact','run']])
  const create={idempotency_key:'only-contact-gap',preview_hash:preview.preview_hash,request}
  const recovery=await ok('POST',`/api/workflow-runs/${parent}/replan`,create)
  const recoveredId=recovery.run_id
  assert.equal((await ok('POST',`/api/workflow-runs/${parent}/replan`,create)).run_id,recoveredId)
  const repairRun=await stageChild(recoveredId,'contact'),savedUnknown=answers.get(q3.question_id),savedRole=answers.get(q1.question_id)
  const callsBeforeRepair=modelCalls
  decisions=[
    // This attack is rejected by actual question scoping, then the selected
    // question proceeds. A failed attack must never revise question one.
    write('research.answer.v1','wrong-question-write',{...savedRole.payload,answer:'Must not replace verified role.'},[],savedRole),
    tool('business_material_read',{material_id:xlsx.material_id,segment_id:'sheet:1:cell:D2'}),
    ()=>write('research.claim.v1','contact-fact',claim('contact',email),[cellRef('D2',email)]),
    ()=>write('research.answer.v1','contact-answer',questionAnswer(q3,email,'ANSWERED',[contactClaim]),[],savedUnknown),
    final('Only contact gap repaired.'),
  ]
  const repairedChild=await finishChild(repairRun)
  assert.ok(repairedChild.events.some(e=>/run_question_(?:scope_)?mismatch/.test(JSON.stringify(e.content))),'actual out-of-scope write must be visibly refused')
  const secondDone=await until('recovered_parent',()=>workflowDetail(recoveredId),d=>['succeeded','failed'].includes(d.status))
  assert.equal(secondDone.status,'succeeded')
  const recoveredStages=new Map(secondDone.stages.map(s=>[s.stage_id,s]))
  assert.equal(recoveredStages.get('role').child_run_id,roleRun)
  assert.equal(recoveredStages.get('projects').child_run_id,projectsRun)
  assert.notEqual(recoveredStages.get('contact').child_run_id,contactRun)
  assert.equal(modelCalls-callsBeforeRepair,5,'only the selected stage may issue model decisions')
  for(const pin of initialPins){const current=await ok('GET',casePath+`/records/${pin.id}`);assert.equal(current.version,pin.version);assert.deepEqual(current.payload,pin.payload)}
  assert.equal(answers.get(q3.question_id).version,2)
  await ok('POST',casePath+'/reviews',{record_id:contactClaim.record_id,record_version:contactClaim.version,decision:'accepted',rationale:'Synthetic test review matched the formal contact cell.'},token,201)
  assert.equal((await ok('GET',casePath+'/quality')).business_quality,'passed')
  const second=await freezeAndBrief('completed')
  assert.notEqual(second.fact.fact_set_id,first.fact.fact_set_id)
  assert.ok(second.text.includes(email));assert.ok(!second.text.includes('Not yet verified.'))
  assert.equal((await ok('GET',casePath+`/fact-sets/${first.fact.fact_set_id}`)).content_hash,first.fact.content_hash)
  assert.deepEqual(await download(first.receipt),first.bytes,'old report bytes must remain unchanged')
  const database=new DatabaseSync(path.join(temp,'data.db'),{readOnly:true})
  try{
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM agent_studio_business_reviews WHERE case_id=?').get(business.case_id).n,3)
    for(const record of [entity,roleClaim,projectClaim,contactClaim,...answers.values()]){
      const row=database.prepare('SELECT run_id FROM agent_studio_business_records WHERE record_id=? AND version=?').get(record.record_id,record.version)
      assert.ok([roleRun,projectsRun,contactRun,repairRun].includes(row.run_id),'facts must originate from real Agent tool execution')
    }
  }finally{database.close()}
  for(const route of [casePath,casePath+`/fact-sets/${first.fact.fact_set_id}`,casePath+`/records/${entity.record_id}`,`/api/workflow-runs/${recoveredId}/research`,`/api/agent-runs/${roleRun}/tool-results/${sourceResult.result_id}`])assert.equal((await api('GET',route,undefined,outsider)).status,404,route)
  for(const report of [first,second])assert.equal((await fetch(origin+casePath+`/reports/${report.receipt.report_id}/download`,{headers:{Authorization:outsider}})).status,404)
  await ok('POST','/api/knowledge-bases/access',{action:'revoke',base_id:base.id,recipient_id:grant.recipient_id},owner)
  for(const route of [`/api/business/materials/${docx.material_id}/original`,`/api/business/materials/${xlsx.material_id}/read?segment_id=sheet:1:cell:D2`,casePath+`/records/${roleClaim.record_id}`,casePath+`/fact-sets/${first.fact.fact_set_id}`,casePath+`/fact-sets/${second.fact.fact_set_id}`,endpoint])assert.equal((await api('GET',route)).status,403,route)
  for(const report of [first,second])assert.equal((await fetch(origin+casePath+`/reports/${report.receipt.report_id}/download`,{headers:{Authorization:token}})).status,403)
  const hidden=await agentDetail(roleRun);assert.equal(hidden.run.source_access_revoked,true);assert.equal(hidden.run.result,'')
  assert.ok(hidden.events.every(event=>event.content.source_access_revoked===true))
  evidence.milestones.push({step:'only_missing_repaired_and_acl_revoked',revision_run_id:recoveredId,fact_set_id:second.fact.fact_set_id,report_id:second.receipt.report_id,pdf_sha256:sha(second.bytes),pages:1,unchanged_old_pdf_sha256:sha(first.bytes)})
  console.log('RESEARCH_VERTICAL_RESULT '+JSON.stringify({...evidence,status:'PASS',model_calls:modelCalls,worker_processes:workerPids.length}))
}catch(error){
  // No tokens, raw request headers, original binaries, or fixture credentials.
  let diagnostic=logs.slice(-2200)
  for(const secret of [setupKey,workerKey,syntheticKey,token,owner,outsider].filter(Boolean))diagnostic=diagnostic.replaceAll(secret,'[redacted]')
  console.error('RESEARCH_VERTICAL_RESULT '+JSON.stringify({...evidence,status:'FAIL',reason:String(error.message).slice(0,1000),worker_processes:workerPids.length}))
  console.error(diagnostic);throw error
}finally{
  // Only stop handles created here; never enumerate/kill other users' workers.
  for(const child of workers)if(child.exitCode===null)await new Promise(resolve=>{child.once('close',resolve);child.kill()})
  await stopHeadlessPocketBase(pb)
  upstream.closeAllConnections();await new Promise(resolve=>upstream.close(resolve))
  const realTemp=fs.realpathSync(temp),allowed=fs.realpathSync(os.tmpdir())
  assert.equal(path.dirname(realTemp).toLowerCase(),allowed.toLowerCase())
  assert.ok(path.basename(realTemp).startsWith('agentstudio-vertical-'))
  fs.rmSync(realTemp,{recursive:true,force:true})
}
