// Real isolated PocketBase Agent engine -> local deterministic model HTTP boundary.
// The completed WorkBuddy job and PNG are synthetic; no native app or paid model runs.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {createServer} from 'node:http'
import {createServer as createNetServer} from 'node:net'
import {randomBytes} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from './helpers/headless-pocketbase.mjs'

const root=await fs.realpath(process.cwd()),parent=path.join(root,'.tmp')
const binary=process.env.POCKETBASE_BIN||path.join(root,'vibex-local/bin/windows/pocketbase.exe')
const previousTemp=Object.fromEntries(['TEMP','TMP','TMPDIR'].map(name=>[name,process.env[name]]))
const bootstrapSecret=randomBytes(32).toString('hex'),password='Synthetic-visual-context-2026!'
const modelId='visual-context-fixture',appId='a'.repeat(24)
const observation='0123456789abcdef0123456789abcdef'
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4f8AAAAASUVORK5CYII='
const metadata={
 application:'Synthetic WorkBuddy research and report drafting acceptance window',mode:'vision',
 window:{id:'1376950',width:1600,height:900,foreground:true},imageSize:{width:1,height:1},
 captureSource:'visible_window',coordinateSpace:'image_pixels',actionable:true,observation,
 expiresInSeconds:30,message:'Synthetic screenshot only. Input appends to the draft; verify the next screenshot before claiming completion.',
}
const resultText=JSON.stringify(metadata),engineRequests=[],modelErrors=[]
let directory,dataDirectory,pb,token='',origin='',logs='',stage='setup',failure=null,cleanup='pending',savedReference='',chosenDecision=null
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const model=createServer((req,res)=>{void (async()=>{
 res.setHeader('Content-Type','application/json')
 if(req.method==='GET'&&req.url==='/v1/models'){
  res.end(JSON.stringify({data:[{id:modelId}]}));return
 }
 if(req.method!=='POST'||req.url!=='/v1/chat/completions'){
  res.writeHead(404);res.end(JSON.stringify({error:'unexpected_fixture_route'}));return
 }
 let raw='';for await(const chunk of req)raw+=chunk
 const body=JSON.parse(raw)
 const planning=(body.messages||[]).some(message=>message.role==='system'&&String(message.content).includes('助手执行引擎'))
 if(planning)engineRequests.push(body)
 // Exercise the user's intervening read sequence, without any desktop action.
 const decision=chosenDecision||(planning&&engineRequests.length<=2
  ?{action:'tool',tool:'result_read',tool_input:{result_id:savedReference,
    field:engineRequests.length===1?'content':'text',offset:0,limit:8000}}
  :{action:'tool',tool:'apps.act_visual',tool_input:{app:appId,observation,
    x:0,y:0,action:'type',text:'Public research fixture; approval must remain mandatory.'}})
 res.end(JSON.stringify({choices:[{message:{role:'assistant',content:JSON.stringify(decision)}}]}))
 })().catch(error=>{
  modelErrors.push(String(error.message).slice(0,150))
  if(!res.headersSent)res.writeHead(500)
  res.end(JSON.stringify({error:'fixture_request_failed'}))
 })})

async function listen(server){
 await new Promise((resolve,reject)=>{
  server.once('error',reject)
  server.listen(0,'127.0.0.1',()=>{server.removeListener('error',reject);resolve()})
 })
 return server.address().port
}
async function closeServer(server){
 if(!server.listening)return
 server.closeAllConnections?.()
 await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))
}
async function freePort(){
 const probe=createNetServer()
 try{return await listen(probe)}finally{await closeServer(probe)}
}
async function request(method,route,body,{auth=token,headers={},expected=200}={}){
 const response=await fetch(origin+route,{method,headers:{'Content-Type':'application/json',
  ...(auth?{Authorization:auth}:{}),...headers},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)})
 const value=await response.json().catch(()=>({}))
 assert.equal(response.status,expected,method+' '+route+' returned '+response.status+' '+String(value.error||''))
 return value
}
async function removeOwnedDirectory(){
 if(!directory)return
 assert.equal((await fs.lstat(parent)).isSymbolicLink(),false,'temporary parent must not be a replaced directory link')
 assert.equal(await fs.realpath(parent),parent,'cleanup parent must still resolve inside this workspace')
 const actual=await fs.realpath(directory),intended=await fs.realpath(parent)
 assert.equal(path.dirname(actual).toLowerCase(),intended.toLowerCase(),'temporary directory must stay under this project')
 assert.ok(path.basename(actual).startsWith('agentstudio-visual-context-'),'owned temporary prefix required')
 assert.equal((await fs.lstat(directory)).isSymbolicLink(),false,'never traverse a replaced fixture link')
 const rejectLinks=async dir=>{
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
   assert.equal(entry.isSymbolicLink(),false,'never traverse a link during fixture cleanup')
   if(entry.isDirectory())await rejectLinks(path.join(dir,entry.name))
  }
 }
 await rejectLinks(actual)
 await fs.rm(actual,{recursive:true,force:true,maxRetries:5,retryDelay:200})
 cleanup='removed'
}

try{
 await fs.access(binary)
 await fs.mkdir(parent,{recursive:true})
 assert.equal((await fs.lstat(parent)).isSymbolicLink(),false,'temporary parent must not be a directory link')
 assert.equal(await fs.realpath(parent),parent,'temporary parent must resolve inside this workspace')
 directory=await fs.mkdtemp(path.join(parent,'agentstudio-visual-context-'))
 for(const name of ['TEMP','TMP','TMPDIR'])process.env[name]=directory
 // The shared launcher requires a disposable direct child of the process TEMP.
 dataDirectory=await fs.mkdtemp(path.join(os.tmpdir(),'agentstudio-pb-'))
 const modelPort=await listen(model),port=await freePort()
 origin='http://127.0.0.1:'+port
 pb=spawnHeadlessPocketBase(binary,['serve','--http=127.0.0.1:'+port,'--dir='+dataDirectory,
  '--hooksDir='+path.join(root,'pocketbase/pb_hooks')],{cwd:path.join(root,'pocketbase'),env:{
  TEMP:directory,TMP:directory,TMPDIR:directory,AGENT_STUDIO_AUTH_MODE:'standalone',
  AGENT_STUDIO_LEGACY_TEST_ONLY:'false',AGENT_STUDIO_ALLOW_ANON:'false',
  AGENT_STUDIO_BACKGROUND_WORKER:'false',AGENT_STUDIO_BOOTSTRAP_SECRET:bootstrapSecret,
  AGENT_STUDIO_SECRET_KEY:randomBytes(16).toString('hex'),AGENT_STUDIO_STRICT_SECRETS:'true',
 }})
 pb.stdout.on('data',chunk=>{logs=(logs+chunk).slice(-6000)})
 pb.stderr.on('data',chunk=>{logs=(logs+chunk).slice(-6000)})
 let ready=false
 for(let i=0;i<150;i++){
  if(pb.exitCode!==null)break
  try{if((await fetch(origin+'/api/health',{signal:AbortSignal.timeout(500)})).ok){ready=true;break}}catch{}
  await sleep(100)
 }
 assert.ok(ready,'isolated PocketBase did not become ready')
 const account=await request('POST','/api/studio/bootstrap',{
  email:'visual-context@example.test',password,display_name:'Synthetic visual context owner',
 },{auth:'',headers:{'X-Agent-Studio-Setup-Key':bootstrapSecret},expected:201})
 token=(await request('POST','/api/collections/studio_users/auth-with-password',{
  identity:'visual-context@example.test',password,
 },{auth:''})).token
 assert.ok(token,'synthetic employee must authenticate')
 const connection=await request('POST','/api/model-connections',{
  name:'Synthetic visual context model',provider:'openai',api_key:'synthetic-fixture-not-a-real-key',
  base_url:'http://127.0.0.1:'+modelPort+'/v1',models:[modelId],
 })
 await request('POST','/api/model-connections/test',{connection_id:connection.item.id})
 const device=await request('POST','/api/local-devices',{name:'Synthetic WorkBuddy computer'},{expected:201})
 const paired=await request('POST','/api/public/local-executor/pair',{code:device.pairing_code},{auth:''})
 const advertisedTools=[...Array.from({length:48},(_,i)=>({
  name:'fixture.padding_'+i,description:'Non-executable context fixture. '+'.'.repeat(520),
  inputSchema:{type:'object',properties:{fixture:{type:'string'}},additionalProperties:false},
 })),{
  name:'apps.observe_visual',description:'Synthetic visual observation; no native application is connected.',
  inputSchema:{type:'object',properties:{app:{type:'string',enum:[appId]},window:{type:'string'}},
   required:['app','window'],additionalProperties:false},
 },{
  name:'apps.act_visual',description:'Synthetic input action; this fixture must stop before dispatch.',
  inputSchema:{type:'object',properties:{app:{type:'string',enum:[appId]},observation:{type:'string'},
   x:{type:'integer'},y:{type:'integer'},action:{type:'string',enum:['click','type']},text:{type:'string'}},
   required:['app','observation','x','y','action'],additionalProperties:false},
 }]
 assert.ok(JSON.stringify(advertisedTools).length>24000,'fixture must exercise a catalog accepted beyond the old prompt truncation')
 await request('POST','/api/public/local-executor/poll',{tools:advertisedTools},
  {auth:'',headers:{'X-Studio-Device-Token':paired.token}})
 const spec=await request('POST','/api/agent_specs',{name:'Synthetic visual context regression',spec:{
  goal:'Inspect complete synthetic screenshot metadata at the model boundary',task_scope:'Only isolated fixture data',
  tools:['local_computer'],roles:[],task_plan:['Inspect the supplied synthetic observation'],
  deliverables:['A complete visual context'],done_criteria:['PNG and complete observation metadata arrive together'],
 }})
 const run=await request('POST','/api/agent-runs/start',{
  spec_id:spec.id,instruction:'Inspect the completed synthetic WorkBuddy observation. Do not execute any desktop action.',
  model:modelId,config:{local_device_id:device.id,max_steps:6,max_model_calls:12,tools:{local_computer:true},
   custom_model:{connection_id:connection.item.id,model_id:modelId}},
 })
 const jobId=randomBytes(12).toString('hex'),now=Date.now()
 const db=new DatabaseSync(path.join(dataDirectory,'data.db'),{timeout:5000})
 try{
  const stored=db.prepare('SELECT checkpoint FROM agent_runs WHERE id=?').get(run.run_id)
  assert.ok(stored,'real Agent run must exist before injecting its completed local job')
  const checkpoint=JSON.parse(stored.checkpoint||'{}')
  checkpoint.local_job={id:jobId,local_tool:'apps.observe_visual',plan_node_id:''}
  db.prepare('UPDATE agent_runs SET checkpoint=?,status=? WHERE id=?')
   .run(JSON.stringify(checkpoint),'running',run.run_id)
  // Persist the real local-result wire shape; the production decoder reads it.
  const encoded='\u001eSTUDIO_LOCAL_V1:'+JSON.stringify({text:resultText,images:[{mimeType:'image/png',data:png}]})
  db.prepare("INSERT INTO studio_local_jobs(id,owner,device_id,run_id,job_key,args_hash,payload,status,result,created_ms,deadline_ms) VALUES(?,?,?,?,?,?,?,'succeeded',?,?,?)")
   .run(jobId,account.user.id,device.id,run.run_id,'visual-context-'+jobId,'synthetic-hash',
    JSON.stringify({tool:'apps.observe_visual',arguments:{app:appId,window:metadata.window.id}}),encoded,now,now+120000)
 }finally{db.close()}
 stage='persist_completed_receipt'
 await request('POST','/api/llm/agent-engine/'+run.run_id+'/tick',{})
 const receiptList=await request('GET','/api/agent-runs/'+run.run_id+'/tool-results')
 assert.equal(receiptList.items.length,1,'completed local job must produce one immutable result')
 savedReference=receiptList.items[0].result_id
 const saved=await request('GET','/api/agent-runs/'+run.run_id+'/tool-results/'+savedReference+'?offset=0&limit=8000')
 assert.equal(saved.text,resultText,'full metadata must exist before testing the planner projection')
 for(let round=0;round<3;round++){
  stage=['model_http_boundary','recover_missing_content','retain_image_after_text_read'][round]
  await request('POST','/api/llm/agent-engine/'+run.run_id+'/tick',{})
  assert.deepEqual(modelErrors,[],'local model fixture must not fail while handling requests')
  assert.equal(engineRequests.length,round+1,'each real planner request must reach the local model exactly once')
  const blocks=engineRequests[round].messages.flatMap(message=>Array.isArray(message.content)?message.content:[{type:'text',text:String(message.content||'')}])
  const catalogLine=String(engineRequests[round].messages.find(m=>m.role==='system').content)
   .split('\n').find(line=>line.startsWith('local_computer'))
  let projectedCatalog
  try{projectedCatalog=JSON.parse(catalogLine.slice(catalogLine.indexOf('[{')))}
  catch{assert.fail('LOCAL_CATALOG_TRUNCATED: the model must receive a complete parseable tool catalog, including the final visual input schema')}
  assert.deepEqual(projectedCatalog,advertisedTools,'no currently advertised subtool or schema constraint may disappear from the model contract')
  const images=blocks.filter(block=>block.type==='image_url')
  assert.equal(images.length,1,'planner must retain the private job PNG across result reads')
  assert.equal(images[0].image_url.url,'data:image/png;base64,'+png,'model must receive the exact synthetic PNG')
  const text=blocks.filter(block=>block.type==='text').map(block=>block.text).join('\n')
  assert.ok(text.includes('"observation":"'+observation+'"'),
   'VISUAL_CONTEXT_TRUNCATED: the model HTTP request must include the complete 32-character observation alongside its PNG')
  assert.match(text,/"expiresInSeconds"\s*:\s*30/,'the observation lifetime must reach the same model request')
  assert.match(text,/"actionable"\s*:\s*true/,'the actionability flag must reach the same model request')
  assert.match(text,/"imageSize"\s*:\s*\{\s*"width"\s*:\s*1\s*,\s*"height"\s*:\s*1\s*\}/,
   'the raster coordinate dimensions must reach the same model request')
  if(round===1)assert.ok(text.includes('result_field_unavailable'),'a missing content field must be visible as a recoverable tool error')
  if(round===2)assert.ok(text.includes('"field":"text"'),'the real result_read must have supplied the stored metadata')
 }
 stage='route_catalog_action_to_review'
 const routed=await request('GET','/api/agent-runs/'+run.run_id+'/detail')
 assert.equal(routed.run.status,'awaiting_approval',
  'LOCAL_TOOL_ROUTE_LOST: a currently advertised local action must reach the normal approval instead of an unknown top-level tool error')
 assert.equal(routed.run.checkpoint.pending_approval.tool,'local_computer')
 assert.deepEqual(routed.run.checkpoint.pending_approval.input,{tool:'apps.act_visual',arguments:{
  app:appId,observation,x:0,y:0,action:'type',text:'Public research fixture; approval must remain mandatory.'}})
 assert.equal(routed.events.filter(e=>e.event_type==='tool_call'&&e.content?.tool==='local_computer').length,0,
  'normalizing a tool name must never execute an unapproved local action')
 const assertNoDispatch=async()=>{
  const read=new DatabaseSync(path.join(dataDirectory,'data.db'),{readOnly:true,timeout:5000})
  try{assert.equal(read.prepare("SELECT count(*) AS count FROM studio_local_jobs WHERE status IN ('queued','running')").get().count,0,
   'no route may queue a local operation before its exact approval')}
  finally{read.close()}
 }
 await assertNoDispatch()
 const routeCase=async(label,{authorized=true,revoke=false,tool='apps.act_visual',input={app:appId,observation,x:0,y:0,action:'click'}}={})=>{
  stage=label
  const deniedSpec=await request('POST','/api/agent_specs',{name:'Synthetic route boundary '+label,spec:{
   goal:'Verify a denied route never becomes an executable grant',task_scope:'Isolated fixture only',
   tools:authorized?['local_computer']:[],roles:[],task_plan:['Inspect one model decision'],
   deliverables:['Denied route evidence'],done_criteria:['No unapproved device job exists'],
  }})
  const deniedRun=await request('POST','/api/agent-runs/start',{spec_id:deniedSpec.id,instruction:'Synthetic route boundary only',
   model:modelId,config:{...(authorized?{local_device_id:device.id}:{}),max_steps:6,max_model_calls:12,
    tools:{},custom_model:{connection_id:connection.item.id,model_id:modelId}}})
  if(revoke)await request('POST','/api/local-devices/'+device.id+'/revoke',{})
  chosenDecision={action:'tool',tool,tool_input:input}
  await request('POST','/api/llm/agent-engine/'+deniedRun.run_id+'/tick',{})
  const detail=await request('GET','/api/agent-runs/'+deniedRun.run_id+'/detail')
  assert.notEqual(detail.run.status,'awaiting_approval',label+' must not produce an executable approval')
  assert.equal(Boolean(detail.run.checkpoint?.pending_approval),false,label+' must not create pending authority')
  await assertNoDispatch()
 }
 await routeCase('unknown_local_tool',{tool:'apps.not_registered'})
 await routeCase('local_computer_not_authorized',{authorized:false})
 await routeCase('malformed_local_arguments',{input:[]})
 await routeCase('null_local_arguments',{input:null})
 await routeCase('primitive_local_arguments',{input:'invalid'})
 stage='approved_alias_is_enqueued_once'
 const planningCallsBeforeApproval=engineRequests.length
 await request('POST','/api/agent-runs/'+run.run_id+'/approve',{decision:'approve'})
 await request('POST','/api/llm/agent-engine/'+run.run_id+'/tick',{})
 await request('POST','/api/llm/agent-engine/'+run.run_id+'/tick',{})
 assert.equal(engineRequests.length,planningCallsBeforeApproval,'resuming the reviewed alias must not ask the model to rewrite its approved arguments')
 let approvedJob
 const queued=new DatabaseSync(path.join(dataDirectory,'data.db'),{readOnly:true,timeout:5000})
 try{
  const rows=queued.prepare('SELECT id,status,payload FROM studio_local_jobs WHERE run_id=? AND id<>?').all(run.run_id,jobId)
  assert.equal(rows.length,1,'a repeated tick must not enqueue a second copy of the approved input')
  approvedJob=rows[0]
  assert.equal(approvedJob.status,'queued','the fixture must stop before any native executor claims the action')
  assert.deepEqual(JSON.parse(approvedJob.payload).arguments,routed.run.checkpoint.pending_approval.input.arguments)
  assert.equal(JSON.parse(approvedJob.payload).tool,'apps.act_visual')
 }finally{queued.close()}
 await request('POST','/api/local-jobs/'+approvedJob.id+'/cancel',{})
 await assertNoDispatch()
 await routeCase('revoked_device_cannot_route',{revoke:true})
}catch(error){failure=error}
finally{
 const stopped=await Promise.allSettled([stopHeadlessPocketBase(pb),closeServer(model)])
 const stopFailure=stopped.find(result=>result.status==='rejected')
 if(stopFailure){cleanup='retained';failure=failure||stopFailure.reason}
 else{
  try{await removeOwnedDirectory()}
  catch(error){cleanup='retained';failure=failure||error}
 }
 for(const [name,value] of Object.entries(previousTemp)){
  if(value===undefined)delete process.env[name]
  else process.env[name]=value
 }
 if(cleanup==='retained')console.error('VISUAL_CONTEXT_CLEANUP_RETAINED '+JSON.stringify({directory,
  condition:'Remove only this owned fixture after its test processes release all handles.'}))
}
console.log('VISUAL_CONTEXT_SUMMARY '+JSON.stringify({status:failure?'FAIL':'PASS',stage,
 engineRequests:engineRequests.length,syntheticOnly:true,cleanup}))
if(failure){
 console.error(failure.stack||String(failure))
 if(stage==='setup')console.error('ISOLATED_POCKETBASE_LOG '+logs.replace(/\/pbinstall\/\S+/g,'/pbinstall/[redacted]').slice(-1500))
 process.exitCode=1
}
