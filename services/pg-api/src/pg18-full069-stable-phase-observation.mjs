// Passive per-async-call scalars only. No file, source/runtime/audit result,
// Pool, target, permission, clock adapter, readiness or original Error is stored.
import {AsyncLocalStorage} from 'node:async_hooks'
import {performance} from 'node:perf_hooks'
const contexts=new AsyncLocalStorage()
const phaseKeys=Object.freeze(['state_host_ms','live_context_source_ms','live_profile_key_telemetry_ms','network_policy_ms','node_executable_ms','C_records_ms','live_input_pins_ms','live_file_pins_ms','final_sources_ms','final_signature_key_ms','final_private_pins_ms','other_ms'])
function newContext(){return {valid:true,closed:false,active:false,calls:0,guardMs:0,guardAt:0,at:0,phase:null,parts:Object.fromEntries(phaseKeys.map(k=>[k,0]))}}
function invalidate(t){try{if(t)t.valid=false}catch{}}
function stamp(t){const at=performance.now();if(!Number.isFinite(at)||at<0||at<t.at){t.valid=false;return null}return at}
function beginPart(t,part){
 if(!t||t.closed||!t.valid)return null
 if(part==='guard'){
  if(t.active){t.valid=false;return null}
  const at=stamp(t);if(at===null)return null;t.active=true;t.calls++;t.guardAt=at;t.at=at;t.phase='other_ms';return {t,root:true,previous:null}
 }
 if(!t.active)return null
 if(!phaseKeys.includes(part)||part==='other_ms'){t.valid=false;return null}
 const at=stamp(t);if(at===null)return null;const previous=t.phase;t.parts[previous]+=at-t.at;t.at=at;t.phase=part;return {t,root:false,previous}
}
function endPart(span){
 if(!span)return;const {t,root,previous}=span
 if(!t.valid){if(root){t.active=false;t.phase=null}return}
 const at=stamp(t);if(at===null){if(root){t.active=false;t.phase=null}return}
 t.parts[t.phase]+=at-t.at;t.at=at
 if(root){t.guardMs+=at-t.guardAt;t.active=false;t.phase=null}else t.phase=previous
}
/** Internal fixed-source call sites only. Work executes once even if recording fails. */
export function measureFull069StablePhase(part,work){
 let t,span;try{t=contexts.getStore();span=beginPart(t,part)}catch{invalidate(t)}
 try{return work()}finally{try{endPart(span)}catch{invalidate(t)}}
}
function closedParts(t){
 if(!t.valid||t.active||t.phase!==null||t.calls!==30)return null
 const round=v=>{const n=Math.ceil(v);if(!Number.isSafeInteger(n)||Object.is(n,-0)||n<0||n>120000)throw Error();return n},parts=Object.fromEntries(phaseKeys.map(k=>[k,round(t.parts[k])])),guardMs=round(t.guardMs)
 const total=Object.values(parts).reduce((a,b)=>a+b,0);if(total+1<guardMs||total>guardMs+phaseKeys.length)return null
 return Object.freeze({guard_calls:30,guard_ms:guardMs,...parts})
}
/** The caller is the actual Runtime's own audit closure, never an audit adapter. */
export async function withFull069StablePhaseTiming(observation,work){
 let t;try{if(observation)t=newContext()}catch{}
 if(!t)return await work()
 let invoked=false,returned,thrown,failed=false
 const actual=()=>{if(invoked){if(failed)throw thrown;return returned}invoked=true;try{returned=work();return returned}catch(error){failed=true;thrown=error;throw error}}
 try{contexts.run(t,actual)}catch{invalidate(t)}
 if(!invoked){t.closed=true;return await work()}
 try{
  if(failed)throw thrown
  const value=await returned
  try{const parts=closedParts(t);if(parts)observation.stablePhases=parts}catch{}
  return value
 }finally{t.closed=true}
}
