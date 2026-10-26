import { HttpError, isUuid, type Identity, type SqlPool, type SqlClient,
  type AgentSpecInput } from "./contracts.ts"
import {exactProviderEndpoint} from "./model-connection-probe.ts"
import {parseAgentHttpTools} from "./agent-http-tools.ts"
import {resolveAgentMcpTools} from "./mcp-binding-resources.ts"
import {verifyOptionalCredentialBoundary} from "./optional-credential-boundary.ts"
import {applyKnowledgeScope} from "./knowledge-scope-policy.ts"
import {requireKnowledgeScope} from "./knowledge-runtime-scope.ts"
import {verifyKnowledgeRetrievalBinding} from "./knowledge-retrieval-policy.ts"

/**
 * Every employee query is in one transaction:
 *   verified JWT -> map active issuer/sub -> SET LOCAL RLS actor -> DML
 * SET LOCAL never persists across reused pooled connections.
 * The database login must be NONSUPERUSER / NOBYPASSRLS and allowed SET ROLE.
 */
// Reuse the caller's transaction for compound admissions such as a schedule
// occurrence + run + queue + audit. This function never commits or rolls back.
export async function withActorClient<T>(client:SqlClient,pool:SqlPool,identity:Identity,
  body:(client:SqlClient,actor:string)=>Promise<T>):Promise<T>{
  if(!identity?.issuer||!identity.subject)throw new HttpError(401,"invalid_identity")
  await applyKnowledgeScope(client,pool)
  await client.query("SET LOCAL ROLE agentstudio_api")
  const actor=(await client.query<{id:string|null}>("SELECT agentstudio.identity_user_id($1::text,$2::text) AS id",[identity.issuer,identity.subject])).rows[0]?.id
  if(!isUuid(actor))throw new HttpError(403,"employee_not_provisioned")
  await client.query("SELECT set_config('agentstudio.actor_id',$1::text,true)",[actor])
  return await body(client,actor)
}
export async function assertOwnedAdmissionContext(db:SqlClient,owner:string,plannedRunId?:string):Promise<void>{
  if(!isUuid(owner)||plannedRunId!==undefined&&!isUuid(plannedRunId))throw new HttpError(400,"invalid_owned_admission")
  const context=(await db.query<{ok:boolean}>("SELECT current_user='agentstudio_api' AND agentstudio.actor_id()=$1::uuid AS ok",[owner])).rows[0]
  if(context?.ok!==true)throw new HttpError(403,"owned_admission_context_required")
}

export async function withActor<T>(
  pool: SqlPool, identity: Identity,
  body: (client: SqlClient, actor: string)=>Promise<T>,
): Promise<T> {
  if(!identity || !identity.issuer || !identity.subject)
    throw new HttpError(401,"invalid_identity")
  const client=await pool.connect()
  let begun=false
  try {
    await client.query("BEGIN")
    begun=true
    const value=await withActorClient(client,pool,identity,body)
    await client.query("COMMIT")
    begun=false
    return value
  } catch(error) {
    if(begun)await client.query("ROLLBACK").catch(()=>undefined)
    throw error
  } finally {
    client.release()
  }
}

export interface SpecRow {
  id:string
  owner_user_id:string
  name:string
  spec:AgentSpecInput
  revision:number
  created_at:string
  updated_at:string
}

// node-postgres returns PostgreSQL BIGINT columns (such as revision) as
// strings by default. Do not allow that to break optimistic locking in JSON
// clients; reject values outside JavaScript safe integer range.
function toSpecRow(row:SpecRow):SpecRow {
  const revision=Number(row.revision)
  if(!Number.isSafeInteger(revision) || revision<1)
    throw new Error("invalid_persisted_revision")
  return {...row,revision}
}


// Resolve *all* selected KB IDs inside the same verified owner transaction.
// A non-existent, unshared or another employee\'s KB cannot enter the spec.
async function verifyKnowledgeSelection(db:SqlClient,actor:string,
  spec:AgentSpecInput):Promise<void>{
  await verifyKnowledgeRetrievalBinding(db,spec.knowledge_retrieval)
  const ids=spec.knowledge_base_ids??[]
  if(!Array.isArray(ids)||ids.length>3||
     ids.some(id=>!isUuid(id))||new Set(ids).size!==ids.length||
     (ids.length>0&&!spec.tools.includes("knowledge_search")))
    throw new HttpError(400,"invalid_agent_knowledge_scope")
  if(!ids.length)return
  await requireKnowledgeScope(db,actor,ids)
}

// Bind an Agent to a model through an owner-scoped PostgreSQL SELECT.
// Only a reference and revision are saved in the Agent spec: never a key,
// encryption envelope, arbitrary URL or browser-controlled user ID.
async function verifyModelBinding(db:SqlClient,actor:string,
  spec:AgentSpecInput):Promise<void>{
  const binding=spec.model_binding
  if(!binding)return
  const result=await db.query<{
    revision:string|number;enabled:boolean;status:string
    models:string[]|string;provider:"openai"|"anthropic"|"gemini"
    base_url:string
  }>("SELECT revision,enabled,status,models,provider,base_url "+
    "FROM agentstudio.model_connections WHERE id=$1::uuid "+
    "AND owner_user_id=$2::uuid",[binding.connection_id,actor])
  const row=result.rows[0]
  if(!row)throw new HttpError(404,"model_connection_not_found")
  if(Number(row.revision)!==binding.connection_revision)
    throw new HttpError(409,"model_connection_revision_changed")
  if(!row.enabled||row.status!=="ok")
    throw new HttpError(409,"model_connection_not_ready")
  let models:unknown=row.models
  if(typeof models==="string"){
    try{models=JSON.parse(models)}catch{models=[]}
  }
  if(!Array.isArray(models)||!models.includes(binding.model_id))
    throw new HttpError(409,"model_not_in_connection")
  try{exactProviderEndpoint(row)}
  catch{throw new HttpError(409,"model_provider_not_allowlisted")}
}

// All full-configuration writes, including historical restoration, must
// re-resolve current resources under the verified owner's transaction.
export async function verifyAgentSpecResources(db:SqlClient,actor:string,spec:AgentSpecInput):Promise<void>{
  await verifyKnowledgeSelection(db,actor,spec)
  await verifyModelBinding(db,actor,spec)
  await verifyAgentHttpTools(db,actor,spec)
  await resolveAgentMcpTools(db,actor,spec.mcp_tools,true)
}

export class AgentSpecRepository {
  readonly pool:SqlPool
  constructor(pool:SqlPool) {this.pool=pool}
  list(identity:Identity,limit=30):Promise<SpecRow[]> {
    const bounded=Math.max(1,Math.min(50,Math.trunc(limit)))
    return withActor(this.pool,identity,async (db,actor)=>{
      const result=await db.query<SpecRow>(
        "SELECT id,owner_user_id,name,spec,revision,created_at,updated_at "+
        "FROM agentstudio.agent_specs WHERE owner_user_id=$1::uuid "+
        "ORDER BY updated_at DESC,id LIMIT $2::int",
        [actor,bounded],
      )
      return result.rows.map(toSpecRow)
    })
  }
  get(identity:Identity,id:string):Promise<SpecRow|null> {
    if(!isUuid(id))throw new HttpError(400,"invalid_spec_id")
    return withActor(this.pool,identity,async (db,actor)=>{
      const result=await db.query<SpecRow>(
        "SELECT id,owner_user_id,name,spec,revision,created_at,updated_at "+
        "FROM agentstudio.agent_specs WHERE id=$1::uuid AND owner_user_id=$2::uuid",
        [id,actor],
      )
      return result.rows[0]?toSpecRow(result.rows[0]):null
    })
  }
  create(identity:Identity,name:string,spec:AgentSpecInput):Promise<SpecRow> {
    return withActor(this.pool,identity,async (db,actor)=>{
      await verifyAgentSpecResources(db,actor,spec)
      const result=await db.query<SpecRow>(
        "INSERT INTO agentstudio.agent_specs "+
        "(owner_user_id,name,spec,requires_approval) "+
        "VALUES($1::uuid,$2::text,$3::jsonb,true) "+
        "RETURNING id,owner_user_id,name,spec,revision,created_at,updated_at",
        [actor,name,JSON.stringify(spec)],
      )
      if(!result.rows[0])throw new Error("insert_returned_no_rows")
      return toSpecRow(result.rows[0])
    })
  }
  update(identity:Identity,id:string,name:string,spec:AgentSpecInput,revision:number):
    Promise<SpecRow|null> {
    if(!isUuid(id))throw new HttpError(400,"invalid_spec_id")
    if(!Number.isSafeInteger(revision) || revision<1)
      throw new HttpError(400,"invalid_revision")
    return withActor(this.pool,identity,async (db,actor)=>{
      await verifyAgentSpecResources(db,actor,spec)
      const result=await db.query<SpecRow>(
        "UPDATE agentstudio.agent_specs "+
        "SET name=$3::text,spec=$4::jsonb,requires_approval=true,"+
        "revision=revision+1,updated_at=now() "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND revision=$5::bigint "+
        "RETURNING id,owner_user_id,name,spec,revision,created_at,updated_at",
        [id,actor,name,JSON.stringify(spec),revision],
      )
      return result.rows[0]?toSpecRow(result.rows[0]):null
    })
  }
}

export async function verifyAgentHttpTools(db:SqlClient,actor:string,spec:AgentSpecInput):Promise<void>{
  let tools
  try{tools=parseAgentHttpTools(spec.http_tools)}catch{throw new HttpError(400,"invalid_agent_http_tools")}
  if(tools.some(tool=>!spec.tools.includes(tool.name)))throw new HttpError(400,"invalid_agent_http_tools")
  // Stable lock order, including specs that list the same resources differently.
  for(const tool of [...tools].sort((a,b)=>a.connection_id.localeCompare(b.connection_id))){
    const row=(await db.query<{revision:number|string;enabled:boolean}>(
      "SELECT revision,enabled FROM agentstudio.tool_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",
      [tool.connection_id,actor])).rows[0]
    if(!row)throw new HttpError(404,"tool_connection_not_found")
    if(Number(row.revision)!==tool.connection_revision)throw new HttpError(409,"tool_connection_revision_changed")
    if(row.enabled!==true)throw new HttpError(409,"tool_connection_not_ready")
  }
}

/** Refuse admin/superuser pools at service startup, even on staging. */
export async function verifyDatabaseRole(pool:SqlPool):Promise<void> {
  const client=await pool.connect()
  try{
    const roles=await client.query<{username:string;admin:boolean;bypass:boolean}>(
      "SELECT session_user AS username,rolsuper AS admin,rolbypassrls AS bypass "+
      "FROM pg_roles WHERE rolname=session_user",
    )
    const role=roles.rows[0]
    if(!role || role.admin || role.bypass || role.username==="agentstudio_admin")
      throw new Error("unsafe_database_role")
    await client.query("BEGIN READ ONLY")
    try {
      await client.query("SET LOCAL ROLE agentstudio_api")
      const roleResult=await client.query<{name:string}>(
        "SELECT current_user AS name",
      )
      if(roleResult.rows[0]?.name!=="agentstudio_api")
        throw new Error("database_api_role_unavailable")
      await verifyOptionalCredentialBoundary(client,"api")
    } finally {await client.query("ROLLBACK")}
  } finally {client.release()}
}
