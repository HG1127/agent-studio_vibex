import {parseOriginalHomeAuthoring,type OriginalHomeAuthoring} from '../../shared/original-home-authoring.ts'
import {safeNativeLocalAgentSpec} from '../../services/pg-api/src/native-local-agent-contract.ts'
import {parseOriginalHomeResources} from './originalHomeResources.ts'

/** Backend DTO for the existing Home page, not a replacement page. */
export type OriginalHomeAgent={
  id:string;owner_user_id:string;name:string;revision:number
  spec:Record<string,unknown>;created_at:string;updated_at:string
  authoring:OriginalHomeAuthoring|null
}
export type OriginalHomeAgentWrite={name:string;spec:Record<string,unknown>;authoring:OriginalHomeAuthoring}
export type OriginalHomeAgentUpdate=Omit<OriginalHomeAgentWrite,'authoring'>&{authoring?:OriginalHomeAuthoring}
export type OriginalHomeCatalogQuery={page?:number;perPage?:number;q?:string;source?:'all'|'create'|'template';favorite?:boolean;sort?:'updated_desc'|'created_desc'|'name_asc'|'name_desc'|'favorite_desc'}
export type OriginalHomeCatalog={items:(OriginalHomeAgent&{favorite:boolean})[];totalItems:number;page:number;totalPages:number;perPage:number}
export class OriginalHomeApiError extends Error{
  readonly status:number;readonly code:string
  constructor(status:number,code:string){super(code);this.status=status;this.code=code;this.name='OriginalHomeApiError'}
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fields=['goal','task_scope','deliverables','task_plan','done_criteria','tools','knowledge_base_ids','knowledge_retrieval','model_binding','http_tools','mcp_tools','require_plan_review']
function sameJson(left:unknown,right:unknown):boolean{
  if(left===right)return true
  if(Array.isArray(left)||Array.isArray(right))return Array.isArray(left)&&Array.isArray(right)&&left.length===right.length&&left.every((v,i)=>sameJson(v,right[i]))
  if(!left||!right||typeof left!=='object'||typeof right!=='object')return false
  const a=Object.keys(left).sort(),b=Object.keys(right).sort()
  return a.length===b.length&&a.every((k,i)=>k===b[i]&&sameJson((left as Record<string,unknown>)[k],(right as Record<string,unknown>)[k]))
}
const refuse=(status:number,code:string):never=>{throw new OriginalHomeApiError(status,code)}
function object(raw:unknown){
  if(!raw||typeof raw!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return refuse(503,'invalid_original_home_response')
  return raw as Record<string,unknown>
}
function jsonData(raw:unknown,depth=0):unknown{
  if(depth>20)return refuse(400,'invalid_original_home_data')
  if(raw===null||typeof raw==='boolean'||typeof raw==='string'||typeof raw==='number'&&Number.isFinite(raw))return raw
  if(Array.isArray(raw)){
    if(Reflect.ownKeys(raw).length!==raw.length+1)return refuse(400,'invalid_original_home_data')
    return Array.from({length:raw.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(raw,String(i));if(!d||!Object.hasOwn(d,'value'))return refuse(400,'invalid_original_home_data');return jsonData(d.value,depth+1)})
  }
  const value=object(raw),result:Record<string,unknown>={}
  for(const key of Reflect.ownKeys(value)){
    if(typeof key!=='string'||['__proto__','constructor','prototype'].includes(key))return refuse(400,'invalid_original_home_data')
    const d=Object.getOwnPropertyDescriptor(value,key)
    if(!d?.enumerable||!Object.hasOwn(d,'value'))return refuse(400,'invalid_original_home_data')
    result[key]=jsonData(d.value,depth+1)
  }
  return result
}
/** Pure browser normalization only; the Native server independently authorizes. */
export function normalizeOriginalHomeExecutionSpec(raw:unknown):Record<string,unknown>{
  const visibleSpec=object(jsonData(raw))
  if(Object.hasOwn(visibleSpec,'require_approval')&&visibleSpec.require_approval!==true)return refuse(400,'original_home_approval_required')
  // GET exposes the server's mandatory approval status. It is not a writable
  // permission field in the frozen API; retain that policy while editing.
  const {require_approval:_visibleApproval,...rawSpec}=visibleSpec
  if(Object.keys(rawSpec).some(k=>!fields.includes(k))||typeof rawSpec.goal!=='string'||!rawSpec.goal.trim())return refuse(400,'invalid_original_home_input')
  let spec:Record<string,unknown>
  try{
    // This is browser data normalization only. The real Native server must
    // independently check its enabled capabilities, employee and resources.
    const {require_approval:_approval,...normalized}=safeNativeLocalAgentSpec(rawSpec,true)
    spec=normalized
  }catch{return refuse(400,'invalid_original_home_input')}
  return spec
}
function input(raw:OriginalHomeAgentUpdate,requireAuthoring=true){
  const copied=object(jsonData(raw))
  const hasAuthoring=Object.hasOwn(copied,'authoring')
  if(Object.keys(copied).sort().join(',')!==(hasAuthoring?'authoring,name,spec':'name,spec')||requireAuthoring&&!hasAuthoring||typeof copied.name!=='string'||!copied.name.trim()||copied.name.length>120||/[\u0000-\u001f\u007f]/.test(copied.name))return refuse(400,'invalid_original_home_input')
  const spec=normalizeOriginalHomeExecutionSpec(copied.spec)
  let authoring:OriginalHomeAuthoring|undefined
  if(hasAuthoring)try{authoring=parseOriginalHomeAuthoring(copied.authoring)}catch{return refuse(400,'invalid_original_home_authoring')}
  return {name:copied.name.trim(),spec,...(authoring===undefined?{}:{authoring})}
}
function id(raw:string){if(!uuid.test(raw))return refuse(400,'invalid_original_home_id');return raw.toLowerCase()}
function revision(raw:number){if(!Number.isSafeInteger(raw)||raw<1)return refuse(400,'invalid_original_home_revision');return raw}
function row(raw:unknown,employee:string,expectedId?:string):OriginalHomeAgent{
  const r=object(raw),keys=['id','owner_user_id','name','spec','revision','created_at','updated_at','authoring']
  if(Object.keys(r).sort().join(',')!==keys.sort().join(',')||typeof r.id!=='string'||!uuid.test(r.id)||r.owner_user_id!==employee||expectedId!==undefined&&r.id!==expectedId||typeof r.name!=='string'||!r.name.trim()||r.name.length>120||!Number.isSafeInteger(r.revision)||Number(r.revision)<1)return refuse(503,'invalid_original_home_response')
  for(const key of['created_at','updated_at'])if(typeof r[key]!=='string'||!Number.isFinite(Date.parse(r[key] as string)))return refuse(503,'invalid_original_home_response')
  const spec=object(r.spec)
  if(Object.keys(spec).some(k=>![...fields,'require_approval'].includes(k))||typeof spec.goal!=='string'||!spec.goal.trim()||spec.require_approval!==true)return refuse(503,'invalid_original_home_response')
  try{return {...r,spec:object(jsonData(spec)),authoring:r.authoring===null?null:parseOriginalHomeAuthoring(r.authoring)} as OriginalHomeAgent}catch{return refuse(503,'invalid_original_home_response')}
}
export function createOriginalHomeAgentApi(config:{employeeId:string;transport?:typeof fetch;rootPath?:''|'/__pg_native';timeoutMs?:number}){
  const employee=id(config.employeeId),send=config.transport??fetch,root=config.rootPath??'/__pg_native',budget=config.timeoutMs??8000
  if(root!==''&&root!=='/__pg_native'||typeof send!=='function'||!Number.isSafeInteger(budget)||budget<1||budget>8000)return refuse(400,'invalid_original_home_transport')
  const base=root+'/api/v2/original-ui/agent-specs'
  async function request(route:string,method:'GET'|'POST'|'PATCH',body?:unknown,signal?:AbortSignal):Promise<Record<string,unknown>>{
    const bytes=body===undefined?undefined:JSON.stringify(body)
    if(bytes!==undefined&&new TextEncoder().encode(bytes).length>262144)return refuse(400,'original_home_input_too_large')
    const controller=new AbortController();let reader:ReadableStreamDefaultReader<Uint8Array>|undefined,timer:ReturnType<typeof setTimeout>|undefined
    const unavailable=()=>new OriginalHomeApiError(0,method==='GET'?'original_home_unavailable':'original_home_outcome_unknown')
    const cancel=()=>controller.abort()
    signal?.addEventListener('abort',cancel,{once:true})
    const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(unavailable())},budget)})
    const perform=async()=>{
      const response=await send(route,{method,body:bytes,credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal,headers:{Accept:'application/json',...(method==='GET'?{}:{'Content-Type':'application/json','X-AgentStudio-Request':'1','X-AgentStudio-Expected-Employee':employee})}})
      if(!(response instanceof Response)||response.redirected||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??'')||!response.body)return refuse(503,'invalid_original_home_response')
      const declared=response.headers.get('content-length')
      if(declared!==null&&(!/^(0|[1-9][0-9]*)$/.test(declared)||Number(declared)>1048576))return refuse(503,'invalid_original_home_response')
      reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0
      while(true){const c=await reader.read();if(c.done)break;size+=c.value.byteLength;if(size>1048576)return refuse(503,'invalid_original_home_response');chunks.push(c.value)}
      if(declared!==null&&size!==Number(declared))return refuse(503,'invalid_original_home_response')
      const buffer=new Uint8Array(size);let at=0;for(const c of chunks){buffer.set(c,at);at+=c.byteLength}
      let value:Record<string,unknown>
      try{value=object(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer)))}catch{return refuse(503,'invalid_original_home_response')}
      if(!response.ok)return refuse(response.status,typeof value.error==='string'&&/^[a-z0-9_]{1,80}$/.test(value.error)?value.error:'original_home_request_refused')
      return value
    }
    try{if(signal?.aborted)throw unavailable();return await Promise.race([perform(),deadline])}catch(error){if(error instanceof OriginalHomeApiError)throw error;throw unavailable()}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(reader){void reader.cancel().catch(()=>{});try{reader.releaseLock()}catch{}}}
  }
  const saved=(value:unknown,original:ReturnType<typeof input>,expectedId?:string,expectedRevision?:number)=>{
    const result=row(value,employee,expectedId)
    if(result.name!==original.name||original.authoring!==undefined&&!sameJson(result.authoring,original.authoring)||expectedRevision!==undefined&&result.revision!==expectedRevision||Object.keys(original.spec).some(k=>!sameJson(result.spec[k],original.spec[k])))return refuse(503,'unconfirmed_original_home_save')
    return result
  }
  return Object.freeze({
    async list(){const data=await request(base+'?limit=50','GET');if(Object.keys(data).join(',')!=='items'||!Array.isArray(data.items)||data.items.length>50)return refuse(503,'invalid_original_home_response');const rows=data.items.map(r=>row(r,employee));if(new Set(rows.map(r=>r.id)).size!==rows.length)return refuse(503,'invalid_original_home_response');return rows},
    async get(key:string,signal?:AbortSignal){const selected=id(key),data=await request(base+'/'+selected,'GET',undefined,signal);if(Object.keys(data).join(',')!=='item')return refuse(503,'invalid_original_home_response');return row(data.item,employee,selected)},
    async create(draft:OriginalHomeAgentWrite){const original=input(draft),data=await request(base,'POST',original);if(Object.keys(data).join(',')!=='item')return refuse(503,'invalid_original_home_response');return saved(data.item,original)},
    async update(key:string,expectedRevision:number,draft:OriginalHomeAgentUpdate){const selected=id(key),expected=revision(expectedRevision),original=input(draft,false),data=await request(base+'/'+selected,'PATCH',{...original,expected_revision:expected});if(Object.keys(data).join(',')!=='item')return refuse(503,'invalid_original_home_response');return saved(data.item,original,selected,expected+1)},
    async catalog(query:OriginalHomeCatalogQuery={},signal?:AbortSignal):Promise<OriginalHomeCatalog>{
      const page=query.page??1,perPage=query.perPage??18,q=query.q??'',source=query.source??'all',favorite=query.favorite??false,sort=query.sort??'updated_desc'
      if(Object.keys(query).some(k=>!['page','perPage','q','source','favorite','sort'].includes(k))||!Number.isSafeInteger(page)||page<1||page>1000000||!Number.isSafeInteger(perPage)||perPage<1||perPage>50||typeof q!=='string'||q.length>100||/[\u0000-\u001f\u007f]/.test(q)||!['all','create','template'].includes(source)||typeof favorite!=='boolean'||!['updated_desc','created_desc','name_asc','name_desc','favorite_desc'].includes(sort))return refuse(400,'invalid_original_home_catalog_query')
      const params=new URLSearchParams({page:String(page),perPage:String(perPage),sort,...(q?{q}:{}),...(source==='all'?{}:{source}),...(favorite?{favorite:'1'}:{})})
      const data=await request(root+'/api/v2/original-ui/agent-catalog?'+params,'GET',undefined,signal)
      if(Object.keys(data).sort().join(',')!=='items,page,perPage,totalItems,totalPages'||!Array.isArray(data.items)||!Number.isSafeInteger(data.totalItems)||Number(data.totalItems)<0||data.page!==page||data.perPage!==perPage||data.totalPages!==Math.ceil(Number(data.totalItems)/perPage)||data.items.length!==Math.max(0,Math.min(perPage,Number(data.totalItems)-(page-1)*perPage)))return refuse(503,'invalid_original_home_response')
      const items=data.items.map(raw=>{const {favorite:marked,...rest}=object(raw);if(typeof marked!=='boolean'||favorite&&!marked)return refuse(503,'invalid_original_home_response');const item=row(rest,employee);if(source!=='all'&&item.authoring?.source!==source)return refuse(503,'invalid_original_home_response');return {...item,favorite:marked}})
      if(new Set(items.map(r=>r.id)).size!==items.length)return refuse(503,'invalid_original_home_response')
      return {items,totalItems:Number(data.totalItems),page,perPage,totalPages:Number(data.totalPages)}
    },
    async favorite(key:string,expectedRevision:number,favorite:boolean){
      const selected=id(key),expected=revision(expectedRevision)
      if(typeof favorite!=='boolean')return refuse(400,'invalid_original_home_favorite')
      const data=await request(root+'/api/v2/original-ui/agent-catalog/'+selected+'/favorite','POST',{favorite,expected_revision:expected})
      if(Object.keys(data).sort().join(',')!=='agent_spec_id,favorite,revision'||data.agent_spec_id!==selected||data.favorite!==favorite||data.revision!==expected)return refuse(503,'unconfirmed_original_home_favorite')
      return {agent_spec_id:selected,favorite,revision:expected}
    },
    async resources(signal?:AbortSignal){
      const data=await request(root+'/api/v2/original-ui/home-resources','GET',undefined,signal)
      if(data.employee_id!==employee)return refuse(409,'employee_session_changed')
      try{return parseOriginalHomeResources(data,employee)}catch{return refuse(503,'invalid_original_home_resources')}
    },
  })
}
