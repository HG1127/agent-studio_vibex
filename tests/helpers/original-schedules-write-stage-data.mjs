import {createPgEmployeeSession} from '../../src/lib/pgNativeSession.ts'
import {createStudioPgAuthAdapter} from '../../src/lib/studioPgAuthAdapter.ts'
import {createOriginalSchedulesIdentity} from '../../src/lib/originalSchedulesIdentity.ts'
import {createOriginalSchedulesController} from '../../src/lib/originalSchedules.ts'
import {harness,E,OTHER,R,O,receipt,json,envelope} from './original-schedules-terminal-data.mjs'
export {E,OTHER,R,O,receipt,json,envelope,createOriginalSchedulesController}
export const prefixLoss=status=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));controller.error(Error('terminal_actual_response_prefix_lost'))}}),{status,headers:{'Content-Type':'application/json'}})
export async function setup(change,options={}){
 let mode='ok',who=E,h,pendingMe=null,removeFails=false
 const authRequests=[],apiFailures=[],apiAcknowledgements=[],writtenMarkers=[],keys=[R,O]
 const auth=createStudioPgAuthAdapter(createPgEmployeeSession(async(route,init)=>{
  authRequests.push({route,method:init.method})
  if(route.endsWith('/login')){mode='ok';return json({authenticated:true})}
  if(route.endsWith('/logout')){mode='signed_out';return json({ok:true})}
  if(pendingMe&&h?.stored){const handler=pendingMe;pendingMe=null;return await handler()}
  if(mode==='unavailable')throw Error('terminal native auth unavailable')
  if(mode==='signed_out')return json({error:'session_required'},401)
  return json({authenticated:true,user:{id:who,email:'employee@example.test',display_name:'Employee',is_admin:false}})
 }))
 await auth.verify();const identity=createOriginalSchedulesIdentity({account:auth.account,verify:auth.verify})
 h=await harness({ports:{...identity,key:()=>keys.shift()??crypto.randomUUID()},change:async op=>change(op,{h,auth,setMode:value=>{mode=value}}),...options})
 const actualStorage=h.ports.storage
 h.ports.storage={read:actualStorage.read,write(value){writtenMarkers.push(value);actualStorage.write(value)},remove(){if(removeFails)throw Error('terminal session storage removal unavailable');actualStorage.remove()}}
 const actualApi=h.ports.api
 h.ports.api=Object.freeze({...actualApi,async change(...args){try{const value=await actualApi.change(...args);apiAcknowledgements.push({request_id:args[1].request_id,status:value.result.status});return value}catch(error){apiFailures.push({request_id:args[1].request_id,status:error.status,code:error.code,outcomeUnknown:error.outcomeUnknown});throw error}}})
 const reLogin=async()=>{await auth.signOut();await auth.signIn('employee@example.test','SyntheticPassword#2026');await auth.verify()}
 const recreate=async()=>{h.controller.dispose();const next=createOriginalSchedulesController(h.ports);await next.start();return next}
 return{h,auth,authRequests,apiFailures,apiAcknowledgements,writtenMarkers,reLogin,recreate,setMode:value=>{mode=value},setWho:value=>{who=value},setPendingMe:handler=>{pendingMe=handler},setRemoveFailure:value=>{removeFails=value}}
}
export const posts=x=>x.h.requests.filter(r=>r.method==='POST')
export const metadataOnlyMarker=x=>{const raw=x.h.stored;return raw?{present:true,request_id:JSON.parse(raw).request_id,private_absent:!raw.includes('PRIVATE FULL INSTRUCTION')&&!raw.includes('authorization')}:null}
