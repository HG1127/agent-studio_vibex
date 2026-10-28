import {selectAutonomousAgentExecution} from "./durable-v2-root.ts"
import {selectMcpExecution} from "./mcp-call.ts"
import {selectSmitheryManagement} from "./smithery-contracts.ts"
import {selectKnowledgeSharing} from "./knowledge-sharing-policy.ts"
import {selectKnowledgeEmbeddingSettings,selectKnowledgeEmbeddingConsent} from "./knowledge-embedding-policy.ts"
import {selectKnowledgeIndexRuntime} from "./knowledge-index-policy.ts"
import {selectKnowledgeQueryRuntime} from "./knowledge-query-policy.ts"
import {selectKnowledgeToolRuntime} from "./knowledge-tool-policy.ts"
import {selectScheduleRuntime} from "./schedule-runtime-policy.ts"
import {selectAgentMemoryRuntime,selectAgentDerivedMemoryWrites,selectAgentOutcomeMemoryWrites} from "./agent-memory-runtime-policy.ts"
import {selectAgentFeedbackScopes} from "./agent-feedback-runtime-policy.ts"
import {selectAgentOptimizationAcceptance} from "./agent-optimization-runtime-policy.ts"
import {selectAgentReviewSubmission} from "./agent-review-runtime-policy.ts"
import {selectAgentGeneratedAcceptance} from "./agent-generated-runtime-policy.ts"
import {selectAgentDescriptivePatchAcceptance} from "./agent-descriptive-patch-runtime-policy.ts"
// Standalone PG18 UAT-only business configuration mutation policy.
// This module does NOT connect to a database or start an HTTP listener.
// The current 8090/PocketBase site remains authoritative until full UAT.
export interface NativePg18UatCapabilities {
  configurationWrites:boolean
  employeeProvisioning:boolean
  /** Disabled unless a SECOND explicit, isolated Run/approval UAT acknowledgement. */
  runApprovalUat:boolean
  /** Explicitly reviewed synthetic TXT/MD ingestion, never document-files. */
  knowledgeIngestUat:boolean
  /** External GET /models is a separate opt-in, never inherited from configuration writes. */
  modelProbeUat:boolean
  mcpDiscoveryUat?:boolean
  mcpToolExecutionUat?:boolean
  smitheryManagementUat?:boolean
  knowledgeSharingUat?:boolean
  knowledgeEmbeddingSettingsUat?:boolean
  knowledgeEmbeddingConsentUat?:boolean
  knowledgeIndexRuntimeUat?:boolean
  knowledgeQueryRuntimeUat?:boolean
  knowledgeToolExecutionUat?:boolean
  /** Additional opt-in for inert Start/End-only Workflow validation records. */
  workflowValidationUat?:boolean
  /** Separately approved queue + safe Start/End Workflow Worker UAT. */
  workflowExecutionUat?:boolean
  /** Versioned Workflow queue/approval UAT, independent of Start/End-only. */
  workflowV2ExecutionUat?:boolean
  autonomousAgentUat?:boolean
  agentMemoryUat?:boolean
  agentDerivedMemoryUat?:boolean
  agentOutcomeMemoryUat?:boolean
  agentFeedbackUat?:boolean
  agentFeedbackLessonsUat?:boolean
  agentOptimizationUat?:boolean
  agentReviewSubmissionUat?:boolean
  agentGeneratedAcceptanceUat?:boolean
  agentDescriptivePatchUat?:boolean
  scheduleRuntimeUat?:boolean
  /** Additional independent UAT prerequisite; does not register a paid transport. */
  boundModelExecutionUat?:boolean
}
const empty:NativePg18UatCapabilities={
  configurationWrites:false,employeeProvisioning:false,
  runApprovalUat:false,knowledgeIngestUat:false,modelProbeUat:false,
}
function refuse():never{throw Error("unsafe_native_pg18_uat_config")}
const permissionMarker="APPROVE_ISOLATED_PG18_CONFIG_UAT_ONLY"
const runApprovalMarker="APPROVE_DISPOSABLE_PG18_RUN_APPROVAL_UAT_ONLY"
const kbIngestMarker="APPROVE_DISPOSABLE_PG18_TEXT_INGEST_UAT_ONLY"
const modelProbeMarker="APPROVE_DISPOSABLE_PG18_PROVIDER_READONLY_PROBE_ONLY"
const workflowValidationMarker="APPROVE_DISPOSABLE_PG18_WORKFLOW_VALIDATION_ONLY"
const workflowExecutionMarker="APPROVE_DISPOSABLE_PG18_WORKFLOW_EXECUTION_ONLY"
const workflowV2Marker="APPROVE_DISPOSABLE_PG18_WORKFLOW_V2_EXECUTION_ONLY"
const boundModelExecutionMarker="APPROVE_DISPOSABLE_PG18_OWNER_BOUND_GENERATION_UAT_ONLY"

// Explicit operator acknowledgement is required only for an isolated
// non-root HTTPS service; --plan and read-only --preflight can never turn
// into a write-capable server by inheriting ambient environment variables.
export function selectNativePg18UatCapabilities(
  env:NodeJS.ProcessEnv,listen:boolean,origin:string,
  uid=process.getuid?.(),
):NativePg18UatCapabilities {
  const autonomousAgentUat=selectAutonomousAgentExecution(env)
  const agentMemoryUat=selectAgentMemoryRuntime(env)
  const agentDerivedMemoryUat=selectAgentDerivedMemoryWrites(env)
  const agentOutcomeMemoryUat=selectAgentOutcomeMemoryWrites(env)
  const feedback=selectAgentFeedbackScopes(env)
  const optimization=selectAgentOptimizationAcceptance(env)
  const reviewSubmission=selectAgentReviewSubmission(env)
  const generatedAcceptance=selectAgentGeneratedAcceptance(env)
  const descriptivePatch=selectAgentDescriptivePatchAcceptance(env)
  const scheduleRuntimeUat=selectScheduleRuntime(env)
  const mcpToolExecutionUat=selectMcpExecution(env)
  const smitheryManagementUat=selectSmitheryManagement(env)
  const knowledgeSharingUat=selectKnowledgeSharing(env)
  const knowledgeEmbeddingSettingsUat=selectKnowledgeEmbeddingSettings(env)
  const knowledgeEmbeddingConsentUat=selectKnowledgeEmbeddingConsent(env)
  const knowledgeIndexRuntimeUat=selectKnowledgeIndexRuntime(env)
  const knowledgeQueryRuntimeUat=selectKnowledgeQueryRuntime(env)
  const knowledgeToolExecutionUat=selectKnowledgeToolRuntime(env)
  if(knowledgeEmbeddingSettingsUat&&!knowledgeSharingUat)refuse()
  if(knowledgeEmbeddingConsentUat&&!knowledgeEmbeddingSettingsUat)refuse()
  if(knowledgeIndexRuntimeUat&&!knowledgeEmbeddingConsentUat)refuse()
  if(knowledgeQueryRuntimeUat&&!knowledgeEmbeddingConsentUat)refuse()
  const config=env.AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED
  const employees=env.AGENT_STUDIO_PG18_EMPLOYEE_UAT_ENABLED
  const marker=env.AGENT_STUDIO_PG18_UAT_APPROVAL
  const run=env.AGENT_STUDIO_PG18_RUN_APPROVAL_UAT_ENABLED
  const runMarker=env.AGENT_STUDIO_PG18_RUN_APPROVAL_UAT_APPROVED
  const ingest=env.AGENT_STUDIO_PG18_KNOWLEDGE_INGEST_UAT_ENABLED
  const ingestMarker=env.AGENT_STUDIO_PG18_KNOWLEDGE_INGEST_UAT_APPROVED
  const probe=env.AGENT_STUDIO_PG18_MODEL_PROBE_UAT_ENABLED
  const probeMarker=env.AGENT_STUDIO_PG18_MODEL_PROBE_UAT_APPROVED
  const mcp=env.AGENT_STUDIO_PG18_MCP_DISCOVERY_UAT_ENABLED
  const mcpMarker=env.AGENT_STUDIO_PG18_MCP_DISCOVERY_UAT_APPROVED
  const flow=env.AGENT_STUDIO_PG18_WORKFLOW_VALIDATION_UAT_ENABLED
  const flowMarker=env.AGENT_STUDIO_PG18_WORKFLOW_VALIDATION_UAT_APPROVED
  const execution=env.AGENT_STUDIO_PG18_WORKFLOW_EXECUTION_UAT_ENABLED
  const executionMarker=env.AGENT_STUDIO_PG18_WORKFLOW_EXECUTION_UAT_APPROVED
  const flowV2=env.AGENT_STUDIO_PG18_WORKFLOW_V2_UAT_ENABLED
  const flowV2Marker=env.AGENT_STUDIO_PG18_WORKFLOW_V2_UAT_APPROVED
  const boundModel=env.AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_ENABLED
  const boundModelMarker=env.AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_APPROVED
  for(const value of [config,employees,run,ingest,probe,mcp,flow,execution,flowV2,boundModel])
    if(value!==undefined&&value!=="true")refuse()
  const configUat=config==="true"
  if(agentMemoryUat&&(!configUat||!autonomousAgentUat))refuse()
  if(agentDerivedMemoryUat&&!configUat)refuse()
  if(feedback.submit&&!configUat)refuse()
  if(optimization&&!configUat)refuse()
  if(reviewSubmission&&!configUat)refuse()
  if(generatedAcceptance&&!configUat)refuse()
  if(descriptivePatch&&!configUat)refuse()
  if(agentOutcomeMemoryUat&&(!configUat||!autonomousAgentUat||!agentDerivedMemoryUat))refuse()
  const employeeUat=employees==="true"
  const runUat=run==="true"
  const ingestUat=ingest==="true"
  const modelProbeUat=probe==="true"
  const mcpDiscoveryUat=mcp==="true"
  if(!mcpDiscoveryUat&&mcpMarker!==undefined)refuse()
  const workflowValidationUat=flow==="true"
  const workflowExecutionUat=execution==="true"
  const workflowV2ExecutionUat=flowV2==="true"
  if(scheduleRuntimeUat&&(!workflowV2ExecutionUat||!autonomousAgentUat))refuse()
  const boundModelExecutionUat=boundModel==="true"
  if(!boundModelExecutionUat&&boundModelMarker!==undefined)refuse()
  if(!runUat&&runMarker!==undefined)refuse()
  if(!ingestUat&&ingestMarker!==undefined)refuse()
  if(!modelProbeUat&&probeMarker!==undefined)refuse()
  if(!workflowValidationUat&&flowMarker!==undefined)refuse()
  if(!workflowExecutionUat&&executionMarker!==undefined)refuse()
  if(!workflowV2ExecutionUat&&flowV2Marker!==undefined)refuse()
  if(!configUat&&!employeeUat&&!runUat&&!ingestUat&&!modelProbeUat&&
     !knowledgeSharingUat&&!smitheryManagementUat&&!mcpToolExecutionUat&&!mcpDiscoveryUat&&!workflowValidationUat&&!workflowExecutionUat&&!workflowV2ExecutionUat&&!boundModelExecutionUat&&!autonomousAgentUat){
    if(marker!==undefined)refuse()
    return {...empty}
  }
  if(!listen||!Number.isSafeInteger(uid)||uid===undefined||uid<=0||
     !origin.startsWith("https://")||
     marker!==permissionMarker||
     ((knowledgeSharingUat||smitheryManagementUat||mcpToolExecutionUat||employeeUat||runUat||ingestUat||modelProbeUat||mcpDiscoveryUat||workflowValidationUat||workflowExecutionUat||workflowV2ExecutionUat||boundModelExecutionUat||autonomousAgentUat)&&!configUat)||
     (mcpToolExecutionUat&&!workflowV2ExecutionUat&&!autonomousAgentUat)||
     (mcpDiscoveryUat&&mcpMarker!=="APPROVE_DISPOSABLE_PG18_MCP_DISCOVERY_ONLY")||
     (runUat&&runMarker!==runApprovalMarker)||
     (ingestUat&&ingestMarker!==kbIngestMarker)||
     (modelProbeUat&&probeMarker!==modelProbeMarker)||
     (workflowValidationUat&&flowMarker!==workflowValidationMarker)||
     (workflowExecutionUat&&executionMarker!==workflowExecutionMarker)||
     (workflowV2ExecutionUat&&flowV2Marker!==workflowV2Marker)||
      (boundModelExecutionUat&&(!runUat||boundModelMarker!==boundModelExecutionMarker)))refuse()
  return {configurationWrites:configUat,
    employeeProvisioning:employeeUat,runApprovalUat:runUat,
    knowledgeIngestUat:ingestUat,modelProbeUat,
    ...(mcpDiscoveryUat?{mcpDiscoveryUat:true}:{}),
    ...(mcpToolExecutionUat?{mcpToolExecutionUat:true}:{}),
    ...(smitheryManagementUat?{smitheryManagementUat:true}:{}),
    ...(knowledgeSharingUat?{knowledgeSharingUat:true}:{}),
    ...(knowledgeEmbeddingSettingsUat?{knowledgeEmbeddingSettingsUat:true}:{}),
    ...(knowledgeEmbeddingConsentUat?{knowledgeEmbeddingConsentUat:true}:{}),
    ...(knowledgeIndexRuntimeUat?{knowledgeIndexRuntimeUat:true}:{}),
    ...(knowledgeQueryRuntimeUat?{knowledgeQueryRuntimeUat:true}:{}),
    ...(knowledgeToolExecutionUat?{knowledgeToolExecutionUat:true}:{}),
    ...(workflowValidationUat?{workflowValidationUat:true}:{}),
    ...(workflowExecutionUat?{workflowExecutionUat:true}:{}),
    ...(workflowV2ExecutionUat?{workflowV2ExecutionUat:true}:{}),
    ...(autonomousAgentUat?{autonomousAgentUat:true}:{}),
    ...(agentMemoryUat?{agentMemoryUat:true}:{}),
    ...(agentDerivedMemoryUat?{agentDerivedMemoryUat:true}:{}),
    ...(agentOutcomeMemoryUat?{agentOutcomeMemoryUat:true}:{}),
    ...(feedback.submit?{agentFeedbackUat:true}:{}),
    ...(feedback.lessons?{agentFeedbackLessonsUat:true}:{}),
    ...(optimization?{agentOptimizationUat:true}:{}),
    ...(reviewSubmission?{agentReviewSubmissionUat:true}:{}),
    ...(generatedAcceptance?{agentGeneratedAcceptanceUat:true}:{}),
    ...(descriptivePatch?{agentDescriptivePatchUat:true}:{}),
    ...(scheduleRuntimeUat?{scheduleRuntimeUat:true}:{}),
    ...(boundModelExecutionUat?{boundModelExecutionUat:true}:{})}
}
const uuid="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
const configEntities=new Set(["agent-specs","workflows","knowledge-bases","model-connections","tool-connections","mcp-connections"])
function configuredPath(pathname:string):"collection"|"item"|null{
  const collection=/^\/api\/v2\/([a-z-]+)$/.exec(pathname)
  if(collection&&configEntities.has(collection[1]!))return "collection"
  const item=new RegExp("^/api/v2/([a-z-]+)/"+uuid+"$").exec(pathname)
  if(item&&configEntities.has(item[1]!))return "item"
  return null
}
export function permitNativePg18BusinessUatRequest(
  pathname:string,method:string,
  policy:NativePg18UatCapabilities,
):boolean {
  if(method==="GET"&&pathname==="/healthz")return true
  // Read-only owner metadata never inherits a configuration/submission gate.
  // The Native handler still verifies Cookie identity and installed schema.
  if(pathname==="/api/v2/own-overview"||pathname==="/api/v2/own-todos")return method==="GET"
  // Exact original replay must reach059 before its independent fresh gate.
  if(/^\/api\/v2\/agent-generated-acceptances\/(preview|accept|confirm)$/.test(pathname))return method==="POST"
  if(new RegExp("^/api/v2/agent-generated-acceptances/reviews/"+uuid+"$").test(pathname))return method==="GET"
  // Fresh scope stays inside the repository so disabling new writes cannot
  // block confirmation or exact replay of an already accepted original.
  if(/^\/api\/v2\/agent-descriptive-patches\/(preview|accept|confirm)$/.test(pathname))return method==="POST"
  if(new RegExp("^/api/v2/agent-descriptive-patches/reviews/"+uuid+"$").test(pathname))return method==="GET"
  if(pathname==="/api/v2/agent-reviews")return method==="GET"
  // Existing ledger decides original replay before its independent fresh-write
  // scope. Source/preview/recovery/privacy/current reads stay reachable closed.
  if(/^\/api\/v2\/agent-reviews\/(source|preview|submit|confirm)$/.test(pathname))return method==="POST"
  const review=new RegExp("^/api/v2/agent-reviews/"+uuid+"(?:/(control|control-confirm))?$").exec(pathname)
  if(review)return review[1]?method==="POST":method==="GET"
  // The repository gates new submissions. Original recovery and privacy
  // deletion stay reachable when the operator closes new feedback admission.
  const optimization=/^\/api\/v2\/agent-optimizations(?:\/(preview|accept|confirm))?$/.exec(pathname)
  if(optimization)return optimization[1]?method==="POST":method==="GET"
  const feedback=new RegExp("^/api/v2/agent-feedback/"+uuid+"(?:/(change|confirm))?$").exec(pathname)
  if(feedback)return feedback[1]?method==="POST":method==="GET"
  const outcome=new RegExp("^/api/v2/agent-outcome-memories/"+uuid+"(?:/(stop|stop-confirm))?$").exec(pathname)
  // Privacy stops and immutable original confirmation remain available after
  // admission is disabled. The repository still verifies Cookie owner scope.
  if(outcome)return outcome[1]?method==="POST":method==="GET"
  if(pathname==="/api/v2/agent-derived-memories"||pathname==="/api/v2/agent-derived-memories/preview")return method==="GET"
  if(pathname==="/api/v2/agent-derived-memories/confirm")return method==="POST"
  if(pathname==="/api/v2/agent-derived-memories/change")return method==="POST"&&policy.configurationWrites===true&&policy.agentDerivedMemoryUat===true
  if(pathname==="/api/v2/agent-memories")return method==="GET"
  if(pathname==="/api/v2/agent-memories/confirm")return method==="POST"
  if(pathname==="/api/v2/agent-memories/change")return method==="POST"&&policy.configurationWrites===true
  const release=new RegExp("^/api/v2/agent-releases/"+uuid+"(?:/(change|confirm|acceptance|versions)(?:/("+uuid+"))?)?$").exec(pathname)
  if(release){
    const action=release[1],selected=release[2]
    if(method==="GET")return !action||!!selected&&(action==="versions"||action==="acceptance")
    if(method!=="POST"||selected)return false
    if(action==="confirm")return true
    if(action==="acceptance")return policy.configurationWrites===true&&policy.autonomousAgentUat===true
    return action==="change"&&policy.configurationWrites===true
  }
  const collaboration=new RegExp("^/api/v2/agent-collaboration(?:/"+uuid+"(?:/(revisions|change|revoke|reject|confirm))?)?$").exec(pathname)
  if(collaboration){
    const action=collaboration[1]
    if(method==="GET")return !action||action==="revisions"
    // Stops are separately constrained by their exact body action. Confirm
    // only reads the actor's immutable receipt and can never apply a choice.
    if(method==="POST"&&["revoke","reject","confirm"].includes(action??""))return true
    return method==="POST"&&action==="change"&&policy.configurationWrites===true
  }
  if(/^\/api\/v2\/knowledge-query\/(?:submit|receipt)$/.test(pathname))
    return policy.configurationWrites===true&&policy.knowledgeSharingUat===true&&policy.knowledgeEmbeddingSettingsUat===true&&policy.knowledgeEmbeddingConsentUat===true&&policy.knowledgeQueryRuntimeUat===true&&["GET","POST"].includes(method)
  if(/^\/api\/v2\/knowledge-embedding\/(?:index-authorize|index-receipt|bases\/[0-9a-fA-F-]{36}\/index-status)$/.test(pathname))
    return policy.configurationWrites===true&&policy.knowledgeSharingUat===true&&policy.knowledgeEmbeddingSettingsUat===true&&policy.knowledgeEmbeddingConsentUat===true&&policy.knowledgeIndexRuntimeUat===true&&["GET","POST"].includes(method)
  if(/^\/api\/v2\/knowledge-embedding\/(?:consent|consent-receipt)$/.test(pathname))
    return policy.configurationWrites===true&&policy.knowledgeSharingUat===true&&policy.knowledgeEmbeddingSettingsUat===true&&policy.knowledgeEmbeddingConsentUat===true&&["GET","POST"].includes(method)
  if(/^\/api\/v2\/knowledge-embedding\/(?:settings|receipt|bases\/[0-9a-fA-F-]{36}\/(?:status|rebuild))$/.test(pathname))
    return policy.configurationWrites===true&&policy.knowledgeSharingUat===true&&policy.knowledgeEmbeddingSettingsUat===true&&["GET","POST"].includes(method)
  if(/^\/api\/v2\/shared-knowledge(?:\/[0-9a-fA-F-]{36}(?:\/(?:documents|search|import|delete|access|content-receipt|access-receipt))?)?$/.test(pathname))
    return policy.configurationWrites===true&&policy.knowledgeSharingUat===true&&["GET","POST"].includes(method)
  if(/^\/api\/v2\/smithery\/(?:key|namespaces|catalog|connections)(?:\/[0-9a-fA-F-]{36}(?:\/(?:refresh|revoke|retry|pause))?)?$/.test(pathname))
    return policy.configurationWrites===true&&policy.smitheryManagementUat===true&&["GET","POST","DELETE"].includes(method)
  if(method==="POST"&&policy.configurationWrites===true&&policy.mcpDiscoveryUat===true&&
    new RegExp("^/api/v2/mcp-connections/"+uuid+"/discover$").test(pathname))return true
  if(method==="DELETE"&&policy.configurationWrites===true&&
    new RegExp("^/api/v2/mcp-connections/"+uuid+"$").test(pathname))return true
  // Draft writes need config UAT. Background authority and occurrence actions
  // require their own explicit scheduling opt-in in addition to owner checks.
  const scheduleId=new RegExp("^/api/v2/schedules/"+uuid+"$")
  const scheduleHistory=new RegExp("^/api/v2/schedules/"+uuid+"/occurrences$")
  if(method==="POST"&&new RegExp("^/api/v2/schedules/"+uuid+"/pause$").test(pathname))return true
  if(method==="GET"&&new RegExp("^/api/v2/schedules/"+uuid+"/execution$").test(pathname))return true
  if(new RegExp("^/api/v2/schedules/"+uuid+"/(?:execution|activate|pause|run-now|retry-start)$").test(pathname))
    return policy.configurationWrites===true&&policy.scheduleRuntimeUat===true&&
      ((method==="GET"&&pathname.endsWith("/execution"))||(method==="POST"&&!pathname.endsWith("/execution")))
  if(method==="GET"&&(
    pathname==="/api/v2/schedules" ||
    scheduleId.test(pathname) || scheduleHistory.test(pathname)))return true
  if(policy.configurationWrites===true&&(
    (method==="POST"&&pathname==="/api/v2/schedules") ||
    ((method==="PATCH"||method==="DELETE")&&scheduleId.test(pathname))))
    return true
  if(typeof pathname!=="string"||pathname.length>256||pathname.includes("?"))
    return false
  // Read-only, owner-scoped KB document metadata is available even when
  // configuration and Run writes remain disabled. No body/embedding route.
  if(method==="GET"&&new RegExp(
    "^/api/v2/knowledge-bases/"+uuid+"/documents$").test(pathname))
    return true
  // A POST body keeps private search phrases out of URL/proxy logs.
  // The existing repository performs SELECT only, with strict owner RLS,
  // indexed-document filtering and bounded citation snippets.
  if(method==="POST"&&new RegExp(
    "^/api/v2/knowledge-bases/"+uuid+"/search$").test(pathname))
    return true
  // TEXT ingestion is a genuine write. It needs its OWN isolated UAT gate
  // in addition to config write approval and validated Native session/CSRF.
  // Never permit PDF/DOCX upload, arbitrary object keys, or file routes here.
  if(method==="POST"&&policy.knowledgeIngestUat===true&&
     policy.configurationWrites===true&&new RegExp(
       "^/api/v2/knowledge-bases/"+uuid+"/text-documents$").test(pathname))
    return true
  // An authenticated employee may READ only their own existing Agent Run
  // history in the separate PG-native workspace, even with all UAT switches
  // off. The repository applies owner RLS and the API never returns secrets.
  // This does NOT authorize a job, an approval or any paid provider request.
  if(method==="GET" && (pathname==="/api/v2/runs" ||
     new RegExp("^/api/v2/runs/"+uuid+"$").test(pathname)))return true
  // Run/approval WRITES remain independently gated and default-denied.
  if(policy.runApprovalUat===true&&policy.configurationWrites===true&&
     method==="POST" && (
       new RegExp("^/api/v2/agent-specs/"+uuid+"/runs$").test(pathname) ||
       new RegExp("^/api/v2/runs/"+uuid+"/model-approval$").test(pathname)))
    return true
  // Workflow graph validation is inert but a durable write; it needs a
  // distinct reviewed UAT flag, not generic config-write or Run approval.
  if(policy.configurationWrites===true&&
     policy.workflowValidationUat===true){
    if(method==="POST"&&new RegExp(
      "^/api/v2/workflows/"+uuid+"/validate$").test(pathname))return true
    if(method==="GET"&&new RegExp(
      "^/api/v2/workflow-validations/"+uuid+"$").test(pathname))return true
  }
  if(method==="GET"&&(pathname==="/api/v2/agent-autonomous-runs"||new RegExp(
    "^/api/v2/agent-autonomous-runs/"+uuid+"(?:/(?:steps|human-history))?$").test(pathname)))return true
  if(method==="POST"&&new RegExp("^/api/v2/agent-autonomous-runs/"+uuid+"/cancel$").test(pathname))return true
  if(method==="POST"&&new RegExp("^/api/v2/(?:agent-autonomous-runs|workflow-v2-runs)/"+uuid+"/respond-confirm$").test(pathname))return true
  if(policy.configurationWrites===true&&policy.autonomousAgentUat===true&&method==="POST"&&(
    new RegExp("^/api/v2/agent-specs/"+uuid+"/autonomous-runs$").test(pathname)||
    new RegExp("^/api/v2/agent-autonomous-runs/"+uuid+"/(?:decision|respond)$").test(pathname)))return true
  // Existing safe Start/End Workflow run history is owner-scoped READ ONLY.
  if(method==="GET"&&(pathname==="/api/v2/workflow-v2-runs"||new RegExp(
    "^/api/v2/workflow-v2-runs/"+uuid+"(?:/(?:steps|outputs|output-history|human-history))?$").test(pathname)))return true
  // A verified owner can stop unstarted work even after submission permission
  // is revoked. The repository refuses cancellation of in-flight/unknown effects.
  if(method==="POST"&&new RegExp("^/api/v2/workflow-v2-runs/"+uuid+"/cancel$").test(pathname))return true
  if(policy.configurationWrites===true&&policy.workflowV2ExecutionUat===true&&method==="POST"&&(
    new RegExp("^/api/v2/workflows/"+uuid+"/native-runs$").test(pathname)||
    new RegExp("^/api/v2/workflows/"+uuid+"/model-node-debug$").test(pathname)||
    new RegExp("^/api/v2/workflow-v2-runs/"+uuid+"/(?:decision|respond)$").test(pathname)))return true
  // It never queues work and is available without any execution approval.
  if(method==="GET"&&(pathname==="/api/v2/workflow-runs"||new RegExp(
    "^/api/v2/workflow-runs/"+uuid+"$").test(pathname)))return true
  // Queueing safe Start/End Workflow runs has its own UAT approval, distinct
  // from graph validation and Agent model-run approval.
  if(policy.configurationWrites===true&&policy.workflowExecutionUat===true&&
     method==="POST"&&new RegExp(
       "^/api/v2/workflows/"+uuid+"/runs$").test(pathname))return true
  // Provider probing is an external call and is NEVER config CRUD by default.
  if(method==="POST"&&policy.configurationWrites===true&&
     policy.modelProbeUat===true&&new RegExp(
       "^/api/v2/model-connections/"+uuid+"/probe$").test(pathname))return true
  // Model connection deletion is permitted only under the same explicit
  // isolated configuration UAT gate; no other collection gains DELETE.
  if(method==="DELETE"&&policy.configurationWrites===true&&
     new RegExp("^/api/v2/model-connections/"+uuid+"$").test(pathname))
    return true
  const kind=configuredPath(pathname)
  if(!kind)return false
  if(method==="GET")return true
  return policy.configurationWrites &&
    ((method==="POST"&&kind==="collection")||
     (method==="PATCH"&&kind==="item"))
}
