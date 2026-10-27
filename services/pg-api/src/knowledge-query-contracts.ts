import {HttpError,isUuid} from "./contracts.ts"
export const QUERY_CHARGE_ACKNOWLEDGEMENT="PAY_ONCE_FOR_THIS_READER_QUERY" as const
export const knowledgeQueryRoute="/internal/v1/knowledge-query/dispatch"
export interface KnowledgeQueryRequest {
  request_id:string;base_ids:string[];query:string;mode?:"auto"|"lexical"|"semantic"|"hybrid";limit?:number
  profile_id?:string;profile_revision?:number;consent_revision?:number;acknowledgement?:typeof QUERY_CHARGE_ACKNOWLEDGEMENT
}
export interface KnowledgeQueryHit {base_id:string;chunk_id:string;document_id:string;filename:string;chunk_index:number;citation:string;text:string;score:number;semantic_score?:number}
export interface KnowledgeQueryResult {
  items:KnowledgeQueryHit[];retrieval:"lexical"|"semantic"|"hybrid";total_matches:number;scanned_candidates:number;candidate_limit_reached:boolean
  semantic_status:string;semantic_indexed:number;semantic_total:number;shared_semantic_used:boolean;shared_lexical_only:boolean
}
export interface KnowledgeQueryReceipt {request_id:string;status:"prepared"|"dispatched"|"succeeded"|"unknown"|"rejected"|"expired"|"unavailable";error_code:string;billing_may_have_occurred:boolean;result:KnowledgeQueryResult|null}
export interface KnowledgeQueryDispatchResult {status:"retrieved"}
export function safeKnowledgeQueryDispatchResult(raw:unknown):KnowledgeQueryDispatchResult{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||Object.keys(raw).length!==1||(raw as {status?:unknown}).status!=="retrieved")throw Error("invalid_knowledge_query_private_result")
  return {status:"retrieved"}
}
export function safeKnowledgeQueryRequest(raw:unknown):Required<Pick<KnowledgeQueryRequest,"request_id"|"base_ids"|"query"|"mode"|"limit">>&KnowledgeQueryRequest{
  const fail=():never=>{throw new HttpError(400,"invalid_knowledge_query_request")}
  if(!raw||typeof raw!=="object"||Array.isArray(raw))fail()
  const x=raw as Record<string,unknown>,keys=["request_id","base_ids","query","mode","limit","profile_id","profile_revision","consent_revision","acknowledgement"]
  if(Object.keys(x).some(k=>!keys.includes(k))||!isUuid(x.request_id)||!Array.isArray(x.base_ids)||x.base_ids.length<1||x.base_ids.length>10||x.base_ids.some(id=>!isUuid(id))||
    typeof x.query!=="string"||!x.query.trim()||x.query.trim().length>300||x.query.includes("\0")||Array.from(x.query).some(c=>c.length===1&&c.charCodeAt(0)>=0xd800&&c.charCodeAt(0)<=0xdfff))fail()
  const mode=x.mode===undefined?"auto":x.mode,limit=x.limit===undefined?8:x.limit,paid=x.acknowledgement!==undefined
  if(typeof mode!=="string"||!["auto","lexical","semantic","hybrid"].includes(mode)||!Number.isSafeInteger(limit)||(limit as number)<1||(limit as number)>8||
    paid&&(mode==="lexical"||x.acknowledgement!==QUERY_CHARGE_ACKNOWLEDGEMENT||!isUuid(x.profile_id)||!Number.isSafeInteger(x.profile_revision)||(x.profile_revision as number)<1||!Number.isSafeInteger(x.consent_revision)||(x.consent_revision as number)<1)||
    !paid&&(x.profile_id!==undefined||x.profile_revision!==undefined||x.consent_revision!==undefined||["semantic","hybrid"].includes(String(mode))))fail()
  return {request_id:(x.request_id as string).toLowerCase(),base_ids:[...new Set((x.base_ids as string[]).map(id=>id.toLowerCase()))].sort(),query:(x.query as string).trim(),mode:mode as "auto"|"lexical"|"semantic"|"hybrid",limit:limit as number,
    ...(paid?{profile_id:(x.profile_id as string).toLowerCase(),profile_revision:x.profile_revision as number,consent_revision:x.consent_revision as number,acknowledgement:QUERY_CHARGE_ACKNOWLEDGEMENT}:{})}
}
