import {randomBytes} from 'node:crypto'
import {confirmNative} from './native-confirmation.mjs'

/** Only the private parent IPC channel can answer. No HTTP/model/tool endpoint. */
export function confirmManaged(review,signal,{channel=process,timeoutMs=90000}={}){
 if(!channel.connected||process.env.STUDIO_LOCAL_EMBEDDED!=='1')return confirmNative(review,signal)
 if(signal?.aborted)return Promise.reject(Object.assign(Error('permission_confirmation_cancelled'),{name:'AbortError'}))
 if(typeof review?.message!=='string'||review.message.length>24000)return Promise.reject(Error('invalid_control_review'))
 const requestId=randomBytes(16).toString('hex')
 return new Promise((resolve,reject)=>{
  let finished=false
  const finish=(ok,error)=>{if(finished)return;finished=true;clearTimeout(timer);channel.off('message',message);channel.off('disconnect',disconnect);signal?.removeEventListener('abort',abort);try{if(channel.connected)channel.send({type:'studio-review-cancel',requestId},()=>{})}catch{};error?reject(error):resolve(ok)}
  const message=m=>{if(m?.type==='studio-review-result'&&m.requestId===requestId)finish(m.ok===true)}
  const abort=()=>finish(false,Object.assign(Error('permission_confirmation_cancelled'),{name:'AbortError'}))
  const disconnect=()=>finish(false,Error('permission_confirmation_unavailable'))
  const timer=setTimeout(()=>finish(false,Error('permission_confirmation_timeout')),timeoutMs)
  channel.on('message',message);channel.once('disconnect',disconnect);signal?.addEventListener('abort',abort,{once:true})
  try{channel.send({type:'studio-review',requestId,review,expiresAt:Date.now()+timeoutMs},error=>{if(error)disconnect()})}catch{disconnect()}
 })
}
