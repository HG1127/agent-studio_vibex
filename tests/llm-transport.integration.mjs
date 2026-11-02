// Real standalone JWT + disposable SQLite + socket disconnect + local provider.
// No external requests, credentials, or company data.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import net from 'node:net'
import {randomBytes} from 'node:crypto'
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from './helpers/headless-pocketbase.mjs'

const root=process.cwd(), temp=fs.mkdtempSync(path.join(os.tmpdir(),'agentstudio-llm-transport-'))
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const freePort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
const setupKey=randomBytes(32).toString('hex'),password=randomBytes(24).toString('hex')
let release, received
const providerReceived=new Promise(resolve=>{received=resolve})
const providerRelease=new Promise(resolve=>{release=resolve})
let calls=0,logs='',server
// Large JSON makes a write to the deliberately closed socket observable.
const answer=JSON.stringify({name:'断线恢复测试',goal:'仅使用合成内容验证结果恢复',detail:'合成测试内容'.repeat(7000)})
const provider=http.createServer(async(req,res)=>{
  for await(const _chunk of req) { /* drain synthetic prompt */ }
  calls++;received();await providerRelease
  res.writeHead(200,{'Content-Type':'application/json'})
  res.end(JSON.stringify({choices:[{message:{role:'assistant',content:answer},finish_reason:'stop'}]}))
})
try {
  await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve))
  const port=await freePort(),origin='http://127.0.0.1:'+port
  server=spawnHeadlessPocketBase(process.env.POCKETBASE_BIN||path.join(root,'vibex-local/bin/windows/pocketbase.exe'),[
    'serve','--dev','--http=127.0.0.1:'+port,'--dir='+temp,'--hooksDir='+path.join(root,'pocketbase/pb_hooks'),
  ],{cwd:path.join(root,'pocketbase'),env:{AGENT_STUDIO_AUTH_MODE:'standalone',AGENT_STUDIO_ALLOW_ANON:'false',
    AGENT_STUDIO_BOOTSTRAP_SECRET:setupKey}})
  server.stdout.on('data',x=>logs=(logs+x).slice(-12000))
  server.stderr.on('data',x=>logs=(logs+x).slice(-12000))
  let ready=false
  for(let i=0;i<150;i++){
    try{if((await fetch(origin+'/api/health',{signal:AbortSignal.timeout(600)})).ok){ready=true;break}}catch{}
    if(server.exitCode!==null)break
    await sleep(120)
  }
  assert.ok(ready,'isolated PocketBase did not start')
  async function post(route,body,token,extra={}) {
    const res=await fetch(origin+route,{method:'POST',headers:{'Content-Type':'application/json',
      ...(token?{Authorization:token}:{}),...extra},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)})
    return {status:res.status,data:await res.json()}
  }
  assert.equal((await post('/api/studio/bootstrap',{email:'transport-owner@example.test',password,display_name:'测试账号A'},null,
    {'X-Agent-Studio-Setup-Key':setupKey})).status,201)
  const login=await post('/api/collections/studio_users/auth-with-password',{identity:'transport-owner@example.test',password})
  assert.equal(login.status,200)
  const token=login.data.token,ownerId=login.data.record.id
  assert.equal((await post('/api/studio/users',{email:'transport-other@example.test',password,display_name:'测试账号B',role:'employee'},token)).status,201)
  const other=await post('/api/collections/studio_users/auth-with-password',{identity:'transport-other@example.test',password})
  assert.equal(other.status,200)
  const conn=await post('/api/model-connections',{name:'本地模拟模型',provider:'openai',
    base_url:'http://127.0.0.1:'+provider.address().port+'/v1',api_key:'synthetic-test-only',models:['fixture-model']},token)
  assert.equal(conn.status,200)
  const payload={request_id:'disconnect-'+randomBytes(16).toString('hex'),connection_id:conn.data.item.id,
    model:'fixture-model',strict_model:true,page:'home',max_tokens:6500,messages:[{role:'user',content:'synthetic disconnect test'}]}
  const disconnected=http.request(origin+'/api/llm/chat',{method:'POST',headers:{'Content-Type':'application/json',Authorization:token}})
  disconnected.on('error',()=>{})
  disconnected.end(JSON.stringify(payload))
  let providerTimer
  try {
    await Promise.race([providerReceived,new Promise((_,reject)=>{
      providerTimer=setTimeout(()=>reject(Error('provider was not reached')),12000)
    })])
  } finally {clearTimeout(providerTimer)}
  const duplicate=await post('/api/llm/chat',payload,token)
  assert.equal(duplicate.data.status,'running')
  assert.equal(calls,1,'running job must not incur a second provider call')
  await new Promise(resolve=>{disconnected.once('close',resolve);disconnected.destroy()})
  // Give PocketBase the socket-close notification before completing the model.
  await sleep(100)
  release()
  let result
  for(let i=0;i<80;i++){
    result=await post('/api/llm/poll',{request_id:payload.request_id},token)
    if(['success','failed'].includes(result.data.status))break
    await sleep(100)
  }
  assert.equal(result.data.status,'success','response delivery must not overwrite successful generation')
  assert.equal(result.data.text,answer)
  const cached=await post('/api/llm/chat',payload,token)
  assert.equal(cached.data.cached,true)
  assert.equal(cached.data.text,answer)
  assert.equal(calls,1)
  const foreign=await post('/api/llm/poll',{request_id:payload.request_id},other.data.token,{'X-Rh-User-Id':ownerId})
  assert.equal(foreign.data.status,'not_found','verified JWT must override forged owner header')
  const spoofed=await post('/api/llm/poll',{request_id:payload.request_id},null,{'X-Rh-User-Id':ownerId})
  assert.equal(spoofed.status,401)
  await sleep(100)
  assert.match(logs,/llm_response_delivery_failed/,'test must exercise a real failed response write')
  console.log('PASS LLM socket disconnect: committed result recovered, one provider call, verified employee isolation')
} finally {
  release()
  await stopHeadlessPocketBase(server)
  await new Promise(resolve=>provider.close(resolve))
  const resolved=fs.realpathSync(temp),intended=fs.realpathSync(os.tmpdir())
  assert.equal(path.dirname(resolved).toLowerCase(),intended.toLowerCase())
  assert.ok(path.basename(resolved).startsWith('agentstudio-llm-transport-'))
  fs.rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200})
}
