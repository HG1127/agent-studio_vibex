import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {NativeMonitorGetTransport} from '../src/native-monitor-live-transport.ts'
import {createWorkflowToolNetwork} from '../src/workflow-v2-tool-network.ts'
import {encryptModelSecret} from '../src/model-connection-crypto.ts'
import {monitorHash} from '../src/native-monitor-source-contract.ts'
// Scripted SQL/DNS/HTTP doubles; no database, socket, server or provider.
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),key=Buffer.alloc(32,7),secret='synthetic-declared-get-secret'
const context=()=>({request_id:id(1),check_id:id(2),lease_token:id(3),lease_version:4,owner_user_id:id(5),case_id:id(6),run_id:id(7),data_space:'LIVE',wall_deadline_ms:Date.now()+60000,source:{source_id:'roles',tool:'http_roles',input:{team:'declared'},adapter_id:'http.json-items.v1',scope_key:'roles',required_markers:[],connection_id:id(8),config_hash:'a'.repeat(64),request_hash:monitorHash(['http_roles',{team:'declared'}])}})
function fixture(options={}){
 const trace=[],requests=[],events=[];let active=0,used=false,lost=false
 const encrypted=encryptModelSecret(JSON.stringify({value:'Bearer '+secret}),key)
 const material={kind:'http',url:'https://public.example.com/roles?team={{team}}',method:'GET',body_template:'',timeout_s:8,headers:[{id:id(9),name:'Authorization',ciphertext:encrypted.ciphertext.toString('hex'),nonce:encrypted.nonce.toString('hex'),tag:encrypted.tag.toString('hex')}],connection_id:id(8),config_hash:'a'.repeat(64),request_hash:context().source.request_hash,...options.material}
 const pool={async connect(){active++;let pending=false,open=true;return{async query(sql,p=[]){
  trace.push({sql,params:p})
  if(sql==='BEGIN'||sql.startsWith('SET LOCAL'))return{rows:[]}
  if(sql.startsWith("SELECT current_user='agentstudio_monitor_dispatch'"))return{rows:[{ok:!options.wrongRole}]}
  if(sql.includes('monitor_live_transport_material(')){assert.deepEqual(p,[id(1),id(3),4]);if(used)throw Error('material already consumed');pending=true;return{rows:[{value:material}]}}
  if(sql==='COMMIT'){if(pending)used=true;pending=false;if(open){active--;open=false};events.push('material_committed');if(options.commitLost&&!lost){lost=true;throw Error('commit acknowledgement lost')};return{rows:[]}}
  if(sql==='ROLLBACK'){pending=false;if(open){active--;open=false};return{rows:[]}}
  throw Error('unexpected SQL-shape operation')
 },release(discard){if(open){active--;open=false};if(discard)events.push('discard')}}}}
 const resolver={async resolve4(){return['93.184.216.34']},async resolve6(){return[]}}
 const requester=(wire,callback)=>{const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=()=>req.emit('error',Error('synthetic request failure'));req.end=body=>{
  assert.equal(active,0);assert(events.includes('material_committed'));requests.push({wire,body});events.push('GET')
  queueMicrotask(()=>{const res=new EventEmitter(),payload=options.body??JSON.stringify({scope_key:'roles',complete:true,has_more:false,next_cursor:null,items:[{text:'FACT '+'.'.repeat(5000)+' TAIL'}]})
   res.statusCode=200;res.headers={'content-type':'application/json','content-length':String(Buffer.byteLength(payload))};res.destroy=()=>{};callback(res);queueMicrotask(()=>{res.emit('data',Buffer.from(payload));res.emit('end')})
  })
 };return req}
 return{transport:new NativeMonitorGetTransport(pool,options.key??key,createWorkflowToolNetwork(resolver,requester)),trace,requests,events,material}
}
test('the concrete GET transport decrypts only declared headers and keeps full response tail',async()=>{
 const f=fixture(),out=await f.transport.captureDeclared(context(),new AbortController().signal)
 assert.equal(out.structuredContent.items[0].text.endsWith('TAIL'),true);assert.equal(out.coverage.stored_complete,true);assert.equal(f.requests.length,1)
 const sent=f.requests[0].wire;assert.equal(sent.method,'GET');assert.equal(sent.path,'/roles?team=declared');assert.equal(sent.headers.authorization??sent.headers.Authorization,'Bearer '+secret)
 assert.equal(sent.rejectUnauthorized,true);assert.equal(sent.agent,false)
 assert(!Object.values(sent.headers).includes(context().lease_token))
 assert(f.trace.some(q=>q.sql.includes('monitor_live_transport_material(')))
 assert(!f.trace.some(q=>q.sql.includes('FROM agentstudio.tool_connection_headers')))
})
test('material request/hash/connection/config/method mismatches are refused before any GET',async()=>{
 for(const patch of [{request_hash:'b'.repeat(64)},{connection_id:id(99)},{config_hash:'b'.repeat(64)},{method:'POST'}]){
  const f=fixture({material:patch})
  await assert.rejects(()=>f.transport.captureDeclared(context(),new AbortController().signal),e=>e.code==='monitor_source_material_unavailable')
  assert.equal(f.requests.length,0)
 }
})
test('bad ciphertext or key never exposes secret data or reaches HTTP',async()=>{
 for(const options of [{key:Buffer.alloc(32,9)},{material:{headers:[{id:id(9),name:'Authorization',ciphertext:'aa',nonce:'00'.repeat(12),tag:'00'.repeat(16)}]}}]){
  const f=fixture(options)
  await assert.rejects(()=>f.transport.captureDeclared(context(),new AbortController().signal),e=>e.code==='monitor_source_material_unavailable'&&!e.message.includes(secret))
  assert.equal(f.requests.length,0)
 }
})
test('material is consumed once; lost COMMIT confirmation causes no GET and no retry',async()=>{
 const f=fixture({commitLost:true})
 await assert.rejects(()=>f.transport.captureDeclared(context(),new AbortController().signal),e=>e.code==='monitor_source_material_unavailable')
 await assert.rejects(()=>f.transport.captureDeclared(context(),new AbortController().signal))
 assert.equal(f.requests.length,0);assert(f.events.includes('discard'))
 const ok=fixture();await ok.transport.captureDeclared(context(),new AbortController().signal)
 await assert.rejects(()=>ok.transport.captureDeclared(context(),new AbortController().signal))
 assert.equal(ok.requests.length,1)
})
test('wrong dispatch identity and a pre-aborted signal never receive material or egress',async()=>{
 const f=fixture({wrongRole:true})
 await assert.rejects(()=>f.transport.captureDeclared(context(),new AbortController().signal));assert.equal(f.requests.length,0)
 assert(!f.trace.some(q=>q.sql.includes('monitor_live_transport_material(')))
 const g=fixture();await assert.rejects(()=>g.transport.captureDeclared(context(),AbortSignal.abort()));assert.equal(g.trace.length,0)
})
test('the existing full response adapter marks echoed header secrets redacted and unusable',async()=>{
 const f=fixture({body:'synthetic source echoed '+secret+' and enough other characters to remain above forty'})
 const out=await f.transport.captureDeclared(context(),new AbortController().signal)
 assert.equal(out.redacted,true);assert.equal(out.usable_as_evidence,false);assert(!out.text.includes(secret))
})
