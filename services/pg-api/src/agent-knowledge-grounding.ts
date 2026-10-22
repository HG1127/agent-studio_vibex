// Restricted, deterministic PG-native Agent knowledge grounding.
//
// The Model Worker calls this ONLY after the run and approval have passed
// owner/lease checks and SET LOCAL ROLE agentstudio_api has been established.
// It returns bounded plain-text citations from indexed, owner-private chunks.
// No network, provider, embedding generation, model calls, queue or writes.
import {isUuid,type SqlClient} from "./contracts.ts"

export interface AgentKnowledgeEvidence {
  baseId:string
  documentId:string
  chunkIndex:number
  citation:string
  snippet:string
}
export function knowledgeSearchTerm(instruction:string):string {
  if(typeof instruction!=="string"||instruction.length>1200||
     instruction.includes("\u0000"))
    throw Error("invalid_agent_knowledge_query")
  // Explicit syntax gives the user deterministic control over literal search.
  // No semantic or keyword-expansion claims. Absent a marker, use a bounded
  // leading phrase from the instruction, with no external retrieval.
  const marker=/(?:知识检索|检索词|检索关键词|Search KB)\s*[:：]\s*(.{2,80})/iu.exec(instruction)
  const raw=(marker?.[1]??instruction).split(/[\r\n。；;!?！？]/u)[0]?.trim()??""
  const query=raw.slice(0,80).trim()
  if(query.length<2)throw Error("invalid_agent_knowledge_query")
  return query
}
function validEvidence(row:{
  document_id:unknown;filename:unknown;chunk_index:unknown;snippet:unknown
}):row is {document_id:string;filename:string;chunk_index:number;snippet:string}{
  return isUuid(row.document_id)&&typeof row.filename==="string"&&
    row.filename.length>=1&&row.filename.length<=120&&
    !/[\r\n\u0000-\u001f\u007f]/u.test(row.filename)&&
    Number.isSafeInteger(Number(row.chunk_index))&&Number(row.chunk_index)>=0&&
    typeof row.snippet==="string"&&row.snippet.length>0&&
    row.snippet.length<=320&&!row.snippet.includes("\u0000")
}
export async function gatherAgentKnowledgeEvidence(
  db:SqlClient,ownerId:string,ids:unknown,tools:unknown,
  instruction:string,
):Promise<AgentKnowledgeEvidence[]> {
  if(!isUuid(ownerId)||!Array.isArray(ids)||ids.length>3||
     ids.some(id=>!isUuid(id))||new Set(ids).size!==ids.length||
     !Array.isArray(tools)||tools.some(x=>typeof x!=="string"))
    throw Error("invalid_agent_knowledge_scope")
  if(ids.length===0)return []
  if(!tools.includes("knowledge_search"))throw Error("unapproved_knowledge_tool")
  return gatherPrivateKnowledgeEvidence(db,ownerId,ids,knowledgeSearchTerm(instruction))
}
// Literal owner-private lookup for explicit Tool queries. Unlike Agent phrase
// extraction, a one-character query remains exactly the approved query.
export async function gatherPrivateKnowledgeEvidence(db:SqlClient,ownerId:string,ids:string[],query:string):Promise<AgentKnowledgeEvidence[]>{
  if(!isUuid(ownerId)||!Array.isArray(ids)||ids.length>3||new Set(ids).size!==ids.length||ids.some(id=>!isUuid(id))||
     typeof query!=="string"||!query.trim()||query.length>80||query.includes("\0"))throw Error("invalid_private_knowledge_query")
  const visible=await db.query<{id:string}>(
    "SELECT id FROM agentstudio.knowledge_bases "+
    "WHERE owner_user_id=$1::uuid AND id=ANY($2::uuid[]) "+
    "AND visibility='private'",[ownerId,ids])
  if(visible.rows.length!==ids.length||
     visible.rows.some(item=>!ids.includes(item.id)))
    throw Error("agent_knowledge_scope_revoked")
  const evidence:AgentKnowledgeEvidence[]=[]
  for(const baseId of ids){
    const result=await db.query<{
      document_id:unknown;filename:unknown;chunk_index:unknown;snippet:unknown
    }>(
      "SELECT c.document_id,d.filename,c.chunk_index,"+
      "substring(c.text_content FROM "+
      "greatest(1,strpos(lower(c.text_content),lower($3::text))-85) FOR 300) "+
      "AS snippet "+
      "FROM agentstudio.knowledge_chunks AS c "+
      "JOIN agentstudio.knowledge_documents AS d "+
      "ON d.id=c.document_id AND d.owner_user_id=c.owner_user_id "+
      "WHERE c.owner_user_id=$2::uuid AND d.owner_user_id=$2::uuid "+
      "AND d.base_id=$1::uuid AND d.status='indexed' "+
      "AND strpos(lower(c.text_content),lower($3::text))>0 "+
      "ORDER BY d.created_at DESC,c.chunk_index,c.id LIMIT 2",
      [baseId,ownerId,query])
    for(const row of result.rows){
      if(!validEvidence(row))
        throw Error("untrusted_agent_knowledge_evidence")
      evidence.push({
        baseId,documentId:row.document_id,
        chunkIndex:Number(row.chunk_index),
        citation:row.filename+"#chunk-"+String(Number(row.chunk_index)),
        snippet:row.snippet
      })
    }
  }
  return evidence
}
