import type {IncomingMessage,ServerResponse} from 'node:http'
import {HttpError,type Identity} from './contracts.ts'
import {nativeSessionToken,verifyNativeOrigin} from './native-auth-http.mjs'
import {expectedOriginalUiEmployee} from './native-original-ui-preconditions.ts'
import {parseLocalTransportJson} from '../../../shared/native-local-device-contract.mjs'
import type {OriginalSkillAbRepository} from './original-skill-ab-repository.ts'
const base='/api/v2/original-ui/role-skills/ab',uuid='[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}'
function reply(res:ServerResponse,status:number,value:unknown){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin'});res.end(JSON.stringify(value))}
async function body(req:IncomingMessage){
 if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(String(req.headers['content-type']??''))||req.headers['content-encoding']!==undefined)throw new HttpError(415,'json_content_type_required')
 const declared=req.headers['content-length'];if(declared!==undefined&&(typeof declared!=='string'||!/^(0|[1-9][0-9]*)$/.test(declared)||Number(declared)>16384))throw new HttpError(413,'request_too_large')
 let size=0;const chunks:Buffer[]=[];for await(const part of req){const bytes=Buffer.from(part);size+=bytes.length;if(size>16384)throw new HttpError(413,'request_too_large');chunks.push(bytes)}if(declared!==undefined&&Number(declared)!==size)throw new HttpError(400,'invalid_original_skill_ab_json')
 try{return parseLocalTransportJson(new TextDecoder('utf8',{fatal:true}).decode(Buffer.concat(chunks)),16384)}catch{throw new HttpError(400,'invalid_original_skill_ab_json')}
}
export function createOriginalSkillAbHttp(input:{repository:OriginalSkillAbRepository;authenticateRequest:(req:IncomingMessage)=>Promise<Identity>;allowedOrigin:string}){
 const budget=new Map<string,{until:number;reads:number;writes:number}>()
 const limit=(owner:string,write:boolean)=>{const now=Date.now();if(budget.size>=2048){for(const [k,v]of budget)if(v.until<=now)budget.delete(k);if(!budget.has(owner)&&budget.size>=2048)throw new HttpError(429,'original_skill_ab_rate_limited')}let v=budget.get(owner);if(!v||v.until<=now){v={until:now+60000,reads:0,writes:0};budget.set(owner,v)}const field=write?'writes':'reads';if(++v[field]>(write?20:120))throw new HttpError(429,'original_skill_ab_rate_limited')}
 return async(req:IncomingMessage,res:ServerResponse)=>{
  const raw=req.url??'';if(raw!==base&&!raw.startsWith(base+'/')&&!raw.startsWith(base+'?'))return false
  try{
   const u=new URL(raw,'https://localhost');if(raw!==u.pathname+u.search||raw.includes('%')||raw.includes('#'))throw new HttpError(400,'invalid_original_skill_ab_route')
   const path=u.pathname.slice(base.length),post=req.method==='POST',get=req.method==='GET'
   if(!post&&!get)throw new HttpError(405,'method_not_allowed')
   verifyNativeOrigin(req,input.allowedOrigin,post)
   if(req.headers.authorization!==undefined||req.headers['x-rh-user-id']!==undefined||!nativeSessionToken(req))throw new HttpError(401,'native_cookie_only')
   const owner=expectedOriginalUiEmployee(req),identity=await input.authenticateRequest(req)
   // Real Cookie identity -> real SQL Actor owner is checked before any body.
   await input.repository.authorize(identity,owner)
   const trial=new RegExp('^/requests/('+uuid+')/trials/([01])$').exec(path),read=new RegExp('^/requests/('+uuid+')(\\/view)?$').exec(path)
   limit(owner,post&&path!=='/preview'&&path!=='/control-confirm')
   if(get){if(!read||[...u.searchParams.keys()].join(',')!=='request_sha256')throw new HttpError(400,'invalid_original_skill_ab_route');for await(const part of req)if(Buffer.byteLength(part)>0)throw new HttpError(400,'invalid_original_skill_ab_route');const sha=u.searchParams.get('request_sha256')??'';reply(res,200,read[2]?await input.repository.view(identity,owner,read[1]!,sha):await input.repository.receipt(identity,owner,read[1]!,sha))}
   else{if(u.search||!trial&&!['/preview','/submit','/control','/control-confirm'].includes(path))throw new HttpError(400,'invalid_original_skill_ab_route');const rawBody=await body(req)
    let value:unknown
    try{value=path==='/preview'?await input.repository.preview(identity,owner,rawBody):path==='/submit'?await input.repository.submit(identity,owner,rawBody):trial?await input.repository.startTrial(identity,owner,trial[1]!,Number(trial[2]),rawBody):await input.repository.control(identity,owner,rawBody,path==='/control-confirm')}catch(e){if(e instanceof Error&&e.message==='invalid_original_skill_ab_execution_contract')throw new HttpError(400,e.message);throw e}
    reply(res,200,value)
   }
  }catch(e){const x=e as {status?:number;code?:string;message?:string},code=x.code??x.message??'',originError=['native_origin_unavailable','origin_not_allowed','cross_site_request_denied','origin_or_csrf_header_required'].includes(code),known=Number.isInteger(x.status)&&x.status!>=400&&x.status!<=599&&(originError||e instanceof HttpError&&/^(?:original_skill_ab_[a-z_]+|invalid_original_skill_ab_[a-z_]+|employee_session_changed|native_employee_identity_required|native_cookie_only|invalid_original_ui_employee_precondition|method_not_allowed|request_too_large|json_content_type_required)$/.test(code));reply(res,known?x.status!:503,{error:known?code:'original_skill_ab_unavailable'})}
  return true
 }
}
