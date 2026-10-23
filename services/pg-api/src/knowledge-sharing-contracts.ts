// JSON wire contracts only. Safe for browser type imports; no Node/DB modules.
export type KnowledgeAccessRole="viewer"|"editor"
export interface KnowledgeGrant {
  recipient_user_id:string;recipient_name:string;recipient_active:boolean
  access_role:KnowledgeAccessRole;semantic_allowed:boolean;revoked:boolean;revision:number
}
export interface KnowledgeAccessReceipt {
  request_id:string;base_id:string;recipient_id:string;role:KnowledgeAccessRole
  semantic_allowed:boolean;revoked:boolean;revision:number
}
export interface SharedKnowledgeMetadata {
  id:string;owner_user_id:string;owner_name:string;name:string;description:string
  access_role:KnowledgeAccessRole;semantic_allowed:boolean;access_revision:number;base_revision:number
}
export interface KnowledgeContentMetadata {id:string;owner_user_id:string;name:string;description:string;revision:number;access_role:"owner"|KnowledgeAccessRole}
export interface KnowledgeContentReceipt {request_id:string;action:"import"|"delete";document_id:string;filename:string;sha256:string;chunk_count?:number}
export interface KnowledgeDocumentRow {id:string;filename:string;mime_type:string;status:string;sha256:string;created_at:string}
export interface KnowledgeSearchHit {document_id:string;filename:string;chunk_index:number;snippet:string;citation:string}
