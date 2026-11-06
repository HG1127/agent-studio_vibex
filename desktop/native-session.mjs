// Main-process only. Use the ORIGINAL Electron partition's network stack;
// never read/copy cookie values or accept caller-selected URLs/headers.
import {localId,localObject,localDigest,parseLocalDevice,parseLocalTransportJson} from '../shared/native-local-device-contract.mjs'
import {guidedOwnerRoute,guidedIntent,guidedReply} from '../shared/native-guided-contract.mjs'
function refused(code,status=0){return Object.assign(Error(code),{status})}
function context(raw){
 localObject(raw,['origin','serverOrigin','epoch','backend'])
 const local=new URL(raw.origin),server=new URL(raw.serverOrigin)
 if(raw.backend!=='native_pg'||!Number.isSafeInteger(raw.epoch)||raw.epoch<0||local.origin!==raw.origin||local.protocol!=='http:'||local.hostname!=='127.0.0.1'||!local.port||server.origin!==raw.serverOrigin||server.protocol!=='https:'&&!(server.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(server.hostname)))throw refused('desktop_native_origin_refused')
 return {...raw}
}
export function createDesktopNativeSessionPort({getSession,getContext}){
 let pending=null
 async function loadInventory(guided){
  const selected=context(getContext()),session=getSession()
  if(!session||typeof session.fetch!=='function')throw refused('desktop_native_session_unavailable')
  const check=()=>{const current=context(getContext());if(getSession()!==session||Object.keys(selected).some(k=>selected[k]!==current[k]))throw refused('desktop_native_epoch_changed')}
  async function read(route,payload,expectedOwner){
   check();const signal=AbortSignal.timeout(10000)
   const response=await session.fetch(selected.origin+'/__pg_native'+route,{method:payload===undefined?'GET':'POST',...(payload===undefined?{}:{body:JSON.stringify(payload)}),credentials:'include',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',headers:{Accept:'application/json',Origin:selected.origin,...(expectedOwner?{'X-AgentStudio-Expected-Owner':expectedOwner}:{}),...(payload===undefined?{}:{'Content-Type':'application/json','X-AgentStudio-Request':'1'})},signal});try{check()
   if(response.status!==200)throw refused([401,403].includes(response.status)?'desktop_native_session_required':'desktop_native_unavailable',response.status)
   if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'')||response.headers.get('cache-control')!=='no-store')throw refused('desktop_native_invalid_response')
   const reader=response.body?.getReader();if(!reader)throw refused('desktop_native_invalid_response');const chunks=[];let used=0
   try{for(;;){signal.throwIfAborted();check();const {value,done}=await reader.read();if(done)break;used+=value.byteLength;if(used>1450000){await reader.cancel().catch(()=>{});throw refused('desktop_native_response_limit')}chunks.push(value)}}finally{reader.releaseLock()}
   const bytes=new Uint8Array(used);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength}check();return parseLocalTransportJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes))
   }catch(error){try{void response.body?.cancel().catch(()=>{})}catch{}throw error}
  }
  const me=async()=>{const value=localObject(await read('/api/native-auth/me'),['authenticated','user']);if(value.authenticated!==true)throw refused('desktop_native_session_required',401);const user=localObject(value.user,['id','email','display_name','is_admin'],['share_enabled']);if(typeof user.email!=='string'||typeof user.display_name!=='string'||typeof user.is_admin!=='boolean')throw refused('desktop_native_invalid_profile');return localId(user.id)}
  const owner=await me();if(guided){if(owner!==guided.expectedOwner)throw refused('desktop_native_owner_changed',401);const value=await read(guidedOwnerRoute+(guided.operation==='confirm'?'/confirm':''),guided.operation==='status'?undefined:guided.input,owner);if(await me()!==owner)throw refused('desktop_native_owner_changed',401);check();return {owner,value:guided.operation==='status'?value:await guidedReply(value,guided.input)}}
  const raw=await read('/api/v2/local-devices');if(!Array.isArray(raw)||raw.length>100)throw refused('desktop_native_invalid_inventory')
  const devices=raw.map(parseLocalDevice);if(new Set(devices.map(d=>d.id)).size!==devices.length)throw refused('desktop_native_invalid_inventory')
  for(const device of devices)if(device.catalog_sha256!==await localDigest(device.catalog))throw refused('desktop_native_invalid_inventory')
  if(await me()!==owner)throw refused('desktop_native_owner_changed',401);check()
  return {owner,devices}
 }
 function inventory(){if(pending)return pending;const request=loadInventory().finally(()=>{if(pending===request)pending=null});pending=request;return request}
 function guided(operation,input,expectedOwner){if(!['record','confirm','status'].includes(operation))throw refused('desktop_native_operation_refused');localId(expectedOwner);if(operation==='status'&&input!==undefined)throw refused('desktop_native_operation_refused');return loadInventory({operation,input:operation==='status'?undefined:guidedIntent(input),expectedOwner})}
 return Object.freeze({inventory,guided})
}
