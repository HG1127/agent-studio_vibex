import type {IncomingMessage,ServerResponse} from 'node:http'
import {HttpError,type Identity} from './contracts.ts'
import {verifyNativeOrigin} from './native-auth-http.mjs'
import type {NativeHomeResourcesRepository} from './native-home-resources-repository.ts'
export const originalHomeResourcesPath='/api/v2/original-ui/home-resources'
type Dependencies={repository:Pick<NativeHomeResourcesRepository,'get'>;authenticateRequest:(req:IncomingMessage)=>Promise<Identity>;allowedOrigin:string}
function reply(res:ServerResponse,status:number,value:unknown):void{
 const encoded=JSON.stringify(value);if(Buffer.byteLength(encoded)>1048576)throw new HttpError(503,'original_home_response_too_large')
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin'});res.end(encoded)
}
/** Read-only Native Cookie facade; routing never grants a server capability. */
export function createNativeHomeResourcesHttp({repository,authenticateRequest,allowedOrigin}:Dependencies){
 if(!repository||typeof repository.get!=='function'||typeof authenticateRequest!=='function')throw Error('invalid_original_home_resources_http_dependencies')
 return async(req:IncomingMessage,res:ServerResponse):Promise<boolean>=>{
  const raw=req.url??''
  if(raw!==originalHomeResourcesPath&&!raw.startsWith(originalHomeResourcesPath+'?')&&!raw.startsWith(originalHomeResourcesPath+'/'))return false
  try{
   verifyNativeOrigin(req,allowedOrigin,req.method!=='GET')
   const identity=await authenticateRequest(req)
   if(identity?.issuer!=='urn:agentstudio:local:v1'||typeof identity.subject!=='string'||!identity.subject)throw new HttpError(403,'native_employee_identity_required')
   if(req.method!=='GET')throw new HttpError(405,'method_not_allowed')
   if(raw!==originalHomeResourcesPath)throw new HttpError(400,'invalid_original_home_resources_path')
   for await(const chunk of req)if(Buffer.byteLength(chunk)>0)throw new HttpError(400,'invalid_original_home_resources_body')
   reply(res,200,await repository.get(identity))
  }catch(error){
   if(error instanceof HttpError&&Number.isInteger(error.status)&&error.status>=400&&error.status<=599&&/^[a-z][a-z0-9_]{0,79}$/.test(error.code))reply(res,error.status,{error:error.code})
   else{const auth=error as {status?:unknown;message?:unknown};if(typeof auth?.status==='number'&&[401,403].includes(auth.status)&&typeof auth.message==='string'&&['session_required','native_cookie_only','origin_not_allowed','cross_site_request_denied','origin_or_csrf_header_required'].includes(auth.message))reply(res,auth.status,{error:auth.message});else reply(res,503,{error:'original_home_resources_unavailable'})}
  }
  return true
 }
}
