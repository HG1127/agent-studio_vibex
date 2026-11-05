import {HttpError,type SqlClient} from './contracts.ts'
import type {WorkflowEffectRequest} from './workflow-v2-machine.ts'
import type {WorkflowV2ToolRequest} from './workflow-v2-tool-contract.ts'

type WebKind='web_fetch'|'web_search'
type FencePhase='reserved'|'dial_started'|'cancelled_before_dial'
export type WorkflowWebUnresolvedEffect={step_key:string;tool_name:string;arguments_sha256:string;status:string;result_reference:string|null}
type WebPending=WorkflowEffectRequest&{kind:'tool';configuration:WorkflowEffectRequest['configuration']&{tool:WebKind}}
function reference(runId:string,step:string,hash:string,tool:WebKind,phase:FencePhase){
  return JSON.stringify({format:'workflow_web_dial_fence.v1',run_id:runId,step_key:step,input_sha256:hash,tool,phase})
}
function webKind(value:unknown):value is WebKind{return value==='web_fetch'||value==='web_search'}
function pendingWeb(value:WorkflowEffectRequest|null):value is WebPending{
  return value?.kind==='tool'&&'tool' in value.configuration&&webKind(value.configuration.tool)
}
/** Same transaction as the original private dispatch reservation and lease check.
 * A committed reserved marker proves that this transport has not dialled yet. */
export async function reserveWorkflowWebDial(db:SqlClient,owner:string,request:WorkflowV2ToolRequest,tool:WebKind){
  const result=await db.query("UPDATE agentstudio.external_effects SET result_reference=$4::text,updated_at=clock_timestamp() "+
    "WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND step_key=$3::text AND status='started' "+
    "AND tool_name='workflow.tool_bound_dispatch' AND arguments_sha256=$5::text AND result_reference IS NULL RETURNING step_key",
    [request.claim.run_id,owner,'wf2_tool:'+request.step_key,reference(request.claim.run_id,request.step_key,request.input_sha256,tool,'reserved'),request.input_sha256])
  if(result.rows.length!==1)throw new HttpError(409,'workflow_web_dial_reservation_changed')
}
/** Called after DNS and the existing full lease/source/approval recheck, in the
 * same locked transaction. Every initial and redirect dial crosses this fence.
 * Once dial_started is committed, cancellation cannot claim a pre-dial result. */
export async function beginWorkflowWebDial(db:SqlClient,owner:string,request:WorkflowV2ToolRequest,tool:WebKind){
  const started=reference(request.claim.run_id,request.step_key,request.input_sha256,tool,'dial_started')
  const result=await db.query("UPDATE agentstudio.external_effects SET result_reference=$4::text,updated_at=clock_timestamp() "+
    "WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND step_key=$3::text AND status='started' "+
    "AND tool_name='workflow.tool_bound_dispatch' AND arguments_sha256=$5::text "+
    "AND result_reference IN ($6::text,$4::text) RETURNING step_key",
    [request.claim.run_id,owner,'wf2_tool:'+request.step_key,started,request.input_sha256,reference(request.claim.run_id,request.step_key,request.input_sha256,tool,'reserved')])
  if(result.rows.length!==1)throw new HttpError(409,'workflow_web_dial_reservation_changed')
}
/** Only the exact primary+private reservation pair can prove no request was
 * sent. An unknown, generic HTTP/MCP/model, absent marker, extra effect, changed
 * input, or any committed dial always retains the existing in-flight refusal. */
export function workflowWebBeforeDialCancellation(runId:string,pending:WorkflowEffectRequest|null,effects:readonly WorkflowWebUnresolvedEffect[]){
  if(!pendingWeb(pending)||effects.length!==2)return null
  const primary=effects.find(row=>row.step_key===pending.step_key),dispatch=effects.find(row=>row.step_key==='wf2_tool:'+pending.step_key)
  if(!primary||!dispatch||primary===dispatch||effects.some(row=>row.status!=='started'||row.arguments_sha256!==pending.input_sha256)||
    primary.tool_name!=='workflow:tool'||primary.result_reference!==null||dispatch.tool_name!=='workflow.tool_bound_dispatch'||
    dispatch.result_reference!==reference(runId,pending.step_key,pending.input_sha256,pending.configuration.tool,'reserved'))return null
  return {step_key:pending.step_key,input_sha256:pending.input_sha256,tool:pending.configuration.tool}
}
/** Caller holds the same owner-scoped job/run locks as the Broker's lease check.
 * The two failed rows are a known pre-I/O stop, never an unknown-effect retry. */
export async function cancelWorkflowWebBeforeDial(db:SqlClient,owner:string,runId:string,pending:WorkflowEffectRequest|null,effects:readonly WorkflowWebUnresolvedEffect[]){
  const proof=workflowWebBeforeDialCancellation(runId,pending,effects)
  if(!proof)return null
  const result=await db.query("UPDATE agentstudio.external_effects SET status='failed',result_reference=$5::text,updated_at=clock_timestamp() "+
    "WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND step_key IN ($3::text,$4::text) "+
    "AND status='started' AND arguments_sha256=$6::text RETURNING step_key",
    [runId,owner,proof.step_key,'wf2_tool:'+proof.step_key,reference(runId,proof.step_key,proof.input_sha256,proof.tool,'cancelled_before_dial'),proof.input_sha256])
  const returned=new Set(result.rows.map(row=>(row as {step_key:string}).step_key))
  if(result.rows.length!==2||returned.size!==2||!returned.has(proof.step_key)||!returned.has('wf2_tool:'+proof.step_key))throw new HttpError(409,'workflow_web_dial_reservation_changed')
  return proof
}
