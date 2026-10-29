import type {IncomingMessage,ServerResponse} from 'node:http'
import {HttpError,type Identity} from './contracts.ts'
import {nativeSessionToken,verifyNativeOrigin} from './native-auth-http.mjs'
import {parseAgentDesignTransportJson} from './agent-design-value-contract.ts'
import {agentTemplateMarketObject as O} from './agent-template-market-contract.ts'
import type {ApprovalDelegationRepository} from './approval-delegation-repository.ts'
import {parseApprovalDelegationChoice,parseApprovalDelegationOwnerList,parseApprovalDelegationManagerList,parseApprovalDelegationReply,matchApprovalDelegationReceipt} from '../../../shared/approval-delegation-contract.ts'
type Dependencies={repository:Pick<ApprovalDelegationRepository,'owner'|'assigned'|'record'|'confirm'>;authenticateRequest:(req:IncomingMessage)=>Promise<Identity>;allowedOrigin:string}
const invalid=():never=>{throw new HttpError(400,'invalid_approval_delegation_request')}
function input<T>(fn:()=>T):T{try{return fn()}catch{return invalid()}}
function send(res:ServerResponse,status:number,value:unknown,allow?:string){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',Pragma:'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY',...(allow?{Allow:allow}:{})});res.end(JSON.stringify(value))}
async function read(req:IncomingMessage){
 if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(String(req.headers['content-type']??''))||req.headers['content-encoding']!==undefined)throw new HttpError(415,'json_content_type_required')
 const length=req.headers['content-length'],transfer=req.headers['transfer-encoding'];if(length!==undefined&&(typeof length!=='string'||!/^(0|[1-9][0-9]*)$/.test(length)))return invalid();if(length!==undefined&&(!Number.isSafeInteger(Number(length))||Number(length)>32768))throw new HttpError(413,'request_too_large');if(transfer!==undefined&&(transfer!=='chunked'||length!==undefined))return invalid()
 const timer=setTimeout(()=>req.destroy(Error('approval_delegation_read_timeout')),5000);try{const chunks:Buffer[]=[];let size=0;for await(const p of req){const bytes=Buffer.isBuffer(p)?p:Buffer.from(p);size+=bytes.length;if(size>32768)throw new HttpError(413,'request_too_large');chunks.push(bytes)}if(length!==undefined&&Number(length)!==size)return invalid();return input(()=>parseAgentDesignTransportJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))))}finally{clearTimeout(timer)}
}
export function createApprovalDelegationHttp({repository:r,authenticateRequest,allowedOrigin}:Dependencies){
 const paths=['/api/v2/approval-delegations','/api/v2/approval-delegations/confirm','/api/v2/manager/approvals','/api/v2/manager/decision']
 const related=(s:string)=>s==='/api/v2/approval-delegations'||s.startsWith('/api/v2/approval-delegations/')||s==='/api/v2/manager'||s.startsWith('/api/v2/manager/')
 async function identity(req:IncomingMessage){const i=await authenticateRequest(req);if(i?.issuer!=='urn:agentstudio:local:v1'||typeof i.subject!=='string'||!i.subject||i.subject.length>255)throw new HttpError(403,'native_employee_identity_required');return{issuer:i.issuer,subject:i.subject}}
 return async(req:IncomingMessage,res:ServerResponse):Promise<boolean>=>{
  const raw=req.url??'';let url:URL|undefined,decoded='';try{url=new URL(raw,'https://internal.invalid');decoded=decodeURIComponent(url.pathname)}catch{}
  if(![raw.split(/[?#]/,1)[0]??'',url?.pathname??'',decoded].some(related))return false
  let allow:string|undefined
  try{
   try{verifyNativeOrigin(req,allowedOrigin,req.method!=='GET')}catch{throw new HttpError(403,'native_request_origin_denied')}
   if(req.headers.authorization!==undefined||!nativeSessionToken(req))throw new HttpError(401,'session_required')
   if(['x-rh-user-id','x_rh_user_id','x-rh-user_id'].some(k=>req.headers[k]!==undefined))throw new HttpError(403,'native_employee_identity_required')
   if(!url||raw!==url.pathname||url.search||raw.includes('#')||url.pathname.includes('%')||!paths.includes(raw))return invalid()
   const owner=raw===paths[0],assigned=raw===paths[2],confirm=raw===paths[1];allow=owner?'GET, POST':assigned?'GET':'POST';if(owner?req.method!=='GET'&&req.method!=='POST':req.method!==(assigned?'GET':'POST'))throw new HttpError(405,'method_not_allowed')
   const actor=await identity(req);let value:unknown
   if(req.method==='GET'){if(req.headers['transfer-encoding']!==undefined||req.headers['content-length']!==undefined&&req.headers['content-length']!=='0')return invalid();for await(const piece of req)if(Buffer.byteLength(piece)>0)return invalid();value=assigned?parseApprovalDelegationManagerList(await r.assigned(actor)):parseApprovalDelegationOwnerList(await r.owner(actor))}
   else{const rawBody=await read(req),choice=input(()=>parseApprovalDelegationChoice(confirm?O(rawBody,['choice']).choice:rawBody));if(!confirm&&(owner?choice.action==='review':choice.action!=='review'))return invalid();const result=parseApprovalDelegationReply(await(confirm?r.confirm(actor,choice):r.record(actor,choice)));await matchApprovalDelegationReceipt(result.receipt,choice);if(confirm&&!result.replayed)throw Error('invalid_receipt');value=result}
   if(Buffer.byteLength(JSON.stringify(value))>1048576)throw Error('invalid_projection');const after=await identity(req);if(after.issuer!==actor.issuer||after.subject!==actor.subject)throw new HttpError(401,'session_required');send(res,200,value)
  }catch(e){const known=e instanceof HttpError&&/^(approval_delegation_[a-z_]+|invalid_approval_delegation_request|invalid_approval_delegation_choice|native_employee_identity_required|native_request_origin_denied|employee_not_provisioned|session_required|method_not_allowed|request_too_large|json_content_type_required)$/.test(e.code);send(res,known?e.status:503,{error:known?e.code:'approval_delegation_unavailable'},allow)}
  return true
 }
}
