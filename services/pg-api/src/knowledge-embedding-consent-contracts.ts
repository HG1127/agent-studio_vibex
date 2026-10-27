// Metadata only. Owner consent is necessary but never sufficient for dispatch.
export const EMBEDDING_CHARGE_ACKNOWLEDGEMENT="APPROVE_EMBEDDING_PROVIDER_CHARGES_FOR_THIS_PROFILE" as const
export interface KnowledgeEmbeddingConsent {
  revision:number;profile_id:string|null;profile_revision:number;profile_valid:boolean
  index_enabled:boolean;query_enabled:boolean
}
export interface KnowledgeEmbeddingConsentReceipt {
  request_id:string;action:"grant"|"revoke";revision:number;profile_id:string|null
  profile_revision:number|null;index_enabled:boolean;query_enabled:boolean
}
export type KnowledgeEmbeddingConsentChange={request_id:string;expected_revision:number}&(
  {action:"grant";profile_id:string;profile_revision:number;index_enabled:boolean;query_enabled:boolean;acknowledgement:typeof EMBEDDING_CHARGE_ACKNOWLEDGEMENT}|
  {action:"revoke"})
