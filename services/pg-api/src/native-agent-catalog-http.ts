import type {IncomingMessage,ServerResponse} from 'node:http'
import {HttpError,isUuid,type Identity} from './contracts.ts'
import {verifyNativeOrigin} from './native-auth-http.mjs'
import {parseOriginalAgentCatalogQuery} from '../../../shared/original-agent-catalog.ts'
import type {NativeAgentCatalogRepository} from './native-agent-catalog-repository.ts'
export const originalAgentCatalogPrefix='/api/v2/original-ui/agent-catalog'
type Dependencies={repository:Pick<NativeAgentCatalogRepository,'list'|'favorite'>;authenticateRequest:(req:IncomingMessage)=>Promise<Identity>;allowedOrigin:string;allowWrites:boolean}
function reply(res:ServerResponse,status:number,value:unknown){const bytes=JSON.stringify(value);if(Buffer.byteLength(bytes,'utf8')>1048576)throw new HttpError(503,'original_agent_catalog_response_too_large');res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin'});res.end(bytes)}
async function empty(req:IncomingMessage){for await(const chunk of req)if(Buffer.byteLength(chunk)>0)throw new HttpError(400,'invalid_original_agent_catalog_query')}
async function body(req:IncomingMessage):Promise<Record<string,unknown>>{
 if(typeof req.headers['content-type']!=='string'||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type']))throw new HttpError(415,'json_content_type_required')
 const length=req.headers['content-length'];if(length!==undefined&&(typeof length!=='string'||!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>1024))throw new HttpError(413,'request_too_large')
 const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>1024)throw new HttpError(413,'request_too_large');chunks.push(Buffer.from(chunk))}if(length!==undefined&&Number(length)!==size)throw new HttpError(400,'invalid_json')
 let value:unknown;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))}catch{throw new HttpError(400,'invalid_json')}
 if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'invalid_json');return value as Record<string,unknown>
}
export function createNativeAgentCatalogHttp({repository,authenticateRequest,allowedOrigin,allowWrites}:Dependencies){
 if(!repository||typeof repository.list!=='function'||typeof repository.favorite!=='function'||typeof authenticateRequest!=='function'||typeof allowWrites!=='boolean')throw Error('invalid_original_agent_catalog_http_dependencies')
 return async(req:IncomingMessage,res:ServerResponse):Promise<boolean>=>{
  const raw=req.url??'';if(raw!==originalAgentCatalogPrefix&&!raw.startsWith(originalAgentCatalogPrefix+'?')&&!raw.startsWith(originalAgentCatalogPrefix+'/'))return false
  try{
   const method=req.method??'';verifyNativeOrigin(req,allowedOrigin,method!=='GET');const identity=await authenticateRequest(req)
   if(identity?.issuer!=='urn:agentstudio:local:v1'||typeof identity.subject!=='string'||!identity.subject)throw new HttpError(403,'native_employee_identity_required')
   const url=new URL(raw,'http://127.0.0.1');if(raw.length>4096||raw!==url.pathname+url.search)throw new HttpError(400,'invalid_original_agent_catalog_path')
   if(method==='GET'&&url.pathname===originalAgentCatalogPrefix){
    await empty(req);const keys=[...url.searchParams.keys()];if(new Set(keys).size!==keys.length)throw new HttpError(400,'invalid_original_agent_catalog_query')
    let selected;try{selected=parseOriginalAgentCatalogQuery(Object.fromEntries(url.searchParams))}catch{throw new HttpError(400,'invalid_original_agent_catalog_query')}
    reply(res,200,await repository.list(identity,selected));return true
   }
   const suffix=url.pathname.slice(originalAgentCatalogPrefix.length),match=/^\/([0-9a-fA-F-]{36})\/favorite$/.exec(suffix),id=match?.[1]
   if(method!=='POST'||!id||!isUuid(id))throw new HttpError(405,'method_not_allowed')
   if(!allowWrites)throw new HttpError(405,'pilot_business_writes_disabled')
   if(url.search!==''||raw!==url.pathname)throw new HttpError(400,'invalid_original_agent_catalog_path')
   const expectedEmployee=req.headers['x-agentstudio-expected-employee']
   if(typeof expectedEmployee!=='string'||!isUuid(expectedEmployee))throw new HttpError(400,'expected_employee_required')
   const value=await body(req);if(Object.keys(value).sort().join(',')!=='expected_revision,favorite'||typeof value.favorite!=='boolean'||!Number.isSafeInteger(value.expected_revision)||Number(value.expected_revision)<1)throw new HttpError(400,'invalid_original_agent_catalog_favorite')
   reply(res,200,await repository.favorite(identity,id.toLowerCase(),value.favorite,Number(value.expected_revision),expectedEmployee.toLowerCase()));return true
  }catch(error){
   if(error instanceof HttpError&&Number.isInteger(error.status)&&error.status>=400&&error.status<=599&&/^[a-z][a-z0-9_]{0,79}$/.test(error.code))reply(res,error.status,{error:error.code})
   else{const failure=error as {status?:unknown;message?:unknown;code?:unknown};if(typeof failure?.status==='number'&&[401,403].includes(failure.status)&&typeof failure.message==='string'&&['session_required','native_cookie_only','origin_not_allowed','cross_site_request_denied','origin_or_csrf_header_required'].includes(failure.message))reply(res,failure.status,{error:failure.message});else if(failure?.code==='23503')reply(res,409,{error:'original_agent_catalog_resource_changed'});else if(failure?.code==='40001')reply(res,409,{error:'original_agent_catalog_snapshot_changed'});else reply(res,503,{error:'original_agent_catalog_request_unavailable'})}return true
  }
 }
}
