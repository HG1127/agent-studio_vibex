import {dropActualCommittedModelReplyPrefix} from './pg-original-model-committed-prefix-loss.mjs'
/** Actual status/headers and byte0 only. Independent committed receipt/audit
 * verification precedes write; original browser requestfailed is proved by the story. */
export async function dropActualCommittedReleaseReply(input){
 const {req,res,onDelivered,...rest}=input
 if(typeof onDelivered!=='function')throw Error('release_prefix_delivery_observer_required')
 let closed=false,resolveClose;const close=new Promise(resolve=>{resolveClose=resolve}),onClose=()=>{closed=true;resolveClose()};res.once('close',onClose)
 let writtenProof,writtenDetail,timer
 try{
  await dropActualCommittedModelReplyPrefix({...rest,req,res,onWritten(proof,detail){writtenProof=proof;writtenDetail=detail}})
  await Promise.race([close,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('release_prefix_actual_close_required')),Math.max(1,8000-(Date.now()-input.requestStarted)))})])
  if(!closed||req.socket.destroyed!==true||res.destroyed!==true||!writtenProof||writtenDetail?.forwarded_body_bytes!==1||writtenDetail?.write_callback_confirmed!==true||Date.now()-input.requestStarted>=8000)throw Error('release_prefix_original_delivery_chain_required')
  const detail=Object.freeze({...writtenDetail,actual_proxy_response_closed:true,actual_socket_destroyed:true})
  onDelivered(writtenProof,detail);return detail
 }finally{clearTimeout(timer);res.off('close',onClose)}
}
