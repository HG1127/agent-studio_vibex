type Listener=()=>void
const listeners=new Set<Listener>()
let channel:BroadcastChannel|null=null
function notify(){for(const listener of [...listeners])listener()}
function connect(){
 if(channel||typeof window==='undefined'||typeof BroadcastChannel==='undefined')return
 channel=new BroadcastChannel('agentstudio-session-privacy-v1')
 channel.onmessage=()=>notify()
}
/** Invalidation only: neither local code nor another tab can grant identity. */
export function invalidateStudioSessionPrivacy(){connect();notify();channel?.postMessage('invalidate')}
export function subscribeStudioSessionPrivacy(listener:Listener){connect();listeners.add(listener);return()=>{listeners.delete(listener)}}
