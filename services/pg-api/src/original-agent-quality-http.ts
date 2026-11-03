import type {IncomingMessage,ServerResponse} from 'node:http'
import {createHash} from 'node:crypto'
import {HttpError,type Identity} from './contracts.ts'
import {verifyNativeOrigin} from './native-auth-http.mjs'
import {optionalExpectedOriginalUiEmployee} from './native-original-ui-preconditions.ts'
import {parseAgentDesignTransportJson} from './agent-design-value-contract.ts'
import {originalAgentQualityProtocol,OriginalAgentQualityError,qualityId,parseOriginalQualityWrite,parseOriginalQualityPending,qualityWriteCanonical} from '../../../shared/original-agent-quality-contract.ts'
import type {OriginalAgentQualityRepository} from './original-agent-quality-repository.ts'
export const originalAgentQualityBase='/api/v2/original-ui/agent-quality'
const reply=(res:ServerResponse,status:number,value:unknown)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(JSON.stringify(value))}
async function read(req:IncomingMessage,write:boolean){
 const length=req.headers['content-length'],transfer=req.headers['transfer-encoding'];if(req.headers['content-encoding']!==undefined||transfer!==undefined&&(transfer!=='chunked'||length!==undefined)||length!==undefined&&(typeof length!=='string'||!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>(write?32768:0)))throw new HttpError(400,'invalid_original_quality_body')
 if(!write&&transfer!==undefined)throw new HttpError(400,'invalid_original_quality_body');if(write&&(typeof req.headers['content-type']!=='string'||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type'])))throw new HttpError(415,'json_content_type_required')
 const chunks:Buffer[]=[];let size=0,timer:ReturnType<typeof setTimeout>|undefined
 const run=async()=>{for await(const b of req){const bytes=Buffer.isBuffer(b)?b:Buffer.from(b);size+=bytes.length;if(size>(write?32768:0))throw new HttpError(413,'original_quality_request_too_large');chunks.push(bytes)}if(length!==undefined&&Number(length)!==size)throw new HttpError(400,'invalid_original_quality_body');if(!write)return undefined;try{return parseAgentDesignTransportJson(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(Buffer.concat(chunks)))}catch{throw new HttpError(400,'invalid_original_quality_body')}}
 try{return await Promise.race([run(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(new HttpError(408,'original_quality_body_timeout'));req.destroy()},8000)})])}finally{clearTimeout(timer);for(const c of chunks)c.fill(0)}
}
export function createOriginalAgentQualityHttp(options:{repo:Pick<OriginalAgentQualityRepository,'read'|'save'|'receipt'>;allowedOrigin:string;authenticateRequest:(req:IncomingMessage)=>Promise<Identity>}){
 return async(req:IncomingMessage,res:ServerResponse):Promise<boolean>=>{
  const raw=req.url??'',rawPath=raw.split(/[?#]/,1)[0]??'';let decoded=rawPath;try{decoded=decodeURIComponent(rawPath)}catch{}
  const scoped=(s:string)=>s===originalAgentQualityBase||s.startsWith(originalAgentQualityBase+'/');if(![rawPath,decoded,decoded.replace(/\/+/g,'/')].some(scoped))return false
  let attempt:{request_id:string;request_sha256:string}|null=null
  try{
   const method=req.method??'',url=new URL(raw,'https://original-quality.invalid'),headers=req.rawHeaders??[]
   if(raw!==url.pathname+url.search||/[#\\\u0000-\u0020]/u.test(raw)||/%(?:2f|5c|2e|00)/i.test(raw))throw new HttpError(400,'invalid_original_quality_path')
   if(req.headers['x-agentstudio-original-quality']!==originalAgentQualityProtocol||headers.filter((_,i)=>i%2===0&&headers[i]?.toLowerCase()==='x-agentstudio-original-quality').length!==1)throw new HttpError(400,'original_quality_protocol_header_refused')
   if(['authorization','x-rh-user-id','x-forwarded-user','x-agentstudio-actor'].some(k=>req.headers[k]!==undefined))throw new HttpError(400,'original_quality_identity_header_refused')
   try{verifyNativeOrigin(req,options.allowedOrigin,method!=='GET')}catch(cause){const e=cause as {status?:number;message?:string};throw new HttpError(e.status===403?403:503,['native_origin_unavailable','origin_not_allowed','cross_site_request_denied','origin_or_csrf_header_required'].includes(e.message??'')?e.message!:'original_quality_origin_unavailable')}
   let identity:Identity;try{identity=await options.authenticateRequest(req)}catch(cause){const status=(cause as {status?:number})?.status;throw new HttpError(status===401?401:status===403?403:503,status===401?'session_required':status===403?'native_employee_identity_required':'original_quality_identity_unavailable')};if(identity?.issuer!=='urn:agentstudio:local:v1'||typeof identity.subject!=='string'||!identity.subject)throw new HttpError(403,'native_employee_identity_required')
   const employee=optionalExpectedOriginalUiEmployee(req);if(!employee)throw new HttpError(400,'invalid_original_ui_employee_precondition')
   const match=new RegExp('^'+originalAgentQualityBase+'/([a-f0-9-]{36})(?:/receipts/([a-f0-9-]{36}))?$').exec(url.pathname);if(!match)throw new HttpError(400,'invalid_original_quality_path')
   const spec=qualityId(match[1]),request=match[2]?qualityId(match[2]):null
   if(method==='GET'){
    await read(req,false)
    if(!request){if(url.search)throw new HttpError(400,'invalid_original_quality_query');reply(res,200,{protocol:originalAgentQualityProtocol,item:await options.repo.read(identity,employee,spec)});return true}
    const q=url.searchParams,keys=['request_sha256','expected_spec_revision','expected_source_sha256','expected_checks_sha256'];if(url.search!=='?'+q.toString()||[...q.keys()].join(',')!==keys.join(',')||keys.some(k=>q.getAll(k).length!==1)||! /^[1-9][0-9]{0,15}$/.test(q.get('expected_spec_revision')??''))throw new HttpError(400,'invalid_original_quality_query')
    let pending:ReturnType<typeof parseOriginalQualityPending>;try{pending=parseOriginalQualityPending({protocol:originalAgentQualityProtocol,employee_id:employee,spec_id:spec,request_id:request,request_sha256:q.get('request_sha256'),expected_spec_revision:Number(q.get('expected_spec_revision')),expected_source_sha256:q.get('expected_source_sha256'),expected_checks_sha256:q.get('expected_checks_sha256')==='null'?null:q.get('expected_checks_sha256')},employee,spec)}catch{throw new HttpError(400,'invalid_original_quality_query')}
    reply(res,200,{protocol:originalAgentQualityProtocol,item:await options.repo.receipt(identity,employee,spec,pending)});return true
   }
   if(method!=='POST'||request||url.search)throw new HttpError(405,'original_quality_method_refused')
   let write;try{write=parseOriginalQualityWrite(await read(req,true))}catch(cause){if(cause instanceof HttpError)throw cause;throw new HttpError(400,'invalid_original_quality_write')}
   attempt={request_id:write.request_id,request_sha256:createHash('sha256').update(qualityWriteCanonical(employee,spec,write)).digest('hex')}
   reply(res,200,{protocol:originalAgentQualityProtocol,item:await options.repo.save(identity,employee,spec,write)});return true
  }catch(cause){const known=cause instanceof HttpError||cause instanceof OriginalAgentQualityError,status=known?cause.status:503,code=known?cause.code:'original_quality_unavailable';const refused=known&&[400,403,404,409,405,413,415].includes(status)&&!(cause instanceof OriginalAgentQualityError&&cause.outcomeUnknown);reply(res,status,{protocol:originalAgentQualityProtocol,error:code,outcome:refused?'refused':'unknown',...(attempt??{})});return true}
 }
}
