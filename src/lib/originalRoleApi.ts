import {createOriginalSkillAbSession,type OriginalSkillAbSession} from './originalSkillAbSession.ts'
import {originalSkillAbSelection,originalSkillAbPreview} from '../../shared/original-skill-ab-contract.ts'
import {parseLocalTransportJson} from '../../shared/native-local-device-contract.mjs'
export class OriginalRoleApiError extends Error{readonly status:number;readonly code:string;constructor(status:number,code:string){super(code);this.status=status;this.code=code;this.name='OriginalRoleApiError'}}
function fail(s:number,c:string):never{throw new OriginalRoleApiError(s,c)}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,skill=/^[A-Za-z0-9]{15}$/,sha=/^[a-f0-9]{64}$/
export type RoleSkillSummary={id:string;name:string;description:string;source_url:string;active:boolean;latest_version:number;approved_version:number;approved_hash:string;updated_ms:number}
export type RoleSkillDetail={id:string;name:string;description:string;content:string;source_url:string;version:number;hash:string;active:boolean;approved:boolean}
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v)||![null,Object.prototype].includes(Object.getPrototypeOf(v)))fail(503,'original_role_response_invalid');for(const key of Reflect.ownKeys(v)){const d=Object.getOwnPropertyDescriptor(v,key);if(typeof key!=='string'||!d?.enumerable||!Object.hasOwn(d,'value'))fail(503,'original_role_response_invalid')}return v as Record<string,unknown>}
const exact=(v:unknown,keys:string[])=>{const o=object(v);if(Object.keys(o).sort().join(',')!==keys.slice().sort().join(','))fail(503,'original_role_response_invalid');return o}
export function roleSkillSummary(raw:unknown):RoleSkillSummary{
 const r=exact(raw,['id','name','description','source_url','active','latest_version','approved_version','approved_hash','updated_ms'])
 if(typeof r.id!=='string'||!skill.test(r.id)||typeof r.name!=='string'||!r.name||r.name.length>64||typeof r.description!=='string'||r.description.length>1024||typeof r.source_url!=='string'||r.source_url.length>1000||typeof r.active!=='boolean'||!Number.isSafeInteger(r.latest_version)||Number(r.latest_version)<1||Number(r.latest_version)>100||!Number.isSafeInteger(r.approved_version)||Number(r.approved_version)<0||Number(r.approved_version)>Number(r.latest_version)||typeof r.approved_hash!=='string'||(r.approved_version===0?r.approved_hash!=='':!sha.test(r.approved_hash))||!Number.isSafeInteger(r.updated_ms)||Number(r.updated_ms)<0)fail(503,'original_role_response_invalid')
 return {id:r.id,name:r.name,description:r.description,source_url:r.source_url,active:r.active,latest_version:Number(r.latest_version),approved_version:Number(r.approved_version),approved_hash:r.approved_hash,updated_ms:Number(r.updated_ms)}
}
export function roleSkillDetail(raw:unknown):RoleSkillDetail{
 const r=exact(raw,['id','name','description','content','source_url','version','hash','active','approved'])
 if(typeof r.id!=='string'||!skill.test(r.id)||typeof r.name!=='string'||!r.name||r.name.length>64||typeof r.description!=='string'||r.description.length>1024||typeof r.content!=='string'||r.content.length>16000||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(r.content)||typeof r.source_url!=='string'||r.source_url.length>1000||!Number.isSafeInteger(r.version)||Number(r.version)<1||Number(r.version)>100||typeof r.hash!=='string'||!sha.test(r.hash)||typeof r.active!=='boolean'||typeof r.approved!=='boolean')fail(503,'original_role_response_invalid')
 return {id:r.id,name:r.name,description:r.description,content:r.content,source_url:r.source_url,version:Number(r.version),hash:r.hash,active:r.active,approved:r.approved}
}
function canonical(v:unknown):unknown{if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical((v as Record<string,unknown>)[k])]));return v}
async function digest(v:unknown){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(v)))))].map(n=>n.toString(16).padStart(2,'0')).join('')}
export function createOriginalRoleApi(input:{employeeId:string;transport?:typeof fetch;root?:''|'/__pg_native';currentEmployee?:()=>string;timeoutMs?:number;storage?:Pick<Storage,'getItem'|'setItem'>|null}){
 const employee=input.employeeId,send=input.transport??fetch,root=input.root??'/__pg_native',budget=input.timeoutMs??8000,base=root+'/api/v2/original-ui/role-skills',pending=new Map<string,{operation_id:string;request_sha256:string;path:string}>()
 if(!uuid.test(employee)||!['','/__pg_native'].includes(root)||!Number.isSafeInteger(budget)||budget<1||budget>8000)fail(400,'original_role_transport_invalid')
 let abSession:OriginalSkillAbSession|undefined
 const storage=input.storage===undefined?(typeof window==='undefined'?null:window.sessionStorage):input.storage,storageKey='agentstudio:original-role-ui-pending:v3:'+employee
 if(storage){try{const saved=storage.getItem(storageKey);if(saved!==null){const raw=exact(parseLocalTransportJson(saved,30000),['version','entries']);if(raw.version!==1||!Array.isArray(raw.entries)||raw.entries.length>50)throw Error();for(const entry of raw.entries){const r=exact(entry,['operation_id','request_sha256','path']);if(typeof r.operation_id!=='string'||!uuid.test(r.operation_id)||typeof r.request_sha256!=='string'||!sha.test(r.request_sha256)||!['/import','/approve','/active'].includes(String(r.path))||pending.has(r.request_sha256))throw Error();pending.set(r.request_sha256,{operation_id:r.operation_id,request_sha256:r.request_sha256,path:String(r.path)})}}}catch{fail(409,'original_role_pending_locators_invalid')}}
 function persist(){if(storage)try{storage.setItem(storageKey,JSON.stringify({version:1,entries:[...pending.values()]}))}catch{fail(409,'original_role_pending_storage_unavailable')}}
 function owner(){if(input.currentEmployee&&input.currentEmployee()!==employee)fail(409,'employee_session_changed')}
 async function request(path:string,method:'GET'|'POST',body?:unknown,readOnly=false){
  owner();const c=new AbortController();let reader:ReadableStreamDefaultReader<Uint8Array>|undefined,timer:ReturnType<typeof setTimeout>|undefined
  const unavailable=()=>new OriginalRoleApiError(0,method==='GET'||readOnly?'original_role_unavailable':'original_role_outcome_unknown')
  const work=async()=>{
   const r=await send(path,{method,credentials:'same-origin',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:c.signal,headers:{Accept:'application/json','X-AgentStudio-Expected-Employee':employee,...(method==='POST'?{'Content-Type':'application/json','X-AgentStudio-Request':'1'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})
   if(!(r instanceof Response)||r.redirected||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(r.headers.get('content-type')??'')||!r.body)fail(503,'original_role_response_invalid')
   const declared=r.headers.get('content-length');if(declared!==null&&(!/^(0|[1-9][0-9]*)$/.test(declared)||Number(declared)>1048576))fail(503,'original_role_response_invalid')
   const stream=r.body;if(!stream)fail(503,'original_role_response_invalid');reader=stream.getReader();const chunks:Uint8Array[]=[];let size=0
   for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1048576)fail(503,'original_role_response_invalid');chunks.push(part.value)}
   if(declared!==null&&Number(declared)!==size)fail(503,'original_role_response_invalid')
   const bytes=new Uint8Array(size);let at=0;for(const b of chunks){bytes.set(b,at);at+=b.length}
   let value:Record<string,unknown>;try{value=object(parseLocalTransportJson(new TextDecoder('utf8',{fatal:true}).decode(bytes),1048576))}catch{fail(503,'original_role_response_invalid')}
   owner();if(!r.ok)fail(r.status,typeof value!.error==='string'&&/^[a-z0-9_]{1,100}$/.test(value!.error)?value!.error:'original_role_refused')
   if(value!.employee_id!==employee)fail(409,'employee_session_changed');return value!
  }
  try{return await Promise.race([work(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{c.abort();reject(unavailable())},budget)})])}catch(e){if(e instanceof OriginalRoleApiError)throw e;throw unavailable()}
  finally{if(timer)clearTimeout(timer);if(reader){void reader.cancel().catch(()=>{});try{reader.releaseLock()}catch{}}}
 }
 async function mutate(path:string,data:unknown){
  const key=await digest({path,data}),prior=pending.get(key)
  if(pending.size>=50&&!prior)fail(409,'original_role_pending_limit')
  const intent=prior??{operation_id:crypto.randomUUID(),request_sha256:key,path};if(!prior){pending.set(key,intent);persist()}
  const response=prior?await request(base+'/receipts/'+prior.operation_id+'?request_sha256='+prior.request_sha256,'GET'):await request(base+path,'POST',{...object(data),operation_id:intent.operation_id,request_sha256:intent.request_sha256})
  exact(response,prior?['employee_id','operation_id','request_sha256','confirmed','result']:['employee_id','operation_id','request_sha256','result'])
  if(response.operation_id!==intent.operation_id||response.request_sha256!==intent.request_sha256)fail(503,'original_role_receipt_mismatch')
  if(prior&&response.confirmed!==true)fail(409,'original_role_confirmation_pending')
  const result=object(response.result),original=object(data)
  if(path==='/import'){
   const r=exact(result,['item']),item=exact(r.item,['id','version','hash','name','description','approved','warnings'])
   if(typeof item.id!=='string'||!skill.test(item.id)||!Number.isSafeInteger(item.version)||Number(item.version)<1||Number(item.version)>100||typeof item.hash!=='string'||!sha.test(item.hash)||typeof item.name!=='string'||!item.name||item.name.length>64||typeof item.description!=='string'||item.description.length>1024||item.approved!==false||!Array.isArray(item.warnings)||item.warnings.length>10||item.warnings.some(w=>typeof w!=='string'||w.length>100))fail(503,'original_role_response_invalid')
  }else if(path==='/approve'){exact(result,['id','version','hash','approved']);if(result.id!==original.id||result.version!==original.version||result.hash!==original.hash||result.approved!==true)fail(503,'original_role_response_invalid')}
  else {exact(result,['id','active']);if(result.id!==original.id||result.active!==original.active)fail(503,'original_role_response_invalid')}
  pending.delete(key);try{persist()}catch(error){pending.set(key,intent);throw error}return {...result}
 }
 return Object.freeze({
  ab(){if(!abSession)abSession=createOriginalSkillAbSession({employeeId:employee,storage,request:(path,method,data,readOnly)=>request(base+'/ab'+path,method,data,readOnly)});return abSession},
  async meta(){const r=await request(base+'/meta','GET');if(r.protocol!=='original-role-ui.v3'||r.roles!==true||r.reviewed_v1!==true)fail(503,'original_role_profile_required');return r},
  async list(){const r=await request(base,'GET');if(!Array.isArray(r.items)||r.items.length>100)fail(503,'original_role_response_invalid');const items=(r.items as unknown[]).map(roleSkillSummary);if(new Set(items.map(r=>r.id)).size!==items.length)fail(503,'original_role_response_invalid');return items},
  async previewAB(raw:unknown){const selection=originalSkillAbSelection(raw),r=await request(base+'/ab/preview','POST',selection,true);exact(r,['employee_id','preview']);const preview=originalSkillAbPreview(r.preview,{owner:employee,selection}),{preview_sha256,...core}=preview;if(await digest(core)!==preview_sha256)fail(503,'original_role_response_invalid');return preview},
  async detail(id:string,version:number){if(!skill.test(id)||!Number.isSafeInteger(version)||version<1||version>100)fail(400,'skill_reference_invalid');const r=await request(base+'/detail?id='+id+'&version='+version,'GET'),d=roleSkillDetail(r.item);if(d.id!==id||d.version!==version)fail(503,'original_role_response_invalid');return d},
  async import(source:string,source_url=''){if(typeof source!=='string'||source.length>16100||typeof source_url!=='string'||source_url.length>1000)fail(400,'skill_source_invalid');return object(await mutate('/import',{source,source_url}))},
  async approve(id:string,version:number,hash:string){if(!skill.test(id)||!sha.test(hash)||!Number.isSafeInteger(version)||version<1||version>100)fail(400,'skill_reference_invalid');return mutate('/approve',{id,version,hash,confirm_review:true})},
  async active(id:string,active:boolean){if(!skill.test(id)||typeof active!=='boolean')fail(400,'skill_reference_invalid');return mutate('/active',{id,active})},
  pendingWrites(){return pending.size},
 })
}
