import type {IncomingMessage,ServerResponse} from 'node:http'
import {HttpError,type Identity} from './contracts.ts'
import {nativeLocalAuthenticationError} from './native-local-device-auth-error.ts'
import {nativeSessionToken,verifyNativeOrigin} from './native-auth-http.mjs'
import {parseLocalTransportJson,localId} from '../../../shared/native-local-device-contract.mjs'
import {guidedOwnerRoute,guidedExecutorRoute,guidedIntent,guidedPair} from '../../../shared/native-guided-contract.mjs'
import type {NativeGuidedOwnerRepository,NativeGuidedExecutorRepository} from './native-guided-repository.ts'
type Dependencies={repository:NativeGuidedOwnerRepository;executor:NativeGuidedExecutorRepository;authenticateRequest:(req:IncomingMessage)=>Promise<Identity>;allowedOrigin:string;allowWrites:boolean}
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
export function createNativeGuidedHttp(d:Dependencies){return async(req:IncomingMessage,res:ServerResponse):Promise<boolean>=>{
 const raw=req.url??'';let u:URL|undefined,decoded='';try{u=new URL(raw,'https://internal.invalid');decoded=decodeURIComponent(u.pathname)}catch{}
 const matches=(p:string)=>[guidedOwnerRoute,guidedExecutorRoute].some(r=>p===r||p.startsWith(r+'/'))
 if(![raw.split(/[?#]/,1)[0]??'',u?.pathname??'',decoded].some(matches))return false
 try{
  if(!u||raw!==u.pathname||u.search||raw.includes('#')||u.pathname.includes('%'))return invalid()
  if(['x-rh-user-id','x_rh_user_id','x-rh-user_id'].some(k=>req.headers[k]!==undefined))throw new HttpError(403,'native_employee_identity_required')
  if(u.pathname.startsWith(guidedExecutorRoute+'/')){
   if(req.method!=='POST')throw new HttpError(405,'method_not_allowed')
   if(req.headers.cookie!==undefined||req.headers.authorization!==undefined||req.headers.origin!==undefined||req.headers['sec-fetch-site']!==undefined||req.headers['sec-fetch-mode']!==undefined||req.headers['x-studio-device-token']!==undefined)throw new HttpError(403,'native_local_executor_only')
   const op=u.pathname.slice(guidedExecutorRoute.length+1);if(!['pair','pair-confirm'].includes(op))return invalid()
   if(!d.allowWrites&&op!=='pair-confirm')throw new HttpError(403,'native_local_writes_disabled')
   const data=await body(req),value=input(()=>guidedPair(data));
   respond(res,200,await d.executor.pair(value,op==='pair-confirm'));return true
  }
  try{verifyNativeOrigin(req,d.allowedOrigin,req.method!=='GET')}catch{throw new HttpError(403,'native_request_origin_denied')}
  if(req.headers.authorization!==undefined||req.headers['x-studio-device-token']!==undefined||!nativeSessionToken(req))throw new HttpError(401,'session_required')
  let identity:Identity;try{identity=await d.authenticateRequest(req)}catch(error){throw nativeLocalAuthenticationError(error)}if(identity.issuer!=='urn:agentstudio:local:v1')throw new HttpError(403,'native_employee_identity_required')
  const expectedOwner=input(()=>localId(req.headers['x-agentstudio-expected-owner']));const route=u.pathname.slice(guidedOwnerRoute.length);let result:unknown
  if(req.method==='GET'&&route===''){await empty(req);result=await d.repository.status(identity,expectedOwner)}
  else if(req.method==='POST'&&(route===''||route==='/confirm')){const data=await body(req),intent=input(()=>guidedIntent(data));result=route==='/confirm'?await d.repository.confirm(identity,intent,expectedOwner):await d.repository.record(identity,intent,expectedOwner)}
  else throw new HttpError(405,'method_not_allowed')
  let after:Identity;try{after=await d.authenticateRequest(req)}catch(error){throw nativeLocalAuthenticationError(error)}if(after.issuer!==identity.issuer||after.subject!==identity.subject)throw new HttpError(401,'session_required');respond(res,200,result)
 }catch(e){const x=e as {status?:number;code?:string};const known=e instanceof HttpError&&/^(?:native_local_[a-z_]+|invalid_native_local_device_value|native_employee_identity_required|native_request_origin_denied|session_required|employee_not_provisioned|method_not_allowed|json_content_type_required|request_too_large)$/.test(x.code??'');respond(res,known?x.status!:503,{error:known?x.code:'native_local_unavailable',...(e instanceof HttpError&&'request_id' in e?{request_id:e.request_id}:{})})}
 return true
}}
