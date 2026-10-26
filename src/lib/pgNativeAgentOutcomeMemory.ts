import {isUuid} from "../../services/pg-api/src/contracts.ts"
export type PgNativeOutcomeConsent={enabled:true;protocol:"agent_memory_outcome_v1";run_id:string;spec_id:string;spec_revision:number;intent_sha256:string;memory_id:string}
export type PgNativeOutcomeStop={request_id:string;run_id:string;expected_intent_sha256:string;confirm:true}
export type PgNativeOutcomeStopReceipt={run_id:string;request_id:string;intent_sha256:string;recorded:true;stopped:true;replayed:boolean}
export type PgNativeOutcomeResult={run_id:string;memory_id:string;intent_sha256:string;decision:"stored"|"revoked"|"source_unavailable"|"writes_disabled"|"write_failed";reason_code:string;source_sha256:string|null;created_at:string;recorded:true;replayed:true}
export type PgNativeOutcomeStatus={run_id:string;enabled:false}|PgNativeOutcomeConsent&{stopped:boolean;state:"pending"|"unconfirmed"|"finished";result:PgNativeOutcomeResult|null}
const invalid=():never=>{throw Error("invalid_agent_outcome_memory_projection")}
function object(raw:unknown):Record<string,unknown>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid()
  return raw as Record<string,unknown>
}
const exact=(v:Record<string,unknown>,keys:string[])=>Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
const hash=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v)
const id=(v:unknown):v is string=>isUuid(v)&&v===v.toLowerCase()
const consentKeys=["enabled","protocol","run_id","spec_id","spec_revision","intent_sha256","memory_id"]
function consentFields(v:Record<string,unknown>,runId:string){
  if(v.enabled!==true||v.protocol!=="agent_memory_outcome_v1"||!id(v.run_id)||v.run_id!==runId||!id(v.spec_id)||!id(v.memory_id)||
    !Number.isSafeInteger(v.spec_revision)||Number(v.spec_revision)<1||Number(v.spec_revision)>9007199254740990||!hash(v.intent_sha256))return invalid()
}
export function agentOutcomeConsent(raw:unknown,runId:string,specId:string,revision:number):PgNativeOutcomeConsent{
  const v=object(raw);consentFields(v,runId)
  if(!exact(v,consentKeys)||v.spec_id!==specId||v.spec_revision!==revision)return invalid()
  return v as PgNativeOutcomeConsent
}
export function agentOutcomeStop(raw:unknown):PgNativeOutcomeStop{
  const v=object(raw)
  if(!exact(v,["request_id","run_id","expected_intent_sha256","confirm"])||!isUuid(v.request_id)||!isUuid(v.run_id)||!hash(v.expected_intent_sha256)||v.confirm!==true)return invalid()
  return {request_id:v.request_id.toLowerCase(),run_id:v.run_id.toLowerCase(),expected_intent_sha256:v.expected_intent_sha256,confirm:true}
}
export function agentOutcomeStopReceipt(raw:unknown,choice:PgNativeOutcomeStop,confirmOnly=false):PgNativeOutcomeStopReceipt{
  const v=object(raw)
  if(!exact(v,["run_id","request_id","intent_sha256","recorded","stopped","replayed"])||v.run_id!==choice.run_id||v.request_id!==choice.request_id||v.intent_sha256!==choice.expected_intent_sha256||v.recorded!==true||v.stopped!==true||typeof v.replayed!=="boolean"||confirmOnly&&v.replayed!==true)return invalid()
  return v as PgNativeOutcomeStopReceipt
}
export function agentOutcomeStatus(raw:unknown,runId:string):PgNativeOutcomeStatus{
  const v=object(raw)
  if(!id(runId)||v.run_id!==runId)return invalid()
  if(v.enabled===false){if(!exact(v,["run_id","enabled"]))return invalid();return v as PgNativeOutcomeStatus}
  consentFields(v,runId)
  if(!exact(v,[...consentKeys,"stopped","state","result"])||typeof v.stopped!=="boolean"||!["pending","unconfirmed","finished"].includes(String(v.state)))return invalid()
  if(v.state!=="finished"){if(v.result!==null)return invalid()}
  else{
    const r=object(v.result),stored=r.decision==="stored"
    if(!exact(r,["run_id","memory_id","intent_sha256","decision","reason_code","source_sha256","created_at","recorded","replayed"])||
      r.run_id!==runId||r.memory_id!==v.memory_id||r.intent_sha256!==v.intent_sha256||r.recorded!==true||r.replayed!==true||
      !["stored","revoked","source_unavailable","writes_disabled","write_failed"].includes(String(r.decision))||typeof r.reason_code!=="string"||!/^[a-z0-9_]{1,80}$/.test(r.reason_code)||
      typeof r.created_at!=="string"||r.created_at.length>50||!Number.isFinite(Date.parse(r.created_at))||(stored?!hash(r.source_sha256):r.source_sha256!==null)||r.decision==="revoked"&&v.stopped!==true)return invalid()
  }
  return v as PgNativeOutcomeStatus
}
