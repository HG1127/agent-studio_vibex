import type {KnowledgeEmbeddingChange,KnowledgeEmbeddingReceipt} from "../../services/pg-api/src/knowledge-embedding-contracts.ts"
import type {KnowledgeEmbeddingConsentChange,KnowledgeEmbeddingConsentReceipt} from "../../services/pg-api/src/knowledge-embedding-consent-contracts.ts"
import type {KnowledgeIndexAuthorization,KnowledgeIndexAuthorizationReceipt} from "../../services/pg-api/src/knowledge-index-contracts.ts"

export type EmbeddingMutation=
  |{kind:"settings";payload:Exclude<KnowledgeEmbeddingChange,{action:"rebuild"}>}
  |{kind:"rebuild";payload:Extract<KnowledgeEmbeddingChange,{action:"rebuild"}>}
  |{kind:"consent";payload:KnowledgeEmbeddingConsentChange}
  |{kind:"start";payload:KnowledgeIndexAuthorization}
export interface EmbeddingMutationTransport {
  changeKnowledgeEmbeddingSettings(input:Exclude<KnowledgeEmbeddingChange,{action:"rebuild"}>):Promise<{item:KnowledgeEmbeddingReceipt;replayed:boolean}>
  rebuildKnowledgeEmbeddingIndex(base:string,revision:number,request:string):Promise<{item:KnowledgeEmbeddingReceipt;replayed:boolean}>
  changeKnowledgeEmbeddingConsent(input:KnowledgeEmbeddingConsentChange):Promise<{item:KnowledgeEmbeddingConsentReceipt;replayed:boolean}>
  authorizeKnowledgeIndex(input:KnowledgeIndexAuthorization):Promise<{item:KnowledgeIndexAuthorizationReceipt;replayed:boolean}>
  getKnowledgeEmbeddingReceipt(request:string):Promise<KnowledgeEmbeddingReceipt|null>
  getKnowledgeEmbeddingConsentReceipt(request:string):Promise<KnowledgeEmbeddingConsentReceipt|null>
  getKnowledgeIndexAuthorizationReceipt(request:string):Promise<KnowledgeIndexAuthorizationReceipt|null>
}
const integer=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>=0
// One immutable intent at a time. Lost replies retain the exact request UUID,
// configuration epoch and revision. A receipt never substitutes current GETs.
export function createKnowledgeEmbeddingMutationSession(api:EmbeddingMutationTransport){
  let pending:EmbeddingMutation|null=null,busy=false,uncertain=false,generation=0
  const snapshot=()=>({busy,pending:pending?{kind:pending.kind,requestId:pending.payload.request_id}:null,uncertain})
  function valid(p:EmbeddingMutation,raw:unknown):boolean{
    if(!raw||typeof raw!=="object"||Array.isArray(raw))return false
    const r=raw as Record<string,unknown>,x=p.payload
    if(r.request_id!==x.request_id)return false
    if(p.kind==="start")return r.authorized===true&&r.profile_id===p.payload.profile_id&&r.profile_revision===p.payload.profile_revision&&r.consent_revision===p.payload.expected_consent_revision
    if(p.kind==="consent")return r.action===p.payload.action&&integer(r.revision)&&Number(r.revision)>p.payload.expected_revision&&
      (p.payload.action==="revoke"?r.index_enabled===false&&r.query_enabled===false:
        r.profile_id===p.payload.profile_id&&r.profile_revision===p.payload.profile_revision&&r.index_enabled===p.payload.index_enabled&&r.query_enabled===p.payload.query_enabled)
    return r.action===p.payload.action&&integer(r.revision)&&Number(r.revision)>=p.payload.expected_revision&&integer(r.queued_bases)&&
      (p.kind==="rebuild"?r.base_id===p.payload.base_id:r.base_id===null&&r.configured===(p.payload.action==="configure"))
  }
  async function run(read=false){
    if(!pending||busy)throw Error("embedding_mutation_not_available")
    const p=pending,ticket=generation,wasUncertain=uncertain;busy=true
    try{
      let value:unknown
      if(read)value=await (p.kind==="consent"?api.getKnowledgeEmbeddingConsentReceipt(p.payload.request_id):p.kind==="start"?api.getKnowledgeIndexAuthorizationReceipt(p.payload.request_id):api.getKnowledgeEmbeddingReceipt(p.payload.request_id))
      else if(p.kind==="settings")value=(await api.changeKnowledgeEmbeddingSettings(p.payload)).item
      else if(p.kind==="consent")value=(await api.changeKnowledgeEmbeddingConsent(p.payload)).item
      else if(p.kind==="start")value=(await api.authorizeKnowledgeIndex(p.payload)).item
      else value=(await api.rebuildKnowledgeEmbeddingIndex(p.payload.base_id,p.payload.expected_revision,p.payload.request_id)).item
      if(ticket!==generation)return {stale:true,confirmed:false}
      if(value===null&&read)return {stale:false,confirmed:false}
      if(!valid(p,value))throw Error("invalid_embedding_mutation_receipt")
      pending=null;uncertain=false;return {stale:false,confirmed:true}
    }catch(error){
      if(ticket!==generation)return {stale:true,confirmed:false}
      const status=(error as {status?:number})?.status
      if(!read&&!wasUncertain&&typeof status==="number"&&status>=400&&status<500&&status!==408){pending=null;uncertain=false}
      else uncertain=true
      throw error
    }finally{if(ticket===generation)busy=false}
  }
  return {snapshot,start(intent:EmbeddingMutation){
    if(pending||busy)throw Error("embedding_mutation_pending")
    pending=Object.freeze({...intent,payload:Object.freeze(structuredClone(intent.payload))}) as EmbeddingMutation
    return run()
  },recover:()=>run(true),retry:()=>run(),reset(){generation++;pending=null;busy=false;uncertain=false}}
}
