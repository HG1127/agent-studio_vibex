import type {IncomingMessage,ServerResponse} from 'node:http'
import {HttpError,type Identity} from './contracts.ts'
import {optionalExpectedOriginalUiEmployee} from './native-original-ui-preconditions.ts'
import {verifyNativeOrigin} from './native-auth-http.mjs'
import {ModelDraftProbeError} from '../../../shared/model-draft-probe-contract.ts'
import {parseAgentDesignTransportJson} from './agent-design-value-contract.ts'
import type {ModelDraftProbeRepository} from './model-draft-probe-repository.ts'
const route='/api/v2/model-connections/draft-probe'
function reply(res:ServerResponse,status:number,body:unknown){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(JSON.stringify(body))}
async function readDraftBody(req:IncomingMessage):Promise<unknown>{
 const chunks:Buffer[]=[];let size=0,timer:ReturnType<typeof setTimeout>|undefined
  const read=async()=>{for await(const chunk of req){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;if(size>16384)throw new HttpError(413,'request_too_large');chunks.push(bytes)}const declared=req.headers['content-length'];if(declared!==undefined&&Number(declared)!==size)throw new HttpError(400,'invalid_model_draft_probe');try{return parseAgentDesignTransportJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))}catch{throw new HttpError(400,'invalid_model_draft_probe')}}
 try{return await Promise.race([read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(new HttpError(408,'model_draft_probe_body_timeout'));req.destroy()},8000)})])}finally{clearTimeout(timer);for(const chunk of chunks)chunk.fill(0);chunks.length=0}
}
export function createModelDraftProbeHttp(options:{repository:ModelDraftProbeRepository;allowedOrigin:string;authenticateRequest:(req:IncomingMessage)=>Promise<Identity>}){
 return async(req:IncomingMessage,res:ServerResponse):Promise<boolean>=>{
  let url:URL;try{url=new URL(req.url??'/', 'http://127.0.0.1')}catch{reply(res,400,{error:'invalid_path'});return true}if(url.pathname!==route)return false
  try{
   if(req.method!=='POST'||req.url!==route)throw new HttpError(405,'model_draft_probe_route_refused')
   if(['authorization','x-rh-user-id','x-forwarded-user','x-agentstudio-identity'].some(key=>req.headers[key]!==undefined))throw new HttpError(400,'model_draft_probe_identity_header_refused')
   verifyNativeOrigin(req,options.allowedOrigin,true)
   const identity=await options.authenticateRequest(req),expected=optionalExpectedOriginalUiEmployee(req);if(expected===undefined)throw new HttpError(400,'invalid_original_ui_employee_precondition')
   if(!options.repository.enabled)throw new HttpError(405,'model_draft_probe_disabled')
   const type=req.headers['content-type'],declared=req.headers['content-length'],transfer=req.headers['transfer-encoding'];if(typeof type!=='string'||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(type)||req.headers['content-encoding']!==undefined)throw new HttpError(415,'json_content_type_required');if(transfer!==undefined&&(transfer!=='chunked'||declared!==undefined))throw new HttpError(400,'invalid_model_draft_probe');if(declared!==undefined&&(typeof declared!=='string'||!/^(0|[1-9][0-9]*)$/.test(declared)||Number(declared)>16384))throw new HttpError(413,'request_too_large')
   const raw=await readDraftBody(req)
   try{reply(res,200,await options.repository.probe(identity,raw,expected))}finally{if(raw&&typeof raw==='object'){const c=(raw as {credential?:{api_key?:unknown}}).credential;if(c&&typeof c==='object'&&Object.hasOwn(c,'api_key'))c.api_key=''}}
  }catch(error){const safe=error instanceof HttpError||error instanceof ModelDraftProbeError;reply(res,safe?error.status:503,{error:safe?error.code:'model_draft_probe_unavailable'})}
  return true
 }
}
