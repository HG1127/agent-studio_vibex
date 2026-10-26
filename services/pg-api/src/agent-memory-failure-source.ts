import {HttpError,type SqlClient} from "./contracts.ts"
import {assertOwnedAdmissionContext} from "./repository.ts"
import {verifyAgentMemoryFailureSourceCredentials} from "./agent-memory-failure-source-audit.ts"
import type {WorkflowV2RunRow} from "./workflow-v2-run-repository.ts"
export type AgentFailureLease={id:string;run_id:string;owner_user_id:string;lease_token:string;lease_version:number|string}
// Only called by a Worker that already locked and checked this exact lease in
// the same owned transaction. The audited DB function independently checks it.
// The caller encloses the role switch in a savepoint and restores API on error.
export async function recordAgentMemoryFailureSource(db:SqlClient,job:AgentFailureLease,workerId:string):Promise<boolean|null>{
  await assertOwnedAdmissionContext(db,job.owner_user_id)
  if(!await verifyAgentMemoryFailureSourceCredentials(db))return null
  await db.query("SET LOCAL ROLE agentstudio_worker")
  const recorded=(await db.query<{recorded:boolean}>("SELECT agentstudio.agent_memory_record_failure_source($1::uuid,$2::uuid,$3::bigint,$4::text) AS recorded",[job.id,job.lease_token,job.lease_version,workerId])).rows[0]?.recorded
  await db.query("SET LOCAL ROLE agentstudio_api")
  if(typeof recorded!=="boolean")throw new HttpError(409,"agent_memory_failure_source_unconfirmed")
  return recorded
}
// A historical Worker failure is a separate evidence source from a terminal
// VM. It proves only the failed run/error, never a model result or tool list.
// Current role/knowledge/human/memory scope is verified by the shared caller.
export async function currentAgentMemoryFailureSource(db:SqlClient,owner:string,run:Pick<WorkflowV2RunRow,"id"|"owner_user_id"|"agent_spec_id"|"status"|"last_error_code">,revision:number,graph:string,source:string):Promise<boolean>{
  await assertOwnedAdmissionContext(db,owner)
  if(run.owner_user_id!==owner||run.status!=="failed"||!await verifyAgentMemoryFailureSourceCredentials(db))return false
  return (await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.agent_memory_failure_sources f JOIN agentstudio.jobs j ON j.id=f.job_id "+
    "WHERE f.owner_user_id=$1::uuid AND f.run_id=$2::uuid AND f.source_sha256=$3 AND f.graph_sha256=$4 AND f.error_code=$5 AND f.protocol='agent_memory_failure_source_v1' "+
    "AND f.owner_epoch BETWEEN 1 AND 9007199254740990 AND f.lease_version>0 AND f.worker_sha256 ~ '^[a-f0-9]{64}$' "+
    "AND j.owner_user_id=f.owner_user_id AND j.run_id=f.run_id AND j.kind='run_tick' AND j.payload->>'phase'='agent_native_v2' "+
    "AND j.payload->>'agent_spec_id'=$6::text AND j.payload->>'spec_revision'=$7::text AND j.payload->>'graph_sha256'=f.graph_sha256 "+
    "AND j.lease_version=f.lease_version AND j.status IN('leased','failed') AND NOT EXISTS(SELECT 1 FROM agentstudio.external_effects e "+
    "WHERE e.owner_user_id=f.owner_user_id AND e.run_id=f.run_id AND e.status IN('started','unknown'))) AS ok",
    [owner,run.id,source,graph,run.last_error_code,run.agent_spec_id,revision])).rows[0]?.ok===true
}
