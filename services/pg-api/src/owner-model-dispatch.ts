// Internal-only, API-role owner-scoped model dispatch reservation.
// This is NOT an HTTP endpoint and is NOT wired to the production Worker.
// The future Worker->API transport must authenticate the calling Worker
// independently (short-lived mutual auth) BEFORE calling this module.
// A single already-approved, leased model step can reserve at most one
// owner-bound paid POST; errors/ambiguous outcomes are never auto retried.
import {createHash} from "node:crypto"
import {HttpError,isUuid,type Identity,type SqlPool} from "./contracts.ts"
import {requireKnowledgeScope,storedKnowledgeIds} from "./knowledge-runtime-scope.ts"
import {withActor} from "./repository.ts"
import {withModelBrokerActor} from "./model-broker-actor.ts"
import {decryptModelSecret} from "./model-connection-crypto.ts"
import {exactProviderEndpoint} from "./model-connection-probe.ts"
import type {SelectedModelMaterial} from "./model-connection-executor.ts"
import type {ModelInput} from "./model-provider.ts"

export interface BoundModelClaim {
  run_id:string
  job_id:string
  lease_token:string
  lease_version:number
  lease_owner:string
}
export interface BoundModelDispatchResult {
  status:"succeeded"
  text:string
}
type Row={
  owner_user_id:string;run_id:string
  run_status:string;checkpoint:Record<string,unknown>
  spec_revision:number|string;spec:Record<string,unknown>
  payload:Record<string,unknown>
  approval_status:string;effect_status:string;arguments_sha256:string
}
type ModelSecretRow={
  revision:string|number;status:string;enabled:boolean
  provider:"openai"|"anthropic"|"gemini";base_url:string
  models:string[]|string
  api_key_ciphertext:Uint8Array;api_key_nonce:Uint8Array;api_key_tag:Uint8Array
}
function invalidClaim():never{throw new HttpError(400,"invalid_bound_model_claim")}
// JSONB reorders object keys on persist. Canonical fingerprints eliminate
// false mismatches while still detecting changed prompts, models or evidence.
function canonical(value:unknown):unknown{
  if(Array.isArray(value))return value.map(canonical)
  if(value!==null&&typeof value==="object"){
    const input=value as Record<string,unknown>
    return Object.fromEntries(Object.keys(input).sort().map(k=>[k,canonical(input[k])]))
  }
  return value
}
export function boundModelFingerprint(input:ModelInput,binding:unknown):string{
  const serialized=JSON.stringify(canonical({input,model_phase:"v9_bound",binding}))
  if(!serialized||Buffer.byteLength(serialized,"utf8")>32768)
    throw new HttpError(400,"bound_model_input_invalid")
  return createHash("sha256").update(serialized).digest("hex")
}
export function safeBoundModelClaim(raw:unknown):BoundModelClaim{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))invalidClaim()
  const value=raw as Record<string,unknown>
  const keys=["run_id","job_id","lease_token","lease_version","lease_owner"]
  if(Object.keys(value).length!==keys.length||
     keys.some(k=>!Object.hasOwn(value,k))||
     !isUuid(value.run_id)||!isUuid(value.job_id)||
     !isUuid(value.lease_token)||
     !Number.isSafeInteger(value.lease_version)||
     (value.lease_version as number)<1||
     typeof value.lease_owner!=="string"||
     !/^[A-Za-z0-9_-]{1,120}$/.test(value.lease_owner))
    invalidClaim()
  return value as unknown as BoundModelClaim
}
function safeModels(raw:string[]|string):string[]{
  let modelList:unknown=raw
  if(typeof modelList==="string"){
    try{modelList=JSON.parse(modelList)}catch{modelList=[]}
  }
  if(!Array.isArray(modelList)||modelList.some(v=>typeof v!=="string"))
    throw new HttpError(409,"bound_model_config_invalid")
  return modelList as string[]
}
export class OwnerBoundModelDispatch {
  readonly pool:SqlPool
  readonly brokerPool:SqlPool
  readonly encryptionKey:Buffer
  readonly executor:(material:SelectedModelMaterial,input:ModelInput)=>Promise<string>
  constructor(
    pool:SqlPool,
    key:Buffer,
    executor:(material:SelectedModelMaterial,input:ModelInput)=>Promise<string>,
    brokerPool:SqlPool=pool,
  ){
    if(!Buffer.isBuffer(key)||key.length!==32)
      throw Error("invalid_model_encryption_key")
    if(typeof executor!=="function")throw Error("bound_executor_missing")
    this.pool=pool
    this.encryptionKey=key
    // Live deployment needs a distinct authenticated broker login pool.
    // Default pool is isolated fixture convenience, not production fallback.
    this.brokerPool=brokerPool
    this.executor=executor
  }
  async dispatch(identity:Identity,claimInput:unknown,input:ModelInput):
    Promise<BoundModelDispatchResult>{
    const claim=safeBoundModelClaim(claimInput)
    // The lease, approval, model selection and effect must all be checked
    // inside a single owner-RLS transaction. Only then persist the one-time
    // dispatch marker BEFORE any external provider call.
    const materialRef=await withActor(this.pool,identity,async(db,owner)=>{
      const check=await db.query<Row>(
        "SELECT j.owner_user_id,j.run_id,j.payload,r.status AS run_status,"+
        "r.checkpoint,s.revision AS spec_revision,s.spec,"+
        "a.status AS approval_status,e.status AS effect_status,"+
        "e.arguments_sha256 FROM agentstudio.jobs j "+
        "JOIN agentstudio.runs r ON r.id=j.run_id AND r.owner_user_id=j.owner_user_id "+
        "JOIN agentstudio.agent_specs s ON s.id=r.agent_spec_id "+
        "AND s.owner_user_id=j.owner_user_id "+
        "JOIN agentstudio.approvals a ON a.run_id=r.id "+
        "AND a.owner_user_id=r.owner_user_id AND a.step_key='model' "+
        "JOIN agentstudio.external_effects e ON e.run_id=r.id "+
        "AND e.owner_user_id=r.owner_user_id AND e.step_key='model' "+
        "WHERE j.id=$1::uuid AND j.run_id=$2::uuid "+
        "AND j.owner_user_id=$3::uuid AND j.kind='run_tick' "+
        "AND j.status='leased' AND j.lease_token=$4::uuid "+
        "AND j.lease_version=$5::bigint AND j.lease_owner=$6::text "+
        "AND j.lease_until>clock_timestamp() AND j.payload->>'phase'='model' "+
        "FOR UPDATE OF j",
        [claim.job_id,claim.run_id,owner,claim.lease_token,
          claim.lease_version,claim.lease_owner])
      const row=check.rows[0]
      if(!row)throw new HttpError(409,"bound_model_lease_invalid")
      const version=Number(row.payload?.spec_revision)
      if(row.run_status!=="running"||
         row.checkpoint?.stage!=="model_running"||
         row.approval_status!=="approved"||
         row.effect_status!=="started"||
         !Number.isSafeInteger(version)||version<1||
         Number(row.checkpoint?.spec_revision)!==version||
         Number(row.spec_revision)!==version)
        throw new HttpError(409,"bound_model_approval_or_revision_invalid")
      const binding=row.spec?.model_binding as Record<string,unknown>|undefined
      const knowledgeIds=storedKnowledgeIds(row.spec)
      await requireKnowledgeScope(db,owner,knowledgeIds)
      if(!binding||typeof binding!=="object"||Array.isArray(binding)||
         Object.keys(binding).length!==3||
         !isUuid(binding.connection_id)||
         !Number.isSafeInteger(binding.connection_revision)||
         (binding.connection_revision as number)<1||
         typeof binding.model_id!=="string"||
         !/^[A-Za-z0-9._:/-]{1,120}$/.test(binding.model_id))
        throw new HttpError(409,"bound_model_selection_invalid")
      // Full input identity is asserted against the *durable* external
      // effect fingerprint. The broker must never accept a new prompt/URL
      // from a caller who happens to possess a Worker lease reference.
      const fingerprint=boundModelFingerprint(input,binding)
      if(row.arguments_sha256!==fingerprint)
        throw new HttpError(409,"bound_model_input_fingerprint_mismatch")
      const models=await db.query<Omit<ModelSecretRow,
        "api_key_ciphertext"|"api_key_nonce"|"api_key_tag">>(
        "SELECT revision,status,enabled,provider,base_url,models "+
        "FROM agentstudio.model_connections WHERE id=$1::uuid "+
        "AND owner_user_id=$2::uuid",
        [binding.connection_id,owner])
      const chosen=models.rows[0]
      if(!chosen)throw new HttpError(404,"model_connection_not_found")
      if(Number(chosen.revision)!==binding.connection_revision||
         chosen.enabled!==true||chosen.status!=="ok"||
         !safeModels(chosen.models).includes(binding.model_id))
        throw new HttpError(409,"bound_model_connection_changed")
      try{exactProviderEndpoint(chosen)}
      catch{throw new HttpError(409,"bound_model_provider_not_allowed")}
      // Existing external_effects PK(run_id, step_key) and idempotency_key
      // unique constraint reserve a separate one-shot dispatch. Even two
      // concurrent API instances cannot send the same paid POST twice.
      // No DML is retried after a duplicate or ambiguous provider outcome.
      const reserved=await db.query<{run_id:string}>(
        "INSERT INTO agentstudio.external_effects "+
        "(run_id,owner_user_id,step_key,tool_name,arguments_sha256,"+
        "idempotency_key,status) VALUES "+
        "($1::uuid,$2::uuid,'model_bound_dispatch',"+
        "'model.owner_bound_generate',$3::text,$4::text,'started') "+
        "ON CONFLICT DO NOTHING RETURNING run_id",
        [claim.run_id,owner,fingerprint,"bound-dispatch:"+claim.run_id])
      if(reserved.rows.length!==1)
        throw new HttpError(409,"bound_model_already_dispatched")
      return {
        connection_id:binding.connection_id,
        connection_revision:binding.connection_revision as number,
        model_id:binding.model_id as string,
        provider:chosen.provider,base_url:chosen.base_url,
        knowledgeIds,
      }
    })
    // The API login has no SELECT on ciphertext columns, and the Worker
    // cannot SET ROLE broker. Use a separately authenticated broker pool,
    // rechecking the owner and selected revision after reservation commits.
    // If this fails, the dispatch marker stays STARTED, and no request is sent.
    let material:SelectedModelMaterial
    try{
      material=await withModelBrokerActor(this.brokerPool,identity,
        async(db,owner)=>{
          const results=await db.query<ModelSecretRow>(
            "SELECT revision,status,enabled,provider,base_url,models,"+
            "api_key_ciphertext,api_key_nonce,api_key_tag "+
            "FROM agentstudio.model_connections WHERE id=$1::uuid "+
            "AND owner_user_id=$2::uuid",
            [materialRef.connection_id,owner])
          const selected=results.rows[0]
          if(!selected||
             Number(selected.revision)!==materialRef.connection_revision||
             !selected.enabled||selected.status!=="ok"||
             selected.provider!==materialRef.provider||
             selected.base_url!==materialRef.base_url||
             !safeModels(selected.models).includes(materialRef.model_id))
            throw new HttpError(409,"bound_model_connection_changed")
          const api_key=decryptModelSecret({
            ciphertext:Buffer.from(selected.api_key_ciphertext),
            nonce:Buffer.from(selected.api_key_nonce),
            tag:Buffer.from(selected.api_key_tag),
          },this.encryptionKey)
          return {provider:selected.provider,base_url:selected.base_url,
            model_id:materialRef.model_id,api_key}
        })
    }catch{throw new HttpError(503,"bound_model_outcome_unknown")}
    // A revoke/deactivation may have committed while the separate Broker
    // transaction loaded the reader's credential. Do not send old citations.
    try{await withActor(this.pool,identity,async(db,owner)=>{
      await requireKnowledgeScope(db,owner,materialRef.knowledgeIds)
    })}catch{throw new HttpError(503,"bound_model_outcome_unknown")}
    // No DB transaction is held across the paid POST.
    // Its outcome may be ambiguous even on a socket error: fail closed and
    // require explicit manual reconciliation, never an automatic retry.
    let text:string,failed=false
    try{
      text=await this.executor(material,input)
      if(!text.trim()||text.length>12000)
        throw Error("invalid_bound_model_result")
    }catch{
      failed=true
      text=""
    }
    try{
      await withActor(this.pool,identity,async(db,owner)=>{
        const changed=await db.query<{run_id:string}>(
          "UPDATE agentstudio.external_effects "+
          "SET status=$3::text,updated_at=clock_timestamp() "+
          "WHERE run_id=$1::uuid AND owner_user_id=$2::uuid "+
          "AND step_key='model_bound_dispatch' AND status='started' "+
          "RETURNING run_id",
          [claim.run_id,owner,failed?"unknown":"succeeded"])
        if(changed.rows.length!==1)
          throw Error("bound_dispatch_commit_unknown")
        await db.query(
          "INSERT INTO agentstudio.audit_events "+
          "(owner_user_id,actor_user_id,run_id,action,target_kind,"+
          "target_id,result,metadata) VALUES($1::uuid,$1::uuid,$2::uuid,"+
          "'agent.bound_model_dispatch','run',$2::text,$3::text,$4::jsonb)",
          [owner,claim.run_id,failed?"failed":"succeeded",
            JSON.stringify({outcome:failed?"unknown":"succeeded",
              provider:material.provider,model_id:material.model_id})])
      })
    }catch{
      throw new HttpError(503,"bound_model_outcome_unknown")
    }
    if(failed)throw new HttpError(503,"bound_model_outcome_unknown")
    return {status:"succeeded",text}
  }
}
