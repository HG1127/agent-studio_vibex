import {createHash} from "node:crypto"
import {isUuid,type SqlClient} from "./contracts.ts"
import {knowledgeAgentInstalled} from "./knowledge-agent-audit.ts"
import {gatherAgentKnowledgeEvidence,knowledgeSearchTerm,type AgentKnowledgeEvidence} from "./agent-knowledge-grounding.ts"
import type {ModelInput} from "./model-provider.ts"
type Claim={run_id:string;id:string;lease_token:string;lease_version:number|string;lease_owner:string}
async function installed(db:SqlClient){
  if(!await knowledgeAgentInstalled(db))return false
  const row=(await db.query<{complete:boolean}>("SELECT to_regclass('agentstudio.knowledge_agent_observations') IS NOT NULL AND "+
    "to_regprocedure('agentstudio.knowledge_agent_prepare(jsonb,uuid[],text)') IS NOT NULL AND "+
    "to_regprocedure('agentstudio.knowledge_agent_seal(uuid,text,jsonb)') IS NOT NULL AND "+
    "to_regprocedure('agentstudio.knowledge_agent_validate_input(uuid,text,jsonb)') IS NOT NULL AND "+
    "to_regprocedure('agentstudio.knowledge_agent_validate_run(uuid)') IS NOT NULL AS complete")).rows[0]
  if(row?.complete!==true)throw Error("agent_observation_schema_incomplete")
  return true
}
export async function gatherSingleAgentEvidence(db:SqlClient,owner:string,ids:unknown,tools:unknown,instruction:string,claim:Claim):Promise<AgentKnowledgeEvidence[]>{
  // Only completely absent old isolated stages retain their historical path.
  if(!await installed(db))return gatherAgentKnowledgeEvidence(db,owner,ids,tools,instruction)
  if(!isUuid(owner)||!Array.isArray(ids)||ids.length>3||ids.some(id=>!isUuid(id))||new Set(ids).size!==ids.length||
    !Array.isArray(tools)||tools.some(x=>typeof x!=="string")||ids.length&&!tools.includes("knowledge_search"))throw Error("invalid_agent_knowledge_scope")
  const source={run_id:claim.run_id,job_id:claim.id,lease_sha256:createHash("sha256").update(claim.lease_token).digest("hex"),
    lease_version:Number(claim.lease_version),lease_owner:claim.lease_owner}
  const hits=(await db.query<{hits:unknown}>("SELECT agentstudio.knowledge_agent_prepare($1::jsonb,$2::uuid[],$3::text) AS hits",
    [JSON.stringify(source),ids,ids.length?knowledgeSearchTerm(instruction):""])).rows[0]?.hits
  if(!Array.isArray(hits)||hits.length>6||hits.some(hit=>!hit||typeof hit!=="object"||Array.isArray(hit)||
    Object.keys(hit).sort().join(",")!=="baseId,chunkIndex,citation,documentId,snippet"||!ids.includes(hit.baseId)||!isUuid(hit.documentId)||
    !Number.isSafeInteger(hit.chunkIndex)||hit.chunkIndex<0||typeof hit.citation!=="string"||!hit.citation||Array.from(hit.citation).length>220||
    /[\u0000-\u001f\u007f]/u.test(hit.citation)||typeof hit.snippet!=="string"||!hit.snippet||Array.from(hit.snippet).length>320||hit.snippet.includes("\0")))
    throw Error("untrusted_agent_observation_evidence")
  return hits
}
export async function sealSingleAgentEvidence(db:SqlClient,run:string,sha:string,input:ModelInput){
  if(!await installed(db))return
  const row=(await db.query<{ok:boolean}>("SELECT agentstudio.knowledge_agent_seal($1::uuid,$2::text,$3::jsonb) AS ok",
    [run,sha,JSON.stringify(input.knowledgeEvidence??[])])).rows[0]
  if(row?.ok!==true)throw Error("agent_observation_seal_rejected")
}
export async function requireCurrentSingleAgentInput(db:SqlClient,run:string,sha:string|undefined,input:ModelInput|undefined){
  if(!await installed(db))return
  if(!sha||!input)throw Error("agent_observation_input_required")
  const row=(await db.query<{ok:boolean}>("SELECT agentstudio.knowledge_agent_validate_input($1::uuid,$2::text,$3::jsonb) AS ok",
    [run,sha,JSON.stringify(input.knowledgeEvidence??[])])).rows[0]
  if(row?.ok!==true)throw Error("agent_observation_source_changed")
}
export async function currentSingleAgentOutputs(db:SqlClient,run:string):Promise<boolean|undefined>{
  if(!await installed(db))return undefined
  const row=(await db.query<{ok:boolean}>("SELECT agentstudio.knowledge_agent_validate_run($1::uuid) AS ok",[run])).rows[0]
  return row?.ok===true
}
