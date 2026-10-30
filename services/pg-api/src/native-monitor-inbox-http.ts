import type {IncomingMessage,ServerResponse} from 'node:http'
import {HttpError,isUuid,type Identity} from './contracts.ts'
import {nativeSessionToken,verifyNativeOrigin} from './native-auth-http.mjs'
import {parseMonitorQueryUrl,parseMonitorPage,type MonitorQuery} from './native-monitor-inbox-contract.ts'
type Reads={list(identity:Identity,query:MonitorQuery):Promise<unknown>;ack(identity:Identity,event:string,expectedEmployee:string):Promise<{ok:true}>}
const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
export function createNativeMonitorInboxHttp(input:{repository:Reads;allowedOrigin:string;authenticateRequest:(req:IncomingMessage)=>Promise<Identity>}){
 const reply=(res:ServerResponse,status:number,value:unknown,allow:string)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY',...(status===405?{Allow:allow}:{})});res.end(JSON.stringify(value))}
 return async(req:IncomingMessage,res:ServerResponse):Promise<boolean>=>{
  const raw=req.url??'',path=raw.split(/[?#]/,1)[0]??'',ack=new RegExp('^/api/v2/original-ui/monitor-events/('+uuid+')/read$').exec(path)
  if(path!=='/api/v2/original-ui/monitor-inbox'&&!ack)return false
  const method=ack?'POST':'GET'
  try{
   try{verifyNativeOrigin(req,input.allowedOrigin,req.method==='POST')}catch(error){if((error as {status?:number})?.status===403)throw new HttpError(403,'native_employee_identity_required');throw error}
   if(req.headers.authorization!==undefined||!nativeSessionToken(req))throw new HttpError(401,'session_required')
   if(req.method!==method)throw new HttpError(405,'method_not_allowed')
   let identity:Identity;try{identity=await input.authenticateRequest(req)}catch(error){if((error as {status?:number})?.status===401)throw new HttpError(401,'session_required');throw error}
   if(identity?.issuer!=='urn:agentstudio:local:v1'||typeof identity.subject!=='string'||!identity.subject)throw new HttpError(403,'native_employee_identity_required')
   if(ack){
    if(raw!==path||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(String(req.headers['content-type']??'')))throw new HttpError(400,'invalid_native_monitor_query')
    const employee=req.headers['x-agentstudio-expected-employee'];if(typeof employee!=='string'||!isUuid(employee)||employee!==employee.toLowerCase())throw new HttpError(400,'expected_employee_required')
    if(req.headers['transfer-encoding']!==undefined||req.headers['content-length']!==undefined&&!/^[1-9][0-9]{0,3}$/.test(String(req.headers['content-length'])))throw new HttpError(400,'invalid_native_monitor_query')
    const parts:Buffer[]=[];let length=0;for await(const chunk of req){const bytes=Buffer.from(chunk);length+=bytes.length;if(length>4096)throw new HttpError(400,'invalid_native_monitor_query');parts.push(bytes)}
    let body:unknown;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)))}catch{throw new HttpError(400,'invalid_native_monitor_query')}
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length)throw new HttpError(400,'invalid_native_monitor_query')
    // Body arrival is not continued session authority. Recheck the same real
    // Cookie before entering the mutation; a revoked/changed session cannot
    // use an earlier observation while an incomplete body was being received.
    let current:Identity;try{current=await input.authenticateRequest(req)}catch(error){if((error as {status?:number})?.status===401)throw new HttpError(401,'session_required');throw error}
    if(current.issuer!==identity.issuer||current.subject!==identity.subject)throw new HttpError(409,'employee_session_changed')
    const value=await input.repository.ack(identity,ack[1]!,employee);if(value?.ok!==true||Object.keys(value).join(',')!=='ok')throw new HttpError(503,'native_monitor_inbox_unavailable');reply(res,200,value,method)
   }else{
    if(req.headers['transfer-encoding']!==undefined||req.headers['content-length']!==undefined&&req.headers['content-length']!=='0')throw new HttpError(400,'invalid_native_monitor_query')
    for await(const chunk of req)if(chunk.length)throw new HttpError(400,'invalid_native_monitor_query')
    const query=parseMonitorQueryUrl(raw),value=parseMonitorPage(await input.repository.list(identity,query),query);reply(res,200,value,method)
   }
  }catch(error){
   const allowed:Record<number,string[]>={400:['invalid_native_monitor_query','expected_employee_required'],401:['session_required'],403:['native_employee_identity_required'],404:['native_monitor_event_not_found'],405:['method_not_allowed'],409:['employee_session_changed'],503:['native_monitor_inbox_unavailable']}
   const known=error instanceof HttpError&&allowed[error.status]?.includes(error.code);reply(res,known?error.status:503,{error:known?error.code:'native_monitor_inbox_unavailable'},method)
  }
  return true
 }
}
