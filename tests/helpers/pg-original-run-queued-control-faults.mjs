import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {dropActualCommittedModelReplyPrefix} from './pg-original-model-committed-prefix-loss.mjs'
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
/** Observe the exact browser request's failure, never a pending UI label. */
export function observeOriginalControlDisconnect(page,{origin,path}){
 assert(new URL(origin).origin===origin&&/^\/api\/v2\/(agent-autonomous-runs|workflow-v2-runs)\/[a-f0-9-]+\/(cancel|pause)$/.test(path))
 let selected=null,settled=false,enter,fail,finish,timer
 const entered=new Promise(resolve=>{enter=resolve}),failed=new Promise((resolve,reject)=>{finish=resolve;fail=reject})
 void failed.catch(()=>{})
 const detach=()=>{clearTimeout(timer);page.off('request',onRequest);page.off('requestfailed',onFailed);page.off('requestfinished',onFinished);page.off('close',onPageClose)}
 const reject=error=>{if(settled)return;settled=true;detach();fail(error)}
 const matches=request=>{const url=new URL(request.url());return url.origin===origin&&url.pathname==='/__pg_native'+path&&!url.search&&request.method()==='POST'}
 const onRequest=request=>{if(!matches(request))return;if(selected){reject(Error('original_control_duplicate_post'));return}selected=request;const bytes=Buffer.from(request.postData()??'');enter(Object.freeze({actual_browser_request:true,body_sha256:hash(bytes),body_bytes:bytes.length}))}
 const onFailed=request=>{if(request!==selected)return;const error=request.failure()?.errorText;if(typeof error!=='string'||!error||error.length>200){reject(Error('original_control_missing_requestfailed'));return}settled=true;detach();finish(Object.freeze({actual_requestfailed:true,same_original_request:true,body_sha256:hash(Buffer.from(request.postData()??''))}))}
 const onFinished=request=>{if(request===selected)reject(Error('original_control_finished_without_disconnect'))}
 const onPageClose=()=>reject(Error('original_control_page_closed_before_failure'))
 page.on('request',onRequest);page.on('requestfailed',onFailed);page.on('requestfinished',onFinished);page.on('close',onPageClose)
 timer=setTimeout(()=>reject(Error('original_control_disconnect_not_observed')),12000)
 return Object.freeze({entered:()=>entered,failed:()=>failed,dispose:()=>reject(Error('original_control_observer_disposed'))})
}
/** Stage only actual original bytes. Timeout/cleanup never authorizes dispatch. */
export function bindOriginalPauseStage({id,req,res,actualBody,onClosed}){
 assert(uuid.test(id)&&Buffer.isBuffer(actualBody)&&actualBody.length>0&&actualBody.length<=131072&&typeof onClosed==='function')
 const body=JSON.parse(actualBody.toString('utf8'))
 assert(body&&Object.keys(body).sort().join(',')==='expected_state_sha256,operation_id'&&uuid.test(body.operation_id)&&/^[a-f0-9]{64}$/.test(body.expected_state_sha256))
 const request=Object.freeze({...body}),bodyHash=hash(actualBody)
 let closed=false,negative=false,authorized=false,aborted=false,resolveClose,rejectClose
 const clientClosed=new Promise((resolve,reject)=>{resolveClose=resolve;rejectClose=reject});void clientClosed.catch(()=>{})
 const close=()=>{
  if(closed||aborted)return
  if(res.writableEnded||res.destroyed!==true||req.socket.destroyed!==true){rejectClose(Error('original_pause_close_without_actual_socket_loss'));return}
  closed=true;const proof=Object.freeze({actual_proxy_response_closed:true,actual_socket_destroyed:true,body_sha256:bodyHash})
  onClosed(proof);resolveClose(proof)
 }
 res.once('close',close)
 return Object.freeze({request,body_sha256:bodyHash,clientClosed:()=>clientClosed,
  observeNegative({originalBody,status,responseComplete,actual}){
   if(aborted||authorized||!closed)return false
   assert(Buffer.isBuffer(originalBody)&&actualBody.equals(originalBody)&&status===200&&responseComplete===true&&Buffer.isBuffer(actual))
   const value=JSON.parse(actual.toString('utf8'))
   assert.equal(value.run?.id,id);assert.equal(value.control_confirmed,false);assert.equal(value.run_control_confirmation,null)
   negative=true;return true
  },
  async authorizeRelease(verifyActualNegative){
   assert(!aborted&&!authorized&&closed&&negative&&typeof verifyActualNegative==='function','original_pause_requires_actual_close_and_negative_confirmation')
   const proof=await verifyActualNegative(request)
   assert(!aborted&&!authorized&&closed&&negative&&proof?.actual_exact_receipt_rows===0&&proof.actual_owner_and_actor_verified===true,'original_pause_requires_independent_owner_negative')
   authorized=true;return Object.freeze({actual_negative_before_original_dispatch:true,body_sha256:bodyHash})
  },
  assertDispatch(){assert(!aborted&&authorized,'original_pause_dispatch_not_authorized')},
  abort(){aborted=true;res.off('close',close);if(!closed)rejectClose(Error('original_pause_stage_aborted'))},
 })
}
/** Full real upstream ACK + independent owner read, then real headers/one byte. */
export async function dropOriginalCommittedCancelReply({req,res,status,headers,actual,responseComplete,requestStarted,id,kind,verifyActualOwner}){
 assert(uuid.test(id)&&['agent_autonomous','workflow_v2'].includes(kind)&&typeof verifyActualOwner==='function')
 let written=null
 const detail=await dropActualCommittedModelReplyPrefix({req,res,status,expectedStatus:200,headers,actual,responseComplete,requestStarted,
  verifyCommitted:async()=>{
   const value=JSON.parse(actual.toString('utf8'))
   assert.equal(value.run?.id,id);assert.equal(value.run.status,'cancelled');assert.equal(value.execution_mode,kind==='workflow_v2'?'workflow_native_v2':'agent_native_v2')
   const owner=await verifyActualOwner();assert.equal(owner?.actual_owner_verified,true);assert.equal(owner.id,id);assert.equal(owner.status,'cancelled');assert.equal(owner.step_count,0)
   return Object.freeze({actual_owner_terminal_verified:true})
  },onWritten:(proof,record)=>{written={proof,record}},
 })
 assert.equal(req.socket.destroyed,true);assert.equal(written?.proof.actual_owner_terminal_verified,true);assert.equal(written.record,detail)
 return Object.freeze({...detail,actual_socket_destroyed:true,actual_owner_terminal_verified:true,cancel_causality_claimed:false})
}
