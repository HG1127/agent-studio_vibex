import type {IncomingMessage,ServerResponse} from 'node:http'
import {HttpError,type Identity} from './contracts.ts'
import type {AgentReleaseRepository} from './agent-release-repository.ts'
import {verifyNativeOrigin} from './native-auth-http.mjs'
import {optionalExpectedOriginalUiEmployee} from './native-original-ui-preconditions.ts'
import {parseAgentDesignTransportJson} from './agent-design-value-contract.ts'
import {parseAgentReleaseChoice} from './agent-release-contract.ts'
import {originalVersionReleaseProtocol,originalVersionReleaseBase,parseOriginalReleaseRoute,OriginalVersionReleaseError} from '../../../shared/original-version-release-contract.ts'
function reply(res:ServerResponse,status:number,value:unknown){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(JSON.stringify(value))}
async function read(req:IncomingMessage,write:boolean){
 const length=req.headers['content-length'],transfer=req.headers['transfer-encoding'];if(req.headers['content-encoding']!==undefined||transfer!==undefined&&(transfer!=='chunked'||length!==undefined)||length!==undefined&&(typeof length!=='string'||!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>(write?16384:0)))throw new HttpError(400,'invalid_original_release_body')
 if(!write&&transfer!==undefined)throw new HttpError(400,'invalid_original_release_body');if(write&&(typeof req.headers['content-type']!=='string'||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type'])))throw new HttpError(415,'json_content_type_required')
 const chunks:Buffer[]=[];let size=0,timer:ReturnType<typeof setTimeout>|undefined
 const run=async()=>{for await(const b of req){const bytes=Buffer.isBuffer(b)?b:Buffer.from(b);size+=bytes.length;if(size>(write?16384:0))throw new HttpError(413,'original_release_request_too_large');chunks.push(bytes)}if(length!==undefined&&Number(length)!==size)throw new HttpError(400,'invalid_original_release_body');if(!write)return undefined;try{return parseAgentDesignTransportJson(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(Buffer.concat(chunks)))}catch{throw new HttpError(400,'invalid_original_release_body')}}
 try{return await Promise.race([run(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(new HttpError(408,'original_release_body_timeout'));req.destroy()},8000)})])}finally{clearTimeout(timer);for(const c of chunks)c.fill(0)}
}
/** This facade reuses046 release transactions and the existing runtime flags.
 * It grants no execution or configuration authority of its own. */
export function createOriginalVersionReleaseHttp(options:{repo:AgentReleaseRepository;allowedOrigin:string;authenticateRequest:(req:IncomingMessage)=>Promise<Identity>}){
 return async(req:IncomingMessage,res:ServerResponse):Promise<boolean>=>{
  const raw=req.url??'',rawPath=raw.split(/[?#]/,1)[0]??'';let decoded=rawPath;try{decoded=decodeURIComponent(rawPath)}catch{}
  const scoped=(s:string)=>s===originalVersionReleaseBase||s.startsWith(originalVersionReleaseBase+'/');if(![rawPath,decoded,decoded.replace(/\/+/g,'/')].some(scoped))return false
  try{
   const method=req.method??'',route=parseOriginalReleaseRoute(raw,method),headers=req.rawHeaders??[]
   if(req.headers['x-agentstudio-original-release']!=='1'||headers.filter((_,i)=>i%2===0&&headers[i]?.toLowerCase()==='x-agentstudio-original-release').length!==1)throw new HttpError(400,'original_release_protocol_header_refused')
   if(['authorization','x-rh-user-id','x-forwarded-user','x-agentstudio-identity'].some(k=>req.headers[k]!==undefined))throw new HttpError(400,'original_release_identity_header_refused')
   if(Object.getOwnPropertyDescriptor(options.repo,'originalUiProtocol')?.value!==originalVersionReleaseProtocol)throw new HttpError(503,'original_release_contract_unavailable')
   let identity:Identity;try{verifyNativeOrigin(req,options.allowedOrigin,method!=='GET');identity=await options.authenticateRequest(req)}catch(error){const status=(error as {status?:unknown})?.status;if(status===401||status===403)throw new HttpError(status,status===401?'session_required':'native_request_origin_denied');throw error}
   if(identity.issuer!=='urn:agentstudio:local:v1')throw new HttpError(403,'native_employee_identity_required');const employee=optionalExpectedOriginalUiEmployee(req);if(employee===undefined)throw new HttpError(400,'invalid_original_ui_employee_precondition')
   const envelope=(item:unknown)=>({protocol:originalVersionReleaseProtocol,owner_user_id:employee,item}),repo=options.repo
   if(method==='GET'){
    await read(req,false)
    if(route.action==='workspace')reply(res,200,envelope({workspace:await repo.workspace(identity,route.spec,employee),history_complete:false,history_limit:100,acceptance_limit:10}))
    else if(route.action==='version')reply(res,200,envelope(await repo.detail(identity,route.spec,route.selected!,employee)))
    else if(route.action==='acceptance_status'){const {execution:_,...status}=await repo.acceptanceStatus(identity,route.spec,route.selected!,employee);reply(res,200,envelope(status))}
    else{const result=await repo.queryReceipt(identity,route.spec,route.selected!,employee);reply(res,200,envelope({mode:'read_only_exact_agent_release_receipt',...result}))}
    return true
   }
   const choice=parseAgentReleaseChoice(await read(req,true));if((choice.action==='acceptance')!==(route.action==='acceptance'))throw new HttpError(400,'invalid_agent_release_action')
   reply(res,200,envelope(await repo.change(identity,route.spec,choice,employee)))
  }catch(error){const safe=error instanceof HttpError||error instanceof OriginalVersionReleaseError;reply(res,safe?error.status:503,{error:safe?error.code:'original_release_unavailable'})}
  return true
 }
}
