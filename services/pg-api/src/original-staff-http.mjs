import {originalStaffProtocol,originalStaffPrefix as base,staffExpectedOwner} from '../../../shared/original-staff-contract.mjs'
import {parseLocalTransportJson} from '../../../shared/native-local-device-contract.mjs'
import {nativeSessionToken,verifyNativeOrigin,NativeLoginLimiter} from './native-auth-http.mjs'
import {originalStaffRepositoryState} from './original-staff-repository.mjs'
const id='([a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})',abort=code=>{throw Error(code)}
const codes=new Map([[400,['invalid_original_staff_input','invalid_staff_json','invalid_staff_route']],[401,['session_required','session_changed','native_cookie_only']],[403,['admin_required','original_staff_writes_disabled','employee_provisioning_disabled','origin_not_allowed','origin_or_csrf_header_required','cross_site_request_denied']],[404,['employee_not_found','employee_receipt_not_found','staff_route_not_found']],[405,['staff_method_not_allowed']],[409,['employee_revision_changed','employee_request_conflict','cannot_disable_self_admin','last_active_admin_required','cannot_reset_self_password','employee_password_unchanged','employee_already_exists']],[413,['staff_request_too_large']],[415,['json_content_type_required']],[429,['login_rate_limited','staff_request_busy']]])
const errorStatus=new Map([...codes].flatMap(([status,values])=>values.map(code=>[code,status])))
function reply(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',Pragma:'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY'});res.end(JSON.stringify(value))}
async function body(req){if(typeof req.headers['content-type']!=='string'||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type']))abort('json_content_type_required');const size=req.headers['content-length'];if(size!==undefined&&(typeof size!=='string'||! /^(?:0|[1-9][0-9]{0,4})$/.test(size)||Number(size)>8192))abort('staff_request_too_large');let count=0;const fragments=[];for await(const chunk of req){const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);count+=b.length;if(count>8192)abort('staff_request_too_large');fragments.push(b)}if(size!==undefined&&count!==Number(size))abort('invalid_staff_json');try{return parseLocalTransportJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(fragments)),8192)}catch{abort('invalid_staff_json')}}
// Header/route parsing is not identity authority. The real session query below
// must still finish before body consumption and repeat inside the locked write.
export function parseOriginalStaffHttpRequest(req,allowedOrigin){
 const raw=req.url??''
   const url=new URL(raw,'https://localhost');if(raw!==url.pathname+url.search||raw.includes('#'))abort('invalid_staff_route')
   const user=new RegExp('^'+base+'/users/'+id+'$').exec(url.pathname),reset=new RegExp('^'+base+'/users/'+id+'/reset-password$').exec(url.pathname),receipt=new RegExp('^'+base+'/requests/'+id+'$').exec(url.pathname),self=url.pathname===base+'/me',meta=url.pathname===base+'/meta',list=url.pathname===base+'/users',method=req.method??''
   if(!user&&!reset&&!receipt&&!self&&!meta&&!list)abort('staff_route_not_found')
   const write=list&&method==='POST'||!!user&&method==='PATCH'||!!reset&&method==='POST'
   if(!write&&!(method==='GET'&&(self||meta||list||receipt)))abort('staff_method_not_allowed')
   verifyNativeOrigin(req,allowedOrigin,write)
   if(req.headers.authorization!==undefined||req.headers['x-rh-user-id']!==undefined)abort('native_cookie_only')
   const token=nativeSessionToken(req);if(!token)abort('session_required')
   const owner=staffExpectedOwner(req.headers['x-agentstudio-expected-owner'])

 return {url,user,reset,receipt,self,meta,list,write,token,owner}
}
export function createOriginalStaffHttp(repository){
 const state=originalStaffRepositoryState(repository),limiter=new NativeLoginLimiter(),busy=new Set();let active=0
 return async(req,res)=>{
  const raw=req.url??'';if(raw!==base&&!raw.startsWith(base+'/')&&!raw.startsWith(base+'?'))return false
  let reserved=false,owner
  try{
   const parsed=parseOriginalStaffHttpRequest(req,state.allowedOrigin),{url,user,reset,receipt,self,meta,list,write,token}=parsed;owner=parsed.owner
   limiter.admit(req.socket?.remoteAddress,owner)
   // MUST finish genuine Cookie+owner/admin verification BEFORE consuming body.
   await repository.authorize(token,owner,!(self||meta))
   if(!list&&!receipt&&url.search)abort('invalid_staff_route')
   if(write){if(url.search)abort('invalid_staff_route');if(!state.configurationWrites)abort('original_staff_writes_disabled');if(list&&!state.employeeProvisioning)abort('employee_provisioning_disabled');if(busy.has(owner)||active>=16)abort('staff_request_busy');busy.add(owner);active++;reserved=true;const value=await body(req);const result=await repository.mutate(token,owner,list?'create':reset?'reset':'update',list?null:(reset??user)[1],value);reply(res,list?201:200,result)}
   else if(self)reply(res,200,await repository.me(token,owner))
   else if(meta)reply(res,200,{protocol:originalStaffProtocol,available:true,writes:state.configurationWrites,create:state.employeeProvisioning})
   else if(receipt)reply(res,200,await repository.receipt(token,owner,receipt[1],url.searchParams))
   else reply(res,200,await repository.list(token,owner,url.searchParams))
  }catch(error){const code=error?.code==='23505'?'employee_already_exists':errorStatus.has(error?.message)?error.message:error?.message==='original_staff_commit_unconfirmed'?'original_staff_commit_unconfirmed':'original_staff_unavailable';reply(res,errorStatus.get(code)??503,{error:code})}
  finally{if(reserved){busy.delete(owner);active--}}
  return true
 }
}
