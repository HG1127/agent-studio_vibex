import {HttpError,isUuid,type Identity} from "./contracts.ts"
import {KnowledgeQueryRepository} from "./knowledge-query-repository.ts"
import {workflowKnowledgeQueryId} from "./knowledge-execution-source.ts"
import {QUERY_CHARGE_ACKNOWLEDGEMENT,type KnowledgeQueryReceipt} from "./knowledge-query-contracts.ts"
import type {WorkflowV2ToolRequest} from "./workflow-v2-tool-contract.ts"
import type {KnowledgeRetrievalBinding} from "./knowledge-retrieval-binding.ts"
function unavailable():never{throw new HttpError(503,"workflow_knowledge_query_unavailable")}
const cap=(value:string,size:number)=>Array.from(value).slice(0,size).join("")
export function knowledgeToolEvidence(receipt:KnowledgeQueryReceipt,ids:readonly string[],mode:"semantic"|"hybrid"):string{
  const r=receipt.result
  if(receipt.status!=="succeeded"||!r||r.retrieval!==mode||!Array.isArray(r.items)||r.items.length>6)unavailable()
  const hits=r.items.map(x=>{
    if(!isUuid(x.base_id)||!ids.includes(x.base_id)||!isUuid(x.document_id)||!isUuid(x.chunk_id)||
      !Number.isSafeInteger(x.chunk_index)||x.chunk_index<0||typeof x.text!=="string"||typeof x.citation!=="string")unavailable()
    return {baseId:x.base_id,documentId:x.document_id,chunkId:x.chunk_id,chunkIndex:x.chunk_index,citation:cap(x.citation,200),snippet:cap(x.text,320)}
  })
  let output=""
  do{
    output=JSON.stringify({mode:"authorized_"+mode,request_id:receipt.request_id,hits})
    if(output.length<=4000&&Buffer.byteLength(output,"utf8")<=14336&&Buffer.byteLength(JSON.stringify({status:"succeeded",text:output}),"utf8")<=16384)return output
    hits.pop()
  }while(hits.length)
  return JSON.stringify({mode:"authorized_"+mode,request_id:receipt.request_id,hits:[]})
}
function pause(signal:AbortSignal):Promise<void>{return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(Error("knowledge_tool_aborted"));return}
  const finish=()=>{clearTimeout(timer);signal.removeEventListener("abort",abort);resolve()},abort=()=>{clearTimeout(timer);signal.removeEventListener("abort",abort);reject(Error("knowledge_tool_aborted"))},timer=setTimeout(finish,250)
  signal.addEventListener("abort",abort,{once:true})
})}
export async function executeKnowledgeTool(queries:KnowledgeQueryRepository,identity:Identity,owner:string,source:WorkflowV2ToolRequest,
  plan:{query:string;ids:string[];retrieval:KnowledgeRetrievalBinding},signal:AbortSignal):Promise<string>{
  const request_id=workflowKnowledgeQueryId(owner,source.claim.run_id,source.step_key),b=plan.retrieval
  if(signal.aborted)unavailable()
  // One SQL submission, no transport retry and no transaction across provider
  // I/O. The separate Query Worker/Broker alone owns the paid dispatch.
  await queries.submitExecution(identity,{request_id,base_ids:plan.ids,query:plan.query,mode:b.mode,limit:6,
    profile_id:b.profile_id,profile_revision:b.profile_revision,consent_revision:b.consent_revision,acknowledgement:QUERY_CHARGE_ACKNOWLEDGEMENT},source)
  for(let reads=0;reads<90;reads++){
    if(signal.aborted)unavailable()
    const receipt=await queries.get(identity,request_id)
    if(!receipt||receipt.request_id!==request_id)unavailable()
    if(receipt.status==="succeeded")return knowledgeToolEvidence(receipt,plan.ids,b.mode)
    if(!["prepared","dispatched"].includes(receipt.status))unavailable()
    await pause(signal)
  }
  unavailable()
}
