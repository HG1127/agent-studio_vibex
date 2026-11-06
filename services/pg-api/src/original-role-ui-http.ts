import type {IncomingMessage,ServerResponse} from 'node:http'
import {HttpError,type Identity} from './contracts.ts'
import {nativeSessionToken,verifyNativeOrigin} from './native-auth-http.mjs'
import {parseLocalTransportJson} from '../../../shared/native-local-device-contract.mjs'
import {expectedOriginalUiEmployee} from './native-original-ui-preconditions.ts'
import type {OriginalSkillAbRepository} from './original-skill-ab-repository.ts'
import type {OriginalRoleUiRepository} from './original-role-ui-repository.ts'
const base='/api/v2/original-ui/role-skills'
function reply(res:ServerResponse,status:number,value:unknown){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin'});res.end(JSON.stringify(value))}
async function body(req:IncomingMessage){if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(String(req.headers['content-type']??'')))throw new HttpError(415,'json_content_type_required');const declared=req.headers['content-length'];if(declared!==undefined&&(typeof declared!=='string'||!/^(0|[1-9][0-9]*)$/.test(declared)||Number(declared)>262144))throw new HttpError(413,'request_too_large');const chunks:Buffer[]=[];let size=0;for await(const part of req){const bytes=Buffer.from(part);size+=bytes.length;if(size>262144)throw new HttpError(413,'request_too_large');chunks.push(bytes)}if(declared!==undefined&&size!==Number(declared))throw new HttpError(400,'invalid_original_role_json');try{return parseLocalTransportJson(new TextDecoder('utf8',{fatal:true}).decode(Buffer.concat(chunks)),262144)}catch{throw new HttpError(400,'invalid_original_role_json')}}
export function createOriginalRoleUiHttp(input:{repository:OriginalRoleUiRepository;skillAB?:OriginalSkillAbRepository;authenticateRequest:(req:IncomingMessage)=>Promise<Identity>;allowedOrigin:string}){
 const requests=new Map<string,{until:number;reads:number;writes:number}>(),busy=new Set<string>()
 function budget(owner:string,write:boolean){const now=Date.now();if(requests.size>=2048){for(const [key,value]of requests)if(value.until<=now)requests.delete(key);if(requests.size>=2048&&!requests.has(owner))throw new HttpError(429,'original_role_rate_limited')}
  let entry=requests.get(owner);if(!entry||entry.until<=now){entry={until:now+60000,reads:0,writes:0};requests.set(owner,entry)}
  const kind=write?'writes':'reads';if(entry[kind]>=(write?20:120))throw new HttpError(429,'original_role_rate_limited');entry[kind]++}
 return async(req:IncomingMessage,res:ServerResponse)=>{
  const raw=req.url??'';if(raw!==base&&!raw.startsWith(base+'/')&&!raw.startsWith(base+'?'))return false
  let owner='',reserved=false
  try{
   const u=new URL(raw,'https://localhost');if(raw!==u.pathname+u.search||raw.includes('#'))throw new HttpError(400,'invalid_original_role_route')
   const method=req.method??'',path=u.pathname.slice(base.length),write=method==='POST'
   if(method!=='GET'&&!write)throw new HttpError(405,'method_not_allowed')
   verifyNativeOrigin(req,input.allowedOrigin,write)
   if(req.headers.authorization!==undefined||req.headers['x-rh-user-id']!==undefined||!nativeSessionToken(req))throw new HttpError(401,'native_cookie_only')
   owner=expectedOriginalUiEmployee(req)
   const identity=await input.authenticateRequest(req)
   // Verified identity→actual withActor owner mapping finishes before any body.
   await input.repository.authorize(identity,owner)
   budget(owner,write)
   if(method==='GET')for await(const chunk of req)if(Buffer.byteLength(chunk)>0)throw new HttpError(400,'invalid_original_role_route')
   if(write){
    if(u.search||!['/import','/approve','/active','/ab/preview'].includes(path))throw new HttpError(400,'invalid_original_role_route')
    if(path==='/ab/preview'){reply(res,200,await input.repository.previewSkillAB(identity,owner,await body(req)));return true}
    if(busy.has(owner))throw new HttpError(429,'original_role_busy');busy.add(owner);reserved=true
    reply(res,200,await input.repository.mutate(identity,owner,path,await body(req)))
   }else if(!path){if(u.search)throw new HttpError(400,'invalid_original_role_route');reply(res,200,await input.repository.list(identity,owner))}
   else if(path==='/meta'){if(u.search)throw new HttpError(400,'invalid_original_role_route');reply(res,200,{...await input.repository.meta(identity,owner),...(input.skillAB?await input.skillAB.meta(identity,owner):{})})}
   else if(path==='/detail'){
    if([...u.searchParams.keys()].sort().join(',')!=='id,version'||! /^\d{1,3}$/.test(u.searchParams.get('version')??''))throw new HttpError(400,'invalid_original_role_route')
    reply(res,200,await input.repository.detail(identity,owner,u.searchParams.get('id')??'',Number(u.searchParams.get('version'))))
   }else if(/^\/receipts\/[a-f0-9-]{36}$/.test(path)){
    if([...u.searchParams.keys()].join(',')!=='request_sha256')throw new HttpError(400,'invalid_original_role_route')
    reply(res,200,await input.repository.receipt(identity,owner,path.slice('/receipts/'.length),u.searchParams.get('request_sha256')??''))
   }else throw new HttpError(404,'original_role_route_not_found')
  }catch(e){const x=e as {status?:number;code?:string;message?:string};const code=x.code??x.message??'',allowed=/^[a-z][a-z0-9_]{0,99}$/.test(code),status=x.status;if(typeof status==='number'&&Number.isInteger(status)&&status>=400&&status<=599&&allowed)reply(res,status,{error:code});else reply(res,503,{error:'original_role_unavailable'})}
  finally{if(reserved)busy.delete(owner)}
  return true
 }
}
