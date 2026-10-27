import {HttpError,type SqlClient} from "./contracts.ts"
import type {KnowledgeRetrievalBinding} from "./knowledge-retrieval-binding.ts"
// Metadata only: no embedding request is allowed while saving, preparing or
// approving a graph/spec. Profiles are always the verified reader's own.
export async function verifyKnowledgeRetrievalBinding(db:SqlClient,binding:KnowledgeRetrievalBinding|undefined):Promise<void>{
  if(!binding)return
  const value=(await db.query<{value:{profile_id:string|null;profile_revision:number;revision:number;query_enabled:boolean;profile_valid:boolean}}>(
    "SELECT agentstudio.knowledge_embedding_consent() AS value")).rows[0]?.value
  if(!value||value.profile_valid!==true||value.query_enabled!==true||value.profile_id!==binding.profile_id||
    Number(value.profile_revision)!==binding.profile_revision||Number(value.revision)!==binding.consent_revision)
    throw new HttpError(409,"knowledge_retrieval_profile_changed")
}
