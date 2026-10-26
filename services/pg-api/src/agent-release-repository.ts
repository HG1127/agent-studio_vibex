// Full configuration versions are owner-only. This repository is not routed
// or enabled until migration046 and its independent startup audit are ready.
import {createHash} from "node:crypto"
import {HttpError,isUuid,type Identity,type SqlClient,type SqlPool} from "./contracts.ts"
import {withActor,verifyAgentSpecResources} from "./repository.ts"
import {parseAgentReleaseChoice,parseAgentReleaseStoredSpec,type AgentReleaseChoice} from "./agent-release-contract.ts"

type ObjectValue=Record<string,unknown>
function object(value:unknown):ObjectValue{
  if(!value||typeof value!=="object"||Array.isArray(value))throw new HttpError(503,"invalid_agent_release_response")
  return value as ObjectValue
}
function specId(value:string):string{if(!isUuid(value))throw new HttpError(400,"invalid_spec_id");return value.toLowerCase()}
function result(raw:unknown,spec:string,request:string):ObjectValue{
  const value=object(raw)
  if(value.spec_id!==spec||value.request_id!==request||typeof value.replayed!=="boolean")throw new HttpError(503,"invalid_agent_release_response")
  return value
}
const errors=new Set(["agent_release_actor_unavailable","agent_release_not_found","agent_release_version_not_found","agent_release_request_conflict",
  "agent_release_source_changed","agent_release_version_changed","agent_release_head_changed","agent_release_untested_ack_required","agent_release_version_not_draft",
  "agent_release_acceptance_not_ready","invalid_agent_release_snapshot","invalid_agent_release_publish","invalid_agent_release_delete","invalid_agent_release_restore",
  "agent_release_restore_not_prepared","agent_release_restore_write_changed"])
async function transaction<T>(pool:SqlPool,identity:Identity,body:(db:SqlClient,actor:string)=>Promise<T>):Promise<T>{
  try{return await withActor(pool,identity,async(db,actor)=>{
    await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='5s'")
    const installed=(await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_046') AND "+
      "to_regprocedure('agentstudio.agent_release_restore_finish(uuid,uuid,text)') IS NOT NULL AS ok")).rows[0]?.ok
    if(installed!==true)throw new HttpError(503,"agent_release_not_installed")
    return body(db,actor)
  })}catch(error){
    if(error&&typeof error==="object"&&"code" in error&&error.code==="P0001"&&"message" in error&&errors.has(String(error.message))){
      const code=String(error.message)
      throw new HttpError(code.endsWith("not_found")?404:code==="agent_release_actor_unavailable"?403:code.startsWith("invalid_")?400:409,code)
    }
    throw error
  }
}
async function receipt(db:SqlClient,spec:string,request:string){
  const raw=(await db.query<{item:unknown}>("SELECT agentstudio.agent_release_receipt($1::uuid,$2::uuid) AS item",[spec,request])).rows[0]?.item
  if(raw===null)return null
  const value=object(raw)
  if(typeof value.request_sha256!=="string"||!/^[a-f0-9]{64}$/.test(value.request_sha256))throw new HttpError(503,"invalid_agent_release_response")
  return {request_sha256:value.request_sha256,result:result(value.result,spec,request)}
}
export class AgentReleaseRepository{
  readonly pool:SqlPool;readonly enabled:boolean
  constructor(pool:SqlPool,options:{enabled?:boolean}={}){this.pool=pool;this.enabled=options.enabled===true}
  workspace(identity:Identity,rawId:string){const target=specId(rawId);return transaction(this.pool,identity,async db=>{
    const raw=(await db.query<{item:unknown}>("SELECT agentstudio.agent_release_workspace($1::uuid) AS item",[target])).rows[0]?.item
    if(raw===null)throw new HttpError(404,"agent_release_not_found")
    return object(raw)
  })}
  detail(identity:Identity,rawId:string,rawVersion:string){const target=specId(rawId),version=specId(rawVersion)
    return transaction(this.pool,identity,db=>this.ownedDetail(db,target,version))
  }
  private async ownedDetail(db:SqlClient,target:string,version:string){
    const raw=(await db.query<{item:unknown}>("SELECT agentstudio.agent_release_detail($1::uuid,$2::uuid) AS item",[target,version])).rows[0]?.item
    if(raw===null)throw new HttpError(404,"agent_release_version_not_found")
    const value=object(raw)
    if(value.id!==version||value.spec_id!==target)throw new HttpError(503,"invalid_agent_release_response")
    parseAgentReleaseStoredSpec(value.spec_snapshot)
    return value
  }
  async change(identity:Identity,rawId:string,raw:unknown){
    const target=specId(rawId),choice=parseAgentReleaseChoice(raw),fingerprint=createHash("sha256").update(JSON.stringify({spec_id:target,...choice})).digest("hex")
    const recover=(previous:Awaited<ReturnType<typeof receipt>>)=>{
      if(!previous)return null
      if(previous.request_sha256!==fingerprint)throw new HttpError(409,"agent_release_request_conflict")
      return previous.result
    }
    const prior=recover(await transaction(this.pool,identity,db=>receipt(db,target,choice.request_id)))
    if(prior)return prior
    if(!this.enabled)throw new HttpError(403,"agent_release_writes_disabled")
    return transaction(this.pool,identity,async(db,actor)=>{
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,46))",[actor+":"+choice.request_id])
      const existing=recover(await receipt(db,target,choice.request_id));if(existing)return existing
      return this.apply(db,actor,target,choice,fingerprint)
    })
  }
  confirm(identity:Identity,rawId:string,raw:unknown){
    const target=specId(rawId),choice=parseAgentReleaseChoice(raw),fingerprint=createHash("sha256").update(JSON.stringify({spec_id:target,...choice})).digest("hex")
    return transaction(this.pool,identity,async db=>{
      const prior=await receipt(db,target,choice.request_id)
      if(!prior)throw new HttpError(404,"agent_release_receipt_not_found")
      if(prior.request_sha256!==fingerprint)throw new HttpError(409,"agent_release_request_conflict")
      return prior.result
    })
  }
  private async apply(db:SqlClient,actor:string,target:string,choice:AgentReleaseChoice,fingerprint:string):Promise<ObjectValue>{
    if(choice.action==="restore")return this.restore(db,actor,target,choice,fingerprint)
    let query:string,args:unknown[]
    if(choice.action==="snapshot"){
      query="SELECT agentstudio.agent_release_snapshot($1::uuid,$2::bigint,$3::text,$4::text,$5::uuid,$6::uuid,$7::text) AS item"
      args=[target,choice.expected_spec_revision,choice.source_sha256,choice.note,choice.test_run_id,choice.request_id,fingerprint]
    }else if(choice.action==="publish"){
      query="SELECT agentstudio.agent_release_publish($1::uuid,$2::uuid,$3::bigint,$4::text,$5::text,$6::bigint,$7::bigint,$8::boolean,$9::boolean,$10::uuid,$11::text) AS item"
      args=[target,choice.version_id,choice.expected_spec_revision,choice.source_sha256,choice.version_sha256,choice.expected_version_revision,choice.expected_release_revision,
        choice.confirm,choice.acknowledge_untested,choice.request_id,fingerprint]
    }else{
      query="SELECT agentstudio.agent_release_delete_draft($1::uuid,$2::uuid,$3::text,$4::bigint,$5::boolean,$6::uuid,$7::text) AS item"
      args=[target,choice.version_id,choice.version_sha256,choice.expected_version_revision,choice.confirm,choice.request_id,fingerprint]
    }
    return result((await db.query<{item:unknown}>(query,args)).rows[0]?.item,target,choice.request_id)
  }
  private async restore(db:SqlClient,actor:string,target:string,choice:Extract<AgentReleaseChoice,{action:"restore"}>,fingerprint:string){
    const version=await this.ownedDetail(db,target,choice.version_id),stored=parseAgentReleaseStoredSpec(version.spec_snapshot)
    // Match create/update's resource-before-role lock order. Historical refs
    // never restore a deleted, revoked, untested or changed owned resource.
    await verifyAgentSpecResources(db,actor,stored.validated)
    const owned=(await db.query("SELECT id FROM agentstudio.agent_specs WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR UPDATE",[target,actor])).rows[0]
    if(!owned)throw new HttpError(404,"agent_release_not_found")
    const prepared=object((await db.query<{item:unknown}>("SELECT agentstudio.agent_release_restore_prepare($1::uuid,$2::uuid,$3::bigint,$4::text,$5::text,$6::bigint,$7::boolean,$8::text,$9::uuid,$10::text) AS item",
      [target,choice.version_id,choice.expected_spec_revision,choice.source_sha256,choice.version_sha256,choice.expected_version_revision,choice.confirm,choice.reason,choice.request_id,fingerprint])).rows[0]?.item)
    if(prepared.replayed===true)return result(prepared.result,target,choice.request_id)
    if(prepared.replayed!==false||typeof prepared.name!=="string"||prepared.name!==version.name||JSON.stringify(prepared.spec_snapshot)!==JSON.stringify(version.spec_snapshot))
      throw new HttpError(409,"agent_release_version_changed")
    await db.query("UPDATE agentstudio.agent_specs SET name=$3::text,spec=$4::jsonb,requires_approval=true,revision=revision+1,updated_at=clock_timestamp() "+
      "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND revision=$5::bigint",[target,actor,prepared.name,JSON.stringify(stored.snapshot),choice.expected_spec_revision])
    return result((await db.query<{item:unknown}>("SELECT agentstudio.agent_release_restore_finish($1::uuid,$2::uuid,$3::text) AS item",[target,choice.request_id,fingerprint])).rows[0]?.item,target,choice.request_id)
  }
}
