import type {IncomingMessage,ServerResponse} from 'node:http'
import {HttpError,isUuid,type Identity} from './contracts.ts'
import {verifyNativeOrigin} from './native-auth-http.mjs'
import type {NativeHomeAgentSpecsRepository,OriginalHomeAgentWrite} from './native-home-agent-specs-repository.ts'
import {expectedOriginalUiEmployee} from './native-original-ui-preconditions.ts'

export const originalHomeAgentPrefix='/api/v2/original-ui/agent-specs'
type Repository=Pick<NativeHomeAgentSpecsRepository,'list'|'get'|'create'|'update'>
type Dependencies={repository:Repository;authenticateRequest:(req:IncomingMessage)=>Promise<Identity>;allowedOrigin:string;allowWrites:boolean}
function reply(res:ServerResponse,status:number,value:unknown):void{
 const encoded=JSON.stringify(value)
 if(Buffer.byteLength(encoded,'utf8')>1048576)throw new HttpError(503,'original_home_response_too_large')
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin'})
 res.end(encoded)
}
function exact(value:Record<string,unknown>,required:string[],optional:string[]=[]):void{
 if(required.some(k=>!Object.hasOwn(value,k))||Object.keys(value).some(k=>![...required,...optional].includes(k)))throw new HttpError(400,'invalid_original_home_input')
}
async function empty(req:IncomingMessage):Promise<void>{
 for await(const chunk of req)if(Buffer.byteLength(chunk)>0)throw new HttpError(400,'invalid_original_home_query')
}
async function body(req:IncomingMessage):Promise<Record<string,unknown>>{
 if(typeof req.headers['content-type']!=='string'||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type']))throw new HttpError(415,'json_content_type_required')
 const declared=req.headers['content-length']
 if(declared!==undefined&&(typeof declared!=='string'||!/^(0|[1-9][0-9]*)$/.test(declared)||Number(declared)>262144))throw new HttpError(413,'request_too_large')
 const chunks:Buffer[]=[];let size=0
 for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>262144)throw new HttpError(413,'request_too_large');chunks.push(Buffer.from(chunk))}
 if(declared!==undefined&&size!==Number(declared))throw new HttpError(400,'invalid_json')
 let value:unknown
 try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))}catch{throw new HttpError(400,'invalid_json')}
 if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'invalid_json')
 return value as Record<string,unknown>
}
/** Fixed Native-only facade. No caller owner, PB/OIDC fallback or DELETE. */
export function createNativeHomeAgentSpecsHttp({repository,authenticateRequest,allowedOrigin,allowWrites}:Dependencies){
 if(!repository||typeof authenticateRequest!=='function'||typeof allowWrites!=='boolean'||['list','get','create','update'].some(k=>typeof repository[k as keyof Repository]!=='function'))throw Error('invalid_original_home_http_dependencies')
 return async(req:IncomingMessage,res:ServerResponse):Promise<boolean>=>{
  const raw=req.url??''
  if(raw!==originalHomeAgentPrefix&&!raw.startsWith(originalHomeAgentPrefix+'/')&&!raw.startsWith(originalHomeAgentPrefix+'?'))return false
  try{
   const method=req.method??''
   verifyNativeOrigin(req,allowedOrigin,method!=='GET')
   const identity=await authenticateRequest(req)
   if(identity?.issuer!=='urn:agentstudio:local:v1'||typeof identity.subject!=='string'||!identity.subject)throw new HttpError(403,'native_employee_identity_required')
   const url=new URL(raw,'http://127.0.0.1')
   if(raw!==url.pathname+url.search)throw new HttpError(400,'invalid_original_home_path')
   const suffix=url.pathname.slice(originalHomeAgentPrefix.length),id=suffix?suffix.slice(1):null
   if(id!==null&&(!isUuid(id)||suffix!=='/'+id||url.search!==''))throw new HttpError(400,'invalid_spec_id')
   if(method==='GET'){
    await empty(req)
    if(id!==null){reply(res,200,{item:await repository.get(identity,id.toLowerCase())});return true}
    const keys=[...url.searchParams.keys()],rawLimit=url.searchParams.get('limit')??'50'
    if(keys.some(k=>k!=='limit')||keys.length>1||!/^[1-9][0-9]?$/.test(rawLimit)||Number(rawLimit)>50)throw new HttpError(400,'invalid_limit')
    reply(res,200,{items:await repository.list(identity,Number(rawLimit))});return true
   }
   if(!['POST','PATCH'].includes(method)||method==='POST'&&id!==null||method==='PATCH'&&id===null)throw new HttpError(405,'method_not_allowed')
   if(!allowWrites)throw new HttpError(405,'pilot_business_writes_disabled')
   if(url.search!==''||raw!==url.pathname)throw new HttpError(400,'invalid_original_home_path')
    const expectedEmployee=expectedOriginalUiEmployee(req)
   const input=await body(req)
   if(method==='POST'){
    exact(input,['name','spec','authoring'])
     reply(res,201,{item:await repository.create(identity,{name:input.name as string,spec:input.spec,authoring:input.authoring},expectedEmployee)});return true
   }
   exact(input,['name','spec','expected_revision'],['authoring'])
   if(!Number.isSafeInteger(input.expected_revision)||Number(input.expected_revision)<1||Number(input.expected_revision)>=Number.MAX_SAFE_INTEGER)throw new HttpError(400,'invalid_revision')
   const write:OriginalHomeAgentWrite={name:input.name as string,spec:input.spec,...(Object.hasOwn(input,'authoring')?{authoring:input.authoring}:{})}
    reply(res,200,{item:await repository.update(identity,id!.toLowerCase(),Number(input.expected_revision),write,expectedEmployee)});return true
  }catch(error){
   if(error instanceof HttpError&&Number.isInteger(error.status)&&error.status>=400&&error.status<=599&&/^[a-z][a-z0-9_]{0,79}$/.test(error.code))reply(res,error.status,{error:error.code})
   else{
    // Native auth uses its own fixed status/message errors. Never reflect an
    // arbitrary error.message, raw SQL text, stack or credential material.
    const auth=error as {status?:unknown;message?:unknown}
    if(typeof auth?.status==='number'&&[401,403].includes(auth.status)&&typeof auth.message==='string'&&['session_required','native_cookie_only','origin_not_allowed','cross_site_request_denied','origin_or_csrf_header_required'].includes(auth.message))reply(res,auth.status,{error:auth.message})
    else if(['22021','22P05','23514'].includes(typeof (error as {code?:unknown})?.code==='string'?(error as {code:string}).code:''))reply(res,400,{error:'invalid_original_home_input'})
    else if((error as {code?:unknown})?.code==='23503')reply(res,409,{error:'original_home_resource_changed'})
    else reply(res,503,{error:'original_home_request_unavailable'})
   }
   return true
  }
 }
}
