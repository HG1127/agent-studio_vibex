import {HttpError,isUuid,type SqlClient} from "./contracts.ts"
import {sharedKnowledgeScopeEnabled} from "./knowledge-scope-policy.ts"
export interface AuthorizedKnowledgeBase {base_id:string;owner_user_id:string;access_role:"owner"|"viewer"|"editor"}
export function storedKnowledgeIds(raw:unknown):string[]{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new HttpError(409,"invalid_stored_knowledge_scope")
  const spec=raw as Record<string,unknown>,ids=spec.knowledge_base_ids??[]
  if(!Array.isArray(ids)||ids.length>3||ids.some(id=>!isUuid(id))||new Set(ids.map(id=>String(id).toLowerCase())).size!==ids.length||
     ids.length&&(!Array.isArray(spec.tools)||!spec.tools.includes("knowledge_search")))throw new HttpError(409,"invalid_stored_knowledge_scope")
  return ids.map(id=>String(id).toLowerCase())
}
export async function requireKnowledgeScope(db:SqlClient,actor:string,ids:readonly string[]):Promise<AuthorizedKnowledgeBase[]>{
  if(!isUuid(actor)||!Array.isArray(ids)||ids.length>3||ids.some(id=>!isUuid(id))||new Set(ids.map(id=>id.toLowerCase())).size!==ids.length)
    throw new HttpError(400,"invalid_agent_knowledge_scope")
  if(!ids.length)return []
  const normalized=ids.map(id=>id.toLowerCase())
  const shared=await sharedKnowledgeScopeEnabled(db)
  if(shared&&(await db.query<{matches:boolean}>("SELECT agentstudio.actor_id()=$1::uuid AS matches",[actor])).rows[0]?.matches!==true)
    throw new HttpError(403,"knowledge_actor_mismatch")
  let rows:AuthorizedKnowledgeBase[]
  try{rows=shared?(await db.query<AuthorizedKnowledgeBase>("SELECT * FROM agentstudio.knowledge_runtime_scope($1::uuid[])",[normalized])).rows:
    (await db.query<{id:string}>("SELECT id FROM agentstudio.knowledge_bases WHERE owner_user_id=$1::uuid AND id=ANY($2::uuid[]) AND visibility='private'",[actor,normalized])).rows
      .map(row=>({base_id:row.id,owner_user_id:actor,access_role:"owner" as const}))
  }catch(error){
    if(error&&typeof error==="object"&&"code" in error&&error.code==="P0404")throw new HttpError(404,"knowledge_base_not_found")
    throw error
  }
  if(rows.length!==normalized.length||new Set(rows.map(row=>row.base_id)).size!==normalized.length||rows.some(row=>!normalized.includes(row.base_id)||!isUuid(row.owner_user_id)||!["owner","viewer","editor"].includes(row.access_role)))
    throw new HttpError(404,"knowledge_base_not_found")
  return rows
}
