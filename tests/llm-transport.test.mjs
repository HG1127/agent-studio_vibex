import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import {llmErrorText} from '../src/lib/llmErrorText.ts'

const hookSource = fs.readFileSync(new URL('../pocketbase/pb_hooks/llm.pb.js', import.meta.url), 'utf8')
function backend({providerStatus = 200, failDelivery = true, existing} = {}) {
  const routes = new Map(), jobs = [], saves = [], logs = []
  let calls = 0, replies = 0
  class Record {
    constructor() { this.data = {} }
    set(key, value) { this.data[key] = value }
    getString(key) { return String(this.data[key] ?? '') }
  }
  if (existing) { const row = new Record(); row.data = {...existing}; jobs.push(row) }
  const conn = {id:'owned-connection',getBool:()=>true,getString:key=>({
    base_url:'http://provider.invalid/v1',api_key:'fixture-key',provider:'openai',models:'["fixture-model"]',
  })[key] || ''}
  vm.runInNewContext(hookSource, {
    onBootstrap:()=>{}, routerAdd:(method,route,handler)=>routes.set(method+' '+route,handler), Record,
    $os:{getenv:()=>''},
    $http:{send:()=>{calls++;return {statusCode:providerStatus,raw:JSON.stringify({choices:[{message:{content:'saved-plan'}}]})}}},
    $app:{findCollectionByNameOrId:()=>({}),findRecordsByFilter:(_c,_f,_s,_l,_o,p)=>p.uid==='employee'?[conn]:[],
      findFirstRecordByFilter:(_c,_f,p)=>{const row=jobs.find(j=>j.data.request_id===p.r&&j.data.rh_user_id===p.uid);if(!row)throw Error('not found');return row},
      save:row=>{if(!jobs.includes(row))jobs.push(row);saves.push({...row.data})},
      logger:()=>({warn:message=>logs.push(message),error:message=>logs.push(message)})},
  })
  const body={request_id:'recovery-job',connection_id:conn.id,model:'fixture-model',strict_model:true,
    page:'home',messages:[{role:'user',content:'synthetic plan'}],max_tokens:100}
  function request(route, owner='employee', disconnect=failDelivery) {
    return routes.get('POST /api/llm/'+route)({requestInfo:()=>({headers:{x_rh_user_id:owner},body}),
      json:(status,data)=>{replies++;if(disconnect)throw Error('jsontext: write error: write tcp 127.0.0.1:7100->127.0.0.1:35566: write: broken pipe');return {status,...data}}})
  }
  return {request,jobs,saves,logs,get calls(){return calls},get replies(){return replies}}
}

test('response broken pipe preserves committed success and owner-scoped poll result',()=>{
  const h=backend()
  assert.equal(h.request('chat'),undefined)
  assert.equal(h.calls,1)
  assert.equal(h.replies,1,'never write a second error response to the closed socket')
  assert.equal(h.saves.at(-1).status,'success')
  assert.equal(h.saves.at(-1).result_text,'saved-plan')
  assert.equal(h.saves.at(-1).error_message,undefined)
  const polled=h.request('poll','employee',false)
  assert.equal(polled.status,'success')
  assert.equal(polled.text,'saved-plan')
  assert.equal(h.request('poll','other-employee',false).status,'not_found')
  h.request('chat')
  assert.equal(h.calls,1,'recovering a saved job never resubmits to the provider')
})

test('delivery failure preserves provider failure instead of masking its cause',()=>{
  const h=backend({providerStatus:429})
  h.request('chat')
  assert.equal(h.replies,1)
  assert.equal(h.saves.at(-1).status,'failed')
  assert.match(h.request('poll','employee',false).error,/llm_http_429/)
  assert.doesNotMatch(h.saves.at(-1).error_message,/broken pipe/)
})

test('pending/running duplicate creation returns the original job without billing or corrupting it',()=>{
  for(const status of ['pending','running']) {
    const h=backend({existing:{request_id:'recovery-job',rh_user_id:'employee',model_name:'fixture-model',status}})
    assert.equal(h.request('chat','employee',false).status,status)
    h.request('chat','employee',true)
    assert.equal(h.calls,0)
    assert.equal(h.saves.length,0)
    assert.equal(h.jobs[0].getString('status'),status)
  }
})

const compiled=ts.transpileModule(fs.readFileSync(new URL('../src/lib/llm.ts',import.meta.url),'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
}).outputText
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve()}
function client(fetch) {
  let now=0, serial=0
  const timers=new Map(), calls=[]
  const window={setTimeout:(fn,ms)=>{const id=++serial;timers.set(id,{at:now+ms,fn});return id},clearTimeout:id=>timers.delete(id)}
  const scope={exports:{},AbortController,Date:class extends Date {static now(){return now}},window,
    require:name=>name==='./pb'?{pb:{authStore:{token:'employee-jwt'}},getPocketBaseUrl:()=>'/__pb'}:{getAuthHeaders:()=>({})},
    fetch:(url,options)=>{calls.push({url,...options,body:JSON.parse(options.body)});return fetch(url,options,calls.length)},
  }
  vm.runInNewContext(compiled,scope)
  return {calls,timers,run:(signal)=>scope.exports.callLlmWithFallback('fixture-model',{
    request_id:'original-job',connection_id:'owned-connection',strict_model:true,messages:[{role:'user',content:'synthetic'}],signal,
  }),advance:async ms=>{const end=now+ms;await flush();for(;;){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;timers.delete(next[0]);now=next[1].at;next[1].fn();await flush()}now=end;await flush()}}
}
const success=()=>({ok:true,status:200,json:async()=>({ok:true,status:'success',text:'recovered-plan',model:'fixture-model'})})
const hanging=signal=>new Promise((_,reject)=>{signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true})})

test('slow synchronous generation survives the former 25 second renderer deadline',async()=>{
  let complete,signal
  const h=client((_url,opts)=>{signal=opts.signal;return new Promise(resolve=>{complete=resolve})})
  const pending=h.run()
  await h.advance(26000)
  assert.equal(signal.aborted,false)
  complete(success())
  assert.equal((await pending).text,'recovered-plan')
  assert.equal(h.calls.length,1)
  assert.equal(h.timers.size,0)
})

test('proxy disconnect and transient poll timeout recover the same job without another chat',async()=>{
  const h=client((url,opts,n)=>{if(n===1)throw Error('proxy disconnected');if(n===2)return hanging(opts.signal);return success()})
  const pending=h.run()
  await h.advance(18000)
  assert.equal((await pending).text,'recovered-plan')
  assert.deepEqual(h.calls.map(c=>c.url),['/__pb/api/llm/chat','/__pb/api/llm/poll','/__pb/api/llm/poll'])
  assert.ok(h.calls.every(c=>c.body.request_id==='original-job'&&c.headers.Authorization==='employee-jwt'))
  assert.equal(h.calls[0].body.connection_id,'owned-connection')
  assert.equal(h.calls[0].body.strict_model,true)
  assert.equal(h.timers.size,0)
})

test('response-body timeout remains bounded and resumes polling',async()=>{
  const h=client((_url,opts,n)=>n===1?{ok:true,status:200,json:()=>hanging(opts.signal)}:success())
  const pending=h.run()
  await h.advance(258000)
  assert.equal((await pending).status,'success')
  assert.equal(h.calls.length,2)
  assert.equal(h.timers.size,0)
})

test('accepted pending job is polled and expired employee login stops immediately',async()=>{
  for(const status of ['pending','running']) {
    const h=client((_url,_opts,n)=>n===1?{ok:true,status:200,json:async()=>({status})}:{ok:false,status:401})
    const pending=h.run()
    await h.advance(3000)
    assert.equal((await pending).needsLogin,true)
    assert.equal(h.calls.length,2)
    assert.equal(h.timers.size,0)
  }
})

test('cancellation stops initial request, poll delay and in-flight poll without resubmission',async()=>{
  for(const stage of ['before','chat','delay','poll']) {
    const ctrl=new AbortController()
    const h=client((_url,opts,n)=>{if(stage==='chat'||n>1)return hanging(opts.signal);throw Error('disconnect')})
    if(stage==='before')ctrl.abort()
    const pending=h.run(ctrl.signal)
    await flush()
    if(stage==='poll')await h.advance(3000)
    ctrl.abort()
    assert.equal((await pending).error,'cancelled',stage)
    const count=h.calls.length
    await h.advance(60000)
    assert.equal(h.calls.length,count)
    assert.equal(h.timers.size,0)
  }
})

test('unresponsive polls respect a wall-clock deadline instead of extending to fifty minutes',async()=>{
  const h=client((_url,opts,n)=>{if(n===1)throw Error('disconnect');return hanging(opts.signal)})
  const pending=h.run()
  await h.advance(620000)
  assert.equal((await pending).error,'timeout')
  assert.ok(h.calls.length<=42)
  assert.equal(h.timers.size,0)
})

test('employee error messages hide raw socket/provider/credential details and explain recovery',()=>{
  for(const raw of ['jsontext: write error: write tcp 127.0.0.1:7100->127.0.0.1:35566: write: broken pipe',
    'llm_request_failed: request timeout key=private-credential','llm_http_429: private-provider-body','unknown: sk-private-secret',
    'constructor','toString','__proto__']) {
    const message=llmErrorText(raw)
    assert.doesNotMatch(message,/127\.0\.0\.1|jsontext|private|sk-/)
    assert.match(message,/重试|检查/)
  }
})
