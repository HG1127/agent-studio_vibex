import {selectAutonomousAgentExecution} from "./durable-v2-root.ts"
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
  /** Additional opt-in for inert Start/End-only Workflow validation records. */
  workflowValidationUat?:boolean
  /** Separately approved queue + safe Start/End Workflow Worker UAT. */
  workflowExecutionUat?:boolean
  /** Versioned Workflow queue/approval UAT, independent of Start/End-only. */
  workflowV2ExecutionUat?:boolean
  autonomousAgentUat?:boolean
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
  const config=env.AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED
  const employees=env.AGENT_STUDIO_PG18_EMPLOYEE_UAT_ENABLED
  const marker=env.AGENT_STUDIO_PG18_UAT_APPROVAL
  const run=env.AGENT_STUDIO_PG18_RUN_APPROVAL_UAT_ENABLED
  const runMarker=env.AGENT_STUDIO_PG18_RUN_APPROVAL_UAT_APPROVED
  const ingest=env.AGENT_STUDIO_PG18_KNOWLEDGE_INGEST_UAT_ENABLED
  const ingestMarker=env.AGENT_STUDIO_PG18_KNOWLEDGE_INGEST_UAT_APPROVED
  const probe=env.AGENT_STUDIO_PG18_MODEL_PROBE_UAT_ENABLED
  const probeMarker=env.AGENT_STUDIO_PG18_MODEL_PROBE_UAT_APPROVED
  const flow=env.AGENT_STUDIO_PG18_WORKFLOW_VALIDATION_UAT_ENABLED
  const flowMarker=env.AGENT_STUDIO_PG18_WORKFLOW_VALIDATION_UAT_APPROVED
  const execution=env.AGENT_STUDIO_PG18_WORKFLOW_EXECUTION_UAT_ENABLED
  const executionMarker=env.AGENT_STUDIO_PG18_WORKFLOW_EXECUTION_UAT_APPROVED
  const flowV2=env.AGENT_STUDIO_PG18_WORKFLOW_V2_UAT_ENABLED
  const flowV2Marker=env.AGENT_STUDIO_PG18_WORKFLOW_V2_UAT_APPROVED
  const boundModel=env.AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_ENABLED
  const boundModelMarker=env.AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_APPROVED
  for(const value of [config,employees,run,ingest,probe,flow,execution,flowV2,boundModel])
    if(value!==undefined&&value!=="true")refuse()
  const configUat=config==="true"
  const employeeUat=employees==="true"
  const runUat=run==="true"
  const ingestUat=ingest==="true"
  const modelProbeUat=probe==="true"
  const workflowValidationUat=flow==="true"
  const workflowExecutionUat=execution==="true"
  const workflowV2ExecutionUat=flowV2==="true"
  const boundModelExecutionUat=boundModel==="true"
  if(!boundModelExecutionUat&&boundModelMarker!==undefined)refuse()
  if(!runUat&&runMarker!==undefined)refuse()
  if(!ingestUat&&ingestMarker!==undefined)refuse()
  if(!modelProbeUat&&probeMarker!==undefined)refuse()
  if(!workflowValidationUat&&flowMarker!==undefined)refuse()
  if(!workflowExecutionUat&&executionMarker!==undefined)refuse()
  if(!workflowV2ExecutionUat&&flowV2Marker!==undefined)refuse()
  if(!configUat&&!employeeUat&&!runUat&&!ingestUat&&!modelProbeUat&&
     !workflowValidationUat&&!workflowExecutionUat&&!workflowV2ExecutionUat&&!boundModelExecutionUat&&!autonomousAgentUat){
    if(marker!==undefined)refuse()
    return {...empty}
  }
  if(!listen||!Number.isSafeInteger(uid)||uid===undefined||uid<=0||
     !origin.startsWith("https://")||
     marker!==permissionMarker||
     ((employeeUat||runUat||ingestUat||modelProbeUat||workflowValidationUat||workflowExecutionUat||workflowV2ExecutionUat||boundModelExecutionUat||autonomousAgentUat)&&!configUat)||
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
    ...(workflowValidationUat?{workflowValidationUat:true}:{}),
    ...(workflowExecutionUat?{workflowExecutionUat:true}:{}),
    ...(workflowV2ExecutionUat?{workflowV2ExecutionUat:true}:{}),
    ...(autonomousAgentUat?{autonomousAgentUat:true}:{}),
    ...(boundModelExecutionUat?{boundModelExecutionUat:true}:{})}
}
const uuid="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
const configEntities=new Set(["agent-specs","workflows","knowledge-bases","model-connections","tool-connections"])
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
  // Schedule *configuration* drafts may be saved only with config UAT.
  // There is NO toggle/enable/run/occurrence mutation or scheduler.
  const scheduleId=new RegExp("^/api/v2/schedules/"+uuid+"$")
  const scheduleHistory=new RegExp("^/api/v2/schedules/"+uuid+"/occurrences$")
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
    "^/api/v2/agent-autonomous-runs/"+uuid+"(?:/steps)?$").test(pathname)))return true
  if(method==="POST"&&new RegExp("^/api/v2/agent-autonomous-runs/"+uuid+"/cancel$").test(pathname))return true
  if(policy.configurationWrites===true&&policy.autonomousAgentUat===true&&method==="POST"&&(
    new RegExp("^/api/v2/agent-specs/"+uuid+"/autonomous-runs$").test(pathname)||
    new RegExp("^/api/v2/agent-autonomous-runs/"+uuid+"/decision$").test(pathname)))return true
  // Existing safe Start/End Workflow run history is owner-scoped READ ONLY.
  if(method==="GET"&&(pathname==="/api/v2/workflow-v2-runs"||new RegExp(
    "^/api/v2/workflow-v2-runs/"+uuid+"(?:/steps)?$").test(pathname)))return true
  // A verified owner can stop unstarted work even after submission permission
  // is revoked. The repository refuses cancellation of in-flight/unknown effects.
  if(method==="POST"&&new RegExp("^/api/v2/workflow-v2-runs/"+uuid+"/cancel$").test(pathname))return true
  if(policy.configurationWrites===true&&policy.workflowV2ExecutionUat===true&&method==="POST"&&(
    new RegExp("^/api/v2/workflows/"+uuid+"/native-runs$").test(pathname)||
    new RegExp("^/api/v2/workflows/"+uuid+"/model-node-debug$").test(pathname)||
    new RegExp("^/api/v2/workflow-v2-runs/"+uuid+"/decision$").test(pathname)))return true
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
