import {randomBytes} from 'node:crypto'
const stages=new Set(['imported','choosing_folder','choosing_file','ready_to_confirm','confirming','selection_cancelled','cancelled','error'])
/** Progress is informational: never consumes a ticket, pairs a device or sends
 * paths, permissions, raw failures, credentials files or execution heartbeats. */
export function createSetupReporter({fetcher=fetch,clock=Date.now,heartbeatMs=10000,timeoutMs=2500}={}){
 let current=null,closed=false
 const stop=()=>{const entry=current;current=null;if(entry){clearInterval(entry.timer);entry.controller?.abort()}}
 const pump=async entry=>{
  if(closed||current!==entry||entry.sending||entry.disabled||clock()>=entry.ticket.pairing.expiresAt)return
  entry.sending=true
  const stage=entry.registered?entry.stage:'imported',revision=entry.revision,controller=new AbortController();entry.controller=controller
  let accepted=false
  const send=async(route,body)=>fetcher(entry.ticket.server+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(timeoutMs)])})
  try{
   const identity={id:entry.ticket.pairing.id,code:entry.ticket.pairing.code}
   if(entry.previousAttempt===undefined){
    const context=await send('/api/public/local-executor/setup-progress/context',identity)
    if(!context.ok){if([401,403,404,405,409].includes(context.status)){entry.disabled=true;clearInterval(entry.timer)}await context.body?.cancel().catch(()=>{});return}
    const value=await context.json()
    if(typeof value.previousAttempt!=='string'||value.previousAttempt!==''&&!/^[a-f0-9]{24}$/.test(value.previousAttempt))throw Error('invalid_progress_context')
    entry.previousAttempt=value.previousAttempt
   }
   if(closed||current!==entry||controller.signal.aborted||clock()>=entry.ticket.pairing.expiresAt)return
   const response=await send('/api/public/local-executor/setup-progress',{...identity,attempt:entry.attempt,previousAttempt:entry.previousAttempt,sequence:++entry.sequence,stage})
   accepted=response.ok
   if(response.ok)entry.registered=true
   else if([401,403,404,405,409].includes(response.status)){entry.disabled=true;clearInterval(entry.timer)}
   await response.body?.cancel().catch(()=>{})
  }catch{}finally{
   entry.sending=false;entry.controller=null
   if(current===entry&&entry.finishing&&(!accepted||stage===entry.stage)){current=null;return}
   if(current===entry&&accepted&&!entry.disabled&&(entry.revision!==revision||stage!==entry.stage))void pump(entry)
  }
 }
 return {
  start(ticket){
   stop();if(closed)return
   const entry={ticket,attempt:randomBytes(12).toString('hex'),sequence:0,stage:'imported',revision:0,registered:false,sending:false,disabled:false,controller:null,timer:null}
   current=entry;entry.timer=setInterval(()=>{if(clock()>=ticket.pairing.expiresAt){clearInterval(entry.timer);entry.controller?.abort();return}void pump(entry)},heartbeatMs);entry.timer.unref?.();void pump(entry)
  },
  stage(stage){if(!stages.has(stage))throw Error('invalid_setup_stage');if(!current)return;current.stage=stage;current.revision++;void pump(current)},
  finish(stage){if(!current)return;if(!stages.has(stage))throw Error('invalid_setup_stage');clearInterval(current.timer);current.finishing=true;current.stage=stage;current.revision++;void pump(current)},
  stop,
  close(){closed=true;stop()}
 }
}
