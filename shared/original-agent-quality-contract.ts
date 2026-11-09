/** Source-only v1 contract. Wire values are data, never authorization proof. */
export const originalAgentQualityProtocol='native_original_agent_quality_v1' as const
export class OriginalAgentQualityError extends Error{
 readonly status:number;readonly code:string;readonly outcomeUnknown:boolean
 constructor(status:number,code:string,outcomeUnknown=false){super(code);this.name='OriginalAgentQualityError';this.status=status;this.code=code;this.outcomeUnknown=outcomeUnknown}
}
export const qualityFail=(status=503,code='invalid_original_agent_quality',unknown=false):never=>{throw new OriginalAgentQualityError(status,code,unknown)}
export function qualityObject(raw:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!raw||typeof raw!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return qualityFail()
 const out:Record<string,unknown>={};const names=Reflect.ownKeys(raw)
 if(names.length!==keys.length)return qualityFail()
 for(const key of names){const d=Object.getOwnPropertyDescriptor(raw,key);if(typeof key!=='string'||!keys.includes(key)||!d?.enumerable||!Object.hasOwn(d,'value'))return qualityFail();out[key]=d.value}
 return out
}
export function qualityId(value:unknown):string{if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value))return qualityFail(400,'invalid_original_quality_id');return value}
export function qualityHash(value:unknown):string{if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))return qualityFail();return value}
export function qualityRevision(value:unknown):number{if(!Number.isSafeInteger(value)||Number(value)<1||Number(value)>=Number.MAX_SAFE_INTEGER)return qualityFail();return Number(value)}
function qualityWriteRevision(value:unknown):number{const revision=qualityRevision(value);if(revision>=Number.MAX_SAFE_INTEGER-1)return qualityFail();return revision}
export type OriginalQualityCheck=Readonly<{type:'contains'|'not_contains'|'json_object';expected:string}>
export function parseOriginalQualityChecks(raw:unknown):readonly OriginalQualityCheck[]{
 if(!Array.isArray(raw)||raw.length>12||Reflect.ownKeys(raw).length!==raw.length+1)return qualityFail(400,'invalid_original_quality_rules')
 const result:OriginalQualityCheck[]=[]
 for(let index=0;index<raw.length;index++){
  const d=Object.getOwnPropertyDescriptor(raw,String(index));if(!d?.enumerable||!Object.hasOwn(d,'value'))return qualityFail(400,'invalid_original_quality_rules')
  let value:Record<string,unknown>;try{value=qualityObject(d.value,['type','expected'])}catch{return qualityFail(400,'invalid_original_quality_rules')}
  const type=value.type,expected=value.expected
  if(typeof type!=='string'||!['contains','not_contains','json_object'].includes(type)||typeof expected!=='string'||expected.length>200||/[\u0000-\u001f\u007f]/.test(expected)||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(expected)||(type==='json_object'?expected!=='':!expected.trim()))return qualityFail(400,'invalid_original_quality_rules')
  result.push(Object.freeze({type:type as OriginalQualityCheck['type'],expected}))
 }
 return Object.freeze(result)
}
export type OriginalQualityRevision=Readonly<{protocol:typeof originalAgentQualityProtocol;employee_id:string;spec_id:string;spec_revision:number;source_sha256:string;state:'missing'|'configured';checks_sha256:string|null;checks:readonly OriginalQualityCheck[]|null}>
export function parseOriginalQualityRevision(raw:unknown,employee:string,spec:string):OriginalQualityRevision{
 const v=qualityObject(raw,['protocol','employee_id','spec_id','spec_revision','source_sha256','state','checks_sha256','checks'])
 if(v.protocol!==originalAgentQualityProtocol||qualityId(v.employee_id)!==qualityId(employee)||qualityId(v.spec_id)!==qualityId(spec)||v.state!=='missing'&&v.state!=='configured')return qualityFail()
 const configured=v.state==='configured';if(!configured&&(v.checks_sha256!==null||v.checks!==null))return qualityFail()
 return Object.freeze({protocol:originalAgentQualityProtocol,employee_id:employee,spec_id:spec,spec_revision:qualityRevision(v.spec_revision),source_sha256:qualityHash(v.source_sha256),state:v.state,checks_sha256:configured?qualityHash(v.checks_sha256):null,checks:configured?parseOriginalQualityChecks(v.checks):null})
}
export type OriginalQualityWrite=Readonly<{request_id:string;expected_spec_revision:number;expected_source_sha256:string;expected_checks_sha256:string|null;checks:readonly OriginalQualityCheck[]}>
export function parseOriginalQualityWrite(raw:unknown):OriginalQualityWrite{
 const v=qualityObject(raw,['request_id','expected_spec_revision','expected_source_sha256','expected_checks_sha256','checks'])
 return Object.freeze({request_id:qualityId(v.request_id),expected_spec_revision:qualityWriteRevision(v.expected_spec_revision),expected_source_sha256:qualityHash(v.expected_source_sha256),expected_checks_sha256:v.expected_checks_sha256===null?null:qualityHash(v.expected_checks_sha256),checks:parseOriginalQualityChecks(v.checks)})
}
export function qualityChecksCanonical(checks:unknown):string{return JSON.stringify({protocol:originalAgentQualityProtocol,checks:parseOriginalQualityChecks(checks)})}
export function qualityWriteCanonical(employee:string,spec:string,write:OriginalQualityWrite):string{return JSON.stringify({protocol:originalAgentQualityProtocol,employee_id:qualityId(employee),spec_id:qualityId(spec),...parseOriginalQualityWrite(write)})}
export type OriginalQualityPending=Readonly<{protocol:typeof originalAgentQualityProtocol;employee_id:string;spec_id:string;request_id:string;request_sha256:string;expected_spec_revision:number;expected_source_sha256:string;expected_checks_sha256:string|null}>
export function parseOriginalQualityPending(raw:unknown,employee:string,spec:string):OriginalQualityPending{
 const v=qualityObject(raw,['protocol','employee_id','spec_id','request_id','request_sha256','expected_spec_revision','expected_source_sha256','expected_checks_sha256'])
 if(v.protocol!==originalAgentQualityProtocol||qualityId(v.employee_id)!==qualityId(employee)||qualityId(v.spec_id)!==qualityId(spec))return qualityFail()
 return Object.freeze({protocol:originalAgentQualityProtocol,employee_id:employee,spec_id:spec,request_id:qualityId(v.request_id),request_sha256:qualityHash(v.request_sha256),expected_spec_revision:qualityWriteRevision(v.expected_spec_revision),expected_source_sha256:qualityHash(v.expected_source_sha256),expected_checks_sha256:v.expected_checks_sha256===null?null:qualityHash(v.expected_checks_sha256)})
}
export function qualityPendingFor(employee:string,spec:string,write:OriginalQualityWrite,hash:string):OriginalQualityPending{return parseOriginalQualityPending({protocol:originalAgentQualityProtocol,employee_id:employee,spec_id:spec,request_id:write.request_id,request_sha256:hash,expected_spec_revision:write.expected_spec_revision,expected_source_sha256:write.expected_source_sha256,expected_checks_sha256:write.expected_checks_sha256},employee,spec)}
export type OriginalQualityReceipt=Readonly<{protocol:typeof originalAgentQualityProtocol;employee_id:string;spec_id:string;request_id:string;request_sha256:string;before_revision:number;audit_event_id:string;after:OriginalQualityRevision}>
export function parseOriginalQualityReceipt(raw:unknown,pending:OriginalQualityPending):OriginalQualityReceipt{
 const v=qualityObject(raw,['protocol','employee_id','spec_id','request_id','request_sha256','before_revision','audit_event_id','after'])
 if(v.protocol!==originalAgentQualityProtocol||v.employee_id!==pending.employee_id||v.spec_id!==pending.spec_id||v.request_id!==pending.request_id||v.request_sha256!==pending.request_sha256||v.before_revision!==pending.expected_spec_revision)return qualityFail()
 const after=parseOriginalQualityRevision(v.after,pending.employee_id,pending.spec_id)
 if(after.state!=='configured'||after.spec_revision!==pending.expected_spec_revision+1||after.source_sha256===pending.expected_source_sha256)return qualityFail()
 return Object.freeze({protocol:originalAgentQualityProtocol,employee_id:pending.employee_id,spec_id:pending.spec_id,request_id:pending.request_id,request_sha256:pending.request_sha256,before_revision:pending.expected_spec_revision,audit_event_id:qualityId(v.audit_event_id),after})
}
