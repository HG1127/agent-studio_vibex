// Browser-safe metadata and frozen approval intent. No provider, timer or storage.
import type {createPgNativePilotApi,KnowledgeEmbeddingConsent} from "./pgNativePilotApi.ts"
import {PgNativePilotError} from "./pgNativePilotApi.ts"
import {parseKnowledgeRetrievalBinding,type KnowledgeRetrievalBinding} from "../../services/pg-api/src/knowledge-retrieval-binding.ts"
export type {KnowledgeRetrievalBinding}
export type KnowledgeToolContext={enabled:boolean;consent:KnowledgeEmbeddingConsent|null;bases?:Array<{id:string;name:string;revision:number;semantic_allowed:boolean}>}
type Api=Pick<ReturnType<typeof createPgNativePilotApi>,"getConfigCapabilities"|"getKnowledgeEmbeddingConsent"|"listKnowledge"|"listSharedKnowledge">
type Pending={kind?:string;configuration?:Record<string,unknown>}
export async function loadKnowledgeToolContext(api:Api):Promise<KnowledgeToolContext>{
  const capability=await api.getConfigCapabilities()
  if(capability.knowledge_tool_runtime_enabled!==true)return {enabled:false,consent:null}
  const [consent,own,shared]=await Promise.all([api.getKnowledgeEmbeddingConsent(),api.listKnowledge(),api.listSharedKnowledge()])
  return {enabled:true,consent,bases:[...own.map(base=>({id:base.id,name:base.name,revision:base.revision,semantic_allowed:true})),
    ...shared.filter(base=>!own.some(row=>row.id===base.id)).map(base=>({id:base.id,name:base.name+" · "+base.owner_name+"共享",revision:base.base_revision,semantic_allowed:base.semantic_allowed}))]}
}
export async function optionalKnowledgeToolContext(api:Api):Promise<KnowledgeToolContext>{
  try{return await loadKnowledgeToolContext(api)}catch(error){
    if(error instanceof PgNativePilotError&&error.status===401)throw error
    return {enabled:false,consent:null}
  }
}
export function currentKnowledgeBinding(mode:"semantic"|"hybrid",context:KnowledgeToolContext|null):KnowledgeRetrievalBinding|undefined{
  const c=context?.consent
  if(context?.enabled!==true||c?.profile_valid!==true||c.query_enabled!==true)return undefined
  try{return parseKnowledgeRetrievalBinding({mode,profile_id:c.profile_id,profile_revision:c.profile_revision,consent_revision:c.revision})}catch{return undefined}
}
export function knowledgeBindingCurrent(raw:unknown,context:KnowledgeToolContext|null|undefined):boolean{
  try{const binding=parseKnowledgeRetrievalBinding(raw)
    return Boolean(binding&&JSON.stringify(binding)===JSON.stringify(currentKnowledgeBinding(binding.mode,context??null)))
  }catch{return false}
}
export function usesPaidKnowledge(pending:Pending|null|undefined):boolean{
  return pending?.kind==="tool"&&pending.configuration?.knowledge_retrieval!==undefined
}
export function knowledgeToolScopeCurrent(ids:readonly string[],context:KnowledgeToolContext|null|undefined):boolean{
  return Boolean(Array.isArray(ids)&&ids.length&&ids.length<=3&&new Set(ids).size===ids.length&&context?.bases&&ids.every(id=>typeof id==="string"&&context.bases!.some(base=>base.id===id))&&
    ids.some(id=>context.bases!.some(base=>base.id===id&&base.semantic_allowed===true)))
}
export function knowledgePendingMatches(pending:Pending,expected:unknown,ids:readonly string[]):boolean{
  try{
    const actual=parseKnowledgeRetrievalBinding(pending.configuration?.knowledge_retrieval),binding=parseKnowledgeRetrievalBinding(expected)
    if(!actual&&!binding)return true
    if(!actual||!binding||pending.kind!=="tool"||pending.configuration?.tool!=="knowledge_search"||JSON.stringify(actual)!==JSON.stringify(binding))return false
    const selected=pending.configuration.knowledge_base_ids
    return Array.isArray(selected)&&selected.length===ids.length&&ids.length>0&&ids.length<=3&&
      [...selected].sort().every((id,index)=>typeof id==="string"&&id===[...ids].sort()[index])
  }catch{return false}
}
