// Metadata discovery only. No Source preparation, private table read, body
// helper, request/control mutex, business mutation or provider dependency.
import {HttpError,type Identity,type SqlPool} from "./contracts.ts"
import {withActor,assertOwnedAdmissionContext} from "./repository.ts"
import {verifyAgentOpinionCredentials} from "./agent-opinion-audit.ts"
import {parseAgentReviewHistoryQuery,parseAgentReviewHistoryCursor,parseAgentReviewHistoryCandidate,parseAgentReviewHistoryPage,compareAgentReviewHistoryPositions,agentReviewHistoryCursor,type AgentReviewHistoryPage} from "./agent-review-history-contract.ts"

export class AgentReviewHistoryRepository{
  readonly pool:SqlPool
  constructor(pool:SqlPool){this.pool=pool}
  async list(identity:Identity,raw:unknown):Promise<AgentReviewHistoryPage>{
    if(identity?.issuer!=="urn:agentstudio:local:v1")throw new HttpError(403,"native_employee_identity_required")
    const q=parseAgentReviewHistoryQuery(raw),before=q.before===null?null:parseAgentReviewHistoryCursor(q.before)
    return withActor(this.pool,identity,async(db,owner)=>{
      await db.query("SET LOCAL statement_timeout='8000ms'")
      await db.query("SET LOCAL lock_timeout='3000ms'")
      await assertOwnedAdmissionContext(db,owner)
      if(!await verifyAgentOpinionCredentials(db))throw new HttpError(409,"agent_review_history_unavailable")
      // Existing Native epoch helper retains its transaction locks. The
      // current active employee is required, but historical epochs stay valid.
      const epoch=(await db.query<{epoch:unknown}>("SELECT agentstudio.agent_memory_outcome_epoch() AS epoch")).rows[0]?.epoch
      if(epoch===null||epoch===undefined)throw new HttpError(403,"native_employee_identity_required")
      if(typeof epoch!=="number"&&(typeof epoch!=="string"||!/^[1-9][0-9]*$/.test(epoch))||!Number.isSafeInteger(Number(epoch))||Number(epoch)<1||Number(epoch)>Number.MAX_SAFE_INTEGER-2)throw new HttpError(409,"agent_review_history_unavailable")
      const task=await db.query(`SELECT r.id FROM agentstudio.runs r
        JOIN agentstudio.agent_specs s ON s.id=r.agent_spec_id AND s.owner_user_id=r.owner_user_id
        WHERE r.id=$1::uuid AND r.owner_user_id=$2::uuid AND r.agent_spec_id=$3::uuid AND r.kind='agent' LIMIT 1`,[q.run_id,owner,q.spec_id])
      if(task.rows.length!==1)throw new HttpError(404,"agent_review_history_not_found")
      // Only existing056 metadata, explicit composite joins and actor/scope.
      // LIMIT bounds returned candidates, not rows examined by the planner;
      // exact056 indexes remain frozen and performance needs hosted evidence.
      const result=await db.query(`SELECT r.request_id,r.spec_id,r.run_id,r.purpose,
        r.request_sha256,r.input_sha256,r.content_sha256,r.owner_epoch::text AS owner_epoch,r.source_protocol,
        to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_us,
        j.state AS job_state,(t.request_id IS NOT NULL) AS body_erased
        FROM agentstudio.agent_review_requests r
        LEFT JOIN agentstudio.agent_review_jobs j ON j.owner_user_id=r.owner_user_id AND j.request_id=r.request_id
        LEFT JOIN agentstudio.agent_review_tombstones t ON t.owner_user_id=r.owner_user_id AND t.request_id=r.request_id
        WHERE r.owner_user_id=$1::uuid AND r.spec_id=$2::uuid AND r.run_id=$3::uuid AND r.purpose=$4::text
        ${before?"AND (r.created_at,r.request_id)<($5::timestamptz,$6::uuid)":""}
        ORDER BY r.created_at DESC,r.request_id DESC LIMIT $${before?7:5}::integer`,before?[owner,q.spec_id,q.run_id,q.purpose,before.created_at,before.request_id,q.limit+1]:[owner,q.spec_id,q.run_id,q.purpose,q.limit+1])
      if(result.rows.length>q.limit+1)throw new HttpError(409,"agent_review_history_unavailable")
      // Validate the lookahead too: a corrupt 21st candidate cannot be hidden.
      const candidates=result.rows.map(row=>parseAgentReviewHistoryCandidate(row,q))
      for(let i=0;i<candidates.length;i++){
        const position=candidates[i]!.position,previous=i?candidates[i-1]!.position:before
        if(previous&&compareAgentReviewHistoryPositions(position,previous)>=0)throw new HttpError(409,"agent_review_history_unavailable")
      }
      if(new Set(candidates.map(row=>row.position.request_id)).size!==candidates.length)throw new HttpError(409,"agent_review_history_unavailable")
      const has_more=candidates.length>q.limit,items=candidates.slice(0,q.limit)
      // withActor commits before publishing this copied, closed page.
      return parseAgentReviewHistoryPage({protocol:"agent_paid_review_history_v1",spec_id:q.spec_id,run_id:q.run_id,purpose:q.purpose,items:items.map(row=>row.item),limit:q.limit,has_more,next_cursor:has_more?agentReviewHistoryCursor(items.at(-1)!.position):null},q)
    })
  }
}
