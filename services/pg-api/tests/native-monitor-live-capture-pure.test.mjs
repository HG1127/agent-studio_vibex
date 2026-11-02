import test from 'node:test'
import assert from 'node:assert/strict'
import {NativeMonitorCaptureDispatcher,parseMonitorBoundSource} from '../src/native-monitor-live-capture.ts'
import {monitorCanonical,monitorHash} from '../src/native-monitor-source-contract.ts'
// Scripted transactional RPC double only: no SQL driver, server or network.
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),lease={check_id:id(1),lease_token:id(2),lease_version:7}
const source=()=>({source_id:'roles',tool:'web_fetch',input:{url:'https://example.invalid/roles'},adapter_id:'web.text.v1',scope_key:'',required_markers:['FACT'],request_hash:monitorHash(['web_fetch',{url:'https://example.invalid/roles'}])})
const envelope=()=>({text:'FACT '+'.'.repeat(5000)+' REAL_TAIL',structuredContent:null,coverage:{stored_complete:true},redacted:false,usable_as_evidence:true,http_response:{status:200,complete:true,empty:false,media_type:'text/plain'}})
function fixture(options={}){
 const trace=[],store={state:null,payload:null,canonical:null,result_id:id(9)},events=[]
 let active=0,calls=0,lost=false
 const pool={async connect(){
  active++;let action='',pending=null,open=true
  return{async query(sql,p=[]){
   trace.push({sql,params:p})
   if(sql==='BEGIN'||sql.startsWith('SET LOCAL'))return{rows:[]}
   if(sql.startsWith("SELECT current_user='agentstudio_monitor_dispatch'"))return{rows:[{ok:!options.wrongRole}]}
   if(sql.includes('monitor_live_begin_request(')){
    action='begin_request'
    if(store.state==='captured')return{rows:[{value:{state:'captured',request_id:id(8),result_id:store.result_id,error:''}}]}
    if(store.state==='started'){pending=()=>{store.state='ambiguous'};return{rows:[{value:{state:'ambiguous',request_id:id(8),error:'source_request_outcome_unknown'}}]}}
    if(store.state==='failed'||store.state==='ambiguous')return{rows:[{value:{state:store.state,request_id:id(8),result_id:null,error:'source_capture_failed'}}]}
    pending=()=>{store.state='started'}
    return{rows:[{value:{state:'started',request_id:id(8),owner_user_id:id(3),case_id:id(4),run_id:id(5),source:options.source??source(),data_space:'LIVE',wall_deadline_ms:Date.now()+60000}}]}
   }
   if(sql.includes('monitor_live_finish_request(')){
    action='finish_request'
    assert.equal(store.state,'started');assert.equal(p[0],id(8));assert.equal(p[1],lease.lease_token);assert.equal(p[2],7)
    const payload=JSON.parse(p[3]);assert.equal(p[4],monitorCanonical(payload));assert.equal(p[5],monitorCanonical(payload.text))
    pending=()=>{store.state='captured';store.payload=payload;store.canonical=p[4]}
    return{rows:[{value:{result_id:store.result_id,content_hash:options.badHash?'b'.repeat(64):monitorHash(payload),projection_hash:monitorHash(payload.text),source_id:'roles',run_id:id(5)}}]}
   }
   if(sql.includes('monitor_live_fail_request(')){action='fail_request';pending=()=>{store.state='failed'};return{rows:[{value:true}]}}
   if(sql==='COMMIT'){
    pending?.();pending=null;events.push('commit:'+action)
    if(open){active--;open=false}
    if(options.commitLost===action&&!lost){lost=true;throw Error('synthetic commit acknowledgement lost')}
    return{rows:[]}
   }
   if(sql==='ROLLBACK'){pending=null;if(open){active--;open=false};return{rows:[]}}
   throw Error('unexpected SQL-shape command')
  },release(discard){if(open){active--;open=false};events.push(discard?'discard':'release')}}
 }}
 const transport={async captureDeclared(context,signal){
  assert.equal(active,0,'no database transaction spans egress');assert.equal(store.state,'started','started slot durably committed')
  assert(events.includes('commit:begin_request'));assert.equal(signal.aborted,false)
  assert(Object.isFrozen(context)&&Object.isFrozen(context.source)&&Object.isFrozen(context.source.input))
  assert.equal(context.owner_user_id,id(3));assert.equal(context.run_id,id(5));assert.equal(context.source.request_hash,source().request_hash)
  calls++;events.push('egress')
  if(options.transportError)throw Error('synthetic source unavailable')
  return options.envelope??envelope()
 }}
 return{capture:new NativeMonitorCaptureDispatcher(pool,transport),store,trace,events,calls:()=>calls}
}
test('complete tail is captured once after committed reservation; repeat reads the immutable receipt reference',async()=>{
 const f=fixture(),out=await f.capture.capture(lease,'roles')
 assert.deepEqual(out,{state:'captured',result_id:id(9),new_capture:true})
 assert(f.store.payload.text.endsWith('REAL_TAIL'));assert.equal(f.store.payload.data_space,'LIVE')
 assert.deepEqual(await f.capture.capture(lease,'roles'),{state:'captured',result_id:id(9),new_capture:false})
 assert.equal(f.calls(),1);assert(f.events.indexOf('commit:begin_request')<f.events.indexOf('egress'))
})
test('lost reservation COMMIT acknowledgement prevents egress and the next invocation is ambiguous',async()=>{
 const f=fixture({commitLost:'begin_request'})
 await assert.rejects(()=>f.capture.capture(lease,'roles'),e=>e.code==='monitor_capture_commit_unconfirmed')
 assert.equal(f.calls(),0);assert.equal(f.store.state,'started')
 assert.deepEqual(await f.capture.capture(lease,'roles'),{state:'incomplete',reason:'source_request_outcome_unknown'})
 assert.equal(f.calls(),0);assert.equal(f.store.state,'ambiguous');assert(f.events.includes('discard'))
})
test('lost finalization acknowledgement never retries egress or marks an already committed receipt failed',async()=>{
 const f=fixture({commitLost:'finish_request'})
 await assert.rejects(()=>f.capture.capture(lease,'roles'),e=>e.code==='monitor_capture_commit_unconfirmed')
 assert.equal(f.calls(),1);assert.equal(f.store.state,'captured')
 assert.deepEqual(await f.capture.capture(lease,'roles'),{state:'captured',result_id:id(9),new_capture:false})
 assert.equal(f.calls(),1);assert(!f.trace.some(q=>q.sql.includes('monitor_live_fail_request(')))
})
test('a transport failure or incomplete/redacted response consumes the slot and never creates evidence',async()=>{
 for(const options of [{transportError:true},{envelope:{...envelope(),redacted:true}},{envelope:{...envelope(),coverage:{stored_complete:false}}}]){
  const f=fixture(options)
  assert.deepEqual(await f.capture.capture(lease,'roles'),{state:'incomplete',reason:'source_capture_failed'})
  assert.deepEqual(await f.capture.capture(lease,'roles'),{state:'incomplete',reason:'source_capture_failed'})
  assert.equal(f.calls(),1);assert.equal(f.store.payload,null);assert.equal(f.store.state,'failed')
 }
})
test('wrong dispatch role, forged caller owner, abort and mutated declared input cannot reach egress',async()=>{
 const f=fixture({wrongRole:true})
 await assert.rejects(()=>f.capture.capture(lease,'roles'),e=>e.code==='monitor_capture_dispatch_identity_required');assert.equal(f.calls(),0)
 const g=fixture()
 await assert.rejects(()=>g.capture.capture({...lease,owner_user_id:id(3)},'roles'))
 await assert.rejects(()=>g.capture.capture(lease,'roles',AbortSignal.abort()))
 assert.equal(g.trace.length,0)
 const bad=fixture({source:{...source(),input:{url:'https://example.invalid/changed'}}})
 await assert.rejects(()=>bad.capture.capture(lease,'roles'),e=>e.code==='monitor_capture_binding_changed');assert.equal(bad.calls(),0)
})
test('hash mismatch on RPC acknowledgement is bounded and never reported as a newly captured result',async()=>{
 const f=fixture({badHash:true})
 await assert.rejects(()=>f.capture.capture(lease,'roles'),e=>e.code==='monitor_capture_receipt_unconfirmed')
 assert.equal(f.calls(),1);assert(!f.trace.some(q=>q.sql.includes('monitor_live_fail_request(')))
})
test('declared source parsing refuses secrets, unbound connections, extra keys and malformed model-owned input',()=>{
 for(const v of [{...source(),input:{url:'https://example.invalid',token:'secret'}},{...source(),extra_owner:id(3)},{...source(),required_markers:[]},{...source(),adapter_id:'http.json-items.v1',scope_key:'all'},Object.assign(Object.create({}),source())])assert.throws(()=>parseMonitorBoundSource(v))
 assert.equal(parseMonitorBoundSource(source()).adapter_id,'web.text.v1')
})
