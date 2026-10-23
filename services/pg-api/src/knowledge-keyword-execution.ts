// Private approved Tool adapter. Free literal lookup never uses embedding gates.
import {isUuid,type SqlClient} from "./contracts.ts"
import {gatherAuthorizedKnowledgeEvidence,type AgentKnowledgeEvidence} from "./agent-knowledge-grounding.ts"
import {knowledgeExecutionSource} from "./knowledge-execution-source.ts"
import type {WorkflowV2ToolRequest} from "./workflow-v2-tool-contract.ts"
export async function gatherWorkflowKeywordEvidence(db:SqlClient,owner:string,ids:string[],query:string,request:WorkflowV2ToolRequest):Promise<{hits:AgentKnowledgeEvidence[];recorded:boolean}>{
  const schema=(await db.query<{ledger:boolean;helper:boolean;footprint:boolean}>(
    "SELECT to_regclass('agentstudio.knowledge_keyword_observations') IS NOT NULL AS ledger,"+
    "to_regprocedure('agentstudio.knowledge_keyword_submit(uuid[],text,jsonb)') IS NOT NULL AS helper,"+
    "EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='agentstudio_knowledge_keyword') OR "+
    "EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace "+
    "WHERE n.nspname='agentstudio' AND starts_with(p.proname,'knowledge_keyword_')) AS footprint")).rows[0]
  // Older isolated migration stages keep their existing literal adapter. A
  // partial new installation may never fall back and omit its source record.
  if(schema?.ledger===false&&schema.helper===false&&schema.footprint===false)
    return {hits:await gatherAuthorizedKnowledgeEvidence(db,owner,ids,query),recorded:false}
  if(!schema?.ledger||!schema.helper||!schema.footprint)throw Error("keyword_observation_schema_incomplete")
  const hits=(await db.query<{hits:unknown}>("SELECT agentstudio.knowledge_keyword_submit($1::uuid[],$2::text,$3::jsonb) AS hits",
    [ids,query,JSON.stringify(knowledgeExecutionSource(request))])).rows[0]?.hits
  if(!Array.isArray(hits)||hits.length>6||hits.some(hit=>!hit||typeof hit!=="object"||Array.isArray(hit)||
    Object.keys(hit).sort().join(",")!=="baseId,chunkIndex,citation,documentId,snippet"||!ids.includes(hit.baseId)||!isUuid(hit.documentId)||
    !Number.isSafeInteger(hit.chunkIndex)||hit.chunkIndex<0||typeof hit.citation!=="string"||Array.from(hit.citation).length>220||
    /[\u0000-\u001f\u007f]/u.test(hit.citation)||typeof hit.snippet!=="string"||!hit.snippet||Array.from(hit.snippet).length>320||hit.snippet.includes("\0")))
    throw Error("untrusted_keyword_observation_evidence")
  return {hits,recorded:true}
}
export async function requireCurrentKeywordStep(db:SqlClient,request:WorkflowV2ToolRequest):Promise<void>{
  const row=(await db.query<{ok:boolean}>("SELECT agentstudio.knowledge_keyword_step_current($1::uuid,$2::text,$3::text) AS ok",
    [request.claim.run_id,request.step_key,request.input_sha256])).rows[0]
  if(row?.ok!==true)throw Error("keyword_observation_content_changed")
}
