import {HttpError,isUuid,type Identity,type SqlClient,type SqlPool} from "./contracts.ts"
import {withActor,assertOwnedAdmissionContext} from "./repository.ts"
import {verifyAgentMemoryOutcomeCredentials} from "./agent-memory-outcome-audit.ts"
import {outcomeMemoryConsent,outcomeMemoryStop,outcomeMemoryStopHash,type OutcomeMemoryConsent} from "./agent-memory-outcome-contract.ts"
import {loadAgentMemoryDerivedSource} from "./agent-memory-derived-source.ts"
import {AgentMemoryDerivedRepository} from "./agent-memory-derived-repository.ts"
type Consent=Omit<OutcomeMemoryConsent,"owner_epoch"|"spec_revision">&{owner_epoch:number|string;spec_revision:number|string;created_at:string|Date}
type Stop={run_id:string;request_id:string;intent_sha256:string;request_sha256:string}
export type OutcomeMemoryDecision="stored"|"revoked"|"source_unavailable"|"writes_disabled"|"write_failed"
type Result={run_id:string;memory_id:string;intent_sha256:string;decision:OutcomeMemoryDecision;reason_code:string;source_sha256:string|null;created_at:string|Date}
const consentColumns="owner_user_id,run_id,spec_id,spec_revision,owner_epoch,protocol,instruction_sha256,graph_sha256,intent_sha256,memory_id,created_at"
const resultColumns="run_id,memory_id,intent_sha256,decision,reason_code,source_sha256,created_at"
function native(identity:Identity){if(identity?.issuer!=="urn:agentstudio:local:v1")throw new HttpError(403,"native_employee_identity_required")}
function run(value:string){if(!isUuid(value))throw new HttpError(400,"invalid_agent_memory_outcome_run");return value.toLowerCase()}
function consentPublic(c:Consent){return {enabled:true as const,protocol:c.protocol,run_id:c.run_id,spec_id:c.spec_id,spec_revision:Number(c.spec_revision),intent_sha256:c.intent_sha256,memory_id:c.memory_id}}
function stopPublic(row:Stop,replayed:boolean){return {run_id:row.run_id,request_id:row.request_id,intent_sha256:row.intent_sha256,recorded:true as const,stopped:true as const,replayed}}
function resultPublic(r:Result,replayed:boolean){return {run_id:r.run_id,memory_id:r.memory_id,intent_sha256:r.intent_sha256,decision:r.decision,reason_code:r.reason_code,source_sha256:r.source_sha256,created_at:r.created_at,recorded:true as const,replayed}}
async function required(db:SqlClient){if(!await verifyAgentMemoryOutcomeCredentials(db))throw new HttpError(409,"agent_memory_outcome_schema_required")}
export class AgentMemoryOutcomeRepository{
  readonly pool:SqlPool;readonly admission:boolean;readonly writing:boolean
  constructor(pool:SqlPool,options:{allowAdmission?:boolean;allowWriteback?:boolean}={}){this.pool=pool;this.admission=options.allowAdmission===true;this.writing=options.allowWriteback===true}
  private async consent(db:SqlClient,owner:string,id:string,lock=false):Promise<Consent|undefined>{
    if(lock)await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,520))",[owner+":"+id])
    return (await db.query<Consent>("SELECT "+consentColumns+" FROM agentstudio.agent_memory_outcome_consents WHERE owner_user_id=$1::uuid AND run_id=$2::uuid",[owner,id])).rows[0]
  }
  // Original admission recovery precedes changed scope checks and new writes.
  async matchOwned(db:SqlClient,owner:string,id:string,wanted:boolean){
    await assertOwnedAdmissionContext(db,owner);id=run(id)
    const installed=await verifyAgentMemoryOutcomeCredentials(db)
    const prior=installed?await this.consent(db,owner,id):undefined
    if(Boolean(prior)!==wanted)throw new HttpError(409,"idempotency_key_conflict")
    return prior?consentPublic(prior):null
  }
  async hasOwned(db:SqlClient,owner:string,id:string):Promise<boolean>{
    await assertOwnedAdmissionContext(db,owner);id=run(id)
    return await verifyAgentMemoryOutcomeCredentials(db)&&Boolean(await this.consent(db,owner,id))
  }
  async admitOwned(db:SqlClient,owner:string,scope:{run_id:string;spec_id:string;spec_revision:number;instruction:string;graph_sha256:string}){
    await assertOwnedAdmissionContext(db,owner);await required(db)
    if(!this.admission)throw new HttpError(403,"agent_memory_outcome_admission_disabled")
    const epoch=(await db.query<{epoch:number|string|null}>("SELECT agentstudio.agent_memory_outcome_epoch() AS epoch")).rows[0]?.epoch
    if(epoch===null||epoch===undefined)throw new HttpError(403,"native_employee_identity_required")
    const c=outcomeMemoryConsent({...scope,owner_user_id:owner,owner_epoch:Number(epoch)})
    await db.query("INSERT INTO agentstudio.agent_memory_outcome_consents(owner_user_id,run_id,spec_id,spec_revision,owner_epoch,protocol,instruction_sha256,graph_sha256,intent_sha256,memory_id) VALUES($1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::bigint,$6,$7,$8,$9,$10::uuid)",
      [c.owner_user_id,c.run_id,c.spec_id,c.spec_revision,c.owner_epoch,c.protocol,c.instruction_sha256,c.graph_sha256,c.intent_sha256,c.memory_id])
    await this.audit(db,owner,c.run_id,"consent",{intent_sha256:c.intent_sha256,memory_id:c.memory_id,spec_id:c.spec_id})
    return consentPublic({...c,created_at:""})
  }
  private async audit(db:SqlClient,owner:string,id:string,action:string,metadata:Record<string,unknown>){
    await db.query("INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata) VALUES($1::uuid,$1::uuid,$2::uuid,$3,'agent_run',$2::text,'succeeded',$4::jsonb)",
      [owner,id,"agent.memory_outcome_"+action,JSON.stringify(metadata)])
  }
  async status(identity:Identity,id:string){
    native(identity);id=run(id)
    return withActor(this.pool,identity,async(db,owner)=>{
      const task=(await db.query<{status:string}>("SELECT status FROM agentstudio.runs WHERE id=$1::uuid AND owner_user_id=$2::uuid AND kind='agent' AND checkpoint->>'execution_mode'='agent_native_v2'",[id,owner])).rows[0]
      if(!task)throw new HttpError(404,"agent_run_not_found")
      if(!await verifyAgentMemoryOutcomeCredentials(db))return {run_id:id,enabled:false as const}
      const c=await this.consent(db,owner,id);if(!c)return {run_id:id,enabled:false as const}
      const stopped=(await db.query("SELECT request_id FROM agentstudio.agent_memory_outcome_stops WHERE owner_user_id=$1::uuid AND run_id=$2::uuid",[owner,id])).rows.length>0
      const result=(await db.query<Result>("SELECT "+resultColumns+" FROM agentstudio.agent_memory_outcome_results WHERE owner_user_id=$1::uuid AND run_id=$2::uuid",[owner,id])).rows[0]
      return {...consentPublic(c),stopped,state:result?"finished" as const:["succeeded","failed","cancelled"].includes(task.status)?"unconfirmed" as const:"pending" as const,result:result?resultPublic(result,true):null}
    })
  }
  async stop(identity:Identity,raw:unknown,confirmOnly=false){
    native(identity);const choice=outcomeMemoryStop(raw)
    return withActor(this.pool,identity,async(db,owner)=>{
      await required(db)
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,522))",[owner+":"+choice.request_id])
      const hash=outcomeMemoryStopHash(owner,choice)
      const previous=(await db.query<Stop>("SELECT run_id,request_id,intent_sha256,request_sha256 FROM agentstudio.agent_memory_outcome_stops WHERE owner_user_id=$1::uuid AND request_id=$2::uuid",[owner,choice.request_id])).rows[0]
      if(previous){if(previous.run_id!==choice.run_id||previous.intent_sha256!==choice.expected_intent_sha256||previous.request_sha256!==hash)throw new HttpError(409,"agent_memory_outcome_stop_conflict");return stopPublic(previous,true)}
      if(confirmOnly)throw new HttpError(404,"agent_memory_outcome_stop_not_found")
      const c=await this.consent(db,owner,choice.run_id,true)
      if(!c)throw new HttpError(404,"agent_memory_outcome_consent_not_found")
      if(c.intent_sha256!==choice.expected_intent_sha256)throw new HttpError(409,"agent_memory_outcome_consent_changed")
      if((await db.query("SELECT request_id FROM agentstudio.agent_memory_outcome_stops WHERE owner_user_id=$1::uuid AND run_id=$2::uuid",[owner,choice.run_id])).rows.length)throw new HttpError(409,"agent_memory_outcome_already_stopped")
      const row=(await db.query<Stop>("INSERT INTO agentstudio.agent_memory_outcome_stops(owner_user_id,run_id,request_id,intent_sha256,request_sha256) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5) RETURNING run_id,request_id,intent_sha256,request_sha256",[owner,choice.run_id,choice.request_id,choice.expected_intent_sha256,hash])).rows[0]!
      await this.audit(db,owner,choice.run_id,"stop",{request_id:choice.request_id,intent_sha256:c.intent_sha256})
      return stopPublic(row,false)
    })
  }
  // Trusted lease-holder boundary only. The Worker already locked the lease
  // and run and selected the real owner in this SAME transaction. No actor is
  // supplied by a browser, no nested transaction and no provider is invoked.
  async finishOwned(db:SqlClient,owner:string,id:string){
    await assertOwnedAdmissionContext(db,owner);id=run(id)
    if(!await verifyAgentMemoryOutcomeCredentials(db))return null
    const c=await this.consent(db,owner,id,true);if(!c)return null
    const previous=(await db.query<Result>("SELECT "+resultColumns+" FROM agentstudio.agent_memory_outcome_results WHERE owner_user_id=$1::uuid AND run_id=$2::uuid",[owner,id])).rows[0]
    if(previous)return resultPublic(previous,true)
    const terminal=(await db.query<{status:string}>("SELECT status FROM agentstudio.runs WHERE id=$1::uuid AND owner_user_id=$2::uuid AND kind='agent' AND finished_at IS NOT NULL AND status IN('succeeded','failed') FOR SHARE",[id,owner])).rows[0]
    if(!terminal)return null
    let decision:OutcomeMemoryDecision,reason:string,source_sha256:string|null=null
    const stopped=(await db.query("SELECT request_id FROM agentstudio.agent_memory_outcome_stops WHERE owner_user_id=$1::uuid AND run_id=$2::uuid",[owner,id])).rows.length>0
    if(stopped){decision="revoked";reason="owner_stopped"}
    else if(!this.writing){decision="writes_disabled";reason="worker_scope_disabled"}
    else{
      const epoch=(await db.query<{epoch:number|string|null}>("SELECT agentstudio.agent_memory_outcome_epoch() AS epoch")).rows[0]?.epoch
      if(epoch===null||epoch===undefined||Number(epoch)!==Number(c.owner_epoch)){decision="source_unavailable";reason="native_epoch_changed"}
      else{
        // Roll back only storage if its entry/receipt/final audit fails. The
        // terminal task/effect remains exact and can never be sent again.
        await db.query("SAVEPOINT agent_memory_outcome_storage")
        try{
          const source=await loadAgentMemoryDerivedSource(db,owner,c.spec_id,id)
          await new AgentMemoryDerivedRepository(this.pool,{allowWrites:true}).changeOwned(db,owner,{action:source.status==="succeeded"?"save_success":"save_failure",request_id:c.memory_id,spec_id:c.spec_id,source_run_id:id,expected_source_sha256:source.source_sha256,confirm:true})
          await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,510))",[owner+":"+c.memory_id])
          const present=(await db.query("SELECT id FROM agentstudio.agent_memory_derived_entries WHERE owner_user_id=$1::uuid AND id=$2::uuid",[owner,c.memory_id])).rows.length>0
          if(present){decision="stored";reason="terminal_source_stored";source_sha256=source.source_sha256}
          else{decision="source_unavailable";reason="memory_was_forgotten"}
          await db.query("RELEASE SAVEPOINT agent_memory_outcome_storage")
        }catch(error){
          await db.query("ROLLBACK TO SAVEPOINT agent_memory_outcome_storage");await db.query("RELEASE SAVEPOINT agent_memory_outcome_storage")
          if(error instanceof HttpError&&[400,404,409].includes(error.status)){decision="source_unavailable";reason="original_source_unavailable"}
          else{decision="write_failed";reason="storage_unavailable"}
        }
      }
    }
    const saved=(await db.query<Result>("INSERT INTO agentstudio.agent_memory_outcome_results(owner_user_id,run_id,memory_id,intent_sha256,decision,reason_code,source_sha256) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7) RETURNING "+resultColumns,[owner,id,c.memory_id,c.intent_sha256,decision,reason,source_sha256])).rows[0]!
    await this.audit(db,owner,id,"result",{intent_sha256:c.intent_sha256,memory_id:c.memory_id,decision,reason_code:reason,source_sha256})
    return resultPublic(saved,false)
  }
}
