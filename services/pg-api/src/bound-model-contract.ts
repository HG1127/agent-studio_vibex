// Shared bounded wire contract for the private Worker/Broker transport.
// Identity and credentials are always resolved by the Broker from the lease.
import {safeBoundModelClaim,type BoundModelClaim,type BoundModelDispatchResult}
  from "./owner-model-dispatch.ts"
import type {ModelInput} from "./model-provider.ts"
import {safeModelKnowledgeEvidence} from "./knowledge-evidence.ts"

export const boundModelRoute="/__internal/v1/bound-model/dispatch"
export const boundModelMaxRequestBytes=16384
function refuse():never{throw Error("invalid_internal_bound_dispatch_request")}
function validText(v:unknown,max:number,min=0):v is string{
  return typeof v==="string"&&v.length>=min&&v.length<=max&&
    !/[\u0000\u007f]/u.test(v)
}
function boundedStrings(input:unknown,maxCount:number,maxItem:number):input is string[]{
  return Array.isArray(input)&&input.length<=maxCount&&
    input.every(item=>validText(item,maxItem))
}
export function safeBoundModelRequest(value:unknown):{claim:BoundModelClaim;input:ModelInput}{
  if(!value||typeof value!=="object"||Array.isArray(value))refuse()
  const object=value as Record<string,unknown>
  if(Object.keys(object).length!==2||!Object.hasOwn(object,"claim")||
     !Object.hasOwn(object,"input"))refuse()
  let claim:BoundModelClaim
  try{claim=safeBoundModelClaim(object.claim)}catch{refuse()}
  const raw=object.input
  if(!raw||typeof raw!=="object"||Array.isArray(raw))refuse()
  const input=raw as Record<string,unknown>
  const expected=["goal","instruction","taskScope","deliverables","doneCriteria"]
  if(expected.some(k=>!Object.hasOwn(input,k))||
     Object.keys(input).some(k=>![...expected,"knowledgeEvidence"].includes(k))||
     !validText(input.goal,2000,1)||!validText(input.instruction,2000)||
     !validText(input.taskScope,2000)||
     !boundedStrings(input.deliverables,20,300)||
     !boundedStrings(input.doneCriteria,20,300))refuse()
  let evidence:ReturnType<typeof safeModelKnowledgeEvidence>
  try{evidence=safeModelKnowledgeEvidence(input.knowledgeEvidence)}catch{refuse()}
  return {claim,input:{...input,...(evidence===undefined?{}:{knowledgeEvidence:evidence})} as unknown as ModelInput}
}
export function safeBoundModelResult(raw:unknown):BoundModelDispatchResult{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))refuse()
  const value=raw as Record<string,unknown>
  if(Object.keys(value).length!==2||value.status!=="succeeded"||
     !validText(value.text,12000,1))refuse()
  return {status:"succeeded",text:value.text}
}
