// Native-only fixed read transport. The shared facade owns every request's
// original 8s budget, H3 pre/post identity context and controlled read handles.
import type {IncomingMessage,ServerResponse} from 'node:http'
import {NativeCompanyWorkerHeartbeats} from './native-company-worker-heartbeats.ts'
import {NativeCompanyAdminError} from './native-current-company-admin.mjs'
import {nativeSessionToken,verifyNativeOrigin} from './native-auth-http.mjs'
import {parseWorkerHeartbeatSnapshot} from './worker-heartbeat-contract.ts'

export const nativeCompanyWorkerHeartbeatsRoute='/api/v2/company-worker-heartbeats' as const
const unavailable='company_worker_heartbeats_unavailable' as const
const headers=Object.freeze({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  Pragma:'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
  'Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY'})
const actualRead=NativeCompanyWorkerHeartbeats.prototype.read
const actualLocalStatus=NativeCompanyWorkerHeartbeats.prototype.localStatus

/** Configuration only, never activation or worker readiness. No target, clock,
 * pool, credential or transport adapter can be supplied through this switch. */
export function selectNativeCompanyWorkerHeartbeatsHttp(env:NodeJS.ProcessEnv,listen:boolean,origin:string):boolean{
  const flag=env.AGENT_STUDIO_PG_NATIVE_COMPANY_WORKER_HEARTBEATS_READ_ENABLED
  if(flag===undefined||flag==='false')return false
  let secure=false
  try{const url=new URL(origin);secure=url.origin===origin&&url.protocol==='https:'}catch{}
  const uid=process.getuid?.()
  if(flag!=='true'||env.AGENT_STUDIO_PG_NATIVE_COMPANY_WORKER_HEARTBEATS_REVIEWED!=='true'||
    env.AGENT_STUDIO_PG_NATIVE_PILOT_ENABLED!=='true'||env.AGENT_STUDIO_PG_NATIVE_REVIEWED!=='true'||
    !listen||!secure||process.platform!=='linux'||uid===undefined||uid<=0)
    throw Error('native_company_worker_heartbeats_http_configuration_refused')
  return true
}
export type NativeCompanyWorkerHeartbeatsHttpDependencies=Readonly<{
  component:NativeCompanyWorkerHeartbeats
  allowedOrigin:string
  enabled?:boolean
}>
function dependencies(raw:NativeCompanyWorkerHeartbeatsHttpDependencies){
  const invalid=():never=>{throw Error('invalid_native_company_worker_heartbeats_http_dependencies')}
  if(!raw||typeof raw!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid()
  const descriptors=Object.getOwnPropertyDescriptors(raw)
  for(const key of Reflect.ownKeys(raw)){
    const d=typeof key==='string'?descriptors[key]:undefined
    if(typeof key!=='string'||!['component','allowedOrigin','enabled'].includes(key)||!d?.enumerable||!('value'in d))return invalid()
  }
  const component=descriptors.component?.value,allowedOrigin=descriptors.allowedOrigin?.value,
    enabled=descriptors.enabled?.value===undefined?false:descriptors.enabled.value
  if(!(component instanceof NativeCompanyWorkerHeartbeats)||typeof allowedOrigin!=='string'||typeof enabled!=='boolean')return invalid()
  try{
    // The actual private-field method rejects prototype clones/proxies and
    // caller read/status replacements. This performs no SQL or controller I/O.
    actualLocalStatus.call(component)
    verifyNativeOrigin({headers:{}} as IncomingMessage,allowedOrigin,false)
  }catch{return invalid()}
  return {component,allowedOrigin,enabled}
}
function owns(raw:string):boolean{
  const claimed=(value:string)=>value===nativeCompanyWorkerHeartbeatsRoute||value.startsWith(nativeCompanyWorkerHeartbeatsRoute+'/')
  if(claimed(raw.split(/[?#]/,1)[0]??''))return true
  try{const pathname=new URL(raw,'http://127.0.0.1').pathname;return claimed(pathname)||claimed(decodeURIComponent(pathname))}catch{return false}
}
function reply(res:ServerResponse,status:200|401|403|503,body:unknown):void{
  const encoded=JSON.stringify(body)
  if(res.destroyed||res.writableEnded||res.headersSent)return
  res.writeHead(status,headers);res.end(encoded)
}
function failure(error:unknown):Readonly<{status:401|403|503;code:string}>{
  try{
    if(error instanceof NativeCompanyAdminError){
      const d=Object.getOwnPropertyDescriptors(error),status=d.status?.value,code=d.code?.value
      if(status===401&&code==='session_required')return {status:401,code:'session_required'}
      if(status===403&&code==='admin_required')return {status:403,code:'admin_required'}
    }
  }catch{/* Arbitrary error-shaped values never select an authorization error. */}
  return {status:503,code:unavailable}
}
/** Mount once around the existing Native business handler. This accepts only
 * one actual shared component, never a per-request factory or read adapter. */
export function createNativeCompanyWorkerHeartbeatsHttpHandler(raw:NativeCompanyWorkerHeartbeatsHttpDependencies){
  const {component,allowedOrigin,enabled}=dependencies(raw)
  return async(req:IncomingMessage,res:ServerResponse):Promise<boolean>=>{
    if(!owns(req.url??''))return false
    try{
      try{verifyNativeOrigin(req,allowedOrigin,false)}catch{reply(res,403,{error:'admin_required'});return true}
      const cookie=nativeSessionToken(req)
      if(!cookie||req.headers.authorization!==undefined||
        ['x-rh-user-id','x-agentstudio-user-id','x-forwarded-user','x-forwarded-email'].some(key=>req.headers[key]!==undefined)){
        reply(res,401,{error:'session_required'});return true
      }
      // No stream drain or new timeout precedes the facade budget. A framed
      // GET body, URI alias/query or any other method never starts a read.
      if(req.method!=='GET'||req.url!==nativeCompanyWorkerHeartbeatsRoute||
        req.headers['transfer-encoding']!==undefined||req.headers.expect!==undefined||
        req.headers.trailer!==undefined||req.headers['content-length']!==undefined&&req.headers['content-length']!=='0'||
        req.readableLength>0||!enabled){
        reply(res,503,{error:unavailable});return true
      }
      // Call the captured actual method; an own read replacement is ignored.
      // No retry, alternate pool, new context, Promise.race or unknown fallback.
      const snapshot=await actualRead.call(component,cookie)
      reply(res,200,parseWorkerHeartbeatSnapshot(snapshot))
    }catch(error){
      const checked=failure(error);reply(res,checked.status,{error:checked.code})
    }
    return true
  }
}
