// Only a dedicated, non-Worker PostgreSQL login that can SET ROLE
// agentstudio_model_broker may run this owner-scoped secret read transaction.
// A regular API or Worker login cannot join the Broker role in production.
// Never export a public handler for this primitive.
import {HttpError,isUuid,type Identity,type SqlClient,type SqlPool}
  from "./contracts.ts"

export async function withModelBrokerActor<T>(
  pool:SqlPool,identity:Identity,
  body:(client:SqlClient,actor:string)=>Promise<T>,
):Promise<T>{
  if(!identity?.issuer||!identity.subject)
    throw new HttpError(401,"invalid_identity")
  const db=await pool.connect()
  let active=false
  try{
    await db.query("BEGIN")
    active=true
    await db.query("SET LOCAL ROLE agentstudio_model_broker")
    const current=await db.query<{role:string}>("SELECT current_user AS role")
    if(current.rows[0]?.role!=="agentstudio_model_broker")
      throw new HttpError(503,"credential_broker_unavailable")
    const identityResult=await db.query<{id:string|null}>(
      "SELECT agentstudio.identity_user_id($1::text,$2::text) AS id",
      [identity.issuer,identity.subject])
    const actor=identityResult.rows[0]?.id
    if(!isUuid(actor))throw new HttpError(403,"employee_not_provisioned")
    await db.query(
      "SELECT set_config('agentstudio.actor_id',$1::text,true)",[actor])
    const value=await body(db,actor)
    await db.query("COMMIT")
    active=false
    return value
  }catch(error){
    if(active)await db.query("ROLLBACK").catch(()=>undefined)
    // Do not echo login names, SQL privileges or credentials.
    if(error instanceof HttpError)throw error
    throw new HttpError(503,"credential_broker_unavailable")
  }finally{db.release()}
}
