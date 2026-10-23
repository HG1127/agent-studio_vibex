import type {KnowledgeAccessReceipt,KnowledgeGrant,SharedKnowledgeMetadata,KnowledgeContentMetadata,KnowledgeContentReceipt,KnowledgeDocumentRow,KnowledgeSearchHit} from "../../services/pg-api/src/knowledge-sharing-contracts.ts"
export type {KnowledgeAccessReceipt,KnowledgeGrant,SharedKnowledgeMetadata,KnowledgeContentMetadata,KnowledgeContentReceipt,KnowledgeDocumentRow,KnowledgeSearchHit}
export type KnowledgeMutationKind="access"|"import"|"delete"
type Pending={kind:KnowledgeMutationKind;base:string;request:string;payload:Record<string,unknown>}
export interface KnowledgeSharingTransport {
  changeKnowledgeAccess(base:string,input:Record<string,unknown>):Promise<{item:KnowledgeAccessReceipt;replayed:boolean}>
  importSharedKnowledge(base:string,input:Record<string,unknown>):Promise<{item:KnowledgeContentReceipt;replayed:boolean}>
  deleteSharedKnowledge(base:string,input:Record<string,unknown>):Promise<{item:KnowledgeContentReceipt;replayed:boolean}>
  getKnowledgeAccessReceipt(base:string,request:string):Promise<KnowledgeAccessReceipt|null>
  getKnowledgeContentReceipt(base:string,request:string):Promise<KnowledgeContentReceipt|null>
}
// Payloads, including document text/bytes, stay in this private closure only.
// Navigation must preserve this controller. Logout/session expiry resets it.
export function createKnowledgeMutationSession(api:KnowledgeSharingTransport){
  let pending:Pending|null=null,busy=false,generation=0
  const snapshot=()=>({busy,pending:pending?{kind:pending.kind,base:pending.base,request:pending.request}:null})
  const validReceipt=(p:Pending,raw:unknown):boolean=>{
    if(!raw||typeof raw!=="object"||Array.isArray(raw))return false
    const r=raw as Record<string,unknown>
    if(r.request_id!==p.request)return false
    if(p.kind==="access")return r.base_id===p.base&&Number.isSafeInteger(r.revision)&&Number(r.revision)>0&&
      typeof r.recipient_id==="string"&&["viewer","editor"].includes(String(r.role))&&typeof r.semantic_allowed==="boolean"&&typeof r.revoked==="boolean"&&
      (p.payload.recipient_id===undefined||p.payload.recipient_id===r.recipient_id)&&
      (!["grant","grant_existing"].includes(String(p.payload.action))||(r.role===p.payload.role&&r.semantic_allowed===p.payload.semantic_allowed&&r.revoked===false))&&
      (p.payload.action!=="semantic"||(r.semantic_allowed===p.payload.enabled&&r.revoked===false))&&
      (p.payload.action!=="revoke"||r.revoked===true)
    return r.action===p.kind&&typeof r.document_id==="string"&&typeof r.sha256==="string"&&/^[a-f0-9]{64}$/.test(r.sha256)&&
      (p.kind!=="import"||r.filename===p.payload.filename)&&
      (p.kind!=="delete"||(r.document_id===p.payload.document_id&&r.sha256===p.payload.sha256))
  }
  async function run(recover=false){
    if(!pending||busy)throw Error("knowledge_mutation_not_available")
    const p=pending,ticket=generation;busy=true
    try{
      const result=recover?await (p.kind==="access"?api.getKnowledgeAccessReceipt(p.base,p.request):api.getKnowledgeContentReceipt(p.base,p.request)):
        (await (p.kind==="access"?api.changeKnowledgeAccess(p.base,p.payload):p.kind==="import"?api.importSharedKnowledge(p.base,p.payload):api.deleteSharedKnowledge(p.base,p.payload))).item
      if(ticket!==generation)return {stale:true,confirmed:false}
      if(result===null&&recover)return {stale:false,confirmed:false}
      if(!validReceipt(p,result))throw Error("invalid_knowledge_mutation_receipt")
      pending=null;return {stale:false,confirmed:true}
    }catch(error){
      const status=(error as {status?:number})?.status
      if(ticket===generation&&typeof status==="number"&&status>=400&&status<500)pending=null
      throw error
    }finally{if(ticket===generation)busy=false}
  }
  return {snapshot,
    start(kind:KnowledgeMutationKind,base:string,payload:Record<string,unknown>){
      if(pending||busy)throw Error("knowledge_mutation_pending")
      if(typeof payload.request_id!=="string")throw Error("knowledge_request_id_required")
      pending={kind,base,request:payload.request_id,payload:Object.freeze(structuredClone(payload))}
      return run()
    },recover:()=>run(true),retry:()=>run(),reset(){generation++;pending=null;busy=false},
  }
}
