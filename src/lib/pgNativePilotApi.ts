/** Separate, local-only PostgreSQL 18 native-auth test client.
 * Cookie is HttpOnly, sent by browser same-origin to the Vite dev proxy.
 * Never imports PocketBase, never stores a bearer token or session value. */
import {safeWorkflowNodeDebugRequest,type WorkflowNodeDebugRequest} from "../../services/pg-api/src/workflow-v2-node-debug.ts"
import {agentHumanChoice,agentHumanReceipt,agentHumanProjection,agentHumanHistory,validHumanHistoryQuery,type AgentHumanResponse,type PgNativeAgentHumanInput} from "./pgNativeAgentHumanInput.ts"
import {agentMemoryChoice,agentMemoryReceipt,agentMemoryPage,type PgNativeMemoryChoice} from "./pgNativeAgentMemory.ts"
import {agentDerivedMemoryChoice,agentDerivedMemoryReceipt,agentDerivedMemoryPreview,agentDerivedMemoryPage,type PgNativeDerivedMemoryChoice} from "./pgNativeAgentDerivedMemory.ts"
export type {PgNativeDerivedMemoryChoice,PgNativeDerivedMemoryReceipt,PgNativeDerivedMemoryPreview,PgNativeDerivedMemoryItem,PgNativeDerivedMemoryPage} from "./pgNativeAgentDerivedMemory.ts"
export type {PgNativeMemoryChoice,PgNativeMemoryReceipt,PgNativeMemoryItem,PgNativeMemoryPage} from "./pgNativeAgentMemory.ts"
export type {AgentHumanResponse,PgNativeAgentHumanInput,PgNativeAgentHumanReceipt,PgNativeHumanHistory,PgNativeHumanHistoryPage} from "./pgNativeAgentHumanInput.ts"
import {employeeChange,employeeGovernanceResult,employeeCreation,employeeCreationResult,type EmployeeChange,type EmployeeCreation} from "./pgNativeEmployeeGovernance.ts"
import {agentDescriptiveLimits} from "../../shared/agent-role-limits.mjs"
import {collaborationChoice,collaborationDetail,collaborationRevisions,collaborationSummaries,collaborationResult,type PgNativeAgentCollaborationChoice} from "./pgNativeAgentCollaboration.ts"
export type {PgNativeAgentSafeText,PgNativeAgentCollaborationChoice,PgNativeAgentCollaborationDetail,PgNativeAgentCollaborationSummary,PgNativeAgentCollaborationRevision,PgNativeAgentCollaborationProposal} from "./pgNativeAgentCollaboration.ts"
import {agentReleaseChoice,agentReleaseWorkspace,agentReleaseDetail,agentReleaseAcceptanceStatus,agentReleaseResult,type PgNativeAgentReleaseChoice} from "./pgNativeAgentRelease.ts"
export type {PgNativeAgentReleaseChoice,PgNativeAgentReleaseWorkspace,PgNativeAgentReleaseVersion,PgNativeAgentReleaseDetail,PgNativeAgentReleaseResult,PgNativeAcceptanceSummary,PgNativeAcceptanceStatus} from "./pgNativeAgentRelease.ts"
import {parseAgentHttpTools,type AgentHttpTool} from "../../services/pg-api/src/agent-http-tools.ts"
import {KNOWLEDGE_TOOL_CHARGE_ACKNOWLEDGEMENT,parseKnowledgeRetrievalBinding,type KnowledgeRetrievalBinding} from "../../services/pg-api/src/knowledge-retrieval-binding.ts"
import {parsePgMcpConnection,type PgNativeMcpInput,type PgNativeMcpConnection} from "./pgNativeMcpConnection.ts"
import {parsePgSmitheryKey,parsePgSmitheryConnection,parsePgSmitheryCatalog} from "./pgNativeSmithery.ts"
import {parseSmitherySelection,smitheryApiKey,type SmitherySelection} from "../../services/pg-api/src/smithery-contracts.ts"
export type {PgNativeSmitheryKey,PgNativeSmitheryConnection,PgNativeSmitheryCatalog} from "./pgNativeSmithery.ts"
import {parseAgentMcpTools,type AgentMcpTool} from "../../services/pg-api/src/mcp-binding.ts"
export type {AgentMcpTool} from "../../services/pg-api/src/mcp-binding.ts"
export type {PgNativeMcpInput,PgNativeMcpConnection} from "./pgNativeMcpConnection.ts"
export type {AgentHttpTool} from "../../services/pg-api/src/agent-http-tools.ts"
import {parseWorkflowLatestOutputs,parseWorkflowOutputHistory,validWorkflowOutputCursor} from "../../services/pg-api/src/workflow-v2-output-contract.ts"
export type {WorkflowLatestOutputs,WorkflowOutputHistory,WorkflowOutputHeader,WorkflowLatestNodeOutput,WorkflowHistoricalNodeOutput} from "../../services/pg-api/src/workflow-v2-output-contract.ts"
import type {KnowledgeAccessReceipt,KnowledgeGrant,SharedKnowledgeMetadata,KnowledgeContentMetadata,KnowledgeContentReceipt,KnowledgeDocumentRow,KnowledgeSearchHit} from "./pgNativeKnowledgeSharing.ts"
import type {KnowledgeEmbeddingSettings,KnowledgeEmbeddingStatus,KnowledgeEmbeddingReceipt,KnowledgeEmbeddingChange} from "../../services/pg-api/src/knowledge-embedding-contracts.ts"
import type {KnowledgeEmbeddingConsent,KnowledgeEmbeddingConsentChange,KnowledgeEmbeddingConsentReceipt} from "../../services/pg-api/src/knowledge-embedding-consent-contracts.ts"
import type {KnowledgeIndexAuthorization,KnowledgeIndexAuthorizationReceipt,KnowledgeIndexStatus} from "../../services/pg-api/src/knowledge-index-contracts.ts"
import type {KnowledgeQueryRequest,KnowledgeQueryReceipt} from "../../services/pg-api/src/knowledge-query-contracts.ts"
export type {KnowledgeQueryRequest,KnowledgeQueryReceipt,KnowledgeQueryResult} from "../../services/pg-api/src/knowledge-query-contracts.ts"
export type {KnowledgeIndexAuthorization,KnowledgeIndexAuthorizationReceipt,KnowledgeIndexStatus} from "../../services/pg-api/src/knowledge-index-contracts.ts"
export type {KnowledgeEmbeddingConsent,KnowledgeEmbeddingConsentChange,KnowledgeEmbeddingConsentReceipt} from "../../services/pg-api/src/knowledge-embedding-consent-contracts.ts"
export type {KnowledgeEmbeddingSettings,KnowledgeEmbeddingStatus,KnowledgeEmbeddingReceipt,KnowledgeEmbeddingChange} from "../../services/pg-api/src/knowledge-embedding-contracts.ts"
export type PgNativeConfigCapabilities={
  mode:"native_pg18";config_writes_enabled:boolean;run_execution_enabled:false
  model_probe_enabled:boolean
  mcp_discovery_enabled?:boolean
  mcp_tool_runs_enabled?:boolean
  smithery_management_enabled?:boolean
  knowledge_sharing_enabled?:boolean
  knowledge_embedding_settings_enabled?:boolean
  knowledge_embedding_consent_enabled?:boolean
  knowledge_index_runtime_enabled?:boolean
  knowledge_query_runtime_enabled?:boolean
  knowledge_tool_runtime_enabled?:boolean
  run_submission_enabled?:boolean
  bound_model_runs_enabled?:boolean
  workflow_validation_enabled?:boolean
  workflow_execution_enabled?:boolean
  workflow_v2_submission_enabled?:boolean
  autonomous_agent_submission_enabled?:boolean
  agent_human_input_available?:boolean
  agent_human_responses_enabled?:boolean
  agent_memory_available?:boolean
  agent_memory_writes_enabled?:boolean
  agent_memory_runtime_enabled?:boolean
  agent_derived_memory_available?:boolean
  agent_derived_memory_writes_enabled?:boolean
  schedule_execution_enabled?:boolean
  employee_governance_available?:boolean
  employee_governance_enabled?:boolean
  agent_collaboration_available?:boolean
  agent_releases_available?:boolean
  agent_release_acceptance_enabled?:boolean
}
export type PgNativeStaff={
  id:string;email:string;display_name:string;is_admin:boolean;share_enabled?:boolean
}
export type PgNativeEmployee=PgNativeStaff&{
  enabled:boolean;status:"active"|"disabled";created_at:string;share_enabled:boolean;revision:number
}
export type PgNativeAgentModelBinding={
  connection_id:string;connection_revision:number;model_id:string
}
export type PgNativeAgent={
  id:string;name:string;revision:number
  spec:{goal:string;task_scope:string;deliverables?:string[];require_plan_review?:boolean;
    task_plan?:string[];done_criteria?:string[];tools?:string[];
    knowledge_base_ids?:string[];knowledge_retrieval?:KnowledgeRetrievalBinding;model_binding?:PgNativeAgentModelBinding;http_tools?:AgentHttpTool[];mcp_tools?:AgentMcpTool[]}
}
export type PgNativeWorkflow={id:string;name:string;revision:number;
  graph?:{version?:2;description?:string;nodes:unknown[];edges:unknown[]}}
export type PgNativeWorkflowValidationResult={
  run:{id:string;workflow_id:string;kind:"workflow";status:string
    step_count:number;result_text:string;checkpoint:Record<string,unknown>}
  steps:Array<{step_key:string;status:string;metadata:{
    index:string;node_id:string;node_type:"start"|"end"
    validation_only:boolean;external_effects_executed:false}}>
  replayed:boolean;mode:"graph_validation_only"
  external_effects_executed:false
}
export type PgNativeWorkflowSafeRunResult={
  run:{id:string;workflow_id:string;kind:"workflow";status:string
    step_count:number;result_text:string;checkpoint:Record<string,unknown>
    last_error_code?:string;created_at:string;updated_at:string;finished_at:string|null}
  steps:Array<{step_key:string;status:string;created_at:string;updated_at:string;metadata:{
    index:string;node_id:string;node_type:"start"|"end"
    execution_mode:"start_end_only";external_effects_executed:false}}>
  job_status:string;replayed:boolean;execution_mode:"start_end_only"
  external_effects_executed:false;worker_started_by_api?:false
}
export type PgNativeWorkflowV2Pending={step_key:string;node_id:string;kind:"model"|"tool"|"agent";
  input:string;input_sha256:string;configuration:Record<string,unknown>;missing:string[];
  agent_context?:{parent_step_key:string;round:number;phase:"model"|"tool"}}
export type PgNativeWorkflowV2Result={
  knowledge_outputs_available?:boolean
  human_input_evidence_current?:boolean;human_input_current?:boolean;human_input?:PgNativeAgentHumanInput|null
  run:{id:string;workflow_id:string;kind:"workflow";status:string;instruction:string;result_text:string;
    step_count:number;checkpoint:Record<string,unknown>;last_error_code:string;created_at:string;updated_at:string;finished_at:string|null}
  steps:Array<{step_key:string;status:string;metadata:Record<string,unknown>}>
  steps_truncated:boolean;approvals:Array<{step_key:string;status:string}>;approvals_truncated?:boolean
  pending_effect:PgNativeWorkflowV2Pending|null;replayed:boolean;execution_mode:"workflow_native_v2";worker_started_by_api?:false
  decision_confirmation?:{run_id:string;step_key:string;input_sha256:string;status:"approved"|"rejected"}
}
export type PgNativeWorkflowV2Summary={id:string;workflow_id:string;status:string;instruction_preview:string;result_preview:string;
  step_count:number;last_error_code:string;created_at:string;updated_at:string;finished_at:string|null;stage:string;debug_node_id?:string|null}
export type PgNativeAutonomousAgentResult=Omit<PgNativeWorkflowV2Result,"run"|"execution_mode">&{
  execution_mode:"agent_native_v2";run:Omit<PgNativeWorkflowV2Result["run"],"kind"|"workflow_id">&{kind:"agent";workflow_id:null;agent_spec_id:string}
}
export type PgNativeAutonomousAgentSummary={id:string;agent_spec_id:string;status:string;instruction_preview:string;result_preview:string;
  step_count:number;last_error_code:string;created_at:string;updated_at:string;finished_at:string|null;stage:string}
export type PgNativeKnowledge={id:string;name:string;description:string;revision:number}
export type PgNativeModelProvider="openai"|"anthropic"|"gemini"
export type PgNativeModelConnection={
  id:string;owner_user_id:string;name:string;provider:PgNativeModelProvider
  base_url:string;api_key_tail:string;enabled:boolean
  status:"untested"|"ok"|"error";last_latency_ms:number
  last_checked_at:string|null;models:string[];last_error:string
  revision:number;created_at:string;updated_at:string
}
export type PgNativeModelConnectionInput={
  name:string;provider:PgNativeModelProvider;base_url:string
  api_key?:string;models:string[];enabled:boolean
}
export type PgNativeToolConnectionHeader={key:string;value:string}
export type PgNativeToolConnection={
  id:string;owner_user_id:string;name:string;description:string;url:string
  method:"GET"|"POST";headers:PgNativeToolConnectionHeader[]
  body_template:string;timeout_s:number;enabled:boolean
  status:"untested"|"ok"|"error";last_latency_ms:number
  last_checked_at:string|null;last_error:string;revision:number
  created_at:string;updated_at:string
}
export type PgNativeToolConnectionInput={
  name:string;description:string;url:string;method:"GET"|"POST"
  headers:PgNativeToolConnectionHeader[];body_template:string
  timeout_s:number;enabled:boolean
}
export type PgNativeKnowledgeDocument={
  id:string;filename:string;mime_type:string;status:string
  sha256:string;created_at:string
}
export type PgNativeKeywordHit={
  document_id:string;filename:string;chunk_index:number
  snippet:string;citation:string
}
export type PgNativeKeywordSearch={
  items:PgNativeKeywordHit[];mode:"literal_keyword"
  scope:"current_user";indexed_only:true
}
export type PgNativeTextIngestUat={
  item:{id:string;filename:string;sha256:string;status:"indexed";chunk_count:number}
  scope:"private_keyword_only"
}
export type PgNativeSchedule={
  id:string;name:string;kind:"agent"|"workflow";agent_spec_id:string|null
  workflow_id:string|null;time_zone:string
  recurrence?:Record<string,unknown>
  next_at:string|null;enabled:boolean;revision:number
  created_at:string;updated_at:string
}
export type PgNativeScheduleDraftRule=
  |{kind:"once";start_date:string;local_time:string}
  |{kind:"daily";local_time:string}
  |{kind:"weekly";local_time:string;weekday:number}
  |{kind:"interval";interval_minutes:number}
export type PgNativeScheduleDraftInput={
  name:string;kind:"agent"|"workflow";target_id:string
  time_zone:string;rule:PgNativeScheduleDraftRule
}
export type PgNativeScheduleOccurrence={
  id:string;schedule_id:string;scheduled_for:string
  status:"pending"|"launching"|"retryable"|"failed_start"|"started"|"succeeded"|"failed"|"skipped"|"skipped_overlap"|"cancelled_run"|"cancelled_schedule"|"invalid_schedule"
  run_id:string|null;created_at:string
  schedule_revision?:number|string|null;attempts?:number;error_code?:string;run_status?:string|null
}
export type PgNativeScheduleActivation={expected_revision:number;expected_target_revision:number;instruction:string;max_steps:number;anchor_at:string;
  expires_at:string|null;max_occurrences:number|null;max_auto_effects:number;background_ack:"AUTHORIZE_NATIVE_SCHEDULE_BACKGROUND_V1";
  knowledge_charge_ack:"AUTHORIZE_SCHEDULED_KNOWLEDGE_CHARGES_V1"|null;request_id:string;model_binding?:PgNativeAgentModelBinding|null}
export type PgNativeScheduleExecution={schedule_id:string;revision:number;enabled:boolean;next_at:string|null;authority_id:string|null;source_current:boolean;
  used_occurrences:number;max_occurrences:number|null;expires_at:string|null;max_auto_effects:number|null;allow_paid_knowledge:boolean|null;
  execution:Partial<{instruction:string;max_steps:number;anchor_at:string;expires_at:string|null;max_occurrences:number|null;max_auto_effects:number;allow_paid_knowledge:boolean;model_binding:PgNativeAgentModelBinding|null}>}
export type PgNativeRunStatus="queued"|"running"|"awaiting_approval"|"paused"|
  "succeeded"|"failed"|"cancelled"
export type PgNativeRun={
  id:string;agent_spec_id:string;owner_user_id:string
  status:PgNativeRunStatus;instruction:string;result_text:string
  checkpoint:Record<string,unknown>;step_count:number
  knowledge_outputs_available?:boolean
  last_error_code:string;created_at:string;updated_at:string
}
export type PgNativeRunStep={
  step_key:string;status:"pending"|"running"|"awaiting_approval"|"succeeded"|"failed"|"skipped"
  metadata:Record<string,string|number|boolean|string[]>
  created_at:string;updated_at:string
}
export type PgNativeRunDetail={
  run:PgNativeRun;approval:{status:string;step_key:string}|null
  steps:PgNativeRunStep[]
}
export type PgNativeRunSubmission={run:PgNativeRun;replayed:boolean}
export type PgNativeRunDecision={run:PgNativeRun;approval:string;replayed:boolean}


export class PgNativePilotError extends Error {
  readonly status:number
  readonly code:string
  constructor(status:number,code:string){
    super(code)
    this.status=status
    this.code=code
  }
}
function safeSingleRun(run:PgNativeRun):PgNativeRun{
  if(!run||run.knowledge_outputs_available!==undefined&&typeof run.knowledge_outputs_available!=="boolean")
    throw new PgNativePilotError(503,"unconfirmed_agent_source_availability")
  return run.knowledge_outputs_available===false?{...run,result_text:""}:run
}
type RootPath=""|"/__pg_native"
const routes={
  login:"/api/native-auth/login",
  me:"/api/native-auth/me",
  logout:"/api/native-auth/logout",
  capabilities:"/api/native-auth/capabilities",
  employees:"/api/native-auth/employees",
  employeeCreate:"/api/native-auth/employees/create",employeeChange:"/api/native-auth/employees/change",employeeConfirm:"/api/native-auth/employees/confirm",changePassword:"/api/native-auth/change-password",
  agents:"/api/v2/agent-specs",
  workflows:"/api/v2/workflows",
  bases:"/api/v2/knowledge-bases",
  runs:"/api/v2/runs",
  workflowRuns:"/api/v2/workflow-runs",
  workflowV2Runs:"/api/v2/workflow-v2-runs",
  autonomousAgentRuns:"/api/v2/agent-autonomous-runs",
  schedules:"/api/v2/schedules",
  collaboration:"/api/v2/agent-collaboration",
  modelConnections:"/api/v2/model-connections",
  toolConnections:"/api/v2/tool-connections",
  mcpConnections:"/api/v2/mcp-connections",
} as const
type Route=typeof routes[keyof typeof routes]|`/api/v2/agent-releases/${string}`|`/api/v2/agent-collaboration/${string}`|`/api/v2/workflow-v2-runs/${string}`|
  `/api/v2/runs/${string}`|`/api/v2/agent-specs/${string}/runs`|
  `/api/v2/knowledge-bases/${string}/documents`|
  `/api/v2/knowledge-bases/${string}/search`|
  `/api/v2/knowledge-bases/${string}/text-documents`|
  `/api/v2/schedules/${string}/occurrences`
  | `/api/v2/schedules/${string}`
  | `/api/v2/model-connections/${string}`
  | `/api/v2/tool-connections/${string}`
  | `/api/v2/mcp-connections/${string}`
  | `/api/v2/smithery/${string}`
  | `/api/v2/shared-knowledge${string}`
  | `/api/v2/knowledge-embedding/${string}`
  | `/api/v2/knowledge-query/${string}`
  | `/api/v2/agent-memories${string}`
  | `/api/v2/agent-derived-memories${string}`
  | `/api/v2/workflows/${string}/validate`
  | `/api/v2/workflow-validations/${string}`
  | `/api/v2/workflows/${string}/runs`
  | `/api/v2/workflow-runs/${string}`
async function request<T>(
  route:Route,
  method:"GET"|"POST"|"PATCH"|"DELETE"="GET",
  body?:Record<string,unknown>,
  transport:typeof fetch=fetch,
  rootPath:RootPath="/__pg_native",
  timeoutMs=12000,
):Promise<T> {
  let response:Response
  try{
    response=await transport(rootPath+route,{
      method,
      credentials:"same-origin",
      redirect:"error",
      cache:"no-store",
      referrerPolicy:"no-referrer",
      headers:{
        Accept:"application/json",
        ...(method!=="GET"?{"X-AgentStudio-Request":"1",
          "Content-Type":"application/json"}:{}),
      },
      ...(body?{body:JSON.stringify(body)}:{}),
      signal:AbortSignal.timeout(timeoutMs),
    })
  }catch{throw new PgNativePilotError(0,"pg_native_connection_unavailable")}
  let result:unknown
  try{result=await response.json()}
  catch{throw new PgNativePilotError(response.status,"invalid_pg_native_response")}
  if(!response.ok){
    const error=(result as {error?:unknown})?.error
    const code=typeof error==="string"&&/^[a-z_]{1,80}$/.test(error)
      ?error:"pg_native_request_failed"
    throw new PgNativePilotError(response.status,code)
  }
  return result as T
}

const safeId=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
function recordRoute(route:Route,id:string):Route {
  if(!safeId.test(id))throw new PgNativePilotError(400,"invalid_pg_native_id")
  if(route!==routes.agents&&route!==routes.workflows&&route!==routes.bases&&route!==routes.workflowV2Runs&&route!==routes.autonomousAgentRuns&&route!=="/api/v2/shared-knowledge")
    throw new PgNativePilotError(400,"invalid_pg_native_resource")
  return (route+"/"+id) as Route
}
function workflowValidationSubmitRoute(id:string):
  `/api/v2/workflows/${string}/validate`{
  if(!safeId.test(id))throw new PgNativePilotError(400,"invalid_pg_native_workflow_id")
  return `/api/v2/workflows/${id}/validate`
}
function workflowValidationResultRoute(id:string):
  `/api/v2/workflow-validations/${string}`{
  if(!safeId.test(id))throw new PgNativePilotError(400,"invalid_pg_native_validation_id")
  return `/api/v2/workflow-validations/${id}`
}
function workflowSafeRunSubmitRoute(id:string):`/api/v2/workflows/${string}/runs`{
  if(!safeId.test(id))throw new PgNativePilotError(400,"invalid_pg_native_workflow_id")
  return `/api/v2/workflows/${id}/runs`
}
function workflowSafeRunResultRoute(id:string):`/api/v2/workflow-runs/${string}`{
  if(!safeId.test(id))throw new PgNativePilotError(400,"invalid_pg_native_workflow_run_id")
  return `/api/v2/workflow-runs/${id}`
}
function scheduleDraftRoute(id:string):`/api/v2/schedules/${string}`{
  if(!safeId.test(id))throw new PgNativePilotError(400,"invalid_pg_native_schedule_id")
  return `/api/v2/schedules/${id}`
}
function scheduleOccurrencesRoute(id:string):`/api/v2/schedules/${string}/occurrences`{
  if(!safeId.test(id))throw new PgNativePilotError(400,"invalid_pg_native_schedule_id")
  return `/api/v2/schedules/${id}/occurrences`
}
function modelConnectionRoute(id:string):`/api/v2/model-connections/${string}`{
  if(!safeId.test(id))throw new PgNativePilotError(400,"invalid_pg_native_model_connection_id")
  return `/api/v2/model-connections/${id}`
}
function toolConnectionRoute(id:string):`/api/v2/tool-connections/${string}`{
  if(!safeId.test(id))throw new PgNativePilotError(400,"invalid_pg_native_tool_connection_id")
  return `/api/v2/tool-connections/${id}`
}
function knowledgeTextIngestRoute(id:string):`/api/v2/knowledge-bases/${string}/text-documents`{
  if(!safeId.test(id))throw new PgNativePilotError(400,"invalid_pg_native_knowledge_id")
  return `/api/v2/knowledge-bases/${id}/text-documents`
}
function safeTextIngestUat(filename:string,text:string){
  if(typeof filename!=="string"||typeof text!=="string"||
     filename.length<5||filename.length>120||filename.startsWith(".")||
     !/\.(txt|md)$/i.test(filename)||/[\/\\]/.test(filename)||
     Array.from(filename).some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127)||
     text.length<1||text.length>12000||!text.trim()||text.includes("\u0000"))
    throw new PgNativePilotError(400,"invalid_pg_native_text_ingest")
  return {filename:filename.trim(),text}
}
function knowledgeKeywordSearchRoute(id:string):`/api/v2/knowledge-bases/${string}/search`{
  if(!safeId.test(id))throw new PgNativePilotError(400,"invalid_pg_native_knowledge_id")
  return `/api/v2/knowledge-bases/${id}/search`
}
function safeKeywordQuery(raw:string,limit:number):{query:string;limit:number}{
  if(typeof raw!=="string"||raw.length>160||
     Array.from(raw).some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127)||
     raw.trim().length<2||
     !Number.isSafeInteger(limit)||limit<1||limit>10)
    throw new PgNativePilotError(400,"invalid_pg_native_search_query")
  return {query:raw.trim(),limit}
}
function knowledgeDocumentsRoute(id:string):`/api/v2/knowledge-bases/${string}/documents`{
  if(!safeId.test(id))throw new PgNativePilotError(400,"invalid_pg_native_knowledge_id")
  return `/api/v2/knowledge-bases/${id}/documents`
}
function runRoute(id:string):`/api/v2/runs/${string}`{
  if(!safeId.test(id))throw new PgNativePilotError(400,"invalid_pg_native_run_id")
  return `/api/v2/runs/${id}`
}
function runSubmissionRoute(specId:string):`/api/v2/agent-specs/${string}/runs`{
  if(!safeId.test(specId))throw new PgNativePilotError(400,"invalid_pg_native_agent_id")
  return `/api/v2/agent-specs/${specId}/runs`
}
function safeRunPayload(instruction:string,key:string){
  if(typeof instruction!=="string"||instruction.length>2000||
     instruction.includes("\u0000")||
     typeof key!=="string"||!/^[a-zA-Z0-9_-]{8,80}$/.test(key))
    throw new PgNativePilotError(400,"invalid_pg_native_run_input")
  return {instruction:instruction.trim(),idempotency_key:key}
}
function safeRevision(revision:number):number{
  if(!Number.isSafeInteger(revision)||revision<1)
    throw new PgNativePilotError(400,"invalid_revision")
  return revision
}
function safeAgentGoal(goal:string):string{
  if(typeof goal!=="string"||!goal.trim()||goal.length>agentDescriptiveLimits.goal||goal.includes("\0"))throw new PgNativePilotError(400,"invalid_pg_native_agent_goal")
  return goal.trim()
}
function simpleAgentSpec(goal:string){
  return {goal:safeAgentGoal(goal),task_scope:"",deliverables:[],task_plan:[],
    done_criteria:[],tools:[]}
}
function planReviewSetting(spec:PgNativeAgent["spec"]):{require_plan_review?:boolean}{
  if(!Object.hasOwn(spec,"require_plan_review"))return {}
  if(typeof spec.require_plan_review!=="boolean")throw new PgNativePilotError(409,"unexpected_stored_spec")
  return {require_plan_review:spec.require_plan_review}
}
function collaborationRoute(id:string,action?:"revisions"|"change"|"revoke"|"reject"|"confirm"):Route{
  if(!safeId.test(id))throw new PgNativePilotError(400,"invalid_pg_native_agent_id")
  return `/api/v2/agent-collaboration/${id}${action?"/"+action:""}` as Route
}
function collaborationPayload(raw:PgNativeAgentCollaborationChoice):PgNativeAgentCollaborationChoice{
  try{return collaborationChoice(raw)}catch{throw new PgNativePilotError(400,"invalid_pg_native_agent_collaboration_change")}
}
function collaborationResponse<T>(decode:()=>T):T{
  try{return decode()}catch{throw new PgNativePilotError(503,"invalid_pg_native_agent_collaboration_response")}
}
function releaseRoute(id:string,action?:"versions"|"acceptance"|"change"|"confirm",selected?:string):Route{
  if(!safeId.test(id)||selected!==undefined&&(!safeId.test(selected)||action!=="versions"&&action!=="acceptance"))throw new PgNativePilotError(400,"invalid_pg_native_release_identifier")
  return `/api/v2/agent-releases/${id.toLowerCase()}${action?"/"+action:""}${selected?"/"+selected.toLowerCase():""}`
}
function releasePayload(raw:PgNativeAgentReleaseChoice):PgNativeAgentReleaseChoice{
  try{return agentReleaseChoice(raw)}catch{throw new PgNativePilotError(400,"invalid_pg_native_agent_release_change")}
}
function releaseResponse<T>(decode:()=>T):T{
  try{return decode()}catch{throw new PgNativePilotError(503,"invalid_pg_native_agent_release_response")}
}
function simpleWorkflowGraph(){
  return {nodes:[
    {id:"start",type:"start",data:{title:"开始"},position:{x:0,y:0}},
    {id:"end",type:"end",data:{title:"结束"},position:{x:250,y:0}},
  ],edges:[{id:"flow-start-end",source:"start",target:"end"}]}
}
export function createPgNativePilotApi(
  transport:typeof fetch=fetch,rootPath:RootPath="/__pg_native"
){
  // A fixed same-origin root avoids sending session cookies to arbitrary URLs.
  if(rootPath!==""&&rootPath!=="/__pg_native")
    throw new Error("unsafe_pg_native_client_root")
  const get=<T>(route:Route)=>request<T>(route,"GET",undefined,transport,rootPath)
  const post=<T>(route:Route,body:Record<string,unknown>)=>
    request<T>(route,"POST",body,transport,rootPath)
  const patch=<T>(route:Route,body:Record<string,unknown>)=>
    request<T>(route,"PATCH",body,transport,rootPath)
  const del=<T>(route:Route)=>request<T>(route,"DELETE",undefined,transport,rootPath)
  const memoryChange=async(raw:PgNativeMemoryChoice,confirmOnly=false)=>{
    let choice:PgNativeMemoryChoice;try{choice=agentMemoryChoice(raw)}catch{throw new PgNativePilotError(400,"invalid_agent_memory_request")}
    const result=await post<unknown>(confirmOnly?"/api/v2/agent-memories/confirm":"/api/v2/agent-memories/change",choice)
    try{return await agentMemoryReceipt(result,choice,confirmOnly)}catch{throw new PgNativePilotError(503,"unconfirmed_agent_memory_request")}
  }
  const derivedMemoryChange=async(raw:PgNativeDerivedMemoryChoice,confirmOnly=false)=>{
    let choice:PgNativeDerivedMemoryChoice;try{choice=agentDerivedMemoryChoice(raw)}catch{throw new PgNativePilotError(400,"invalid_agent_memory_derived_change")}
    const result=await post<unknown>(confirmOnly?"/api/v2/agent-derived-memories/confirm":"/api/v2/agent-derived-memories/change",choice)
    try{return agentDerivedMemoryReceipt(result,choice,confirmOnly)}catch{throw new PgNativePilotError(503,"unconfirmed_agent_derived_memory_request")}
  }
  const humanResponse=async(root:typeof routes.autonomousAgentRuns|typeof routes.workflowV2Runs,id:string,raw:AgentHumanResponse,confirmOnly=false)=>{
    const route=recordRoute(root,id.toLowerCase())
    let choice:AgentHumanResponse;try{choice=agentHumanChoice(raw)}catch{throw new PgNativePilotError(400,"invalid_agent_human_response")}
    const result=await post<unknown>((route+(confirmOnly?"/respond-confirm":"/respond")) as Route,choice)
    try{return agentHumanReceipt(result,id.toLowerCase(),choice,confirmOnly)}catch{throw new PgNativePilotError(503,"unconfirmed_agent_human_response")}
  }
  const humanHistory=async(root:typeof routes.autonomousAgentRuns|typeof routes.workflowV2Runs,id:string,after:string,limit:number)=>{
    if(!validHumanHistoryQuery(after,limit))throw new PgNativePilotError(400,"invalid_agent_human_history_query")
    const route=recordRoute(root,id.toLowerCase())
    const result=await get<unknown>((route+"/human-history?limit="+limit+"&after="+encodeURIComponent(after)) as Route)
    try{return agentHumanHistory(result,id.toLowerCase(),after,limit)}catch{throw new PgNativePilotError(503,"invalid_agent_human_history")}
  }
  const mcpRoute=(id:string):`/api/v2/mcp-connections/${string}`=>{
    if(!safeId.test(id))throw new PgNativePilotError(400,"invalid_mcp_connection_id")
    return `/api/v2/mcp-connections/${id}`
  }
  const mcpItem=(raw:unknown):PgNativeMcpConnection=>{
    try{return parsePgMcpConnection(raw)}catch{throw new PgNativePilotError(503,"invalid_mcp_connection_response")}
  }
  const smithery=async<T>(path:string,method:"GET"|"POST"|"DELETE",body:Record<string,unknown>|undefined,parse:(raw:unknown)=>T)=>{
    const result=await request<{item:unknown}>(`/api/v2/smithery/${path}`,method,body,transport,rootPath,25000)
    try{return parse(result.item)}catch{throw new PgNativePilotError(503,"invalid_smithery_response")}
  }
  const smitheryId=(id:string)=>{if(!safeId.test(id))throw new PgNativePilotError(400,"invalid_smithery_id");return id.toLowerCase()}
  return {
    changeAgentDerivedMemory:(choice:PgNativeDerivedMemoryChoice)=>derivedMemoryChange(choice),
    confirmAgentDerivedMemory:(choice:PgNativeDerivedMemoryChoice)=>derivedMemoryChange(choice,true),
    previewAgentDerivedMemory:async(specId:string,runId:string)=>{
      if(!safeId.test(specId)||!safeId.test(runId))throw new PgNativePilotError(400,"invalid_agent_memory_derived_source")
      const spec=specId.toLowerCase(),run=runId.toLowerCase(),result=await get<unknown>(`/api/v2/agent-derived-memories/preview?spec_id=${spec}&run_id=${run}`)
      try{return await agentDerivedMemoryPreview(result,spec,run)}catch{throw new PgNativePilotError(503,"invalid_agent_derived_memory_projection")}
    },
    listAgentDerivedMemories:async(specId:string)=>{
      if(!safeId.test(specId))throw new PgNativePilotError(400,"invalid_agent_spec_id")
      const spec=specId.toLowerCase(),result=await get<unknown>(`/api/v2/agent-derived-memories?spec_id=${spec}`)
      try{return await agentDerivedMemoryPage(result,spec)}catch{throw new PgNativePilotError(503,"invalid_agent_derived_memory_projection")}
    },
    changeAgentMemory:(choice:PgNativeMemoryChoice)=>memoryChange(choice),
    confirmAgentMemory:(choice:PgNativeMemoryChoice)=>memoryChange(choice,true),
    listAgentMemories:async(specId:string)=>{
      if(!safeId.test(specId))throw new PgNativePilotError(400,"invalid_agent_spec_id")
      const id=specId.toLowerCase(),result=await get<unknown>(`/api/v2/agent-memories?spec_id=${id}`)
      try{return await agentMemoryPage(result,id)}catch{throw new PgNativePilotError(503,"invalid_agent_memory_projection")}
    },
    me:async()=> (await get<{authenticated:true;user:PgNativeStaff}>(routes.me)).user,
    getConfigCapabilities:async()=>{
      const value=await get<PgNativeConfigCapabilities>(routes.capabilities)
      if(value?.mode!=="native_pg18"||
         typeof value.config_writes_enabled!=="boolean"||
         typeof value.model_probe_enabled!=="boolean"||
          (value.mcp_discovery_enabled!==undefined&&typeof value.mcp_discovery_enabled!=="boolean")||
          (value.mcp_discovery_enabled===true&&value.config_writes_enabled!==true)||
          (value.mcp_tool_runs_enabled!==undefined&&typeof value.mcp_tool_runs_enabled!=="boolean")||
          (value.mcp_tool_runs_enabled===true&&value.config_writes_enabled!==true)||
          (value.smithery_management_enabled!==undefined&&typeof value.smithery_management_enabled!=="boolean")||
          (value.smithery_management_enabled===true&&value.config_writes_enabled!==true)||
          (value.knowledge_sharing_enabled!==undefined&&typeof value.knowledge_sharing_enabled!=="boolean")||
          (value.knowledge_sharing_enabled===true&&value.config_writes_enabled!==true)||
          (value.knowledge_embedding_settings_enabled!==undefined&&typeof value.knowledge_embedding_settings_enabled!=="boolean")||
          (value.knowledge_embedding_settings_enabled===true&&(value.config_writes_enabled!==true||value.knowledge_sharing_enabled!==true))||
          (value.knowledge_embedding_consent_enabled!==undefined&&typeof value.knowledge_embedding_consent_enabled!=="boolean")||
          (value.knowledge_embedding_consent_enabled===true&&value.knowledge_embedding_settings_enabled!==true)||
          (value.knowledge_index_runtime_enabled!==undefined&&typeof value.knowledge_index_runtime_enabled!=="boolean")||
          (value.knowledge_index_runtime_enabled===true&&value.knowledge_embedding_consent_enabled!==true)||
          (value.knowledge_query_runtime_enabled!==undefined&&typeof value.knowledge_query_runtime_enabled!=="boolean")||
          (value.knowledge_query_runtime_enabled===true&&value.knowledge_embedding_consent_enabled!==true)||
          (value.knowledge_tool_runtime_enabled!==undefined&&typeof value.knowledge_tool_runtime_enabled!=="boolean")||
          (value.knowledge_tool_runtime_enabled===true&&value.knowledge_query_runtime_enabled!==true)||
          (value.workflow_validation_enabled!==undefined&&
            typeof value.workflow_validation_enabled!=="boolean")||
          (value.workflow_execution_enabled!==undefined&&
            typeof value.workflow_execution_enabled!=="boolean")||
          (value.autonomous_agent_submission_enabled!==undefined&&typeof value.autonomous_agent_submission_enabled!=="boolean")||
          (value.autonomous_agent_submission_enabled===true&&value.config_writes_enabled!==true)||
          (value.agent_human_input_available!==undefined&&typeof value.agent_human_input_available!=="boolean")||
          (value.agent_memory_available!==undefined&&typeof value.agent_memory_available!=="boolean")||
          (value.agent_memory_writes_enabled!==undefined&&typeof value.agent_memory_writes_enabled!=="boolean")||
          (value.agent_memory_writes_enabled===true&&(value.agent_memory_available!==true||value.config_writes_enabled!==true))||
          (value.agent_memory_runtime_enabled!==undefined&&typeof value.agent_memory_runtime_enabled!=="boolean")||
          (value.agent_memory_runtime_enabled===true&&(value.agent_memory_available!==true||value.config_writes_enabled!==true||value.autonomous_agent_submission_enabled!==true))||
          (value.agent_derived_memory_available!==undefined&&typeof value.agent_derived_memory_available!=="boolean")||
          (value.agent_derived_memory_writes_enabled!==undefined&&typeof value.agent_derived_memory_writes_enabled!=="boolean")||
          (value.agent_derived_memory_writes_enabled===true&&(value.agent_derived_memory_available!==true||value.config_writes_enabled!==true))||
          (value.agent_human_responses_enabled!==undefined&&typeof value.agent_human_responses_enabled!=="boolean")||
          (value.agent_human_responses_enabled===true&&(value.agent_human_input_available!==true||value.config_writes_enabled!==true||value.autonomous_agent_submission_enabled!==true&&value.workflow_v2_submission_enabled!==true))||
          (value.workflow_v2_submission_enabled!==undefined&&
            typeof value.workflow_v2_submission_enabled!=="boolean")||
          (value.workflow_v2_submission_enabled===true&&value.config_writes_enabled!==true)||
          (value.schedule_execution_enabled!==undefined&&typeof value.schedule_execution_enabled!=="boolean")||
          (value.employee_governance_available!==undefined&&typeof value.employee_governance_available!=="boolean")||
          (value.employee_governance_enabled!==undefined&&typeof value.employee_governance_enabled!=="boolean")||
          (value.employee_governance_enabled===true&&(value.employee_governance_available!==true||value.config_writes_enabled!==true))||
          (value.agent_collaboration_available!==undefined&&typeof value.agent_collaboration_available!=="boolean")||
          (value.agent_releases_available!==undefined&&typeof value.agent_releases_available!=="boolean")||
          (value.agent_release_acceptance_enabled!==undefined&&typeof value.agent_release_acceptance_enabled!=="boolean")||
          (value.agent_release_acceptance_enabled===true&&(value.agent_releases_available!==true||value.config_writes_enabled!==true||value.autonomous_agent_submission_enabled!==true))||
          (value.schedule_execution_enabled===true&&(value.config_writes_enabled!==true||value.workflow_v2_submission_enabled!==true||value.autonomous_agent_submission_enabled!==true))||
          (value.run_submission_enabled!==undefined&&
            typeof value.run_submission_enabled!=="boolean")||
          (value.bound_model_runs_enabled!==undefined&&
            typeof value.bound_model_runs_enabled!=="boolean")||
          (value.run_submission_enabled===true&&value.config_writes_enabled!==true)||
          (value.bound_model_runs_enabled===true&&value.run_submission_enabled!==true)||
         value.run_execution_enabled!==false)
        throw new PgNativePilotError(503,"invalid_native_capabilities")
      return value
    },
    login:(email:string,password:string)=>post<{authenticated:true;role:string}>(
      routes.login,{email,password}),
    logout:()=>post<{ok:true}>(routes.logout,{}),
    createEmployee:async(email:string,password:string,display_name:string)=>
      (await post<{user:PgNativeStaff}>(routes.employees,{
        email,password,display_name
      })).user,
    listEmployees:async(limit=50)=>{
      if(!Number.isSafeInteger(limit)||limit<1||limit>100)
        throw new PgNativePilotError(400,"invalid_employee_limit")
      return (await get<{items:PgNativeEmployee[];scope:"admin_employee_inventory"}>(
        (routes.employees+"?limit="+String(limit)) as Route)).items
    },
    createGovernedEmployee:async(input:EmployeeCreation)=>{
      const choice=employeeCreation(input),result=await post<{user?:unknown}>(routes.employeeCreate,choice)
      return employeeCreationResult(result.user,choice)
    },
    changeEmployee:async(input:EmployeeChange)=>{const choice=employeeChange(input);return employeeGovernanceResult(await post<unknown>(routes.employeeChange,choice),choice)},
    confirmEmployeeChange:async(input:EmployeeChange)=>{const choice=employeeChange(input);return employeeGovernanceResult(await post<unknown>(routes.employeeConfirm,choice),choice)},
    changePassword:async(old_password:string,new_password:string)=>{
      const value=await post<{ok?:boolean;reauthenticate?:boolean}>(routes.changePassword,{old_password,new_password})
      if(value.ok!==true||value.reauthenticate!==true)throw new PgNativePilotError(503,"invalid_employee_password_response")
      return value
    },
    listModelConnections:async()=>
      (await get<{items:PgNativeModelConnection[]}>(routes.modelConnections)).items,
    getModelConnection:async(id:string)=>(await get<{item:PgNativeModelConnection}>(modelConnectionRoute(id))).item,
    createModelConnection:async(input:PgNativeModelConnectionInput)=>
      (await post<{item:PgNativeModelConnection}>(routes.modelConnections,
        input as unknown as Record<string,unknown>)).item,
    updateModelConnection:async(id:string,expected_revision:number,
      input:PgNativeModelConnectionInput)=>
      (await patch<{item:PgNativeModelConnection}>(modelConnectionRoute(id),{
        ...input,expected_revision:safeRevision(expected_revision)
      })).item,
    deleteModelConnection:async(id:string)=>
      del<{ok:true;id:string}>(modelConnectionRoute(id)),
    testModelConnection:async(id:string,revision:number)=>
      (await post<{item:PgNativeModelConnection;mode:"read_only_provider_models_probe"}>(
        (modelConnectionRoute(id)+"/probe") as Route,
        {expected_revision:safeRevision(revision)})).item,
    listToolConnections:async()=>
      (await get<{items:PgNativeToolConnection[];execution_enabled:false}>(
        routes.toolConnections)).items,
    getToolConnection:async(id:string)=>(await get<{item:PgNativeToolConnection}>(toolConnectionRoute(id))).item,
    createToolConnection:async(input:PgNativeToolConnectionInput)=>
      (await post<{item:PgNativeToolConnection;execution_enabled:false}>(
        routes.toolConnections,input as unknown as Record<string,unknown>)).item,
    updateToolConnection:async(id:string,expected_revision:number,
      input:PgNativeToolConnectionInput)=>
      (await patch<{item:PgNativeToolConnection;execution_enabled:false}>(
        toolConnectionRoute(id),{
          ...input,expected_revision:safeRevision(expected_revision)
        })).item,
    deleteToolConnection:async(id:string)=>
      del<{ok:true;id:string;execution_enabled:false}>(
        toolConnectionRoute(id)),
    getSmitheryKey:()=>smithery("key","GET",undefined,parsePgSmitheryKey),
    saveSmitheryKey:(api_key:string,expected_revision:number,request_id:string)=>{
      try{smitheryApiKey(api_key)}catch{throw new PgNativePilotError(400,"invalid_smithery_key")}
      if(!Number.isSafeInteger(expected_revision)||expected_revision<0)throw new PgNativePilotError(400,"invalid_revision")
      smitheryId(request_id);return smithery("key","POST",{api_key,expected_revision,request_id},parsePgSmitheryKey)
    },
    removeSmitheryKey:(expected_revision:number,request_id:string)=>{
      if(!Number.isSafeInteger(expected_revision)||expected_revision<0)throw new PgNativePilotError(400,"invalid_revision")
      smitheryId(request_id);return smithery("key","DELETE",{expected_revision,request_id},parsePgSmitheryKey)
    },
    readSmitheryNamespaces:async()=>{
      const result=await post<{namespaces:unknown}>("/api/v2/smithery/namespaces",{})
      if(!Array.isArray(result.namespaces)||result.namespaces.length>50||result.namespaces.some(name=>typeof name!=="string"||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,59}$/.test(name))||new Set(result.namespaces).size!==result.namespaces.length)
        throw new PgNativePilotError(503,"invalid_smithery_response")
      return result.namespaces as string[]
    },
    searchSmitheryCatalog:async(query:string,page:number)=>{
      if(typeof query!=="string"||query.length>100||/[\u0000-\u001f\u007f]/.test(query)||!Number.isSafeInteger(page)||page<1||page>100)throw new PgNativePilotError(400,"invalid_smithery_query")
      const result=await post<unknown>("/api/v2/smithery/catalog",{query,page})
      try{return parsePgSmitheryCatalog(result)}catch{throw new PgNativePilotError(503,"invalid_smithery_response")}
    },
    listSmitheryConnections:async()=>{
      const result=await get<{items:unknown[]}>("/api/v2/smithery/connections")
      try{if(!Array.isArray(result.items)||result.items.length>50)throw Error();return result.items.map(parsePgSmitheryConnection)}catch{throw new PgNativePilotError(503,"invalid_smithery_response")}
    },
    getSmitheryConnection:(id:string)=>smithery("connections/"+smitheryId(id),"GET",undefined,parsePgSmitheryConnection),
    connectSmithery:(selection:SmitherySelection,request_id:string)=>{
      let checked:SmitherySelection;try{checked=parseSmitherySelection(selection)}catch{throw new PgNativePilotError(400,"invalid_smithery_selection")}
      smitheryId(request_id);return smithery("connections","POST",{selection:checked,request_id},parsePgSmitheryConnection)
    },
    operateSmithery:(id:string,expected_revision:number,action:"refresh"|"revoke"|"retry"|"pause")=>{
      smitheryId(id);safeRevision(expected_revision)
      if(!["refresh","revoke","retry","pause"].includes(action))throw new PgNativePilotError(400,"invalid_smithery_operation")
      return smithery("connections/"+id+"/"+action,"POST",{expected_revision},parsePgSmitheryConnection)
    },
    listMcpConnections:async()=>{
      const {items}=await get<{items:unknown[]}>(routes.mcpConnections)
      if(!Array.isArray(items)||items.length>50)throw new PgNativePilotError(503,"invalid_mcp_connection_response")
      return items.map(mcpItem)
    },
    getMcpConnection:async(id:string)=>mcpItem((await get<{item:unknown}>(mcpRoute(id))).item),
    createMcpConnection:async(input:PgNativeMcpInput,requestId:string)=>{
      mcpRoute(requestId)
      return mcpItem((await post<{item:unknown}>(routes.mcpConnections,{...input,request_id:requestId})).item)
    },
    updateMcpConnection:async(id:string,expected_revision:number,input:PgNativeMcpInput)=>
      mcpItem((await patch<{item:unknown}>(mcpRoute(id),{...input,expected_revision:safeRevision(expected_revision)})).item),
    deleteMcpConnection:(id:string,expected_revision:number)=>request<{ok:true}>(mcpRoute(id),"DELETE",{expected_revision:safeRevision(expected_revision)},transport,rootPath),
    discoverMcpConnection:async(id:string,expected_revision:number)=>mcpItem((await request<{item:unknown}>(`${mcpRoute(id)}/discover`,"POST",
      {expected_revision:safeRevision(expected_revision)},transport,rootPath,25000)).item),
    getAgentReleases:async(id:string)=>{
      const value=await get<{item:unknown}>(releaseRoute(id))
      return releaseResponse(()=>agentReleaseWorkspace(value.item,id))
    },
    getAgentReleaseVersion:async(id:string,version:string)=>{
      const value=await get<{item:unknown}>(releaseRoute(id,"versions",version))
      return releaseResponse(()=>agentReleaseDetail(value.item,id,version))
    },
    getAgentReleaseAcceptance:async(id:string,run:string)=>{
      const value=await get<{item:unknown}>(releaseRoute(id,"acceptance",run))
      return releaseResponse(()=>agentReleaseAcceptanceStatus(value.item,id,run))
    },
    changeAgentRelease:async(id:string,raw:PgNativeAgentReleaseChoice)=>{
      const choice=releasePayload(raw),value=await post<{item:unknown}>(releaseRoute(id,choice.action==="acceptance"?"acceptance":"change"),choice as unknown as Record<string,unknown>)
      return releaseResponse(()=>agentReleaseResult(value.item,id,choice))
    },
    confirmAgentRelease:async(id:string,raw:PgNativeAgentReleaseChoice)=>{
      const choice=releasePayload(raw),value=await post<{item:unknown}>(releaseRoute(id,"confirm"),choice as unknown as Record<string,unknown>)
      return releaseResponse(()=>agentReleaseResult(value.item,id,choice))
    },
    listAgentCollaboration:async()=>{
      const value=await get<{items:unknown}>(routes.collaboration)
      return collaborationResponse(()=>collaborationSummaries(value.items))
    },
    getAgentCollaboration:async(id:string)=>{
      const value=await get<{item:unknown}>(collaborationRoute(id))
      return collaborationResponse(()=>collaborationDetail(value.item,id))
    },
    getAgentCollaborationRevisions:async(id:string)=>{
      const value=await get<{items:unknown}>(collaborationRoute(id,"revisions"))
      return collaborationResponse(()=>collaborationRevisions(value.items))
    },
    changeAgentCollaboration:async(id:string,raw:PgNativeAgentCollaborationChoice)=>{
      const choice=collaborationPayload(raw),action=choice.action==="revoke"?"revoke":choice.action==="review"&&choice.decision==="reject"?"reject":"change"
      const value=await post<{item:unknown}>(collaborationRoute(id,action),choice as unknown as Record<string,unknown>)
      return collaborationResponse(()=>collaborationResult(value.item,id,choice))
    },
    confirmAgentCollaboration:async(id:string,raw:PgNativeAgentCollaborationChoice)=>{
      const choice=collaborationPayload(raw),value=await post<{item:unknown}>(collaborationRoute(id,"confirm"),choice as unknown as Record<string,unknown>)
      return collaborationResponse(()=>collaborationResult(value.item,id,choice))
    },
    listAgents:async()=> (await get<{items:PgNativeAgent[]}>(routes.agents)).items,
    createAgent:async(name:string,goal:string)=>(
      await post<{item:PgNativeAgent}>(routes.agents,{name,spec:{
        ...simpleAgentSpec(goal)
      }})
    ).item,
    getAgent:async(id:string)=>
      (await get<{item:PgNativeAgent}>(recordRoute(routes.agents,id))).item,
    updateAgent:async(id:string,expected_revision:number,name:string,goal:string)=>{
      const checkedGoal=safeAgentGoal(goal)
      const revision=safeRevision(expected_revision)
      const route=recordRoute(routes.agents,id)
      const current=(await get<{item:PgNativeAgent}>(route)).item
      if(current.revision!==revision)
        throw new PgNativePilotError(409,"revision_conflict")
      // Preserve all known user-authored spec fields instead of silently
      // resetting tool choice, task plan, deliverables or done criteria.
      const old=current.spec
      if(!old||typeof old.goal!=="string")
        throw new PgNativePilotError(409,"unexpected_stored_spec")
      const spec={...planReviewSetting(old),goal:checkedGoal,task_scope:old.task_scope??"",
        deliverables:old.deliverables??[],task_plan:old.task_plan??[],
        done_criteria:old.done_criteria??[],tools:old.tools??[],
        knowledge_base_ids:old.knowledge_base_ids??[],
        ...(old.knowledge_retrieval?{knowledge_retrieval:parseKnowledgeRetrievalBinding(old.knowledge_retrieval)}:{}),
        ...(old.http_tools?.length?{http_tools:old.http_tools}:{}),
        ...(old.mcp_tools?.length?{mcp_tools:old.mcp_tools}:{}),
        ...(old.model_binding?{model_binding:old.model_binding}:{})}
      return (await patch<{item:PgNativeAgent}>(route,{
        name,spec,expected_revision:revision
      })).item
    },
    updateAgentPlanReview:async(id:string,expected_revision:number,require_plan_review:boolean)=>{
      const revision=safeRevision(expected_revision),route=recordRoute(routes.agents,id)
      if(typeof require_plan_review!=="boolean")throw new PgNativePilotError(400,"invalid_agent_plan_review")
      const current=(await get<{item:PgNativeAgent}>(route)).item,old=current?.spec
      if(current?.id!==id.toLowerCase()||current.revision!==revision)throw new PgNativePilotError(409,"revision_conflict")
      if(!old||typeof old.goal!=="string")throw new PgNativePilotError(409,"unexpected_stored_spec")
      planReviewSetting(old)
      const spec={goal:old.goal,task_scope:old.task_scope??"",deliverables:old.deliverables??[],task_plan:old.task_plan??[],done_criteria:old.done_criteria??[],
        tools:old.tools??[],knowledge_base_ids:old.knowledge_base_ids??[],require_plan_review,
        ...(old.knowledge_retrieval?{knowledge_retrieval:parseKnowledgeRetrievalBinding(old.knowledge_retrieval)}:{}),
        ...(old.model_binding?{model_binding:old.model_binding}:{}),...(old.http_tools?.length?{http_tools:old.http_tools}:{}),...(old.mcp_tools?.length?{mcp_tools:old.mcp_tools}:{})}
      const saved=(await patch<{item:PgNativeAgent}>(route,{name:current.name,spec,expected_revision:revision})).item
      if(saved?.id!==current.id||saved.revision!==revision+1||saved.spec?.require_plan_review!==require_plan_review)throw new PgNativePilotError(503,"unconfirmed_agent_plan_review")
      return saved
    },
    // Explicit development UAT only. Server verifies all KB IDs belong to
    // this employee and the config-write capability before saving.
    updateAgentKnowledgeBases:async(id:string,expected_revision:number,ids:string[],retrieval?:KnowledgeRetrievalBinding|null)=>{
      const revision=safeRevision(expected_revision)
      if(!Array.isArray(ids)||ids.length>3||ids.some(x=>!safeId.test(x))||
         new Set(ids).size!==ids.length)
        throw new PgNativePilotError(400,"invalid_pg_native_knowledge_scope")
      const route=recordRoute(routes.agents,id)
      const current=(await get<{item:PgNativeAgent}>(route)).item
      if(current.revision!==revision)
        throw new PgNativePilotError(409,"revision_conflict")
      const old=current.spec
      if(!old||typeof old.goal!=="string")
        throw new PgNativePilotError(409,"unexpected_stored_spec")
      const tools=[...new Set([...(old.tools??[]),
        ...(ids.length?["knowledge_search"]:[])])]
      let selected:KnowledgeRetrievalBinding|undefined
      try{
        if(retrieval&&ids.length===0)throw Error()
        selected=ids.length?parseKnowledgeRetrievalBinding(retrieval===undefined?old.knowledge_retrieval:retrieval===null?undefined:retrieval):undefined
      }catch{throw new PgNativePilotError(400,"invalid_pg_native_knowledge_retrieval")}
      const spec={...planReviewSetting(old),goal:old.goal,task_scope:old.task_scope??"",
        deliverables:old.deliverables??[],task_plan:old.task_plan??[],
        done_criteria:old.done_criteria??[],tools,knowledge_base_ids:ids,
        ...(selected?{knowledge_retrieval:selected}:{}),
        ...(old.http_tools?.length?{http_tools:old.http_tools}:{}),
        ...(old.mcp_tools?.length?{mcp_tools:old.mcp_tools}:{}),
        ...(old.model_binding?{model_binding:old.model_binding}:{})}
      return (await patch<{item:PgNativeAgent}>(route,{
        name:current.name,spec,expected_revision:revision
      })).item
    },
    // Owner/model/revision safety is rechecked in the PostgreSQL repository.
    // This only saves configuration; the existing Worker refuses to execute
    // an Agent with a new model binding until the secure broker is approved.
    bindAgentModel:async(id:string,expected_revision:number,
      binding:PgNativeAgentModelBinding|null)=>{
      const revision=safeRevision(expected_revision)
      const route=recordRoute(routes.agents,id)
      const current=(await get<{item:PgNativeAgent}>(route)).item
      if(current.revision!==revision)
        throw new PgNativePilotError(409,"revision_conflict")
      if(binding!==null&&(!safeId.test(binding.connection_id)||
         !Number.isSafeInteger(binding.connection_revision)||
         binding.connection_revision<1||
         !/^[A-Za-z0-9._:/-]{1,120}$/.test(binding.model_id)))
        throw new PgNativePilotError(400,"invalid_pg_native_model_binding")
      const old=current.spec
      if(!old||typeof old.goal!=="string")
        throw new PgNativePilotError(409,"unexpected_stored_spec")
      const spec={...planReviewSetting(old),goal:old.goal,task_scope:old.task_scope??"",
        deliverables:old.deliverables??[],task_plan:old.task_plan??[],
        done_criteria:old.done_criteria??[],tools:old.tools??[],
        knowledge_base_ids:old.knowledge_base_ids??[],
        ...(old.knowledge_retrieval?{knowledge_retrieval:parseKnowledgeRetrievalBinding(old.knowledge_retrieval)}:{}),
        ...(old.http_tools?.length?{http_tools:old.http_tools}:{}),
        ...(old.mcp_tools?.length?{mcp_tools:old.mcp_tools}:{}),
        ...(binding?{model_binding:binding}:{})}
      return (await patch<{item:PgNativeAgent}>(route,{
        name:current.name,spec,expected_revision:revision
      })).item
    },
    updateAgentHttpTools:async(id:string,expected_revision:number,selection:AgentHttpTool[])=>{
      const revision=safeRevision(expected_revision),route=recordRoute(routes.agents,id)
      let httpTools:AgentHttpTool[]
      try{httpTools=parseAgentHttpTools(selection)}catch{throw new PgNativePilotError(400,"invalid_agent_http_tools")}
      const current=(await get<{item:PgNativeAgent}>(route)).item
      if(current.revision!==revision)throw new PgNativePilotError(409,"revision_conflict")
      const old=current.spec
      if(!old||typeof old.goal!=="string")throw new PgNativePilotError(409,"unexpected_stored_spec")
      const oldNames=new Set((old.http_tools??[]).map(tool=>tool.name))
      const tools=[...new Set([...(old.tools??[]).filter(name=>!oldNames.has(name)),...httpTools.map(tool=>tool.name)])]
      if(tools.length>20)throw new PgNativePilotError(400,"invalid_agent_http_tools")
      const spec={...planReviewSetting(old),goal:old.goal,task_scope:old.task_scope??"",deliverables:old.deliverables??[],
        task_plan:old.task_plan??[],done_criteria:old.done_criteria??[],tools,knowledge_base_ids:old.knowledge_base_ids??[],
        ...(old.knowledge_retrieval?{knowledge_retrieval:parseKnowledgeRetrievalBinding(old.knowledge_retrieval)}:{}),
        ...(old.model_binding?{model_binding:old.model_binding}:{}),...(old.mcp_tools?.length?{mcp_tools:old.mcp_tools}:{}),...(httpTools.length?{http_tools:httpTools}:{})}
      return (await patch<{item:PgNativeAgent}>(route,{name:current.name,spec,expected_revision:revision})).item
    },
    updateAgentMcpTools:async(id:string,expected_revision:number,selection:AgentMcpTool[])=>{
      const revision=safeRevision(expected_revision),route=recordRoute(routes.agents,id)
      let mcpTools:AgentMcpTool[]
      try{mcpTools=parseAgentMcpTools(selection)}catch{throw new PgNativePilotError(400,"invalid_agent_mcp_tools")}
      const current=(await get<{item:PgNativeAgent}>(route)).item
      if(current.revision!==revision)throw new PgNativePilotError(409,"revision_conflict")
      const old=current.spec
      if(!old||typeof old.goal!=="string")throw new PgNativePilotError(409,"unexpected_stored_spec")
      const oldNames=new Set((old.mcp_tools??[]).map(tool=>tool.name))
      const tools=[...new Set([...(old.tools??[]).filter(name=>!oldNames.has(name)),...mcpTools.map(tool=>tool.name)])]
      if(tools.length>20)throw new PgNativePilotError(400,"invalid_agent_mcp_tools")
      const spec={...planReviewSetting(old),goal:old.goal,task_scope:old.task_scope??"",deliverables:old.deliverables??[],task_plan:old.task_plan??[],
        done_criteria:old.done_criteria??[],tools,knowledge_base_ids:old.knowledge_base_ids??[],
        ...(old.knowledge_retrieval?{knowledge_retrieval:parseKnowledgeRetrievalBinding(old.knowledge_retrieval)}:{}),
        ...(old.model_binding?{model_binding:old.model_binding}:{}),...(old.http_tools?.length?{http_tools:old.http_tools}:{}),...(mcpTools.length?{mcp_tools:mcpTools}:{})}
      return (await patch<{item:PgNativeAgent}>(route,{name:current.name,spec,expected_revision:revision})).item
    },
    validateWorkflow:async(id:string,expected_revision:number,
      idempotency_key:string)=>{
      if(!/^[A-Za-z0-9_-]{8,80}$/.test(idempotency_key))
        throw new PgNativePilotError(400,"invalid_validation_idempotency_key")
      return post<PgNativeWorkflowValidationResult>(
        workflowValidationSubmitRoute(id),{
          expected_revision:safeRevision(expected_revision),idempotency_key})
    },
    getWorkflowValidation:(runId:string)=>
      get<PgNativeWorkflowValidationResult>(workflowValidationResultRoute(runId)),
    submitWorkflowRun:async(id:string,expected_revision:number,
      idempotency_key:string)=>{
      if(!/^[A-Za-z0-9_-]{8,80}$/.test(idempotency_key))
        throw new PgNativePilotError(400,"invalid_workflow_run_idempotency_key")
      return post<PgNativeWorkflowSafeRunResult>(workflowSafeRunSubmitRoute(id),{
        expected_revision:safeRevision(expected_revision),idempotency_key})
    },
    getWorkflowRun:(runId:string)=>
      get<PgNativeWorkflowSafeRunResult>(workflowSafeRunResultRoute(runId)),
    listWorkflowRuns:async()=>
      (await get<{runs:PgNativeWorkflowSafeRunResult[]}>(routes.workflowRuns)).runs,
    submitWorkflowV2Run:async(id:string,expected_revision:number,instruction:string,idempotency_key:string)=>{
      if(typeof instruction!=="string"||!instruction.trim()||instruction.length>2000||instruction.includes("\0")||
         !/^[A-Za-z0-9_-]{8,80}$/.test(idempotency_key))throw new PgNativePilotError(400,"invalid_workflow_v2_request")
      return agentHumanProjection(await post<PgNativeWorkflowV2Result>((recordRoute(routes.workflows,id)+"/native-runs") as Route,{
        expected_revision:safeRevision(expected_revision),instruction,idempotency_key}))
    },
    getWorkflowV2Run:async(id:string)=>agentHumanProjection(await get<PgNativeWorkflowV2Result>(recordRoute(routes.workflowV2Runs,id))),
    respondWorkflowAgent:async(id:string,choice:AgentHumanResponse)=>humanResponse(routes.workflowV2Runs,id,choice),
    confirmWorkflowAgentResponse:async(id:string,choice:AgentHumanResponse)=>humanResponse(routes.workflowV2Runs,id,choice,true),
    getWorkflowAgentHumanHistory:async(id:string,after="",limit=10)=>humanHistory(routes.workflowV2Runs,id,after,limit),
    submitWorkflowNodeDebug:async(id:string,raw:WorkflowNodeDebugRequest)=>{
      const route=recordRoute(routes.workflows,id)
      let body:WorkflowNodeDebugRequest;try{body=safeWorkflowNodeDebugRequest(raw)}catch{throw new PgNativePilotError(400,"invalid_workflow_node_debug_request")}
      return post<PgNativeWorkflowV2Result>((route+"/model-node-debug") as Route,body)
    },
    listWorkflowV2Runs:async(workflowId?:string)=>{
      if(workflowId!==undefined)recordRoute(routes.workflows,workflowId)
      return (await get<{items:PgNativeWorkflowV2Summary[]}>((routes.workflowV2Runs+(workflowId!==undefined?"?workflow_id="+encodeURIComponent(workflowId):"")) as Route)).items
    },
    getWorkflowV2Outputs:async(id:string)=>{
      const payload=await get<unknown>((recordRoute(routes.workflowV2Runs,id)+"/outputs") as Route)
      try{return parseWorkflowLatestOutputs(payload,id.toLowerCase())}catch{throw new PgNativePilotError(503,"invalid_workflow_output_response")}
    },
    getWorkflowV2OutputHistory:async(id:string,after="",limit=25)=>{
      const route=recordRoute(routes.workflowV2Runs,id)
      if(!validWorkflowOutputCursor(after)||!Number.isSafeInteger(limit)||limit<1||limit>50)throw new PgNativePilotError(400,"invalid_workflow_output_cursor")
      const payload=await get<unknown>((route+"/output-history?limit="+limit+"&after="+encodeURIComponent(after)) as Route)
      try{const page=parseWorkflowOutputHistory(payload,id.toLowerCase());if(page.items.length>limit||page.items.some(item=>item.step_key<=after))throw Error();return page}
      catch{throw new PgNativePilotError(503,"invalid_workflow_output_response")}
    },
    decideWorkflowV2Node:async(id:string,decision:"approved"|"rejected",step_key:string,input_sha256:string,knowledge_query_charge?:typeof KNOWLEDGE_TOOL_CHARGE_ACKNOWLEDGEMENT)=>{
      if(!["approved","rejected"].includes(decision)||!/^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,100}$/.test(step_key)||
         !/^[a-f0-9]{64}$/.test(input_sha256)||knowledge_query_charge!==undefined&&(decision!=="approved"||knowledge_query_charge!==KNOWLEDGE_TOOL_CHARGE_ACKNOWLEDGEMENT))throw new PgNativePilotError(400,"invalid_workflow_v2_request")
      return post<PgNativeWorkflowV2Result>((recordRoute(routes.workflowV2Runs,id)+"/decision") as Route,{decision,step_key,input_sha256,...(knowledge_query_charge?{knowledge_query_charge}:{})})
    },
    cancelWorkflowV2Run:async(id:string)=>post<PgNativeWorkflowV2Result>((recordRoute(routes.workflowV2Runs,id)+"/cancel") as Route,{}),
    getWorkflowV2Steps:async(id:string,after="",limit=100)=>{
      if(!Number.isSafeInteger(limit)||limit<1||limit>200||(after!==""&&!/^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,100}$/.test(after)))
        throw new PgNativePilotError(400,"invalid_workflow_step_cursor")
      return get<{items:Array<{step_key:string;status:string;metadata:Record<string,unknown>}>;next_after:string|null}>(
        (recordRoute(routes.workflowV2Runs,id)+"/steps?limit="+limit+"&after="+encodeURIComponent(after)) as Route)
    },
    submitAutonomousAgentRun:async(id:string,expected_revision:number,instruction:string,idempotency_key:string,max_steps=3,require_plan_review?:boolean)=>{
      if(!Number.isSafeInteger(max_steps)||max_steps<1||max_steps>30)throw new PgNativePilotError(400,"invalid_agent_max_steps")
      if(typeof instruction!=="string"||!instruction.trim()||instruction.length>2000||instruction.includes("\0")||
         !/^[A-Za-z0-9_-]{8,80}$/.test(idempotency_key))throw new PgNativePilotError(400,"invalid_workflow_v2_request")
      if(require_plan_review!==undefined&&typeof require_plan_review!=="boolean")throw new PgNativePilotError(400,"invalid_agent_plan_review")
      return agentHumanProjection(await post<PgNativeAutonomousAgentResult>((recordRoute(routes.agents,id)+"/autonomous-runs") as Route,{
        expected_revision:safeRevision(expected_revision),instruction,idempotency_key,max_steps,...(require_plan_review!==undefined?{require_plan_review}:{})}))
    },
    getAutonomousAgentRun:async(id:string)=>agentHumanProjection(await get<PgNativeAutonomousAgentResult>(recordRoute(routes.autonomousAgentRuns,id))),
    respondAutonomousAgent:async(id:string,choice:AgentHumanResponse)=>humanResponse(routes.autonomousAgentRuns,id,choice),
    confirmAutonomousAgentResponse:async(id:string,choice:AgentHumanResponse)=>humanResponse(routes.autonomousAgentRuns,id,choice,true),
    getAutonomousAgentHumanHistory:async(id:string,after="",limit=10)=>humanHistory(routes.autonomousAgentRuns,id,after,limit),
    listAutonomousAgentRuns:async()=> (await get<{items:PgNativeAutonomousAgentSummary[]}>(routes.autonomousAgentRuns)).items,
    decideAutonomousAgentNode:async(id:string,decision:"approved"|"rejected",step_key:string,input_sha256:string,knowledge_query_charge?:typeof KNOWLEDGE_TOOL_CHARGE_ACKNOWLEDGEMENT)=>{
      if(!["approved","rejected"].includes(decision)||!/^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,100}$/.test(step_key)||
         !/^[a-f0-9]{64}$/.test(input_sha256)||knowledge_query_charge!==undefined&&(decision!=="approved"||knowledge_query_charge!==KNOWLEDGE_TOOL_CHARGE_ACKNOWLEDGEMENT))throw new PgNativePilotError(400,"invalid_workflow_v2_request")
      return post<PgNativeAutonomousAgentResult>((recordRoute(routes.autonomousAgentRuns,id)+"/decision") as Route,{decision,step_key,input_sha256,...(knowledge_query_charge?{knowledge_query_charge}:{})})
    },
    cancelAutonomousAgentRun:async(id:string)=>post<PgNativeAutonomousAgentResult>((recordRoute(routes.autonomousAgentRuns,id)+"/cancel") as Route,{}),
    getAutonomousAgentSteps:async(id:string,after="",limit=100)=>{
      if(!Number.isSafeInteger(limit)||limit<1||limit>200||(after!==""&&!/^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,100}$/.test(after)))
        throw new PgNativePilotError(400,"invalid_workflow_step_cursor")
      return get<{items:Array<{step_key:string;status:string;metadata:Record<string,unknown>}>;next_after:string|null}>(
        (recordRoute(routes.autonomousAgentRuns,id)+"/steps?limit="+limit+"&after="+encodeURIComponent(after)) as Route)
    },
    listWorkflows:async()=> (
      await get<{items:PgNativeWorkflow[]}>(routes.workflows)).items,
    createWorkflow:async(name:string)=> (
      await post<{item:PgNativeWorkflow}>(routes.workflows,{
        name,graph:simpleWorkflowGraph()
      })
    ).item,
    createWorkflowGraph:async(name:string,graph:unknown,request_id?:string)=>{
      if(request_id!==undefined)recordRoute(routes.workflows,request_id)
      return (await post<{item:PgNativeWorkflow}>(routes.workflows,{name,graph,...(request_id?{request_id}:{})})).item
    },
    updateWorkflowGraph:async(id:string,expected_revision:number,name:string,graph:unknown)=>
      (await patch<{item:PgNativeWorkflow}>(recordRoute(routes.workflows,id),{
        name,graph,expected_revision:safeRevision(expected_revision)
      })).item,
    getWorkflow:async(id:string)=>
      (await get<{item:PgNativeWorkflow}>(recordRoute(routes.workflows,id))).item,
    updateWorkflow:async(id:string,expected_revision:number,name:string)=>{
      const revision=safeRevision(expected_revision)
      const route=recordRoute(routes.workflows,id)
      const current=(await get<{item:PgNativeWorkflow}>(route)).item
      if(current.revision!==revision)
        throw new PgNativePilotError(409,"revision_conflict")
      if(!current.graph||!Array.isArray(current.graph.nodes)||
         !Array.isArray(current.graph.edges))
        throw new PgNativePilotError(409,"unexpected_stored_graph")
      return (await patch<{item:PgNativeWorkflow}>(route,{
        name,graph:current.graph,expected_revision:revision
      })).item
    },
    getKnowledgeEmbeddingSettings:async()=>(await get<{item:KnowledgeEmbeddingSettings}>("/api/v2/knowledge-embedding/settings")).item,
    submitKnowledgeQuery:(input:KnowledgeQueryRequest)=>post<{item:KnowledgeQueryReceipt;replayed:boolean}>("/api/v2/knowledge-query/submit",{...input}),
    getKnowledgeQueryReceipt:async(requestId:string)=>{
      recordRoute(routes.bases,requestId)
      return (await get<{item:KnowledgeQueryReceipt|null}>(`/api/v2/knowledge-query/receipt?request_id=${requestId}`)).item
    },
    authorizeKnowledgeIndex:(input:KnowledgeIndexAuthorization)=>post<{item:KnowledgeIndexAuthorizationReceipt;replayed:boolean}>("/api/v2/knowledge-embedding/index-authorize",{...input}),
    getKnowledgeIndexAuthorizationReceipt:async(requestId:string)=>{
      recordRoute(routes.bases,requestId)
      return (await get<{item:KnowledgeIndexAuthorizationReceipt|null}>(`/api/v2/knowledge-embedding/index-receipt?request_id=${requestId}`)).item
    },
    getKnowledgeIndexStatus:async(baseId:string)=>{
      recordRoute(routes.bases,baseId)
      return (await get<{item:KnowledgeIndexStatus}>(`/api/v2/knowledge-embedding/bases/${baseId}/index-status`)).item
    },
    getKnowledgeEmbeddingConsent:async()=>(await get<{item:KnowledgeEmbeddingConsent}>("/api/v2/knowledge-embedding/consent")).item,
    changeKnowledgeEmbeddingConsent:(input:KnowledgeEmbeddingConsentChange)=>post<{item:KnowledgeEmbeddingConsentReceipt;replayed:boolean}>("/api/v2/knowledge-embedding/consent",{...input}),
    getKnowledgeEmbeddingConsentReceipt:async(requestId:string)=>{
      recordRoute(routes.bases,requestId)
      return (await get<{item:KnowledgeEmbeddingConsentReceipt|null}>(`/api/v2/knowledge-embedding/consent-receipt?request_id=${requestId}`)).item
    },
    changeKnowledgeEmbeddingSettings:(input:Exclude<KnowledgeEmbeddingChange,{action:"rebuild"}>)=>post<{item:KnowledgeEmbeddingReceipt;replayed:boolean}>("/api/v2/knowledge-embedding/settings",{...input}),
    getKnowledgeEmbeddingStatus:async(id:string)=>{
      recordRoute(routes.bases,id)
      return (await get<{item:KnowledgeEmbeddingStatus}>(`/api/v2/knowledge-embedding/bases/${id}/status`)).item
    },
    rebuildKnowledgeEmbeddingIndex:(id:string,expectedRevision:number,requestId:string)=>{
      recordRoute(routes.bases,id);recordRoute(routes.bases,requestId)
      if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1)throw new PgNativePilotError(400,"invalid_embedding_request")
      return post<{item:KnowledgeEmbeddingReceipt;replayed:boolean}>(`/api/v2/knowledge-embedding/bases/${id}/rebuild`,{expected_revision:expectedRevision,request_id:requestId})
    },
    getKnowledgeEmbeddingReceipt:async(requestId:string)=>{
      recordRoute(routes.bases,requestId)
      return (await get<{item:KnowledgeEmbeddingReceipt|null}>(`/api/v2/knowledge-embedding/receipt?request_id=${requestId}`)).item
    },
    listSharedKnowledge:async()=>(await get<{items:SharedKnowledgeMetadata[]}>("/api/v2/shared-knowledge")).items,
    getSharedKnowledge:async(id:string)=>(await get<{item:KnowledgeContentMetadata}>(recordRoute("/api/v2/shared-knowledge",id))).item,
    listSharedKnowledgeDocuments:async(id:string)=>(await get<{items:KnowledgeDocumentRow[]}>((recordRoute("/api/v2/shared-knowledge",id)+"/documents") as Route)).items,
    listKnowledgeGrants:async(id:string)=>(await get<{items:KnowledgeGrant[]}>((recordRoute("/api/v2/shared-knowledge",id)+"/access") as Route)).items,
    changeKnowledgeAccess:(id:string,input:Record<string,unknown>)=>post<{item:KnowledgeAccessReceipt;replayed:boolean}>((recordRoute("/api/v2/shared-knowledge",id)+"/access") as Route,input),
    searchSharedKnowledge:async(id:string,query:string)=>(await post<{items:KnowledgeSearchHit[]}>((recordRoute("/api/v2/shared-knowledge",id)+"/search") as Route,safeKeywordQuery(query,8))).items,
    // The parser alone may use 12s; leave time for authentication, SQL and its
    // bounded response. A lost reply still requires explicit receipt recovery.
    importSharedKnowledge:(id:string,input:Record<string,unknown>)=>request<{item:KnowledgeContentReceipt;replayed:boolean}>((recordRoute("/api/v2/shared-knowledge",id)+"/import") as Route,"POST",input,transport,rootPath,20000),
    deleteSharedKnowledge:(id:string,input:Record<string,unknown>)=>post<{item:KnowledgeContentReceipt;replayed:boolean}>((recordRoute("/api/v2/shared-knowledge",id)+"/delete") as Route,input),
    getKnowledgeContentReceipt:async(id:string,requestId:string)=>{
      recordRoute(routes.bases,requestId)
      return (await get<{item:KnowledgeContentReceipt|null}>((recordRoute("/api/v2/shared-knowledge",id)+"/content-receipt?request_id="+requestId) as Route)).item
    },
    getKnowledgeAccessReceipt:async(id:string,requestId:string)=>{
      recordRoute(routes.bases,requestId)
      return (await get<{item:KnowledgeAccessReceipt|null}>((recordRoute("/api/v2/shared-knowledge",id)+"/access-receipt?request_id="+requestId) as Route)).item
    },
    listKnowledge:async()=>(
      await get<{items:PgNativeKnowledge[]}>(routes.bases)).items,
    // Metadata only: the Native API never sends object keys, file bodies or embeddings.
    listKnowledgeDocuments:async(id:string)=>(
      await get<{items:PgNativeKnowledgeDocument[]}>(
        knowledgeDocumentsRoute(id))).items,
    // POST carries private query text in a bounded JSON body, never in a URL.
    // Result is clearly LITERAL keyword matching, not semantic/vector RAG.
    searchKnowledgeKeyword:async(id:string,query:string,limit=6)=>
      post<PgNativeKeywordSearch>(knowledgeKeywordSearchRoute(id),
        safeKeywordQuery(query,limit)),
    // A real write, rejected by the server unless a THIRD isolated UAT gate
    // is explicitly approved. No API for file bytes or external storage keys.
    ingestKnowledgeTextUat:async(id:string,filename:string,text:string)=>
      post<PgNativeTextIngestUat>(knowledgeTextIngestRoute(id),
        safeTextIngestUat(filename,text)),
    // Inert schedule drafts only: always disabled, no next_at, no Worker run.
    createScheduleDraft:async(input:PgNativeScheduleDraftInput)=>
      (await post<{item:PgNativeSchedule;execution_enabled:false}>(
        routes.schedules,input as unknown as Record<string,unknown>)).item,
    updateScheduleDraft:async(id:string,revision:number,input:PgNativeScheduleDraftInput)=>
      (await patch<{item:PgNativeSchedule;execution_enabled:false}>(
        scheduleDraftRoute(id),{...input,expected_revision:safeRevision(revision)})).item,
    deleteScheduleDraft:async(id:string,revision:number)=>
      request<{ok:true;execution_enabled:false}>(scheduleDraftRoute(id),
        "DELETE",{expected_revision:safeRevision(revision)},transport,rootPath),
    listSchedules:async()=>
      (await get<{items:PgNativeSchedule[]}>(routes.schedules)).items,
    getScheduleExecution:async(id:string)=>{
      const value=(await get<{state:PgNativeScheduleExecution}>((scheduleDraftRoute(id)+"/execution") as Route)).state
      if(!value||value.schedule_id!==id||!Number.isSafeInteger(value.revision)||typeof value.enabled!=="boolean"||typeof value.source_current!=="boolean"||
        !Number.isSafeInteger(value.used_occurrences)||!value.execution||typeof value.execution!=="object")throw new PgNativePilotError(503,"invalid_schedule_execution_response")
      return value
    },
    activateSchedule:async(id:string,body:PgNativeScheduleActivation)=>{
      const value=(await post<{state:{id:string;revision:number;authority_id:string;replayed:boolean}}>((scheduleDraftRoute(id)+"/activate") as Route,body as unknown as Record<string,unknown>)).state
      if(!value||value.id!==id||value.revision!==body.expected_revision+1||!safeId.test(value.authority_id)||typeof value.replayed!=="boolean")throw new PgNativePilotError(503,"invalid_schedule_activation_response")
      return value
    },
    pauseSchedule:(id:string,revision:number)=>post<{ok:true}>((scheduleDraftRoute(id)+"/pause") as Route,{expected_revision:safeRevision(revision)}),
    runScheduleNow:async(id:string,revision:number)=>(await post<{state:{occurrence_id:string;run_id:string;queued:true}}>((scheduleDraftRoute(id)+"/run-now") as Route,{expected_revision:safeRevision(revision)})).state,
    retryScheduleStart:async(id:string,revision:number,occurrence:string)=>{
      if(!safeId.test(occurrence))throw new PgNativePilotError(400,"invalid_schedule_occurrence")
      return (await post<{state:{occurrence_id:string;run_id:string;queued:true}}>((scheduleDraftRoute(id)+"/retry-start") as Route,{expected_revision:safeRevision(revision),occurrence_id:occurrence})).state
    },
    listScheduleOccurrences:async(id:string)=>
      (await get<{items:PgNativeScheduleOccurrence[]}>(
        scheduleOccurrencesRoute(id))).items,

    getKnowledge:async(id:string)=>
      (await get<{item:PgNativeKnowledge}>(recordRoute(routes.bases,id))).item,
    updateKnowledge:async(id:string,expected_revision:number,
                          name:string,description:string)=>
      (await patch<{item:PgNativeKnowledge}>(recordRoute(routes.bases,id),{
        name,description,expected_revision:safeRevision(expected_revision)
      })).item,
    createKnowledge:async(name:string,description:string)=>(
      await post<{item:PgNativeKnowledge}>(routes.bases,{name,description})
    ).item,
    // Run/approval routes are server-side disabled by default. The client
    // never chooses a remote origin and never runs tasks on its own.
    listRuns:async()=> (await get<{runs:PgNativeRun[]}>(routes.runs)).runs.map(safeSingleRun),
    getRun:async(id:string)=>{
      const result=await get<PgNativeRunDetail>(runRoute(id)),run=safeSingleRun(result.run)
      return {...result,run,steps:run.knowledge_outputs_available===false?result.steps.map(step=>({...step,metadata:{}})):result.steps}
    },
    submitRun:async(specId:string,instruction:string,idempotencyKey:string)=>{
      const result=await post<PgNativeRunSubmission>(runSubmissionRoute(specId),safeRunPayload(instruction,idempotencyKey))
      return {...result,run:safeSingleRun(result.run)}
    },
    decideModel:async(id:string,decision:"approved"|"rejected")=>{
      if(decision!=="approved"&&decision!=="rejected")
        throw new PgNativePilotError(400,"invalid_pg_native_decision")
      const result=await post<PgNativeRunDecision>(`${runRoute(id)}/model-approval`,{decision})
      return {...result,run:safeSingleRun(result.run)}
    },
  }
}
