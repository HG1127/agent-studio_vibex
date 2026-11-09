import {originalAgentQualityProtocol,OriginalAgentQualityError,qualityId,qualityObject,qualityHash,parseOriginalQualityWrite,parseOriginalQualityPending,qualityWriteCanonical,qualityPendingFor,type OriginalQualityPending} from '../../shared/original-agent-quality-contract.ts'
import {parseAgentDesignTransportJson} from '../../services/pg-api/src/agent-design-value-contract.ts'
export const originalQualityBrowserHash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('')
const failures=new WeakMap<OriginalAgentQualityError,{key:string;phase:'not_dispatched'|'refused'}>()
const refusalCodes=new Set(['original_quality_writes_disabled','original_quality_employee_changed','employee_session_changed','original_quality_spec_not_found','original_quality_revision_conflict','original_quality_request_conflict','invalid_original_quality_rules','invalid_original_quality_write','original_quality_revision_missing','original_quality_run_not_current','original_quality_assertions_failed','original_quality_restore_unavailable','original_quality_intent_not_finished'])
const key=(p:OriginalQualityPending)=>JSON.stringify(parseOriginalQualityPending(p,p.employee_id,p.spec_id))
/** Mandatory Root transport: verified cookie session, closed same-origin paths,
 * owner revalidation, deadline and AbortSignal; no raw fetch/PB fallback. */
export function createOriginalAgentQualityApi(options:{employeeId:string;transport:typeof fetch;hash?:(text:string)=>Promise<string>}){
 const employee=qualityId(options.employeeId),send=options.transport,hash=options.hash??originalQualityBrowserHash,base='/__pg_native/api/v2/original-ui/agent-quality/'
 if(typeof send!=='function')throw Error('original_quality_verified_transport_required')
 const headers=()=>({'X-Agentstudio-Request':'1','Accept':'application/json','Content-Type':'application/json','X-Agentstudio-Original-Quality':originalAgentQualityProtocol,'X-Agentstudio-Expected-Employee':employee})
 const item=async(response:Response,attempt?:OriginalQualityPending)=>{
  let value:Record<string,unknown>
  try{const raw=await response.text();if(new TextEncoder().encode(raw).length>65536||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''))throw Error();const parsed=parseAgentDesignTransportJson(raw);value=qualityObject(parsed,response.ok?['protocol','item']:attempt?['protocol','error','outcome','request_id','request_sha256']:['protocol','error','outcome']);if(value.protocol!==originalAgentQualityProtocol)throw Error()}catch{throw new OriginalAgentQualityError(503,'original_quality_unconfirmed_response',true)}
  if(response.ok)return value.item
  const code=typeof value.error==='string'?value.error:'original_quality_unavailable',refused=Boolean(attempt&&value.outcome==='refused'&&[400,403,404,409].includes(response.status)&&refusalCodes.has(code)&&value.request_id===attempt.request_id&&value.request_sha256===attempt.request_sha256),e=new OriginalAgentQualityError(response.status,code,!refused)
  if(refused&&attempt)failures.set(e,{key:key(attempt),phase:'refused'})
  throw e
 }
 return Object.freeze({
  read:async(spec:string,signal:AbortSignal)=>item(await send(base+qualityId(spec),{method:'GET',headers:headers(),signal})),
  save:async(spec:string,raw:unknown,signal:AbortSignal)=>{qualityId(spec);const write=parseOriginalQualityWrite(raw),pending=qualityPendingFor(employee,spec,write,qualityHash(await hash(qualityWriteCanonical(employee,spec,write))));if(signal.aborted){const e=new OriginalAgentQualityError(503,'original_quality_not_dispatched');failures.set(e,{key:key(pending),phase:'not_dispatched'});throw e}return item(await send(base+spec,{method:'POST',headers:headers(),body:JSON.stringify(write),signal}),pending)},
  receipt:async(spec:string,request:string,signal:AbortSignal,pending:OriginalQualityPending)=>{const p=parseOriginalQualityPending(pending,employee,qualityId(spec));if(qualityId(request)!==p.request_id)throw new OriginalAgentQualityError(503,'original_quality_receipt_changed');const query=new URLSearchParams({request_sha256:p.request_sha256,expected_spec_revision:String(p.expected_spec_revision),expected_source_sha256:p.expected_source_sha256,expected_checks_sha256:p.expected_checks_sha256??'null'});return item(await send(base+spec+'/receipts/'+request+'?'+query,{method:'GET',headers:headers(),signal}))},
  writeFailure(cause:unknown,pending:OriginalQualityPending){if(!(cause instanceof OriginalAgentQualityError))return null;const proof=failures.get(cause);return proof&&proof.key===key(pending)?proof.phase:null},
 })
}
