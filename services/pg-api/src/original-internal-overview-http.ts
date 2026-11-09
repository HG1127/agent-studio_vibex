import type {IncomingMessage,ServerResponse} from 'node:http'
import {HttpError,type Identity} from './contracts.ts'
import {nativeSessionToken,verifyNativeOrigin} from './native-auth-http.mjs'
import {originalInternalEmployeeId,parseOriginalInternalOverview} from '../../../shared/original-internal-overview-contract.ts'
export const originalInternalOverviewPath='/api/v2/original-ui/internal-overview'
type Dependencies={allowedOrigin:string;authenticateRequest(req:IncomingMessage):Promise<Identity>;read(identity:Identity,expectedEmployee:string):Promise<unknown>}
function reply(res:ServerResponse,status:number,value:unknown){const body=JSON.stringify(value);if(Buffer.byteLength(body)>131072)throw new HttpError(503,'original_internal_overview_unavailable');res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',Pragma:'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(body)}
export function createOriginalInternalOverviewHttp({allowedOrigin,authenticateRequest,read}:Dependencies){
 return async(req:IncomingMessage,res:ServerResponse):Promise<boolean>=>{
  const raw=req.url??'';if(raw!==originalInternalOverviewPath&&!raw.startsWith(originalInternalOverviewPath+'?')&&!raw.startsWith(originalInternalOverviewPath+'/'))return false
  try{
   verifyNativeOrigin(req,allowedOrigin,false)
   if(req.headers.authorization!==undefined||!nativeSessionToken(req)||['x-rh-user-id','x-agentstudio-user-id','x-forwarded-user','x-forwarded-email'].some(k=>req.headers[k]!==undefined))throw new HttpError(401,'session_required')
   const identity=await authenticateRequest(req);if(identity?.issuer!=='urn:agentstudio:local:v1'||typeof identity.subject!=='string'||!identity.subject)throw new HttpError(403,'native_employee_identity_required')
   if(req.method!=='GET')throw new HttpError(405,'method_not_allowed')
   if(raw!==originalInternalOverviewPath||req.headers['transfer-encoding']!==undefined||req.headers['content-length']!==undefined&&req.headers['content-length']!=='0')throw new HttpError(400,'invalid_original_internal_overview_request')
   let expected:string;try{expected=originalInternalEmployeeId(req.headers['x-agentstudio-expected-employee'])}catch{throw new HttpError(400,'invalid_original_internal_overview_request')}
   for await(const chunk of req)if(Buffer.byteLength(chunk)>0)throw new HttpError(400,'invalid_original_internal_overview_request')
   reply(res,200,parseOriginalInternalOverview(await read(identity,expected),expected))
  }catch(error){
   const d=error&&typeof error==='object'?Object.getOwnPropertyDescriptors(error):{},status=d.status?.value,code=d.code?.value,message=d.message?.value
   if(error instanceof HttpError&&({400:['invalid_original_internal_overview_request'],401:['session_required'],403:['native_employee_identity_required'],405:['method_not_allowed'],409:['original_internal_overview_employee_changed']} as Record<number,string[]>)[status]?.includes(code))reply(res,status,{error:code})
   else if(status===401&&message==='session_required')reply(res,401,{error:'session_required'})
   else if(status===403&&['origin_not_allowed','cross_site_request_denied','origin_or_csrf_header_required','native_cookie_only'].includes(message))reply(res,403,{error:'native_employee_identity_required'})
   else reply(res,503,{error:'original_internal_overview_unavailable'})
  }
  return true
 }
}
