import { HttpError, isUuid, type Identity, type SqlPool, type SqlClient,
  type AgentSpecInput } from "./contracts.ts"

/**
 * Every employee query is in one transaction:
 *   verified JWT -> map active issuer/sub -> SET LOCAL RLS actor -> DML
 * SET LOCAL never persists across reused pooled connections.
 * The database login must be NONSUPERUSER / NOBYPASSRLS and allowed SET ROLE.
 */
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
    await client.query("SET LOCAL ROLE agentstudio_api")
    const result=await client.query<{id:string|null}>(
      "SELECT agentstudio.identity_user_id($1::text,$2::text) AS id",
      [identity.issuer,identity.subject],
    )
    const actor=result.rows[0]?.id
    if(!isUuid(actor))throw new HttpError(403,"employee_not_provisioned")
    await client.query(
      "SELECT set_config('agentstudio.actor_id',$1::text,true)",
      [actor],
    )
    const value=await body(client,actor)
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
    await client.query("BEGIN")
    try {
      await client.query("SET LOCAL ROLE agentstudio_api")
      const roleResult=await client.query<{name:string}>(
        "SELECT current_user AS name",
      )
      if(roleResult.rows[0]?.name!=="agentstudio_api")
        throw new Error("database_api_role_unavailable")
    } finally {await client.query("ROLLBACK")}
  } finally {client.release()}
}
