import {HttpError,type SqlClient} from './contracts.ts'
import {optimizationRetestProof,type OptimizationRetestProof} from '../../../shared/agent-optimization-retest-contract.ts'
// Original audit_events is Owner-scoped, append-only for the API and committed
// with original run/job admission. It records provenance, never execution power.
export async function storedOptimizationRetest(db:SqlClient,owner:string,run:{id:string;agent_spec_id:string|null;checkpoint:{spec_revision?:number}}):Promise<OptimizationRetestProof|undefined>{
  const rows=(await db.query<{proof:unknown}>("SELECT metadata->'optimization_retest' AS proof FROM agentstudio.audit_events WHERE owner_user_id=$1::uuid AND run_id=$2::uuid AND action='agent.v2_submit' AND metadata ? 'optimization_retest' ORDER BY occurred_at,id LIMIT 2",[owner,run.id])).rows
  if(!rows.length)return undefined
  if(rows.length!==1||!run.agent_spec_id||!Number.isSafeInteger(run.checkpoint.spec_revision))throw new HttpError(409,'agent_optimization_retest_unavailable')
  try{return optimizationRetestProof(rows[0]!.proof,{run_id:run.id,spec_id:run.agent_spec_id,spec_revision:run.checkpoint.spec_revision!})}
  catch{throw new HttpError(409,'agent_optimization_retest_unavailable')}
}
