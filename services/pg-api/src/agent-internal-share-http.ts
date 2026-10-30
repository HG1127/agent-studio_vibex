import {observeInternalShareBoundary as observe} from './agent-internal-share-observation.mjs'
import type {IncomingMessage,ServerResponse} from 'node:http'
import {HttpError,type Identity} from './contracts.ts'
import {nativeSessionToken,verifyNativeOrigin} from './native-auth-http.mjs'
import {parseAgentDesignTransportJson} from './agent-design-value-contract.ts'
import {agentTemplateMarketObject as O} from './agent-template-market-contract.ts'
import {requireInternalShareNative} from './agent-internal-share-runtime-policy.ts'
import type {AgentInternalShareRepository} from './agent-internal-share-repository.ts'
import {internalShareRoute,internalShareId,parseInternalShareIntent,parseInternalShareList,parseInternalSharePreview,parseInternalShareReply,matchInternalShareReceipt} from '../../../shared/agent-internal-share-contract.ts'

type Dependencies={repository:Pick<AgentInternalShareRepository,'list'|'preview'|'record'|'confirm'>;authenticateRequest:(req:IncomingMessage)=>Promise<Identity>;allowedOrigin:string}
const invalid=():never=>{throw new HttpError(400,'invalid_internal_share_request')}
function expectedEmployee(req:IncomingMessage):string|undefined{
 const value=req.headers['x-agentstudio-expected-employee']
 if(value===undefined)return undefined
 if(typeof value!=='string'||(req.rawHeaders??[]).filter((_,i)=>i%2===0&&req.rawHeaders[i]!.toLowerCase()==='x-agentstudio-expected-employee').length!==1)return invalid()
 return input(()=>internalShareId(value))
}
function input<T>(body:()=>T):T{try{return body()}catch{return invalid()}}
function respond(res:ServerResponse,status:number,value:unknown,allow?:string){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',Pragma:'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY',...(allow?{Allow:allow}:{})});res.end(JSON.stringify(value))}
async function read(req:IncomingMessage){
 if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(String(req.headers['content-type']??''))||req.headers['content-encoding']!==undefined)throw new HttpError(415,'json_content_type_required')
 const length=req.headers['content-length'],transfer=req.headers['transfer-encoding'],max=32768
 if(length!==undefined&&(typeof length!=='string'||!/^(0|[1-9][0-9]*)$/.test(length)))return invalid()
 if(length!==undefined&&(!Number.isSafeInteger(Number(length))||Number(length)>max))throw new HttpError(413,'request_too_large')
 if(transfer!==undefined&&(transfer!=='chunked'||length!==undefined))return invalid()
 observe('post_body','begin')
 const timer=setTimeout(()=>{observe('post_body','timeout');req.destroy(Error('internal_share_read_timeout'))},5000)
 try{const chunks:Buffer[]=[];let used=0;for await(const piece of req){const bytes=Buffer.isBuffer(piece)?piece:Buffer.from(piece);used+=bytes.length;if(used>max)throw new HttpError(413,'request_too_large');chunks.push(bytes)}if(length!==undefined&&Number(length)!==used)return invalid();const body=input(()=>parseAgentDesignTransportJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))));observe('post_body','end');return body}catch(error){observe('post_body','failure',error);throw error}finally{clearTimeout(timer)}
}
async function empty(req:IncomingMessage){if(req.headers['transfer-encoding']!==undefined||req.headers['content-length']!==undefined&&req.headers['content-length']!=='0')return invalid();for await(const value of req)if(Buffer.byteLength(value)>0)return invalid()}
export function createAgentInternalShareHttp({repository:r,authenticateRequest,allowedOrigin}:Dependencies){
 async function authenticate(req:IncomingMessage){const identity=await authenticateRequest(req);try{requireInternalShareNative(identity)}catch{throw new HttpError(403,'native_employee_identity_required')}return identity}
 return async(req:IncomingMessage,res:ServerResponse):Promise<boolean>=>{
  const raw=req.url??'';let url:URL|undefined,decoded='';try{url=new URL(raw,'https://internal.invalid');decoded=decodeURIComponent(url.pathname)}catch{}
  const prefix=(p:string)=>p===internalShareRoute||p.startsWith(internalShareRoute+'/')
  if(![raw.split(/[?#]/,1)[0]??'',url?.pathname??'',decoded].some(prefix))return false
  observe('native_handler','begin')
  let allow:string|undefined
  try{
   observe('origin','begin')
   try{verifyNativeOrigin(req,allowedOrigin,req.method!=='GET')}catch{throw new HttpError(403,'native_request_origin_denied')}
   if(req.headers.authorization!==undefined||!nativeSessionToken(req))throw new HttpError(401,'session_required')
   if(['x-rh-user-id','x_rh_user_id','x-rh-user_id'].some(key=>req.headers[key]!==undefined))throw new HttpError(403,'native_employee_identity_required')
   if(!url||raw!==url.pathname||url.search||raw.includes('#')||url.pathname.includes('%'))return invalid()
   const path=url.pathname.slice(internalShareRoute.length);if(!['','/confirm'].includes(path))return invalid()
   allow=path===''?'GET, POST':'POST';if(path===''?req.method!=='GET'&&req.method!=='POST':req.method!=='POST')throw new HttpError(405,'method_not_allowed')
   observe('origin','end');observe('identity_before','begin')
   const verified=await authenticate(req),identity:Identity={issuer:verified.issuer,subject:verified.subject},expected=expectedEmployee(req);let output:unknown
   observe('identity_before','end')
   if(req.method==='GET'&&expected!==undefined)return invalid()
   if(req.method==='GET'){await empty(req);observe('list','begin');output=parseInternalShareList(await r.list(identity));observe('list','end')}
   else{
    const rawBody=await read(req)
    if(path==='/confirm'){const body=input(()=>O(rawBody,['intent'])),intent=input(()=>parseInternalShareIntent(body.intent)),reply=(observe('confirm','begin'),parseInternalShareReply(await r.confirm(identity,intent,expected)));observe('confirm','end');await matchInternalShareReceipt(reply.receipt,intent);if(!reply.replayed||reply.share_code!==null)throw Error('invalid_internal_share_projection');output=reply}
    else{
     const action=input(()=>O(rawBody,['action'],['id','request_id','source','preview_hash','confirm_safe','acknowledgement','share_code','confirm'])).action
     if(action==='preview'){if(expected!==undefined)return invalid();const body=input(()=>O(rawBody,['action','id'])),id=input(()=>internalShareId(body.id)),preview=(observe('preview','begin'),await parseInternalSharePreview(await r.preview(identity,id)));observe('preview','end');if(preview.source.spec_id!==id)throw Error('invalid_internal_share_projection');output=preview}
     else{const intent=input(()=>parseInternalShareIntent(rawBody)),reply=(observe('record','begin'),parseInternalShareReply(await r.record(identity,intent,expected)));observe('record','end');await matchInternalShareReceipt(reply.receipt,intent);output=reply}
    }
   }
   observe('projection','begin')
   if(Buffer.byteLength(JSON.stringify(output))>1048576)throw Error('invalid_internal_share_projection')
   observe('projection','end');observe('identity_after','begin')
   const after=await authenticate(req);if(after.issuer!==identity.issuer||after.subject!==identity.subject)throw new HttpError(401,'session_required')
   observe('identity_after','end');observe('response','begin')
   respond(res,200,output);observe('response','end');observe('native_handler','end')
  }catch(error){observe('native_handler','failure',error);const known=error instanceof HttpError&&/^(?:agent_internal_share_[a-z_]+|invalid_internal_share_request|invalid_internal_share_value|native_employee_identity_required|native_request_origin_denied|employee_not_provisioned|session_required|method_not_allowed|request_too_large|json_content_type_required)$/.test(error.code);respond(res,known?error.status:503,{error:known?error.code:'agent_internal_share_unavailable'},allow)}
  return true
 }
}
