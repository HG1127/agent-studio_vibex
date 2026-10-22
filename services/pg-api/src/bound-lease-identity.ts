// Internal, read-only PostgreSQL lease->employee identity resolution.
// No HTTP listener, TLS bypass, Worker registration, credential decryption or
// paid model call. A future mutually authenticated dispatch service must use
// an independently provisioned, NONSUPERUSER login with SET ROLE permission
// only for agentstudio_bound_dispatch. This must NEVER run under V7/8090.
import {HttpError,type Identity,type SqlPool} from "./contracts.ts"
import {safeBoundModelClaim,type BoundModelClaim,
  type BoundModelDispatchResult,type OwnerBoundModelDispatch} from "./owner-model-dispatch.ts"
import type {ModelInput} from "./model-provider.ts"

function unavailable():never{
  throw new HttpError(503,"bound_dispatch_identity_unavailable")
}
export class BoundLeaseIdentityRepository{
  readonly pool:SqlPool
  constructor(pool:SqlPool){this.pool=pool}
  async resolve(raw:unknown):Promise<Identity>{
    const claim=safeBoundModelClaim(raw)
    const db=await this.pool.connect()
    let started=false
    try{
      // This service is *not* entitled to the API, Worker or model-secret
      // Broker group. It can call only a SECURITY DEFINER function returning
      // the issuer/sub of an ACTIVE, approved, still-leased owner-bound run.
      await db.query("BEGIN READ ONLY")
      started=true
      await db.query("SET LOCAL ROLE agentstudio_bound_dispatch")
      const role=await db.query<{role:string}>("SELECT current_user AS role")
      if(role.rows[0]?.role!=="agentstudio_bound_dispatch")unavailable()
      const rows=await db.query<{issuer:string;subject:string}>(
        "SELECT issuer,subject FROM agentstudio.bound_model_lease_identity("+
        "$1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::text)",
        [claim.run_id,claim.job_id,claim.lease_token,
          claim.lease_version,claim.lease_owner])
      if(rows.rows.length!==1)throw new HttpError(403,"bound_dispatch_lease_invalid")
      const identity=rows.rows[0]!
      if(typeof identity.issuer!=="string"||
        identity.issuer.length<1||identity.issuer.length>2048||
        typeof identity.subject!=="string"||
        identity.subject.length<1||identity.subject.length>512||
        /[\u0000-\u001f\u007f]/u.test(identity.issuer+identity.subject))
        unavailable()
      await db.query("COMMIT")
      started=false
      return {issuer:identity.issuer,subject:identity.subject}
    }catch(error){
      if(started)await db.query("ROLLBACK").catch(()=>undefined)
      // Database/permission errors must never leak SQL, role details or a
      // guessed employee. A nonexistent or revoked lease remains forbidden.
      if(error instanceof HttpError&&error.code==="bound_dispatch_lease_invalid")
        throw error
      unavailable()
    }finally{db.release()}
  }
}

// Only an internal, previously mTLS-authenticated gateway may construct this
// adapter. Never attach it to public createHandler/native-server routes.
// The model Broker STILL revalidates lease/owner/approval/fingerprint inside
// the transaction before reserving any non-replayable external provider POST.
export function createVerifiedBoundDispatchAdapter(
  identityRepository:BoundLeaseIdentityRepository,
  broker:Pick<OwnerBoundModelDispatch,"dispatch">
):(claim:BoundModelClaim,input:ModelInput)=>Promise<BoundModelDispatchResult>{
  if(!identityRepository||!broker||typeof broker.dispatch!=="function")
    throw Error("bound_dispatch_dependencies_unavailable")
  return async(claim,input)=>{
    const identity=await identityRepository.resolve(claim)
    return broker.dispatch(identity,claim,input)
  }
}
