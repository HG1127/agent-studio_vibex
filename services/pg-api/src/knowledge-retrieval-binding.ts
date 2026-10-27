// Browser-safe frozen retrieval policy. Provider-generated tool arguments may
// contain the query only; identity, billing profile and mode belong to the spec.
export interface KnowledgeRetrievalBinding {
  mode:"semantic"|"hybrid";profile_id:string;profile_revision:number;consent_revision:number
}
export const KNOWLEDGE_TOOL_CHARGE_ACKNOWLEDGEMENT="PAY_ONCE_FOR_THIS_APPROVED_KNOWLEDGE_TOOL" as const
export function parseKnowledgeRetrievalBinding(raw:unknown):KnowledgeRetrievalBinding|undefined{
  if(raw===undefined)return undefined
  const fail=():never=>{throw Error("invalid_knowledge_retrieval_binding")}
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))fail()
  const x=raw as Record<string,unknown>
  if(Object.keys(x).length!==4||Object.keys(x).some(k=>!["mode","profile_id","profile_revision","consent_revision"].includes(k))||
    (x.mode!=="semantic"&&x.mode!=="hybrid")||typeof x.profile_id!=="string"||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x.profile_id)||
    !Number.isSafeInteger(x.profile_revision)||(x.profile_revision as number)<1||!Number.isSafeInteger(x.consent_revision)||(x.consent_revision as number)<1)fail()
  return {mode:x.mode as "semantic"|"hybrid",profile_id:(x.profile_id as string).toLowerCase(),profile_revision:x.profile_revision as number,consent_revision:x.consent_revision as number}
}
