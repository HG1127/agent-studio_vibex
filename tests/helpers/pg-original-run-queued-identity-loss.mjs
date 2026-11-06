import assert from 'node:assert/strict'
import {dropActualCommittedModelReplyPrefix} from './pg-original-model-committed-prefix-loss.mjs'
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
/** Only the fully received actual Native/me response may supply these bytes. */
export async function dropOriginalIdentityReplyPrefix({req,res,status,headers,actual,responseComplete,requestStarted,expectedEmployee}){
 assert(uuid.test(expectedEmployee))
 let resolveClose,rejectClose,timer
 const closed=new Promise((yes,no)=>{resolveClose=yes;rejectClose=no});void closed.catch(()=>{})
 const onClose=()=>{if(req.socket.destroyed===true&&res.destroyed===true&&!res.writableEnded)resolveClose({actual_proxy_response_closed:true,actual_socket_destroyed:true});else rejectClose(Error('original_identity_close_not_observed'))}
 res.once('close',onClose)
 const remaining=8000-(Date.now()-requestStarted)
 timer=setTimeout(()=>rejectClose(Error('original_identity_loss_original_deadline')),Math.max(0,remaining))
 try{
  const record=await dropActualCommittedModelReplyPrefix({req,res,status,expectedStatus:200,headers,actual,responseComplete,requestStarted,
   verifyCommitted:()=>{const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(actual)),u=body.user;assert.equal(body.authenticated,true);assert.equal(u?.id,expectedEmployee);assert.equal(typeof u.email,'string');assert(u.email.length>0&&u.email.length<=254);assert.equal(typeof u.display_name,'string');assert(u.display_name.length<=80);assert.equal(typeof u.is_admin,'boolean');return Object.freeze({actual_native_me_verified:true,expected_employee:expectedEmployee})},
   onWritten:(proof)=>{assert.equal(proof.actual_native_me_verified,true)},
  })
  const closeProof=await closed
  return Object.freeze({...record,...closeProof,actual_native_me_verified:true,expected_employee:expectedEmployee})
 }finally{clearTimeout(timer);res.off('close',onClose)}
}
/** The exact original GET must fail in the browser; server destroy is insufficient. */
export function observeOriginalIdentityDisconnect(page,{origin}){
 assert.equal(new URL(origin).origin,origin)
 let selected=null,settled=false,resolveFailed,rejectFailed,timer
 const failed=new Promise((yes,no)=>{resolveFailed=yes;rejectFailed=no});void failed.catch(()=>{})
 const matches=r=>{const u=new URL(r.url());return u.origin===origin&&u.pathname==='/__pg_native/api/native-auth/me'&&!u.search&&r.method()==='GET'}
 const detach=()=>{clearTimeout(timer);page.off('request',onRequest);page.off('requestfailed',onFailed);page.off('requestfinished',onFinished);page.off('close',onPageClose)}
 const reject=error=>{if(settled)return;settled=true;detach();rejectFailed(error)}
 const onRequest=r=>{if(!matches(r))return;if(selected){reject(Error('original_identity_duplicate_get_before_failure'));return}selected=r}
 const onFailed=r=>{if(r!==selected)return;const error=r.failure()?.errorText;if(typeof error!=='string'||!error||error.length>200){reject(Error('original_identity_missing_requestfailed'));return}settled=true;detach();resolveFailed(Object.freeze({actual_requestfailed:true,same_original_get:true}))}
 const onFinished=r=>{if(r===selected)reject(Error('original_identity_get_completed_without_failure'))}
 const onPageClose=()=>reject(Error('original_identity_page_closed_before_failure'))
 page.on('request',onRequest);page.on('requestfailed',onFailed);page.on('requestfinished',onFinished);page.on('close',onPageClose)
 timer=setTimeout(()=>reject(Error('original_identity_requestfailed_not_observed')),8000)
 return Object.freeze({failed:()=>failed,dispose:()=>reject(Error('original_identity_observer_disposed'))})
}
