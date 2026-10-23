// Metadata DTOs only. Neither the Worker nor the employee API receives vectors.
import {HttpError,isUuid} from "./contracts.ts"
export const knowledgeIndexRoute="/internal/v1/knowledge-index/dispatch"
export const INDEX_START_ACKNOWLEDGEMENT="START_OWNER_EMBEDDING_INDEX_AND_ACCEPT_PROVIDER_CHARGES" as const
export interface KnowledgeIndexClaim {attempt_id:string;worker_id:string;lease_token:string}
export interface KnowledgeIndexResult {status:"indexed";chunks:number}
export interface KnowledgeIndexAuthorizationReceipt {request_id:string;profile_id:string;profile_revision:number;consent_revision:number;authorized:true}
export interface KnowledgeIndexAuthorization {
  request_id:string;expected_consent_revision:number;profile_id:string;profile_revision:number;acknowledgement:typeof INDEX_START_ACKNOWLEDGEMENT
}
export interface KnowledgeIndexStatus {
  base_id:string;profile_id:string|null;profile_revision:number;consent_revision:number;index_authorized:boolean
  configured:boolean;connection_valid:boolean;dimensions:number|null;total:number;indexed:number;pending:number;queued:boolean;ready:boolean
  unknown_attempts:number;active_attempts:number
}
export function safeKnowledgeIndexClaim(raw:unknown):KnowledgeIndexClaim{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("invalid_knowledge_index_claim")
  const x=raw as Record<string,unknown>
  if(Object.keys(x).length!==3||Object.keys(x).some(key=>!["attempt_id","worker_id","lease_token"].includes(key))||!isUuid(x.attempt_id)||!isUuid(x.worker_id)||
    typeof x.lease_token!=="string"||!/^[a-f0-9]{64}$/.test(x.lease_token))throw Error("invalid_knowledge_index_claim")
  return {attempt_id:x.attempt_id.toLowerCase(),worker_id:x.worker_id.toLowerCase(),lease_token:x.lease_token}
}
export function safeKnowledgeIndexResult(raw:unknown):KnowledgeIndexResult{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("invalid_knowledge_index_result")
  const x=raw as Record<string,unknown>
  if(Object.keys(x).length!==2||x.status!=="indexed"||!Number.isSafeInteger(x.chunks)||(x.chunks as number)<1||(x.chunks as number)>12)
    throw Error("invalid_knowledge_index_result")
  return {status:"indexed",chunks:x.chunks as number}
}
export function safeKnowledgeIndexAuthorization(raw:unknown):KnowledgeIndexAuthorization{
  const refuse=():never=>{throw new HttpError(400,"invalid_knowledge_index_authorization")}
  if(!raw||typeof raw!=="object"||Array.isArray(raw))refuse()
  const x=raw as Record<string,unknown>
  if(Object.keys(x).length!==5||Object.keys(x).some(key=>!["request_id","expected_consent_revision","profile_id","profile_revision","acknowledgement"].includes(key))||
    !isUuid(x.request_id)||!isUuid(x.profile_id)||!Number.isSafeInteger(x.expected_consent_revision)||(x.expected_consent_revision as number)<1||
    !Number.isSafeInteger(x.profile_revision)||(x.profile_revision as number)<1||x.acknowledgement!==INDEX_START_ACKNOWLEDGEMENT)refuse()
  return {request_id:(x.request_id as string).toLowerCase(),profile_id:(x.profile_id as string).toLowerCase(),
    expected_consent_revision:x.expected_consent_revision as number,profile_revision:x.profile_revision as number,acknowledgement:INDEX_START_ACKNOWLEDGEMENT}
}
