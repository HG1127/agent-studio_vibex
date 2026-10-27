// Pure employee DTOs. No vectors, source text, credentials or database imports.
export interface KnowledgeEmbeddingSettings {
  configured:boolean;revision:number;connection_id:string|null;connection_revision:number|null
  model_name:string;base_url:string;dimensions:number|null;connection_valid:boolean
}
export interface KnowledgeEmbeddingStatus {
  base_id:string;profile_revision:number;configured:boolean;connection_valid:boolean
  dimensions:number|null;total:number;indexed:number;pending:number;queued:boolean;ready:boolean
}
export interface KnowledgeEmbeddingReceipt {
  request_id:string;action:"configure"|"disable"|"rebuild";revision:number
  base_id:string|null;configured:boolean;queued_bases:number
}
export type KnowledgeEmbeddingChange={request_id:string;expected_revision:number}&(
  {action:"configure";connection_id:string;connection_revision:number;model_name:string;base_url:string}|
  {action:"disable"}|{action:"rebuild";base_id:string})
