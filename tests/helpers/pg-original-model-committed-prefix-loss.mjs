// Fault injection for a completely consumed, independently verified upstream
// ACK. Forward its real status/headers and one actual byte, then close only
// after ServerResponse.write confirms the byte was written. No success payload
// is created, completed or parsed on behalf of the browser.
export async function dropActualCommittedModelReplyPrefix({req,res,status,expectedStatus,headers,actual,responseComplete,requestStarted,verifyCommitted,onWritten}){
 const invalid=()=>Error('model_ack_prefix_loss_requires_actual_complete_response')
 if(![200,201].includes(expectedStatus)||status!==expectedStatus||responseComplete!==true||!Buffer.isBuffer(actual)||actual.length<2||actual.length>1048576||!headers||typeof headers!=='object'||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(headers['content-type']??'')||typeof verifyCommitted!=='function'||typeof onWritten!=='function'||!Number.isSafeInteger(requestStarted))throw invalid()
 const length=headers['content-length'];if(length!==undefined&&(typeof length!=='string'||!/^[1-9][0-9]*$/.test(length)||Number(length)!==actual.length))throw invalid()
 const remaining=8000-(Date.now()-requestStarted),prefix=Buffer.from(actual.subarray(0,1))
 if(remaining<=0||remaining>8000||res.headersSent||res.destroyed||req.socket.destroyed)throw Error('model_ack_prefix_loss_requires_connected_client_within_original_budget')
 return new Promise((resolve,reject)=>{
  let settled=false,timer
  const onError=error=>finish(error instanceof Error?error:Error('model_ack_prefix_write_failed')),onClose=()=>finish(Error('model_ack_prefix_client_closed'))
  const detach=()=>{res.off('error',onError);res.off('close',onClose)}
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);detach();if(error)reject(error);else resolve(value)}
  const live=()=>{if(res.destroyed||req.socket.destroyed||Date.now()-requestStarted>=8000)throw Error('model_ack_prefix_loss_requires_connected_client_within_original_budget')}
  timer=setTimeout(()=>finish(Error('model_ack_prefix_loss_original_deadline')),remaining)
  res.once('error',onError);res.once('close',onClose)
  void Promise.resolve().then(verifyCommitted).then(proof=>{
   if(settled)return
   live();res.writeHead(status,headers)
   res.write(prefix,error=>{
    if(settled)return
    if(error){finish(error);return}
    try{live();const detail=Object.freeze({status,actual_body_bytes:actual.length,forwarded_body_bytes:1,headers_written:res.headersSent===true,write_callback_confirmed:true,before_client_deadline:true});if(!detail.headers_written)throw Error('model_ack_prefix_headers_not_written');onWritten(proof,detail);detach();req.socket.destroy();finish(undefined,detail)}catch(error){finish(error)}
   })
  }).catch(error=>finish(error))
 })
}
