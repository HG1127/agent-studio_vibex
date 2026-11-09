export const originalAgentCreateTrialProtocol='original_owned_agent_create_trial_v1' as const
export type OriginalAgentCreateRun={id:string;spec_id:string;spec_revision:number;status:string;created:string;instruction:string;result:string;outputs_current:boolean}
export type OriginalAgentCreateTrial={protocol:typeof originalAgentCreateTrialProtocol;owner_user_id:string;spec_id:string;spec_revision:number;spec_updated_at:string;run:OriginalAgentCreateRun|null}
export class OriginalAgentCreateReadError extends Error{readonly code:string;constructor(code='invalid_original_agent_create_trial'){super(code);this.code=code}}
const bad=():never=>{throw new OriginalAgentCreateReadError()}
export function originalAgentCreateId(v:unknown):string{if(typeof v!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v))return bad();return v}
export function originalAgentCreateRevision(v:unknown):number{if(!Number.isSafeInteger(v)||Number(v)<1||Number(v)>=Number.MAX_SAFE_INTEGER)return bad();return Number(v)}
function object(v:unknown,keys:string[]):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))return bad();if(Reflect.ownKeys(v).length!==keys.length)return bad();for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))return bad()}return v as Record<string,unknown>}
function date(v:unknown):string{if(typeof v!=='string'||v.length>40||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)||!Number.isFinite(Date.parse(v)))return bad();return v}
function text(v:unknown,max:number):string{if(typeof v!=='string'||v.length>max||v.includes('\u0000'))return bad();return v}
const statuses=new Set(['queued','running','awaiting_approval','awaiting_input','paused','succeeded','failed','cancelled'])
export function parseOriginalAgentCreateTrial(raw:unknown,expected:{owner:string;specId:string;revision:number}):OriginalAgentCreateTrial{
 const owner=originalAgentCreateId(expected.owner),spec=originalAgentCreateId(expected.specId),revision=originalAgentCreateRevision(expected.revision)
 const v=object(raw,['protocol','owner_user_id','spec_id','spec_revision','spec_updated_at','run'])
 if(v.protocol!==originalAgentCreateTrialProtocol||v.owner_user_id!==owner||v.spec_id!==spec||v.spec_revision!==revision)return bad()
 const updated=date(v.spec_updated_at);let run:OriginalAgentCreateRun|null=null
 if(v.run!==null){const r=object(v.run,['id','spec_id','spec_revision','status','created','instruction','result','outputs_current']),id=originalAgentCreateId(r.id),runRevision=originalAgentCreateRevision(r.spec_revision)
  if(r.spec_id!==spec||runRevision>revision||typeof r.status!=='string'||!statuses.has(r.status)||typeof r.outputs_current!=='boolean'||r.outputs_current&&runRevision!==revision)return bad()
  const instruction=text(r.instruction,12000),result=text(r.result,1000000);if((!r.outputs_current&&instruction!=='')||(!r.outputs_current||r.status!=='succeeded')&&result!=='')return bad()
  run=Object.freeze({id,spec_id:spec,spec_revision:runRevision,status:r.status,created:date(r.created),instruction,result,outputs_current:r.outputs_current})
 }
 return Object.freeze({protocol:originalAgentCreateTrialProtocol,owner_user_id:owner,spec_id:spec,spec_revision:revision,spec_updated_at:updated,run})
}
