import {roleObject} from '../../shared/original-role-execution-contract.mjs'
import {parseLocalTransportJson} from '../../shared/native-local-device-contract.mjs'
import {abId,abSha,skillAbIntent,skillAbIntentHashData,skillAbFeeAcknowledgement,skillAbReceipt,skillAbView,skillAbResultHashData,skillAbControl,skillAbControlHashData,skillAbControlReceipt,type SkillAbIntent,type SkillAbReceipt} from '../../shared/original-skill-ab-execution-contract.ts'
type Request=(path:string,method:'GET'|'POST',body?:unknown,readOnly?:boolean)=>Promise<Record<string,unknown>>
type Locator={request_id:string;request_sha256:string;input_sha256:string;skill_ref:{id:string;version:number;hash:string};attempted:(0|1)[]}
type Control=ReturnType<typeof skillAbControl>&{request_sha256:string}
function bad(code:string):never{throw Error(code)}
function canonical(v:unknown):unknown{if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical((v as Record<string,unknown>)[k])]));return v}
async function digest(v:unknown){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(v)))))].map(n=>n.toString(16).padStart(2,'0')).join('')}
/** Uses the existing Role API's bounded, owner-conditioned Native transport.
 * Only locators/hashes survive reload. Prompts/results/credentials never do. */
export function createOriginalSkillAbSession(input:{employeeId:string;request:Request;storage:Pick<Storage,'getItem'|'setItem'>|null}){
 const owner=abId(input.employeeId),key='agentstudio:original-skill-ab:v1:'+owner,locators=new Map<string,Locator>(),controls=new Map<string,Control>(),controlFlights=new Map<string,Promise<ReturnType<typeof skillAbControlReceipt>>>();let closed=false
 const active=()=>{if(closed)bad('original_skill_ab_session_closed')}
 const persist=()=>{if(!input.storage)bad('original_skill_ab_locator_storage_unavailable');try{input.storage.setItem(key,JSON.stringify({protocol:'original-skill-ab-locators.v1',entries:[...locators.values()],controls:[...controls.values()]}))}catch{bad('original_skill_ab_locator_storage_unavailable')}}
 function hydrate(){let raw:string|null|undefined;try{raw=input.storage?.getItem(key)}catch{bad('original_skill_ab_locator_storage_unavailable')}if(!raw)return;try{
  const saved=roleObject(parseLocalTransportJson(raw,65536),['protocol','entries','controls']);if(saved.protocol!=='original-skill-ab-locators.v1'||!Array.isArray(saved.entries)||saved.entries.length>20||!Array.isArray(saved.controls)||saved.controls.length>40)throw Error()
  for(const raw of saved.entries){const v=roleObject(raw,['request_id','request_sha256','input_sha256','skill_ref','attempted']),s=roleObject(v.skill_ref,['id','version','hash']);if(typeof s.id!=='string'||!/^[A-Za-z0-9]{15}$/.test(s.id)||typeof s.version!=='number'||!Number.isSafeInteger(s.version)||s.version<1||s.version>100||!Array.isArray(v.attempted)||v.attempted.length>2||v.attempted.some(n=>n!==0&&n!==1)||new Set(v.attempted).size!==v.attempted.length)throw Error();const id=abId(v.request_id);if(locators.has(id))throw Error();locators.set(id,{request_id:id,request_sha256:abSha(v.request_sha256),input_sha256:abSha(v.input_sha256),skill_ref:{id:s.id,version:s.version,hash:abSha(s.hash)},attempted:v.attempted.map(n=>n===0?0:1)})}
  for(const raw of saved.controls){const v=roleObject(raw,['operation_id','request_id','action','confirm','request_sha256']),{request_sha256,...rawChoice}=v,c=skillAbControl(rawChoice),id=c.request_id+':'+c.action;if(controls.has(id)||!locators.has(c.request_id))throw Error();controls.set(id,{...c,request_sha256:abSha(request_sha256)})}
 }catch{bad('original_skill_ab_locator_storage_invalid')}}
 hydrate()
 const locator=(id:string)=>{const l=locators.get(abId(id));if(!l)bad('original_skill_ab_original_locator_required');return l}
 const envelope=(raw:unknown,field:string)=>{const v=roleObject(raw,['employee_id',field]);if(v.employee_id!==owner)bad('employee_session_changed');return v[field]}
 const expected=(l:Locator)=>({owner,requestId:l.request_id,requestSha:l.request_sha256,inputSha:l.input_sha256})
 async function confirmReceipt(r:SkillAbReceipt,l:Locator){if(r.selection.skill_ref.id!==l.skill_ref.id||r.selection.skill_ref.version!==l.skill_ref.version||r.selection.skill_ref.hash!==l.skill_ref.hash||await digest(skillAbIntentHashData({...r.selection,request_id:r.request_id,expected_input_sha256:r.input_sha256,confirm:true,fee_acknowledgement:skillAbFeeAcknowledgement}))!==r.request_sha256)bad('original_skill_ab_receipt_unconfirmed');active();return r}
 async function view(id:string){active();const l=locator(id),value=skillAbView(envelope(await input.request('/requests/'+l.request_id+'/view?request_sha256='+l.request_sha256,'GET'), 'view'),expected(l));await confirmReceipt(value.receipt,l);for(const r of value.results??[])if(await digest(skillAbResultHashData(value.receipt,r))!==r.result_sha256)bad('original_skill_ab_result_unconfirmed');active();return value}
 async function receipt(id:string){active();const l=locator(id),value=skillAbReceipt(envelope(await input.request('/requests/'+l.request_id+'?request_sha256='+l.request_sha256,'GET'),'receipt'),expected(l));return confirmReceipt(value,l)}
 return Object.freeze({
  locators(){return [...locators.values()].map(l=>({...l,skill_ref:{...l.skill_ref},attempted:[...l.attempted]}))},
  async submit(raw:unknown){active();const intent=skillAbIntent(raw),hash=await digest(skillAbIntentHashData(intent));active();const prior=locators.get(intent.request_id)
   if(prior){if(prior.request_sha256!==hash||prior.input_sha256!==intent.expected_input_sha256)bad('original_skill_ab_request_conflict');return receipt(intent.request_id)}
   if(locators.size>=20)bad('original_skill_ab_locator_limit');const l:Locator={request_id:intent.request_id,request_sha256:hash,input_sha256:intent.expected_input_sha256,skill_ref:{...intent.skill_ref},attempted:[]};locators.set(intent.request_id,l);try{persist()}catch(e){locators.delete(intent.request_id);throw e}
   const value=skillAbReceipt(envelope(await input.request('/submit','POST',intent),'receipt'),expected(l));return confirmReceipt(value,l)
  },
  receipt,view,
  async startTrial(id:string,ordinal:0|1){active();const l=locator(id);if(ordinal!==0&&ordinal!==1)bad('invalid_original_skill_ab_trial');if(l.attempted.includes(ordinal))return view(id)
   l.attempted.push(ordinal);try{persist()}catch(e){l.attempted=l.attempted.filter(n=>n!==ordinal);throw e}
   const value=skillAbView(envelope(await input.request('/requests/'+l.request_id+'/trials/'+ordinal,'POST',{request_sha256:l.request_sha256}),'view'),expected(l));await confirmReceipt(value.receipt,l);for(const r of value.results??[])if(await digest(skillAbResultHashData(value.receipt,r))!==r.result_sha256)bad('original_skill_ab_result_unconfirmed');active();return value
  },
  async control(id:string,action:'cancel'|'erase'){active();locator(id);if(action!=='cancel'&&action!=='erase')bad('invalid_original_skill_ab_control');const ck=id+':'+action,flight=controlFlights.get(ck);if(flight)return flight
   const work=(async()=>{const prior=controls.get(ck),choice=prior?skillAbControl({operation_id:prior.operation_id,request_id:prior.request_id,action:prior.action,confirm:prior.confirm}):skillAbControl({operation_id:crypto.randomUUID(),request_id:id,action,confirm:true}),request_sha256=await digest(skillAbControlHashData(choice));active();if(prior&&prior.request_sha256!==request_sha256)bad('original_skill_ab_locator_storage_invalid')
    if(!prior){if(controls.size>=40)bad('original_skill_ab_locator_limit');controls.set(ck,{...choice,request_sha256});try{persist()}catch(e){controls.delete(ck);throw e}}
    const {request_sha256:_hash,...body}=controls.get(ck)!,value=skillAbControlReceipt(envelope(await input.request(prior?'/control-confirm':'/control','POST',body,!!prior),'receipt'),owner,choice,request_sha256);active();return value
   })();controlFlights.set(ck,work);try{return await work}finally{controlFlights.delete(ck)}
  },
  close(){closed=true},
 })
}
export type OriginalSkillAbSession=ReturnType<typeof createOriginalSkillAbSession>
export type {SkillAbIntent}
