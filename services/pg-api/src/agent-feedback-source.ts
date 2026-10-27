import {HttpError,isUuid,type SqlClient} from "./contracts.ts"
import {assertOwnedAdmissionContext} from "./repository.ts"
import {checkedWorkflowV2StoredState,verifyWorkflowV2Snapshot,workflowV2RunColumns,type WorkflowV2RunRow} from "./workflow-v2-run-repository.ts"
import {currentKnowledgeObservations} from "./knowledge-observation-policy.ts"
const unavailable=():never=>{throw new HttpError(409,"agent_feedback_lesson_source_unavailable")}
export type AgentFeedbackTask={row:WorkflowV2RunRow;source_sha256:string|null}
// Employee statements need a real owned terminal task, including cancellation.
// They do not claim a Worker failure, model delivery, tool result or live KB.
export async function loadAgentFeedbackTask(db:SqlClient,owner:string,id:string,specId?:string):Promise<AgentFeedbackTask>{
  if(!isUuid(id)||specId!==undefined&&!isUuid(specId))throw new HttpError(400,"invalid_agent_feedback_task")
  await assertOwnedAdmissionContext(db,owner)
  const row=(await db.query<WorkflowV2RunRow>("SELECT "+workflowV2RunColumns+" FROM agentstudio.runs WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[id,owner])).rows[0]
  if(!row||specId!==undefined&&(row.kind!=="agent"||row.agent_spec_id!==specId))throw new HttpError(404,"agent_run_not_found")
  const source_sha256=(await db.query<{hash:string|null}>("SELECT agentstudio.agent_feedback_run_source_sha256($1::uuid) AS hash",[row.id])).rows[0]?.hash
  if(source_sha256!==null&&(typeof source_sha256!=="string"||!/^[a-f0-9]{64}$/.test(source_sha256)))throw new HttpError(409,"agent_feedback_task_source_unavailable")
  return {row,source_sha256}
}
// Reusing the statement as a lesson is a separate act. Check current original
// role/resources/knowledge/human/manual-memory sources, without inventing VM
// success for failed/cancelled tasks. No provider is invoked here.
export async function verifyAgentFeedbackLessonSource(db:SqlClient,owner:string,task:AgentFeedbackTask,source:string):Promise<void>{
  await assertOwnedAdmissionContext(db,owner)
  if(task.source_sha256!==source||!["succeeded","failed","cancelled"].includes(task.row.status)||!task.row.finished_at)return unavailable()
  const state=checkedWorkflowV2StoredState(task.row.checkpoint,task.row.instruction)
  if(state.execution_mode!=="agent_native_v2")return unavailable()
  if((await db.query("SELECT 1 FROM agentstudio.external_effects WHERE owner_user_id=$1::uuid AND run_id=$2::uuid AND status IN('started','unknown') LIMIT 1",[owner,task.row.id])).rows.length)return unavailable()
  await verifyWorkflowV2Snapshot(db,owner,task.row,state)
  if(!await currentKnowledgeObservations(db,task.row.id))return unavailable()
}
