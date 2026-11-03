import {localId,localObject,localCanonical,localDigest,parseLocalDevice,parseLocalTransportJson} from './native-local-device-contract.mjs'
import {guidedOwnerRoute} from './native-guided-contract.mjs'

const snapshots=new WeakSet()
export class NativeEmployeeInventoryError extends Error{
 constructor(status,code){super(code);this.name='NativeEmployeeInventoryError';this.status=status;this.code=code}
}
const fail=(code='native_local_inventory_unknown',status=503)=>{throw new NativeEmployeeInventoryError(status,code)}
const freeze=value=>{if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value)}return value}
function scope(raw){const v=localObject(raw,['owner','epoch']);localId(v.owner);if(!Number.isSafeInteger(v.epoch)||v.epoch<0)fail('native_local_inventory_session_changed',0);return {owner:v.owner,epoch:v.epoch}}
export function readNativeEmployeeInventory(value,expected){
 const current=scope(expected)
 if(!snapshots.has(value)||value.owner!==current.owner||value.epoch!==current.epoch)fail('native_local_inventory_session_changed',0)
 return value.items.map(row=>({...row}))
}
/** Read-only SDK. The expected owner is an additional fence; only the real
 * Cookie-authenticated /me response supplies verified server identity. */
export function createNativeEmployeeInventoryReader({transport=fetch,getContext,timeoutMs=15000}){
 if(typeof transport!=='function'||typeof getContext!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>15000)fail()
 async function read(signal,expected=getContext()){
  const selected=scope(expected),combined=AbortSignal.any([AbortSignal.timeout(timeoutMs),...(signal?[signal]:[])])
  const check=()=>{combined.throwIfAborted();const current=scope(getContext());if(current.owner!==selected.owner||current.epoch!==selected.epoch)fail('native_local_inventory_session_changed',0)}
  check()
  async function request(route,max){
   check()
   const response=await transport('/__pg_native'+route,{method:'GET',credentials:'same-origin',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',headers:{Accept:'application/json','X-AgentStudio-Expected-Owner':selected.owner},signal:combined})
   check()
   if(response.redirected||response.headers.get('cache-control')!=='no-store'||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??''))fail()
   const reader=response.body?.getReader();if(!reader)fail()
   const chunks=[];let used=0
   try{for(;;){check();const {value,done}=await reader.read();check();if(done)break;used+=value.byteLength;if(used>max)fail('native_local_inventory_limit');chunks.push(value)}}catch(error){try{void reader.cancel().catch(()=>{})}catch{}throw error}finally{reader.releaseLock()}
   const bytes=new Uint8Array(used);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength}
   check();let body
   try{body=parseLocalTransportJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes),max)}catch{fail()}
   return {status:response.status,body}
  }
  function accepted(response){
   if(response.status!==200){
    let code='native_local_inventory_unavailable'
    try{const v=localObject(response.body,['error'],['request_id']);if(typeof v.error==='string'&&/^[a-z_]{1,100}$/.test(v.error))code=v.error}catch{}
    fail(code,response.status)
   }
   return response.body
  }
  async function me(){
   const v=localObject(accepted(await request('/api/native-auth/me',8192)),['authenticated','user'])
   if(v.authenticated!==true)fail('native_local_inventory_session_required',401)
   const user=localObject(v.user,['id','email','display_name','is_admin'],['share_enabled'])
   if(typeof user.email!=='string'||user.email.length>254||typeof user.display_name!=='string'||user.display_name.length>80||typeof user.is_admin!=='boolean'||user.share_enabled!==undefined&&typeof user.share_enabled!=='boolean')fail()
   if(localId(user.id)!==selected.owner)fail('native_local_inventory_session_changed',401)
   check()
  }
  await me()
  let inventory,problem,failed=false
  try{
   const first=accepted(await request('/api/v2/local-devices',1450000)),pairings=accepted(await request(guidedOwnerRoute,70000)),last=accepted(await request('/api/v2/local-devices',1450000))
   if(!Array.isArray(first)||!Array.isArray(last)||!Array.isArray(pairings)||first.length>100||first.length!==last.length||pairings.length!==last.length)fail()
   const before=first.map(parseLocalDevice),devices=last.map(parseLocalDevice),old=new Map(before.map(d=>[d.id,d])),states=new Map()
   if(old.size!==before.length||new Set(devices.map(d=>d.id)).size!==devices.length)fail()
   for(const item of pairings){const p=localObject(item,['id','paired','pairing_expires_ms']);localId(p.id);if(states.has(p.id)||typeof p.paired!=='boolean'||!Number.isSafeInteger(p.pairing_expires_ms)||p.pairing_expires_ms<1)fail();states.set(p.id,p)}
   const items=[]
   for(const device of devices){
    const prior=old.get(device.id),pair=states.get(device.id)
    if(!prior||!pair||localCanonical(prior)!==localCanonical(device))fail('native_local_inventory_changed')
    if(!pair.paired&&device.seen_ms>0)fail()
    if(await localDigest(device.catalog)!==device.catalog_sha256)fail();check()
    items.push({backend:'native_pg',id:device.id,name:device.name,revoked:device.revoked,seen_ms:device.seen_ms,catalog:JSON.stringify(device.catalog),catalog_sha256:device.catalog_sha256,version:device.version,paired:pair.paired,pairing_expires_ms:pair.pairing_expires_ms})
   }
   inventory=freeze({backend:'native_pg',owner:selected.owner,epoch:selected.epoch,items})
  }catch(error){problem=error;failed=true}
  // A real Cookie change must win over an in-flight404 or projection error.
  // No empty inventory or old-owner result is published before this final /me.
  await me();check()
  if(failed)throw problem
  snapshots.add(inventory);return inventory
 }
 return Object.freeze({read})
}
