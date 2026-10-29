import type {IncomingMessage,ServerResponse} from 'node:http'
import {HttpError,type Identity} from './contracts.ts'
import {nativeSessionToken,verifyNativeOrigin} from './native-auth-http.mjs'
import {localDeviceRoute as ownerRoute,localExecutorRoute as executorRoute,localObject,localId,localSha,parseLocalIntent,parseLocalCatalog,parseLocalResult,parseLocalTransportJson} from '../../../shared/native-local-device-contract.mjs'
import type {NativeLocalDeviceRepository,NativeLocalExecutorRepository} from './native-local-device-repository.ts'
type Dependencies={repository:NativeLocalDeviceRepository;executor:NativeLocalExecutorRepository;authenticateRequest:(req:IncomingMessage)=>Promise<Identity>;allowedOrigin:string;allowWrites:boolean}
function invalid():never{throw new HttpError(400,'invalid_native_local_device_value')}
function input<T>(read:()=>T){try{return read()}catch{return invalid()}}
function respond(res:ServerResponse,status:number,value:unknown){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',Pragma:'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY'});res.end(JSON.stringify(value))}
async function body(req:IncomingMessage,max=32768){
 if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(String(req.headers['content-type']??''))||req.headers['content-encoding']!==undefined)throw new HttpError(415,'json_content_type_required')
 const len=req.headers['content-length'],transfer=req.headers['transfer-encoding'];if(len!==undefined&&(typeof len!=='string'||!/^(0|[1-9][0-9]*)$/.test(len)||!Number.isSafeInteger(Number(len))))return invalid()
 if(len!==undefined&&Number(len)>max)throw new HttpError(413,'request_too_large');if(transfer!==undefined&&(transfer!=='chunked'||len!==undefined))return invalid()
 const timer=setTimeout(()=>req.destroy(Error('native_local_read_timeout')),5000)
 try{let n=0;const chunks:Buffer[]=[];for await(const piece of req){const b=Buffer.isBuffer(piece)?piece:Buffer.from(piece);n+=b.length;if(n>max)throw new HttpError(413,'request_too_large');chunks.push(b)}if(len!==undefined&&Number(len)!==n)return invalid();return input(()=>parseLocalTransportJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)),max))}finally{clearTimeout(timer)}
}
async function empty(req:IncomingMessage){if(req.headers['transfer-encoding']!==undefined||req.headers['content-length']!==undefined&&req.headers['content-length']!=='0')return invalid();for await(const v of req)if(Buffer.byteLength(v))return invalid()}
function secret(v:unknown,pattern:RegExp){if(typeof v!=='string'||!pattern.test(v))return invalid();return v}
export function createNativeLocalDeviceHttp(d:Dependencies){return async(req:IncomingMessage,res:ServerResponse):Promise<boolean>=>{
 const raw=req.url??'';let u:URL|undefined,decoded='';try{u=new URL(raw,'https://internal.invalid');decoded=decodeURIComponent(u.pathname)}catch{}
 const matches=(p:string)=>[ownerRoute,executorRoute].some(r=>p===r||p.startsWith(r+'/'))
 if(![raw.split(/[?#]/,1)[0]??'',u?.pathname??'',decoded].some(matches))return false
 try{
  if(!u||raw!==u.pathname||u.search||raw.includes('#')||u.pathname.includes('%'))return invalid()
  if(['x-rh-user-id','x_rh_user_id','x-rh-user_id'].some(k=>req.headers[k]!==undefined))throw new HttpError(403,'native_employee_identity_required')
  if(u.pathname.startsWith(executorRoute+'/')){
   if(req.method!=='POST')throw new HttpError(405,'method_not_allowed')
   // This dedicated CLI protocol has no browser or employee identity input.
   if(req.headers.cookie!==undefined||req.headers.authorization!==undefined||req.headers.origin!==undefined||req.headers['sec-fetch-site']!==undefined||req.headers['sec-fetch-mode']!==undefined)throw new HttpError(403,'native_local_executor_only')
   const op=u.pathname.slice(executorRoute.length+1);if(!['pair','pair-confirm','poll','check','complete','confirm'].includes(op))return invalid()
   if(!d.allowWrites&&op!=='check'&&op!=='confirm'&&op!=='pair-confirm')throw new HttpError(403,'native_local_writes_disabled')
   const value=await body(req,op==='complete'||op==='confirm'?1450000:70000);let token:string|null=null,parsed:unknown
   if(op==='pair'||op==='pair-confirm'){if(req.headers['x-studio-device-token']!==undefined)return invalid();const v=input(()=>localObject(value,['request_id','pairing_code','device_token']));parsed={request_id:input(()=>localId(v.request_id)),pairing_code:secret(v.pairing_code,/^[a-f0-9]{48}$/),device_token:secret(v.device_token,/^[a-f0-9]{64}$/)}}
   else{
    token=secret(req.headers['x-studio-device-token'],/^[a-f0-9]{64}$/)
    if(op==='poll'){const v=input(()=>localObject(value,['catalog','claim']));parsed={catalog:input(()=>parseLocalCatalog(v.catalog)),claim:input(()=>localSha(v.claim))}}
    else if(op==='check'){const v=input(()=>localObject(value,['id','claim']));parsed={id:input(()=>localId(v.id)),claim:input(()=>localSha(v.claim))}}
    else{const v=input(()=>localObject(value,['request_id','id','claim','ok','result']));if(typeof v.ok!=='boolean')return invalid();parsed={request_id:input(()=>localId(v.request_id)),id:input(()=>localId(v.id)),claim:input(()=>localSha(v.claim)),ok:v.ok,result:input(()=>parseLocalResult(v.result))}}
   }
   const result=await d.executor.call(op as 'pair'|'pair-confirm'|'poll'|'check'|'complete'|'confirm',token,parsed);if(Buffer.byteLength(JSON.stringify(result))>1450000)throw Error('native_local_invalid_projection');respond(res,200,result);return true
  }
  try{verifyNativeOrigin(req,d.allowedOrigin,req.method!=='GET')}catch{throw new HttpError(403,'native_request_origin_denied')}
  if(req.headers.authorization!==undefined||req.headers['x-studio-device-token']!==undefined||!nativeSessionToken(req))throw new HttpError(401,'session_required')
  const identity=await d.authenticateRequest(req);if(identity.issuer!=='urn:agentstudio:local:v1')throw new HttpError(403,'native_employee_identity_required')
  const route=u.pathname.slice(ownerRoute.length);let result:unknown
  if(req.method==='GET'&&route===''){await empty(req);result=await d.repository.list(identity)}
  else if(req.method==='GET'&&/^\/jobs\/[a-f0-9-]{36}$/.test(route)){await empty(req);result=await d.repository.get(identity,input(()=>localId(route.slice(6))))}
  else if(req.method==='POST'&&(route===''||route==='/confirm')){const rawBody=await body(req),intent=input(()=>parseLocalIntent(rawBody));result=route==='/confirm'?await d.repository.confirm(identity,intent):await d.repository.record(identity,intent)}
  else throw new HttpError(405,'method_not_allowed')
  const after=await d.authenticateRequest(req);if(after.issuer!==identity.issuer||after.subject!==identity.subject)throw new HttpError(401,'session_required');respond(res,200,result)
 }catch(e){const x=e as {status?:number;code?:string};const known=e instanceof HttpError&&/^(?:native_local_[a-z_]+|invalid_native_local_device_value|native_employee_identity_required|native_request_origin_denied|session_required|employee_not_provisioned|method_not_allowed|json_content_type_required|request_too_large)$/.test(x.code??'');respond(res,known?x.status!:503,{error:known?x.code:'native_local_unavailable',...(e instanceof HttpError&&'request_id' in e?{request_id:e.request_id}:{})})}
 return true
}}
