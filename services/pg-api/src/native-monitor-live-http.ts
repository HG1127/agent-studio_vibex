import type {IncomingMessage,ServerResponse} from 'node:http'
import {HttpError,type Identity} from './contracts.ts'
import {ownId} from './own-operations-contract.ts'
import {nativeSessionToken,verifyNativeOrigin} from './native-auth-http.mjs'
import {parseLocalTransportJson} from '../../../shared/native-local-device-contract.mjs'
import {parseMonitorQueryUrl} from './native-monitor-inbox-contract.ts'
import {parseMonitorHistoryQuery} from './native-monitor-live-reads.ts'
import {NativeMonitorLiveRepository} from './native-monitor-live-repository.ts'
import {NativeMonitorRequestAdmission} from './native-monitor-request-admission.ts'
const uuid='([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})',base='/api/v2/original-ui/business'
type Route={method:'GET'|'POST';work:(i:Identity,e:string,body:unknown,u:URL)=>Promise<unknown>}
function history(u:URL){
 const keys=[...u.searchParams.keys()]
 if(keys.some(k=>!['limit','after_ms','after_id'].includes(k))||new Set(keys).size!==keys.length||u.searchParams.has('limit')&&u.searchParams.get('limit')!=='20')throw new HttpError(400,'invalid_monitor_history_query')
 const at=u.searchParams.get('after_ms'),id=u.searchParams.get('after_id')
 if(at===null&&id===null)return parseMonitorHistoryQuery({limit:20,cursor:null})
 if(at===null||id===null||!/^[1-9][0-9]{0,15}$/.test(at))throw new HttpError(400,'invalid_monitor_history_query')
 return parseMonitorHistoryQuery({limit:20,cursor:{after_ms:Number(at),after_id:ownId(id)}})
}
export function createNativeMonitorLiveHttp(input:{repository:NativeMonitorLiveRepository;allowWrites?:boolean;allowedOrigin:string;authenticateRequest:(req:IncomingMessage)=>Promise<Identity>}){
 const r=input.repository,admission=new NativeMonitorRequestAdmission()
 return async(req:IncomingMessage,res:ServerResponse):Promise<boolean>=>{
  const raw=req.url??'',path=raw.split(/[?#]/,1)[0]??''
  let route:Route|undefined,match:RegExpExecArray|null
  if(path==='/api/v2/original-ui/monitor-inbox')route={method:'GET',work:(i,e,_b)=>r.inbox(i,parseMonitorQueryUrl(raw),e)}
  else if(match=new RegExp('^/api/v2/original-ui/monitor-events/'+uuid+'/read$').exec(path)){const id=match[1]!;route={method:'POST',work:(i,e,b)=>{if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).length)throw new HttpError(400,'invalid_monitor_request');return r.ack(i,id,e)}}}
  else if(path===base+'/collector-schedules')route={method:'GET',work:(i,e)=>r.schedules(i,e)}
  else if(path===base+'/cases')route={method:'POST',work:(i,e,b)=>r.caseCreate(i,e,b)}
  else if(match=new RegExp('^'+base+'/cases/'+uuid+'(?:/(query|records|reviews|monitors|monitors/preview))?$').exec(path)){
   const id=match[1]!,action=match[2]
   if(action===undefined)route={method:'GET',work:(i,e)=>r.caseGet(i,id,e)}
   else if(action==='query')route={method:'POST',work:(i,e,b)=>r.query(i,e,id,b)}
   else if(action==='records')route={method:'POST',work:(i,e,b)=>r.recordWrite(i,e,id,b)}
   else if(action==='reviews')route={method:'POST',work:(i,e,b)=>r.recordReview(i,e,id,b)}
   else if(action==='monitors/preview')route={method:'POST',work:(i,e,b)=>r.preview(i,e,id,b)}
   else route=req.method==='POST'?{method:'POST',work:(i,e,b)=>r.save(i,e,id,b)}:{method:'GET',work:(i,e)=>r.monitorList(i,id,e)}
  }else if(match=new RegExp('^'+base+'/monitors/'+uuid+'(?:/(definition|control|checks|events)(?:/'+uuid+')?)?$').exec(path)){
   const id=match[1]!,action=match[2],detail=match[3]
   if(action===undefined)route={method:'GET',work:(i,e)=>r.monitorGet(i,id,e)}
   else if(action==='definition'&&!detail)route={method:'POST',work:(i,e,b)=>r.update(i,e,id,b)}
   else if(action==='control'&&!detail)route={method:'POST',work:(i,e,b)=>r.control(i,e,id,b)}
   else if(action==='checks'||action==='events')route={method:'GET',work:(i,e,_b,u)=>detail?(action==='checks'?r.checkGet(i,id,detail,e):r.eventGet(i,id,detail,e)):r.history(i,id,action,history(u),e)}
  }else if(match=new RegExp('^'+base+'/monitor-checks/'+uuid+'/(review-preview|review|discard)$').exec(path)){
   const id=match[1]!,action=match[2]!
   route=action==='review-preview'?{method:'GET',work:(i,e)=>r.reviewPreview(i,id,e)}:action==='review'?{method:'POST',work:(i,e,b)=>r.review(i,e,id,b)}:{method:'POST',work:(i,e,b)=>r.discard(i,e,id,b)}
  }else if(match=new RegExp('^'+base+'/runs/'+uuid+'/results/'+uuid+'$').exec(path)){
   const run=match[1]!,result=match[2]!
   route={method:'GET',work:(i,e,_b,u)=>{
    const keys=[...u.searchParams.keys()]
    if(keys.some(k=>!['field','offset','limit'].includes(k))||new Set(keys).size!==keys.length||!/^(0|[1-9][0-9]{0,15})$/.test(u.searchParams.get('offset')??'0')||!/^[1-9][0-9]{0,3}$/.test(u.searchParams.get('limit')??'4000'))throw new HttpError(400,'invalid_monitor_result_range')
    return r.result(i,run,result,{field:u.searchParams.get('field')??'text',offset:Number(u.searchParams.get('offset')??0),limit:Number(u.searchParams.get('limit')??4000)},e)
   }}
  }
  if(!route)return false
  const reply=(status:number,value:unknown)=>{
   res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY',...(status===405?{Allow:route!.method}:{}),...(status===429?{'Retry-After':'10'}:{})});res.end(JSON.stringify(value))
  }
  let releaseIp:(()=>void)|undefined,releaseOwner:(()=>void)|undefined
  try{
   const u=new URL(raw,'https://localhost')
   if(raw!==u.pathname+u.search||raw.includes('#'))throw new HttpError(400,'invalid_monitor_request')
   verifyNativeOrigin(req,input.allowedOrigin,route.method==='POST')
   if(req.headers.authorization!==undefined||!nativeSessionToken(req))throw new HttpError(401,'session_required')
   if(req.method!==route.method)throw new HttpError(405,'method_not_allowed')
   const rawEmployee=req.headers['x-agentstudio-expected-employee']
   const headerCount=Array.isArray(req.rawHeaders)?req.rawHeaders.filter((name,index)=>index%2===0&&name.toLowerCase()==='x-agentstudio-expected-employee').length:1
   if(headerCount!==1||typeof rawEmployee!=='string'||!new RegExp('^'+uuid+'$').test(rawEmployee))throw new HttpError(400,'expected_employee_required')
   const employee=ownId(rawEmployee)
   releaseIp=admission.admitIp(req.socket?.remoteAddress)
   const identity=await input.authenticateRequest(req)
   if(identity?.issuer!=='urn:agentstudio:local:v1'||typeof identity.subject!=='string'||!identity.subject)throw new HttpError(403,'native_employee_identity_required')
   releaseOwner=admission.admitOwner(identity)
   const mutation=route.method==='POST'&&!path.endsWith('/query')&&!path.endsWith('/monitors/preview')&&!/^\/api\/v2\/original-ui\/monitor-events\//.test(path)
   if(mutation&&input.allowWrites!==true)throw new HttpError(403,'monitor_employee_writes_not_approved')
   let body:unknown
   if(route.method==='POST'){
    if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(String(req.headers['content-type']??''))||req.headers['transfer-encoding']!==undefined||!/^[1-9][0-9]{0,5}$/.test(String(req.headers['content-length']??''))||Number(req.headers['content-length'])>131072)throw new HttpError(400,'invalid_monitor_request')
    const parts:Buffer[]=[];let length=0
    for await(const chunk of req){const bytes=Buffer.from(chunk);length+=bytes.length;if(length>131072)throw new HttpError(413,'monitor_request_limit');parts.push(bytes)}
    if(length!==Number(req.headers['content-length']))throw new HttpError(400,'invalid_monitor_request')
    try{body=parseLocalTransportJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)),131072)}catch{throw new HttpError(400,'invalid_monitor_request')}
   }else{
    if(req.headers['transfer-encoding']!==undefined||req.headers['content-length']!==undefined&&req.headers['content-length']!=='0')throw new HttpError(400,'invalid_monitor_request')
    for await(const chunk of req)if(chunk.length)throw new HttpError(400,'invalid_monitor_request')
   }
   const queryAllowed=path==='/api/v2/original-ui/monitor-inbox'||/\/(checks|events)$/.test(path)||/\/runs\/[^/]+\/results\//.test(path)
   if(!queryAllowed&&u.search)throw new HttpError(400,'invalid_monitor_request')
   const assertCurrent=async()=>{const current=await input.authenticateRequest(req);if(current?.issuer!==identity.issuer||current.subject!==identity.subject)throw new HttpError(409,'employee_session_changed')}
   await assertCurrent()
   const value=await route.work(identity,employee,body,u)
   await assertCurrent()
   const encoded=JSON.stringify(value)
   if(Buffer.byteLength(encoded)>1048576)throw new HttpError(413,'monitor_response_limit')
   reply(200,value)
  }catch(error){
   // Root origin/auth/parser errors may expose status but never their message.
   const status=error&&typeof error==='object'&&'status'in error?Number(error.status):503
   const allowed=error instanceof HttpError&&/^(?:monitor_|native_monitor_|invalid_monitor_|business_|invalid_business_|session_required$|employee_session_changed$|native_employee_identity_required$|method_not_allowed$|expected_employee_required$|invalid_native_monitor_query$)/.test(error.code)
   reply([400,401,403,404,405,409,413,422,429].includes(status)?status:503,{error:allowed?error.code:status===401?'session_required':status===403?'native_employee_identity_required':'native_monitor_live_unavailable'})
  }finally{releaseOwner?.();releaseIp?.()}
  return true
 }
}
