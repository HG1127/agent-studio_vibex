// Real isolated PocketBase exercise of a completed local_computer receipt.
// No user applications, credentials, model calls or production data.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import {randomBytes} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from './helpers/headless-pocketbase.mjs'

const root=process.cwd()
const binary=process.env.POCKETBASE_BIN||path.join(root,'vibex-local/bin/windows/pocketbase.exe')
assert.ok(fs.existsSync(binary),'isolated PocketBase binary required')
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'agentstudio-local-receipt-'))
const port=await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const value=server.address().port;server.close(()=>resolve(value))})})
const origin='http://127.0.0.1:'+port,bootstrapSecret=randomBytes(32).toString('hex')
let owner='',token=''
const pb=spawnHeadlessPocketBase(binary,['serve','--http=127.0.0.1:'+port,'--dir='+dir,'--hooksDir='+path.join(root,'pocketbase/pb_hooks')],{
 cwd:path.join(root,'pocketbase'),windowsHide:true,env:{...process.env,AGENT_STUDIO_AUTH_MODE:'standalone',
 AGENT_STUDIO_ALLOW_ANON:'false',AGENT_STUDIO_BACKGROUND_WORKER:'false',AGENT_STUDIO_BOOTSTRAP_SECRET:bootstrapSecret,
 AGENT_STUDIO_SECRET_KEY:randomBytes(16).toString('hex')}
})
let logs=''
pb.stdout.on('data',v=>logs=(logs+v.toString()).slice(-8000))
pb.stderr.on('data',v=>logs=(logs+v.toString()).slice(-8000))
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function request(method,route,body,extraHeaders={}){
 const response=await fetch(origin+route,{method,headers:{'Content-Type':'application/json',
   ...(token?{Authorization:token}:{}),'X-Rh-User-Id':'forged-untrusted-owner',...extraHeaders},
   ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)})
 return {status:response.status,body:await response.json().catch(()=>({}))}
}
async function ok(method,route,body){
 const r=await request(method,route,body)
 assert.equal(r.status,200,method+' '+route+' => '+JSON.stringify(r.body).slice(0,650))
 return r.body
}
try{
 let ready=false
 for(let i=0;i<150;i++){
   if(pb.exitCode!==null)break
   try{if((await fetch(origin+'/api/health',{signal:AbortSignal.timeout(500)})).ok){ready=true;break}}catch{}
   await sleep(120)
 }
 assert.ok(ready,'temporary PocketBase unavailable: '+logs.slice(-1400))
 const boot=await request('POST','/api/studio/bootstrap',
   {email:'local-receipt@example.test',password:'Isolated-run-fixture-2026!',display_name:'本机回执验收'},
   {'X-Agent-Studio-Setup-Key':bootstrapSecret})
 assert.equal(boot.status,201,JSON.stringify(boot.body))
 owner=boot.body.user.id
 const login=await request('POST','/api/collections/studio_users/auth-with-password',
   {identity:'local-receipt@example.test',password:'Isolated-run-fixture-2026!'})
 assert.equal(login.status,200,JSON.stringify(login.body).slice(0,250))
 token=login.body.token
 assert.ok(token)
 assert.equal((await ok('GET','/api/studio/me')).user.id,owner,'verified employee JWT must replace forged identity header')

 const created=await request('POST','/api/agent_specs',{name:'Local receipt isolated fixture',spec:{
   goal:'仅验证一次本机工具回执持久化',task_scope:'不操作真实应用',task_plan:['获取合成工具结果'],
   tools:['calculate'],deliverables:['本机工具回执'],done_criteria:['完整存储结果引用']
 }})
 assert.equal(created.status,200,JSON.stringify(created.body).slice(0,450))
 const run=await ok('POST','/api/agent-runs/start',{spec_id:created.body.id,instruction:'验证合成 WorkBuddy 窗口结果，不调用实际工具或模型'})
 const runId=run.run_id,jobId=randomBytes(12).toString('hex')
 const resultText=JSON.stringify({application:'WorkBuddy fixture',status:'ready',accepted:true,windows:[{id:'123',title:'Synthetic WorkBuddy'}]})+'*'.repeat(1900)
 const now=Date.now(),db=new DatabaseSync(path.join(dir,'data.db'),{timeout:5000})
 try{
   const record=db.prepare('SELECT checkpoint FROM agent_runs WHERE id=?').get(runId)
   assert.ok(record)
   const checkpoint=JSON.parse(record.checkpoint||'{}')
   checkpoint.local_job={id:jobId,local_tool:'apps.windows',plan_node_id:''}
   db.prepare('UPDATE agent_runs SET checkpoint=?,status=? WHERE id=?').run(JSON.stringify(checkpoint),'running',runId)
   db.prepare("INSERT INTO studio_local_jobs(id,owner,device_id,run_id,job_key,args_hash,payload,status,result,created_ms,deadline_ms) VALUES(?,?,?,?,?,?,?,'succeeded',?,?,?)")
     .run(jobId,owner,'fixture-device',runId,'local-fixture-'+jobId,'hash',JSON.stringify({tool:'apps.windows',arguments:{}}),resultText,now,now+120000)
 }finally{db.close()}
 const tick=await request('POST','/api/llm/agent-engine/'+runId+'/tick',{})
 assert.equal(tick.status,200,JSON.stringify(tick.body).slice(0,700)+' '+logs.slice(-700))
 const list=await ok('GET','/api/agent-runs/'+runId+'/tool-results')
 assert.equal(list.items.length,1,'exactly one durable result should be recorded')
 const entry=list.items[0]
 assert.ok(entry.result_id)
 const stored=await ok('GET','/api/agent-runs/'+runId+'/tool-results/'+entry.result_id+'?offset=0&limit=8000')
 assert.equal(stored.text,resultText,'entire local result must survive, not just 280-char observation')
 const detail=await ok('GET','/api/agent-runs/'+runId+'/detail')
 const event=detail.events.find(e=>e.event_type==='tool_result'&&e.content?.job_id===jobId)
 assert.equal(event?.content?.result_id,entry.result_id,'tool event must link to saved result')
 assert.equal(detail.run.status,'running')
 assert.equal(detail.run.checkpoint?.local_job,null)
 assert.ok(detail.run.checkpoint?.steps?.some(x=>x.result_id===entry.result_id),'checkpoint must retain the same result locator')
 assert.ok(!detail.run.checkpoint?.steps?.some(x=>x.action==='tool_error'))
  const nextJobId=randomBytes(12).toString('hex')
  const nextText=JSON.stringify({application:'WorkBuddy fixture',status:'observed',controls:[{name:'组织OS方案设计'}]})+'#'.repeat(850)
  const retryDb=new DatabaseSync(path.join(dir,'data.db'),{timeout:5000})
  try{
    const row=retryDb.prepare('SELECT checkpoint FROM agent_runs WHERE id=?').get(runId)
    const state=JSON.parse(row.checkpoint||'{}')
    state.attempt_no=2
    state.local_job={id:nextJobId,local_tool:'apps.observe',plan_node_id:''}
    state.steps=[];state.done_steps=0;state.seq=1
    retryDb.prepare('UPDATE agent_runs SET checkpoint=?,status=?,current_step=0 WHERE id=?')
      .run(JSON.stringify(state),'running',runId)
    retryDb.prepare("INSERT INTO studio_local_jobs(id,owner,device_id,run_id,job_key,args_hash,payload,status,result,created_ms,deadline_ms) VALUES(?,?,?,?,?,?,?,'succeeded',?,?,?)")
      .run(nextJobId,owner,'fixture-device',runId,'local-fixture-'+nextJobId,'hash',
        JSON.stringify({tool:'apps.observe',arguments:{window:'123'}}),nextText,now+10,now+120010)
  }finally{retryDb.close()}
  const secondTick=await request('POST','/api/llm/agent-engine/'+runId+'/tick',{})
  assert.equal(secondTick.status,200,JSON.stringify(secondTick.body).slice(0,700))
  const current=await ok('GET','/api/agent-runs/'+runId+'/tool-results')
  assert.equal(current.items.length,1,'only the current attempt belongs in current tool result list')
  assert.notEqual(current.items[0].result_id,entry.result_id,'same run ID must not overwrite prior attempt')
  const second=await ok('GET','/api/agent-runs/'+runId+'/tool-results/'+current.items[0].result_id+'?offset=0&limit=8000')
  assert.equal(second.text,nextText,'new attempt stores its own local result')
  const original=await ok('GET','/api/agent-runs/'+runId+'/tool-results/'+entry.result_id+'?offset=0&limit=8000')
  assert.equal(original.text,resultText,'previous attempt remains immutable and accessible to its owner')
  const newDetail=await ok('GET','/api/agent-runs/'+runId+'/detail')
  assert.equal(newDetail.run.status,'running')
  assert.ok(newDetail.events.some(e=>e.content?.result_id===current.items[0].result_id))
  const evalDb=new DatabaseSync(path.join(dir,'data.db'),{timeout:5000})
  try{evalDb.prepare("UPDATE agent_runs SET status='succeeded',result=?,evaluation='{}' WHERE id=?")
    .run('隔离测试生成的组织OS方案设计：明确岗位、任务分配、能力画像、结果验收与复盘闭环。',runId)}
  finally{evalDb.close()}
  const firstEval=await ok('POST','/api/agent-runs/'+runId+'/evaluate',{})
  assert.notEqual(firstEval.cached,true,'an empty evaluation object is not a valid cached score')
  assert.equal(firstEval.evaluation?.dimensions?.length,5)
  assert.equal(typeof firstEval.evaluation?.score,'number')
  const cachedEval=await ok('POST','/api/agent-runs/'+runId+'/evaluate',{})
  assert.equal(cachedEval.cached,true,'completed evaluation is reused without a second model call')
  assert.equal(cachedEval.evaluation.score,firstEval.evaluation.score)
  const projectedEval=await ok('GET','/api/agent_runs/'+runId)
  assert.equal(projectedEval.evaluation?.score,firstEval.evaluation.score,
    'the regular Agent run API consumed by the React panel must expose the score')
  const detailedEval=await ok('GET','/api/agent-runs/'+runId+'/detail')
  assert.equal(detailedEval.run.evaluation?.score,firstEval.evaluation.score)
  console.log('LOCAL_COMPUTER_RECEIPT_E2E_PASS '+JSON.stringify({resultStored:true,resultReadback:true,linkedEvent:true,
    secondAttemptIsolated:true,previousResultImmutable:true,emptyEvaluationGenerated:true,validEvaluationCached:true,
    sourceWindowFixture:true,agentStatus:'test-fixture-complete',productionData:false}))
}catch(error){
 console.error('LOCAL_COMPUTER_RECEIPT_E2E_FAILURE',error.stack||String(error))
 console.error('POCKETBASE_LOG',logs.slice(-2200))
 process.exitCode=1
}finally{
 try{await stopHeadlessPocketBase(pb)}catch{}
 try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:250})}catch{}
}
