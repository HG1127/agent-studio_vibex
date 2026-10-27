// Internal optional056 submission/control repository only. Receipts attest
// durable admission, never a provider call, paid execution or a model result.
import {HttpError,isUuid,type Identity,type SqlClient,type SqlPool} from "./contracts.ts"
import {withActor,assertOwnedAdmissionContext} from "./repository.ts"
import {verifyAgentReviewCredentials} from "./agent-review-audit.ts"
import {parseAgentReviewSubmission,type AgentReviewSubmission} from "./agent-review-contract.ts"
import {parseAgentReviewControl,type AgentReviewControl} from "./agent-review-control.ts"
import {AgentReviewSourceRepository} from "./agent-review-source.ts"

type ReviewRow={request_id:string;spec_id:string;run_id:string;purpose:"evaluate"|"optimize";request_sha256:string;input_sha256:string;content_sha256:string;owner_epoch:number|string;source_protocol:string;created_at:string|Date;state:string|null;body_erased:boolean}
type ControlRow={request_id:string;review_id:string;action:"cancel"|"erase";request_sha256:string;created_at:string|Date}
export type AgentReviewReceipt={protocol:"agent_paid_review_receipt_v1";request_id:string;spec_id:string;run_id:string;purpose:"evaluate"|"optimize";request_sha256:string;input_sha256:string;content_sha256:string;owner_epoch:number;source_protocol:"current_task_delivery_v1"|"employee_statement_anchor_v1";created_at:string;state:"pending"|"cancelled"|"erased";body_erased:boolean;recorded:true;replayed:boolean}
export type AgentReviewControlReceipt={protocol:"agent_paid_review_control_receipt_v1";request_id:string;review_id:string;action:"cancel"|"erase";request_sha256:string;created_at:string;recorded:true;replayed:boolean}
const reviewColumns="r.request_id,r.spec_id,r.run_id,r.purpose,r.request_sha256,r.input_sha256,r.content_sha256,r.owner_epoch,r.source_protocol,r.created_at,j.state,(t.request_id IS NOT NULL) AS body_erased"
const unavailable=():never=>{throw new HttpError(409,"agent_review_receipt_unavailable")}
function native(identity:Identity){if(identity?.issuer!=="urn:agentstudio:local:v1")throw new HttpError(403,"native_employee_identity_required")}
function epochNumber(value:unknown):number{
  if(typeof value!=="number"&&(typeof value!=="string"||!/^[1-9][0-9]*$/.test(value)))return unavailable()
  const n=Number(value);if(!Number.isSafeInteger(n)||n<1||n>Number.MAX_SAFE_INTEGER-2)return unavailable();return n
}
function uuid(value:unknown):string{if(!isUuid(value)||value!==value.toLowerCase())return unavailable();return value}
function hash(value:unknown):string{if(typeof value!=="string"||!/^[a-f0-9]{64}$/.test(value))return unavailable();return value}
function date(value:string|Date):string{if(!(value instanceof Date)&&typeof value!=="string")return unavailable();const n=value instanceof Date?value.getTime():Date.parse(value);if(!Number.isFinite(n))return unavailable();return new Date(n).toISOString()}
const sqlErrors:Record<string,number>={
  agent_review_invalid_intent:400,agent_review_invalid_control:400,agent_review_native_employee_required:403,agent_review_receipt_not_found:404,
  agent_review_request_conflict:409,agent_review_evaluation_source_unavailable:409,agent_review_source_unavailable:409,agent_review_model_unavailable:409,agent_review_feedback_changed:409,agent_review_input_changed:409,
}
async function actor<T>(pool:SqlPool,identity:Identity,body:(db:SqlClient,owner:string,epoch:number)=>Promise<T>):Promise<T>{
  native(identity)
  try{return await withActor(pool,identity,async(db,owner)=>{
    await assertOwnedAdmissionContext(db,owner)
    if(!await verifyAgentReviewCredentials(db))throw new HttpError(409,"agent_review_schema_required")
    const epoch=(await db.query<{epoch:unknown}>("SELECT agentstudio.agent_memory_outcome_epoch() AS epoch")).rows[0]?.epoch
    if(epoch===null||epoch===undefined)throw new HttpError(403,"native_employee_identity_required")
    return body(db,owner,epochNumber(epoch))
  })}catch(error){
    if(error&&typeof error==="object"&&"code" in error&&error.code==="P0001"&&"message" in error&&typeof error.message==="string"&&Object.hasOwn(sqlErrors,error.message))throw new HttpError(sqlErrors[error.message]!,error.message)
    throw error
  }
}

export class AgentReviewLedgerRepository{
  readonly pool:SqlPool;readonly submitting:boolean
  constructor(pool:SqlPool,{allowSubmissions=false}:{allowSubmissions?:boolean}={}){this.pool=pool;this.submitting=allowSubmissions===true}
  private receipt(row:ReviewRow,replayed:boolean):AgentReviewReceipt{
    if(row.purpose!=="evaluate"&&row.purpose!=="optimize"||row.source_protocol!==(row.purpose==="evaluate"?"current_task_delivery_v1":"employee_statement_anchor_v1")||
      row.state!=="pending"&&row.state!=="cancelled"&&row.state!=="erased"||typeof row.body_erased!=="boolean"||row.body_erased!==(row.state==="erased"))return unavailable()
    return {protocol:"agent_paid_review_receipt_v1",request_id:uuid(row.request_id),spec_id:uuid(row.spec_id),run_id:uuid(row.run_id),purpose:row.purpose,
      request_sha256:hash(row.request_sha256),input_sha256:hash(row.input_sha256),content_sha256:hash(row.content_sha256),owner_epoch:epochNumber(row.owner_epoch),source_protocol:row.source_protocol as AgentReviewReceipt["source_protocol"],
      created_at:date(row.created_at),state:row.state,body_erased:row.body_erased,recorded:true,replayed}
  }
  private async review(db:SqlClient,owner:string,requestId:string):Promise<ReviewRow|undefined>{
    // A single snapshot reads only public receipt/job/tombstone metadata. The
    // API deliberately cannot SELECT agent_review_inputs, even after submit.
    return (await db.query<ReviewRow>("SELECT "+reviewColumns+" FROM agentstudio.agent_review_requests r LEFT JOIN agentstudio.agent_review_jobs j ON j.owner_user_id=r.owner_user_id AND j.request_id=r.request_id "+
      "LEFT JOIN agentstudio.agent_review_tombstones t ON t.owner_user_id=r.owner_user_id AND t.request_id=r.request_id WHERE r.owner_user_id=$1::uuid AND r.request_id=$2::uuid",[owner,requestId])).rows[0]
  }
  private matches(row:ReviewRow,value:AgentReviewSubmission){
    if(row.request_id!==value.request_id||row.request_sha256!==value.request_sha256||row.spec_id!==value.spec_id||row.run_id!==value.run_id||row.purpose!==value.purpose||row.input_sha256!==value.expected_input_sha256)throw new HttpError(409,"agent_review_request_conflict")
  }
  private async previous(db:SqlClient,owner:string,value:AgentReviewSubmission):Promise<AgentReviewReceipt|null>{
    const row=await this.review(db,owner,value.request_id);if(!row)return null
    this.matches(row,value);return this.receipt(row,true)
  }
  async confirm(identity:Identity,rawSubmission:unknown):Promise<AgentReviewReceipt>{
    native(identity);const value=parseAgentReviewSubmission(rawSubmission)
    return actor(this.pool,identity,async(db,owner)=>{const old=await this.previous(db,owner,value);if(!old)throw new HttpError(404,"agent_review_receipt_not_found");return old})
  }
  async submit(identity:Identity,rawSubmission:unknown):Promise<AgentReviewReceipt>{
    native(identity);const value=parseAgentReviewSubmission(rawSubmission)
    return actor(this.pool,identity,async(db,owner,epoch)=>{
      // Match SQL record's order: Native epoch -> request561 -> sorted540
      // source mutexes -> resource/receipt rows. Never wait on561 while
      // already holding540: direct API SQL record also takes561 first.
      // Feedback privacy deletion holds540 but never requests561.
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,561))",[owner+":"+value.request_id])
      const old=await this.previous(db,owner,value);if(old)return old
      if(!this.submitting)throw new HttpError(403,"agent_review_submission_disabled")
      if(value.evaluation_sources.length)throw new HttpError(409,"agent_review_evaluation_source_unavailable")
      const {request_id:_id,expected_input_sha256:_input,confirm:_confirm,fee_acknowledgement:_fee,request_sha256:_hash,...fields}=value
      const prepared=await new AgentReviewSourceRepository(this.pool).prepareOnClient(identity,db,owner,{...fields,action:"preview"})
      if(prepared.input_sha256!==value.expected_input_sha256||prepared.owner_epoch!==epoch)throw new HttpError(409,"agent_review_input_changed")
      const {request_sha256:_internal,...submission}=value
      const id=(await db.query<{request_id:string}>("SELECT agentstudio.agent_review_record($1::jsonb,$2::jsonb) AS request_id",[JSON.stringify(submission),JSON.stringify(prepared)])).rows[0]?.request_id
      if(id!==value.request_id)return unavailable()
      const row=await this.review(db,owner,value.request_id);if(!row)return unavailable()
      this.matches(row,value)
      if(epochNumber(row.owner_epoch)!==epoch||row.content_sha256!==prepared.content_sha256)return unavailable()
      return this.receipt(row,false)
    })
  }
  private controlReceipt(row:ControlRow,replayed:boolean):AgentReviewControlReceipt{
    if(row.action!=="cancel"&&row.action!=="erase"||row.request_id===row.review_id)return unavailable()
    return {protocol:"agent_paid_review_control_receipt_v1",request_id:uuid(row.request_id),review_id:uuid(row.review_id),action:row.action,request_sha256:hash(row.request_sha256),created_at:date(row.created_at),recorded:true,replayed}
  }
  private async control(db:SqlClient,owner:string,requestId:string):Promise<ControlRow|undefined>{
    return (await db.query<ControlRow>("SELECT control_id AS request_id,request_id AS review_id,action,request_sha256,created_at FROM agentstudio.agent_review_controls WHERE owner_user_id=$1::uuid AND control_id=$2::uuid",[owner,requestId])).rows[0]
  }
  private matchesControl(row:ControlRow,value:AgentReviewControl){
    if(row.request_id!==value.request_id||row.review_id!==value.review_id||row.action!==value.action||row.request_sha256!==value.request_sha256)throw new HttpError(409,"agent_review_request_conflict")
  }
  private async previousControl(db:SqlClient,owner:string,value:AgentReviewControl):Promise<AgentReviewControlReceipt|null>{
    const row=await this.control(db,owner,value.request_id);if(!row)return null
    this.matchesControl(row,value);return this.controlReceipt(row,true)
  }
  async confirmControl(identity:Identity,rawControl:unknown):Promise<AgentReviewControlReceipt>{
    native(identity);const value=parseAgentReviewControl(rawControl)
    return actor(this.pool,identity,async(db,owner)=>{const old=await this.previousControl(db,owner,value);if(!old)throw new HttpError(404,"agent_review_receipt_not_found");return old})
  }
  async change(identity:Identity,rawControl:unknown):Promise<AgentReviewControlReceipt>{
    native(identity);const value=parseAgentReviewControl(rawControl)
    return actor(this.pool,identity,async(db,owner)=>{
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,562))",[owner+":"+value.request_id])
      const old=await this.previousControl(db,owner,value);if(old)return old
      // Cancellation/erasure remain available while new submissions are off.
      // SQL performs the protected mutation and mandatory audit atomically.
      const {request_sha256:_internal,...control}=value
      const id=(await db.query<{request_id:string}>("SELECT agentstudio.agent_review_control($1::jsonb) AS request_id",[JSON.stringify(control)])).rows[0]?.request_id
      if(id!==value.request_id)return unavailable()
      const row=await this.control(db,owner,value.request_id);if(!row)return unavailable()
      this.matchesControl(row,value);return this.controlReceipt(row,false)
    })
  }
}
