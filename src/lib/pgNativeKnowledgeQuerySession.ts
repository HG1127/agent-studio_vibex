import {safeKnowledgeQueryRequest,type KnowledgeQueryRequest,type KnowledgeQueryReceipt,type KnowledgeQueryResult,type KnowledgeQueryHit} from "../../services/pg-api/src/knowledge-query-contracts.ts"
export type {KnowledgeQueryRequest,KnowledgeQueryReceipt,KnowledgeQueryResult}
export interface KnowledgeQueryTransport {
  submitKnowledgeQuery(request:KnowledgeQueryRequest):Promise<{item:KnowledgeQueryReceipt;replayed:boolean}>
  getKnowledgeQueryReceipt(request:string):Promise<KnowledgeQueryReceipt|null>
}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const integer=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>=0
const plain=(value:unknown,max:number)=>typeof value==="string"&&Array.from(value).length<=max&&!value.includes("\0")
function safeReceipt(raw:unknown,request:KnowledgeQueryRequest):KnowledgeQueryReceipt{
  const fail=():never=>{throw Error("invalid_knowledge_query_receipt")}
  if(!raw||typeof raw!=="object"||Array.isArray(raw))fail()
  const r=raw as KnowledgeQueryReceipt
  if(r.request_id!==request.request_id||!["prepared","dispatched","succeeded","unknown","rejected","expired","unavailable"].includes(r.status)||
    typeof r.billing_may_have_occurred!=="boolean"||typeof r.error_code!=="string"||!/^[a-z_]{0,80}$/.test(r.error_code)||r.status==="succeeded"&&r.result===null)fail()
  let result:KnowledgeQueryResult|null=null
  if(r.result!==null){
    const x=r.result
    if(r.status!=="succeeded"||!x||typeof x!=="object"||!["lexical","semantic","hybrid"].includes(x.retrieval)||
      !Array.isArray(x.items)||x.items.length>(request.limit??8)||![x.total_matches,x.scanned_candidates,x.semantic_indexed,x.semantic_total].every(integer)||
      x.scanned_candidates>23000||x.total_matches>23000||typeof x.candidate_limit_reached!=="boolean"||typeof x.shared_semantic_used!=="boolean"||typeof x.shared_lexical_only!=="boolean"||
      !["skipped","ok","partial","not_configured","query_not_authorized","not_indexed","query_charge_not_confirmed","provider_error","dimensions_changed"].includes(x.semantic_status))fail()
    if(request.mode==="semantic"&&x.retrieval!=="semantic"||request.mode==="hybrid"&&x.retrieval!=="hybrid"||
      request.mode==="lexical"&&x.retrieval!=="lexical"||request.acknowledgement===undefined&&x.retrieval!=="lexical")fail()
    const items:KnowledgeQueryHit[]=x.items.map(hit=>{
      if(!hit||typeof hit!=="object"||!request.base_ids.includes(hit.base_id)||!uuid.test(hit.chunk_id)||!uuid.test(hit.document_id)||
        !integer(hit.chunk_index)||!plain(hit.filename,180)||!plain(hit.citation,240)||!plain(hit.text,1200)||
        !Number.isFinite(hit.score)||hit.score<0||hit.semantic_score!==undefined&&(!Number.isFinite(hit.semantic_score)||hit.semantic_score< -1||hit.semantic_score>1))fail()
      return {base_id:hit.base_id,chunk_id:hit.chunk_id,document_id:hit.document_id,filename:hit.filename,chunk_index:hit.chunk_index,citation:hit.citation,text:hit.text,score:hit.score,
        ...(hit.semantic_score===undefined?{}:{semantic_score:hit.semantic_score})}
    })
    if(new Set(items.map(hit=>hit.base_id+":"+hit.chunk_id)).size!==items.length)fail()
    result={items,retrieval:x.retrieval,total_matches:x.total_matches,scanned_candidates:x.scanned_candidates,candidate_limit_reached:x.candidate_limit_reached,
      semantic_status:x.semantic_status,semantic_indexed:x.semantic_indexed,semantic_total:x.semantic_total,shared_semantic_used:x.shared_semantic_used,shared_lexical_only:x.shared_lexical_only}
  }
  return {request_id:r.request_id,status:r.status,error_code:r.error_code,billing_may_have_occurred:r.billing_may_have_occurred,result}
}
export const queryStillRunning=(receipt:KnowledgeQueryReceipt|null)=>receipt?.status==="prepared"||receipt?.status==="dispatched"
// No persistence, automatic POST, or provider credentials. All retries retain
// the same full intent; a GET confirming absence is required before retry.
export function createKnowledgeQuerySession(api:KnowledgeQueryTransport){
  let request:KnowledgeQueryRequest|null=null,receipt:KnowledgeQueryReceipt|null=null,busy=false,uncertain=false,checkedAbsent=false,generation=0,readEpoch=0
  const snapshot=()=>({busy,requestId:request?.request_id??null,paidIntent:request?.acknowledgement!==undefined,receipt:receipt?structuredClone(receipt):null,uncertain,
    canRetry:!!request&&!busy&&uncertain&&checkedAbsent&&!receipt,locked:busy||uncertain||queryStillRunning(receipt)})
  function hideResults(){readEpoch++;if(receipt)receipt={...receipt,result:null}}
  async function run(read:boolean){
    if(!request||busy)throw Error("knowledge_query_not_available")
    const p=request,ticket=generation,wasUncertain=uncertain;busy=true;hideResults();const permissionTicket=readEpoch
    try{
      const value=read?await api.getKnowledgeQueryReceipt(p.request_id):(await api.submitKnowledgeQuery(structuredClone(p))).item
      if(ticket!==generation)return {stale:true,found:false}
      if(value===null&&read){receipt=null;uncertain=true;checkedAbsent=true;return {stale:false,found:false}}
      const current=safeReceipt(value,p)
      receipt=permissionTicket===readEpoch?current:{...current,result:null};uncertain=false;checkedAbsent=false
      return {stale:false,found:true}
    }catch(error){
      if(ticket!==generation)return {stale:true,found:false}
      const status=(error as {status?:number})?.status
      if(read&&(status===403||status===404)){
        receipt={request_id:p.request_id,status:"unavailable",error_code:"knowledge_query_scope_unavailable",billing_may_have_occurred:receipt?.billing_may_have_occurred===true||p.acknowledgement!==undefined,result:null};uncertain=false;checkedAbsent=false
      }else if(!read&&!wasUncertain&&typeof status==="number"&&status>=400&&status<500&&status!==408){request=null;receipt=null;uncertain=false;checkedAbsent=false}
      else{uncertain=true;checkedAbsent=false}
      throw error
    }finally{if(ticket===generation)busy=false}
  }
  return {snapshot,hideResults,start(input:KnowledgeQueryRequest){
    if(snapshot().locked)throw Error("knowledge_query_pending")
    request=Object.freeze(safeKnowledgeQueryRequest(structuredClone(input)));receipt=null;uncertain=false;checkedAbsent=false
    return run(false)
  },recover:()=>run(true),retry(){if(!snapshot().canRetry)throw Error("knowledge_query_recovery_required");return run(false)},
  reset(){generation++;readEpoch++;request=null;receipt=null;busy=false;uncertain=false;checkedAbsent=false}}
}
