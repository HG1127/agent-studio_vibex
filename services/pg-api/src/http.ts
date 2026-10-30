import {safeNativeLocalAgentSpec} from './native-local-agent-contract.ts'
import type {AutonomousAgentRunRepository} from "./autonomous-agent-run-repository.ts"
import type {AgentHumanInputRepository} from "./agent-human-input-repository.ts"
import type {AgentMemoryRepository} from "./agent-memory-repository.ts"
import type {AgentCollaborationRepository} from "./agent-collaboration-repository.ts"
import type {AgentReleaseRepository} from "./agent-release-repository.ts"
import type {KnowledgeAccessRepository} from "./knowledge-access-repository.ts"
import type {KnowledgeContentRepository} from "./knowledge-content-repository.ts"
import type {KnowledgeEmbeddingRepository} from "./knowledge-embedding-repository.ts"
import type {KnowledgeEmbeddingConsentRepository} from "./knowledge-embedding-consent-repository.ts"
import type {KnowledgeIndexRepository} from "./knowledge-index-repository.ts"
import type {KnowledgeQueryRepository} from "./knowledge-query-repository.ts"
import {safeSharedKnowledgeText} from "./knowledge-content-repository.ts"
import type { IncomingMessage, ServerResponse } from "node:http"
import { AgentSpecRepository } from "./repository.ts"
import { RunRepository } from "./run-repository.ts"
import { ScheduleInventoryRepository } from "./schedule-inventory-repository.ts"
import {ScheduleDraftRepository} from "./schedule-draft-repository.ts"
import type {ScheduleRuntimeRepository} from "./schedule-runtime-repository.ts"
import { WorkflowRepository } from "./workflow-repository.ts"
import {WorkflowValidationRepository} from "./workflow-validation-repository.ts"
import {WorkflowSafeRunRepository} from "./workflow-safe-run-repository.ts"
import {WorkflowV2RunRepository} from "./workflow-v2-run-repository.ts"
import { KnowledgeBaseRepository, safeDescription, safeKnowledgeQuery, safeTextDocumentInput } from "./knowledge-repository.ts"
import {ModelConnectionRepository,safeModelConnectionInput} from "./model-connection-repository.ts"
import {optionalExpectedOriginalUiEmployee} from "./native-original-ui-preconditions.ts"
import {parseAgentDesignTransportJson} from "./agent-design-value-contract.ts"
import {ToolConnectionRepository,safeToolConnectionInput} from "./tool-connection-repository.ts"
import type {McpConnectionRepository} from "./mcp-connection-repository.ts"
import type {McpMaterial} from "./mcp-discovery.ts"
import type {McpCatalog} from "./mcp-catalog.ts"
import type {SmitheryRepository} from "./smithery-repository.ts"
import type {ProviderProbeInput,ProviderProbeResult} from "./model-connection-probe.ts"
import {parseDocumentIsolated} from "./document-worker.ts"
import { HttpError, isUuid, safeAgentSpec, safeName, safeWorkflowGraph, type Identity } from "./contracts.ts"
import {parseAgentReviewSubmission} from "./agent-review-contract.ts"
import {parseAgentReviewControl} from "./agent-review-control.ts"
import {parseAgentOpinionView} from "./agent-opinion-contract.ts"
import {parseAgentReviewHistoryUrl,parseAgentReviewHistoryPage} from "./agent-review-history-contract.ts"
import {parseAgentReviewTarget,parsePublicAgentReviewChoice,publicAgentReviewSource,publicAgentReviewPreview,publicAgentReviewReceipt,publicAgentReviewControlReceipt} from "./agent-review-public-contract.ts"
import {parseAgentGeneratedPreviewInput,parseAgentGeneratedAcceptance,parseAgentGeneratedPreview,parseAgentGeneratedReceipt,agentGeneratedAcknowledgement,type AgentGeneratedAcceptance,type AgentGeneratedReceipt} from "./agent-generated-acceptance-contract.ts"

import {ownerToolHubRoute,handleOwnerToolHubHttp,type OwnerToolHubHttpContext} from "./tool-hub-http.ts"

export interface AppDependencies {
  ownerToolHub?:OwnerToolHubHttpContext
  /** Native server only, after actual SQL067 audit; requires verified employee Cookie identity. */
  allowNativeLocalAgentSpecs?:boolean
  repository: AgentSpecRepository
  agentCollaborationRepository?:AgentCollaborationRepository
  agentReleaseRepository?:AgentReleaseRepository
  runRepository?: RunRepository
  scheduleInventory?: ScheduleInventoryRepository
  scheduleDraftRepository?: ScheduleDraftRepository
  scheduleRuntimeRepository?:ScheduleRuntimeRepository
  workflowRepository?: WorkflowRepository
  workflowValidationRepository?: WorkflowValidationRepository
  workflowSafeRunRepository?: WorkflowSafeRunRepository
  autonomousAgentRunRepository?:AutonomousAgentRunRepository
  agentHumanInputRepository?:AgentHumanInputRepository
  agentMemoryRepository?:AgentMemoryRepository
  agentOptimizationRepository?:import("./agent-optimization-repository.ts").AgentOptimizationRepository
  agentFeedbackRepository?:import("./agent-feedback-repository.ts").AgentFeedbackRepository
  /** Mounted atomically only after full optional058/057/056 schema inspection. */
  agentReviewSourceRepository?:Pick<import("./agent-review-source.ts").AgentReviewSourceRepository,"source"|"preview">
  agentReviewLedgerRepository?:Pick<import("./agent-review-ledger.ts").AgentReviewLedgerRepository,"submit"|"confirm"|"change"|"confirmControl">
  agentOpinionRepository?:Pick<import("./agent-opinion-repository.ts").AgentOpinionRepository,"getCurrent">
  agentReviewHistoryRepository?:Pick<import("./agent-review-history-repository.ts").AgentReviewHistoryRepository,"list">
  agentGeneratedAcceptanceRepository?:Pick<import("./agent-generated-acceptance-repository.ts").AgentGeneratedAcceptanceRepository,"preview"|"accept"|"confirm"|"receipt">
  agentOutcomeMemoryRepository?:import("./agent-memory-outcome-repository.ts").AgentMemoryOutcomeRepository
  agentDerivedMemoryRepository?:import("./agent-memory-derived-repository.ts").AgentMemoryDerivedRepository
  workflowHumanInputRepository?:AgentHumanInputRepository
  workflowV2RunRepository?: WorkflowV2RunRepository
  knowledgeRepository?: KnowledgeBaseRepository
  knowledgeAccessRepository?:KnowledgeAccessRepository
  knowledgeContentRepository?:KnowledgeContentRepository
  knowledgeEmbeddingRepository?:KnowledgeEmbeddingRepository
  knowledgeEmbeddingConsentRepository?:KnowledgeEmbeddingConsentRepository
  knowledgeIndexRepository?:KnowledgeIndexRepository
  knowledgeQueryRepository?:KnowledgeQueryRepository
  modelConnectionRepository?: ModelConnectionRepository
  toolConnectionRepository?: ToolConnectionRepository
  mcpConnectionRepository?:McpConnectionRepository
  smitheryRepository?:SmitheryRepository
  mcpDiscovery?:(material:McpMaterial,signal:AbortSignal)=>Promise<McpCatalog>
  modelConnectionProbe?:(input:ProviderProbeInput)=>Promise<ProviderProbeResult>
  verifyToken(token: string): Promise<Identity>
  /** Local-cookie mode: server-validated session only, never a client user ID. */
  authenticateRequest?(req: IncomingMessage): Promise<Identity>
  allowedOrigin: string
}

function send(res:ServerResponse,code:number,body:Record<string,unknown>):void {
  res.writeHead(code,{
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff",
    "Referrer-Policy":"no-referrer",
  })
  res.end(JSON.stringify(body))
}
async function readBody(req:IncomingMessage,maxBytes=32768):Promise<Record<string,unknown>> {
  const size=Number(req.headers["content-length"]||0)
  if(size>maxBytes)throw new HttpError(413,"request_too_large")
  let bytes=0
  const chunks:Buffer[]=[]
  for await(const chunk of req){
    const item=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk)
    bytes+=item.length
    if(bytes>maxBytes)throw new HttpError(413,"request_too_large")
    chunks.push(item)
  }
  let data:unknown
  try{data=JSON.parse(Buffer.concat(chunks).toString("utf8"))}
  catch{throw new HttpError(400,"invalid_json")}
  if(!data || typeof data!=="object" || Array.isArray(data))
    throw new HttpError(400,"invalid_json")
  return data as Record<string,unknown>
}
async function readReviewBody(req:IncomingMessage,maxBytes:number):Promise<Record<string,unknown>>{
  const type=req.headers["content-type"],length=req.headers["content-length"]
  if(typeof type!=="string"||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(type))throw new HttpError(415,"json_content_type_required")
  if(length!==undefined&&(typeof length!=="string"||!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length))||Number(length)>maxBytes))throw new HttpError(413,"request_too_large")
  let size=0;const chunks:Buffer[]=[]
  for await(const chunk of req){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;if(size>maxBytes)throw new HttpError(413,"request_too_large");chunks.push(bytes)}
  let value:unknown
  try{value=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)))}catch{throw new HttpError(400,"invalid_json")}
  if(!value||typeof value!=="object"||Array.isArray(value))throw new HttpError(400,"invalid_json")
  return value as Record<string,unknown>
}
// Separate strict reader: do not change the frozen older review surface.
async function readGeneratedBody(req:IncomingMessage):Promise<Record<string,unknown>>{
  const type=req.headers["content-type"],length=req.headers["content-length"]
  if(typeof type!=="string"||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(type))throw new HttpError(415,"json_content_type_required")
  if(length!==undefined&&(typeof length!=="string"||!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length))||Number(length)>8192))throw new HttpError(413,"request_too_large")
  if(length!==undefined&&req.headers["transfer-encoding"]!==undefined)throw new HttpError(400,"invalid_agent_generated_request")
  let size=0;const chunks:Buffer[]=[]
  for await(const chunk of req){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;if(size>8192)throw new HttpError(413,"request_too_large");chunks.push(bytes)}
  const bytes=Buffer.concat(chunks)
  if(bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)throw new HttpError(400,"invalid_agent_generated_request")
  let value:unknown
  try{value=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes))}catch{throw new HttpError(400,"invalid_agent_generated_request")}
  if(!value||typeof value!=="object"||Array.isArray(value))throw new HttpError(400,"invalid_agent_generated_request")
  return value as Record<string,unknown>
}
async function emptyGeneratedGet(req:IncomingMessage):Promise<void>{
  if(req.headers["transfer-encoding"]!==undefined||req.headers["content-length"]!==undefined&&req.headers["content-length"]!=="0")throw new HttpError(400,"invalid_agent_generated_request")
  for await(const chunk of req)if(Buffer.byteLength(chunk)>0)throw new HttpError(400,"invalid_agent_generated_request")
}
function generatedProjection<T>(decode:()=>T):T{
  // A fulfilled repository may already have committed. Invalid output is an
  // uncertain server failure, never a definitive400/409 fresh rejection.
  try{return decode()}catch{throw Error("unsafe_agent_generated_response")}
}
function generatedReceiptProjection(raw:unknown,original?:AgentGeneratedAcceptance,reviewId?:string,readonly=false):AgentGeneratedReceipt{
  const value=parseAgentGeneratedReceipt(raw,original)
  const expected=original??parseAgentGeneratedAcceptance({action:"accept",request_id:value.request_id,review_id:value.source.review_id,spec_id:value.source.spec_id,target_run_id:value.source.target_run_id,
    anchor_run_id:value.anchor.run_id,anchor_feedback_id:value.anchor.feedback_id,expected_preview_sha256:value.preview_sha256,expected_result_sha256:value.source.result_sha256,
    expected_spec_revision:value.before.revision,expected_spec_sha256:value.before.source_sha256,expected_candidate_sha256:value.candidate_sha256,confirm:true,acceptance_acknowledgement:agentGeneratedAcknowledgement})
  // The derived original verifies visible metadata only, never retry consent.
  parseAgentGeneratedReceipt(value,expected)
  if(readonly&&value.replayed!==true||reviewId!==undefined&&value.source.review_id!==reviewId)throw Error("invalid_agent_generated_receipt_scope")
  return value
}
function tokenFrom(req:IncomingMessage):string {
  const header=req.headers.authorization
  if(!header || !new RegExp("^Bearer [A-Za-z0-9._~+/-]{1,8192}=?$").test(header))
    throw new HttpError(401,"bearer_token_required")
  return header.slice(7)
}
function allowBodyFields(data:Record<string,unknown>,permitted:string[]) {
  if(Object.keys(data).some(k=>!permitted.includes(k)))
    throw new HttpError(400,"unknown_request_field")
}

/**
 * API v2 proof-of-concept, intentionally NOT connected to the V7 UI.
 * No CORS, no cookies, no anonymous mode, no trust in X-Rh-User-Id.
 */
export function createHandler(deps:AppDependencies) {
  const agentSpec=(raw:unknown,identity:Identity)=>{
    if(deps.allowNativeLocalAgentSpecs!==true)return safeAgentSpec(raw)
    if(!deps.authenticateRequest||identity.issuer!=="urn:agentstudio:local:v1")throw new HttpError(403,"native_employee_identity_required")
    return safeNativeLocalAgentSpec(raw,true)
  }
  return async (req:IncomingMessage,res:ServerResponse):Promise<void>=>{
    try{
      const method=req.method||""
      const path=new URL(req.url||"/","http://127.0.0.1").pathname
      if(path==="/healthz" && method==="GET"){
        return send(res,200,{ok:true,service:"agentstudio-pg-pilot",scope:"isolated"})
      }
      if(req.headers.origin && req.headers.origin!==deps.allowedOrigin)
        throw new HttpError(403,"origin_not_allowed")
      const workflowRoute=path==="/api/v2/workflows" ||
        /^\/api\/v2\/workflows\/[0-9a-fA-F-]{36}$/.test(path)
      const workflowValidationSubmitRoute=
        /^\/api\/v2\/workflows\/[0-9a-fA-F-]{36}\/validate$/.test(path)
      const workflowValidationReadRoute=
        /^\/api\/v2\/workflow-validations\/[0-9a-fA-F-]{36}$/.test(path)
      const workflowSafeRunSubmitRoute=
        /^\/api\/v2\/workflows\/[0-9a-fA-F-]{36}\/runs$/.test(path)
      const workflowSafeRunReadRoute=path==="/api/v2/workflow-runs" ||
        /^\/api\/v2\/workflow-runs\/[0-9a-fA-F-]{36}$/.test(path)
      const workflowV2Submit=/^\/api\/v2\/workflows\/([0-9a-fA-F-]{36})\/native-runs$/.exec(path)
      const workflowNodeDebug=/^\/api\/v2\/workflows\/([0-9a-fA-F-]{36})\/model-node-debug$/.exec(path)
      const workflowV2Route=/^\/api\/v2\/workflow-v2-runs(?:\/([0-9a-fA-F-]{36})(?:\/(decision|cancel|steps|outputs|output-history|respond|respond-confirm|human-history))?)?$/.exec(path)
      const autonomousAgentRoute=/^\/api\/v2\/agent-autonomous-runs(?:\/([0-9a-fA-F-]{36})(?:\/(decision|cancel|steps|respond|respond-confirm|human-history|pause|resume|pause-confirm|resume-confirm))?)?$/.exec(path)
      const autonomousAgentSubmit=/^\/api\/v2\/agent-specs\/([0-9a-fA-F-]{36})\/autonomous-runs$/.exec(path)
      const runRoute=path==="/api/v2/runs" ||
        /^\/api\/v2\/runs\/[0-9a-fA-F-]{36}(?:\/model-approval)?$/.test(path)
      const submitPrepareRoute=
        /^\/api\/v2\/agent-specs\/[0-9a-fA-F-]{36}\/runs$/.test(path)
      const knowledgeRoute=path==="/api/v2/knowledge-bases" ||
        /^\/api\/v2\/knowledge-bases\/[0-9a-fA-F-]{36}(?:\/(?:documents|search|text-documents|document-files))?$/.test(path)
      const schedulesRoute=path==="/api/v2/schedules" ||
        /^\/api\/v2\/schedules\/[0-9a-fA-F-]{36}(?:\/(?:occurrences|execution|activate|pause|run-now|retry-start))?$/.test(path)
      const modelConnectionsRoute=path==="/api/v2/model-connections" ||
        /^\/api\/v2\/model-connections\/[0-9a-fA-F-]{36}(?:\/probe)?$/.test(path)
      const toolConnectionsRoute=path==="/api/v2/tool-connections" ||
        /^\/api\/v2\/tool-connections\/[0-9a-fA-F-]{36}$/.test(path)
      const mcpRoute=/^\/api\/v2\/mcp-connections(?:\/([0-9a-fA-F-]{36})(?:\/(discover))?)?$/.exec(path)
      const smitheryRoute=/^\/api\/v2\/smithery\/(key|namespaces|catalog|connections)(?:\/([0-9a-fA-F-]{36})(?:\/(refresh|revoke|retry|pause))?)?$/.exec(path)
      const sharedKnowledgeRoute=/^\/api\/v2\/shared-knowledge(?:\/([0-9a-fA-F-]{36})(?:\/(documents|search|import|delete|access|content-receipt|access-receipt))?)?$/.exec(path)
      const embeddingRoute=/^\/api\/v2\/knowledge-embedding\/(settings|receipt|consent|consent-receipt|index-authorize|index-receipt|bases\/([0-9a-fA-F-]{36})\/(status|rebuild|index-status))$/.exec(path)
      const queryRoute=/^\/api\/v2\/knowledge-query\/(submit|receipt)$/.exec(path)
      const collaborationRoute=/^\/api\/v2\/agent-collaboration(?:\/([0-9a-fA-F-]{36})(?:\/(revisions|change|revoke|reject|confirm))?)?$/.exec(path)
      const memoryRoute=/^\/api\/v2\/agent-memories(?:\/(change|confirm))?$/.exec(path)
      const optimizationRoute=/^\/api\/v2\/agent-optimizations(?:\/(preview|accept|confirm))?$/.exec(path)
      const reviewAction=/^\/api\/v2\/agent-reviews\/(source|preview|submit|confirm)$/.exec(path)
      const reviewItem=/^\/api\/v2\/agent-reviews\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:\/(control|control-confirm))?$/.exec(path)
      const reviewCollection=path==="/api/v2/agent-reviews"
      const reviewRoute=reviewAction||reviewItem||reviewCollection
      const toolHubRoute=ownerToolHubRoute(path)
      const generatedBase="/api/v2/agent-generated-acceptances"
      const generatedAction=/^\/api\/v2\/agent-generated-acceptances\/(preview|accept|confirm)$/.exec(path)
      const generatedItem=/^\/api\/v2\/agent-generated-acceptances\/reviews\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/.exec(path)
      const generatedRoute=path===generatedBase||path.startsWith(generatedBase+"/")
      const feedbackRoute=/^\/api\/v2\/agent-feedback\/([0-9a-fA-F-]{36})(?:\/(change|confirm))?$/.exec(path)
      const outcomeMemoryRoute=/^\/api\/v2\/agent-outcome-memories\/([0-9a-fA-F-]{36})(?:\/(stop|stop-confirm))?$/.exec(path)
      const derivedMemoryRoute=/^\/api\/v2\/agent-derived-memories(?:\/(preview|change|confirm))?$/.exec(path)
      const releaseRoute=/^\/api\/v2\/agent-releases\/([0-9a-fA-F-]{36})(?:\/(change|confirm|acceptance|versions)(?:\/([0-9a-fA-F-]{36}))?)?$/.exec(path)
      if(!workflowRoute && !workflowValidationSubmitRoute &&
         !workflowValidationReadRoute && !workflowSafeRunSubmitRoute &&
         !workflowSafeRunReadRoute && !workflowV2Submit && !workflowNodeDebug && !workflowV2Route && !autonomousAgentSubmit && !autonomousAgentRoute && !knowledgeRoute && !runRoute && !schedulesRoute &&
         !modelConnectionsRoute && !toolConnectionsRoute && !mcpRoute && !smitheryRoute && !sharedKnowledgeRoute && !embeddingRoute && !queryRoute && !collaborationRoute && !releaseRoute && !memoryRoute && !derivedMemoryRoute && !outcomeMemoryRoute && !feedbackRoute && !optimizationRoute && !reviewRoute && !generatedRoute && !toolHubRoute &&
         !submitPrepareRoute && path!=="/api/v2/agent-specs" &&
         !/^\/api\/v2\/agent-specs\/[0-9a-fA-F-]{36}$/.test(path))
        throw new HttpError(404,"route_not_found")
      if(!["GET","POST","PATCH","DELETE"].includes(method))
        throw new HttpError(405,"method_not_allowed")
      if(toolHubRoute&&(!deps.ownerToolHub||!deps.authenticateRequest))throw new HttpError(404,"route_not_found")
      if(reviewRoute){
        if(!deps.agentReviewSourceRepository||!deps.agentReviewLedgerRepository||!deps.agentOpinionRepository)throw new HttpError(404,"route_not_found")
        if(reviewCollection&&!deps.agentReviewHistoryRepository)throw new HttpError(404,"route_not_found")
        // Never evaluate an OIDC/PocketBase token fallback for this surface.
        if(!deps.authenticateRequest)throw new HttpError(403,"native_employee_identity_required")
      }
      if(generatedRoute){
        if(!deps.agentGeneratedAcceptanceRepository)throw new HttpError(404,"route_not_found")
        if(!deps.authenticateRequest)throw new HttpError(403,"native_employee_identity_required")
      }


      // Explicitly ignore X-Rh-User-Id. In native mode the server-side
      // cookie verifier supplies a DB-verified identity. Legacy PG OIDC mode
      // still requires a cryptographically signed Bearer token.
      let identity:Identity
      try {
        identity=deps.authenticateRequest
          ?await deps.authenticateRequest(req)
          :await deps.verifyToken(tokenFrom(req))
      } catch(error) {
        // Distinguish native Cookie CSRF/origin violations from an expired
        // session. Neither may fall back to PocketBase/OIDC credentials.
        if(deps.authenticateRequest&&
           (error as {status?:unknown})?.status===403)
          throw new HttpError(403,"native_request_origin_denied")
        throw new HttpError(401,"invalid_token")
      }
      if(typeof identity?.issuer!=="string" || !identity.issuer ||
         typeof identity?.subject!=="string" || !identity.subject)
        throw new HttpError(401,"invalid_token")
      if(toolHubRoute){await handleOwnerToolHubHttp(req,res,identity,deps.ownerToolHub!);return}
      if(generatedRoute){
        if(identity.issuer!=="urn:agentstudio:local:v1")throw new HttpError(403,"native_employee_identity_required")
        if(req.url!==path)throw new HttpError(400,"invalid_agent_generated_request")
        const repo=deps.agentGeneratedAcceptanceRepository!
        if(generatedAction){
          if(method!=="POST")throw new HttpError(405,"method_not_allowed")
          const action=generatedAction[1],raw=await readGeneratedBody(req)
          if(action==="preview"){
            const input=parseAgentGeneratedPreviewInput(raw),value=await repo.preview(identity,input)
            return send(res,200,generatedProjection(()=>{
              const result=parseAgentGeneratedPreview(value,input)
              if(Buffer.byteLength(JSON.stringify(result),"utf8")>1048576)throw Error("oversized_agent_generated_preview")
              return result
            }))
          }
          const original=parseAgentGeneratedAcceptance(raw)
          // No outer fresh gate: exact accept replay belongs to the repository.
          const value=action==="accept"?await repo.accept(identity,original):await repo.confirm(identity,original)
          return send(res,200,generatedProjection(()=>generatedReceiptProjection(value,original,undefined,action==="confirm")))
        }
        if(generatedItem){
          if(method!=="GET")throw new HttpError(405,"method_not_allowed")
          const id=generatedItem[1]!
          if(id!==id.toLowerCase())throw new HttpError(400,"invalid_agent_generated_request")
          await emptyGeneratedGet(req)
          const value=await repo.receipt(identity,id)
          return send(res,200,generatedProjection(()=>generatedReceiptProjection(value,undefined,id,true)))
        }
        throw new HttpError(400,"invalid_agent_generated_request")
      }
      if(reviewRoute){
        if(identity.issuer!=="urn:agentstudio:local:v1")throw new HttpError(403,"native_employee_identity_required")
        if(reviewCollection){
          if(method!=="GET")throw new HttpError(405,"method_not_allowed")
          const query=parseAgentReviewHistoryUrl(req.url)
          if(req.headers["transfer-encoding"]!==undefined||req.headers["content-length"]!==undefined&&req.headers["content-length"]!=="0")throw new HttpError(400,"invalid_agent_review_history_query")
          for await(const chunk of req)if(Buffer.byteLength(chunk)>0)throw new HttpError(400,"invalid_agent_review_history_query")
          return send(res,200,parseAgentReviewHistoryPage(await deps.agentReviewHistoryRepository!.list(identity,query),query))
        }
        // Only exact origin-form paths: no query, fragment, encoded alias,
        // absolute URL or normalized dot-segment alternate route is accepted.
        if(req.url!==path)throw new HttpError(400,"invalid_agent_review_path")
        const repositories={source:deps.agentReviewSourceRepository!,ledger:deps.agentReviewLedgerRepository!,opinions:deps.agentOpinionRepository!}
        if(reviewAction){
          if(method!=="POST")throw new HttpError(405,"method_not_allowed")
          const action=reviewAction[1],body=await readReviewBody(req,action==="source"?8192:16384)
          if(action==="source"){
            const target=parseAgentReviewTarget(body)
            return send(res,200,publicAgentReviewSource(await repositories.source.source(identity,target),target))
          }
          if(action==="preview"){
            const choice=parsePublicAgentReviewChoice(body)
            return send(res,200,publicAgentReviewPreview(await repositories.source.preview(identity,choice),choice))
          }
          parseAgentReviewSubmission(body)
          // Existing ledger checks an exact original replay before its new
          // admission flag. HTTP must not replace that gate or mutate intent.
          const receipt=action==="submit"?await repositories.ledger.submit(identity,body):await repositories.ledger.confirm(identity,body)
          return send(res,200,publicAgentReviewReceipt(receipt,body))
        }
        const id=reviewItem![1]!.toLowerCase(),action=reviewItem![2]
        if(!action){
          if(method!=="GET")throw new HttpError(405,"method_not_allowed")
          const current=await repositories.opinions.getCurrent(identity,id)
          let result:ReturnType<typeof parseAgentOpinionView>
          try{result=parseAgentOpinionView(current)}catch{throw new HttpError(502,"agent_review_response_unavailable")}
          if(result.request.request_id!==id)throw new HttpError(502,"agent_review_response_unavailable")
          return send(res,200,result)
        }
        if(method!=="POST")throw new HttpError(405,"method_not_allowed")
        const body=await readReviewBody(req,8192),control=parseAgentReviewControl(body)
        if(control.review_id!==id)throw new HttpError(400,"agent_review_id_mismatch")
        const receipt=action==="control"?await repositories.ledger.change(identity,body):await repositories.ledger.confirmControl(identity,body)
        return send(res,200,publicAgentReviewControlReceipt(receipt,body))
      }
      if(optimizationRoute){
        if(!deps.authenticateRequest)throw new HttpError(403,"native_employee_identity_required")
        const optimization=deps.agentOptimizationRepository
        if(!optimization)throw new HttpError(503,"agent_optimization_unavailable")
        const query=new URL(req.url||"/","http://127.0.0.1").searchParams,action=optimizationRoute[1]
        if(!action&&method==="GET"){
          if([...query.keys()].length!==1||!query.has("spec_id"))throw new HttpError(400,"invalid_agent_optimization_query")
          return send(res,200,await optimization.list(identity,query.get("spec_id")!))
        }
        if([...query.keys()].length)throw new HttpError(400,"invalid_agent_optimization_query")
        if(!action||method!=="POST")throw new HttpError(405,"method_not_allowed")
        // Preserve all supported Native role fields, including full Chinese
        // descriptions/lists and bounded private binding references.
        const body=await readBody(req,524288)
        return send(res,200,await(action==="preview"?optimization.preview(identity,body):action==="accept"?optimization.accept(identity,body):optimization.confirm(identity,body)))
      }
      if(feedbackRoute){
        if(!deps.authenticateRequest)throw new HttpError(403,"native_employee_identity_required")
        const feedback=deps.agentFeedbackRepository
        if(!feedback)throw new HttpError(503,"agent_feedback_unavailable")
        if(new URL(req.url||"/","http://127.0.0.1").search)throw new HttpError(400,"invalid_agent_feedback_query")
        const id=feedbackRoute[1]!.toLowerCase(),action=feedbackRoute[2]
        if(!action&&method==="GET")return send(res,200,await feedback.status(identity,id))
        if(!action||method!=="POST")throw new HttpError(405,"method_not_allowed")
        const body=await readBody(req,8192)
        if(typeof body.run_id!=="string"||body.run_id.toLowerCase()!==id)throw new HttpError(400,"agent_feedback_run_mismatch")
        return send(res,200,await(action==="confirm"?feedback.confirm(identity,body):feedback.change(identity,body)))
      }
      if(outcomeMemoryRoute){
        if(!deps.authenticateRequest)throw new HttpError(403,"native_employee_identity_required")
        const memory=deps.agentOutcomeMemoryRepository
        if(!memory)throw new HttpError(503,"agent_memory_outcome_unavailable")
        if(new URL(req.url||"/","http://127.0.0.1").search)throw new HttpError(400,"invalid_agent_memory_outcome_query")
        const id=outcomeMemoryRoute[1]!,action=outcomeMemoryRoute[2]
        if(!action&&method==="GET")return send(res,200,await memory.status(identity,id))
        if(!action||method!=="POST")throw new HttpError(405,"method_not_allowed")
        const body=await readBody(req,8192)
        if(typeof body.run_id!=="string"||body.run_id.toLowerCase()!==id.toLowerCase())throw new HttpError(400,"agent_memory_outcome_run_mismatch")
        return send(res,200,await memory.stop(identity,body,action==="stop-confirm"))
      }
      if(derivedMemoryRoute){
        if(!deps.authenticateRequest)throw new HttpError(403,"native_employee_identity_required")
        const memory=deps.agentDerivedMemoryRepository
        if(!memory)throw new HttpError(503,"agent_memory_derived_unavailable")
        const query=new URL(req.url||"/","http://127.0.0.1").searchParams,action=derivedMemoryRoute[1]
        if((!action||action==="preview")&&method==="GET"){
          if([...query.keys()].length!==(action?2:1)||!query.has("spec_id")||action&&!query.has("run_id"))throw new HttpError(400,"invalid_agent_memory_derived_query")
          return send(res,200,await(action?memory.preview(identity,query.get("spec_id")!,query.get("run_id")!):memory.list(identity,query.get("spec_id")!)))
        }
        if([...query.keys()].length)throw new HttpError(400,"invalid_agent_memory_derived_query")
        if(method!=="POST"||action!=="change"&&action!=="confirm")throw new HttpError(405,"method_not_allowed")
        const body=await readBody(req,8192)
        return send(res,200,await(action==="change"?memory.change(identity,body):memory.confirm(identity,body)))
      }
      if(memoryRoute){
        if(!deps.authenticateRequest)throw new HttpError(403,"native_employee_identity_required")
        const memory=deps.agentMemoryRepository
        if(!memory)throw new HttpError(503,"agent_memory_unavailable")
        const query=new URL(req.url||"/","http://127.0.0.1").searchParams,action=memoryRoute[1]
        if(!action&&method==="GET"){
          if([...query.keys()].length!==1||!query.has("spec_id"))throw new HttpError(400,"invalid_agent_memory_query")
          return send(res,200,await memory.list(identity,query.get("spec_id")!))
        }
        if([...query.keys()].length)throw new HttpError(400,"invalid_agent_memory_query")
        if(method!=="POST"||!action)throw new HttpError(405,"method_not_allowed")
        const body=await readBody(req,8192)
        return send(res,200,await(action==="change"?memory.change(identity,body):memory.confirm(identity,body)))
      }
      if(releaseRoute){
        const repo=deps.agentReleaseRepository
        if(!repo)throw new HttpError(503,"agent_release_not_installed")
        if(new URL(req.url||"/","http://127.0.0.1").search)throw new HttpError(400,"invalid_agent_release_query")
        const id=releaseRoute[1]!,action=releaseRoute[2],selected=releaseRoute[3]
        if(method==="GET"&&!action)return send(res,200,{item:await repo.workspace(identity,id)})
        if(method==="GET"&&selected&&action==="versions")return send(res,200,{item:await repo.detail(identity,id,selected)})
        if(method==="GET"&&selected&&action==="acceptance")return send(res,200,{item:await repo.acceptanceStatus(identity,id,selected)})
        if(method!=="POST"||selected||!["change","confirm","acceptance"].includes(action??""))throw new HttpError(405,"method_not_allowed")
        const body=await readBody(req,16384)
        if(action==="acceptance"&&body.action!=="acceptance"||action==="change"&&body.action==="acceptance")throw new HttpError(400,"invalid_agent_release_action")
        return send(res,200,{item:action==="confirm"?await repo.confirm(identity,id,body):await repo.change(identity,id,body)})
      }
      if(collaborationRoute){
        const repo=deps.agentCollaborationRepository
        if(!repo)throw new HttpError(503,"agent_collaboration_not_installed")
        if(new URL(req.url||"/","http://127.0.0.1").search)throw new HttpError(400,"invalid_agent_collaboration_query")
        const id=collaborationRoute[1],action=collaborationRoute[2]
        if(method==="GET"&&!id)return send(res,200,{items:await repo.list(identity)})
        if(!id)throw new HttpError(405,"method_not_allowed")
        if(method==="GET"&&!action)return send(res,200,{item:await repo.detail(identity,id)})
        if(method==="GET"&&action==="revisions")return send(res,200,{items:await repo.revisions(identity,id)})
        if(method!=="POST"||!action||action==="revisions")throw new HttpError(405,"method_not_allowed")
        const body=await readBody(req,131072)
        if(action==="revoke"&&body.action!=="revoke"||action==="reject"&&(body.action!=="review"||body.decision!=="reject"))throw new HttpError(400,"invalid_agent_collaboration_stop")
        return send(res,200,{item:action==="confirm"?await repo.confirm(identity,id,body):await repo.change(identity,id,body)})
      }
      if(queryRoute){
        const repo=deps.knowledgeQueryRepository
        if(!repo)throw new HttpError(503,"knowledge_query_runtime_disabled")
        const query=new URL(req.url||"/","http://127.0.0.1").searchParams
        if(queryRoute[1]==="receipt"){
          if(method!=="GET")throw new HttpError(405,"method_not_allowed")
          if([...query.keys()].length!==1||!isUuid(query.get("request_id")))throw new HttpError(400,"invalid_knowledge_query_identifier")
          return send(res,200,{item:await repo.get(identity,query.get("request_id")!)})
        }
        if([...query.keys()].length)throw new HttpError(400,"invalid_knowledge_query_identifier")
        if(method!=="POST")throw new HttpError(405,"method_not_allowed")
        return send(res,200,await repo.submit(identity,await readBody(req,4096)))
      }
      if(embeddingRoute){
        if(embeddingRoute[1]==="index-authorize"||embeddingRoute[1]==="index-receipt"||embeddingRoute[3]==="index-status"){
          const repo=deps.knowledgeIndexRepository
          if(!repo)throw new HttpError(503,"knowledge_index_runtime_disabled")
          const query=new URL(req.url||"/","http://127.0.0.1").searchParams
          if(embeddingRoute[1]==="index-receipt"){
            if(method!=="GET")throw new HttpError(405,"method_not_allowed")
            if([...query.keys()].length!==1||!isUuid(query.get("request_id")))throw new HttpError(400,"invalid_knowledge_index_identifier")
            return send(res,200,{item:await repo.receipt(identity,query.get("request_id")!)})
          }
          if([...query.keys()].length)throw new HttpError(400,"invalid_knowledge_index_identifier")
          if(embeddingRoute[3]==="index-status"&&method==="GET")return send(res,200,{item:await repo.status(identity,embeddingRoute[2]!)})
          if(embeddingRoute[1]==="index-authorize"&&method==="POST")return send(res,200,await repo.authorize(identity,await readBody(req,2048)))
          throw new HttpError(405,"method_not_allowed")
        }
        const consentRepo=deps.knowledgeEmbeddingConsentRepository
        const consentKind=embeddingRoute[1]
        if(consentKind==="consent"||consentKind==="consent-receipt"){
          if(!consentRepo)throw new HttpError(503,"knowledge_embedding_consent_disabled")
          const query=new URL(req.url||"/","http://127.0.0.1").searchParams
          if(consentKind==="consent-receipt"){
            if(method!=="GET")throw new HttpError(405,"method_not_allowed")
            if([...query.keys()].length!==1||!isUuid(query.get("request_id")))throw new HttpError(400,"invalid_embedding_consent_request")
            return send(res,200,{item:await consentRepo.receipt(identity,query.get("request_id")!)})
          }
          if([...query.keys()].length)throw new HttpError(400,"invalid_embedding_consent_request")
          if(method==="GET")return send(res,200,{item:await consentRepo.get(identity)})
          if(method==="POST")return send(res,200,await consentRepo.change(identity,await readBody(req,2048)))
          throw new HttpError(405,"method_not_allowed")
        }
        const repo=deps.knowledgeEmbeddingRepository
        if(!repo)throw new HttpError(503,"knowledge_embedding_settings_disabled")
        const query=new URL(req.url||"/","http://127.0.0.1").searchParams
        const [,kind,base,action]=embeddingRoute
        if(kind==="receipt"){
          if(method!=="GET")throw new HttpError(405,"method_not_allowed")
          if([...query.keys()].length!==1||!isUuid(query.get("request_id")))throw new HttpError(400,"invalid_embedding_request")
          return send(res,200,{item:await repo.receipt(identity,query.get("request_id")!)})
        }
        if([...query.keys()].length)throw new HttpError(400,"invalid_embedding_request")
        if(kind==="settings"){
          if(method==="GET")return send(res,200,{item:await repo.settings(identity)})
          if(method!=="POST")throw new HttpError(405,"method_not_allowed")
          const body=await readBody(req,4096)
          if(body.action!=="configure"&&body.action!=="disable")throw new HttpError(400,"invalid_embedding_request")
          return send(res,200,await repo.change(identity,body))
        }
        if(method==="GET"&&action==="status")return send(res,200,{item:await repo.status(identity,base!)})
        if(method==="POST"&&action==="rebuild"){
          const body=await readBody(req,1024);allowBodyFields(body,["request_id","expected_revision"])
          return send(res,200,await repo.change(identity,{...body,action:"rebuild",base_id:base}))
        }
        throw new HttpError(405,"method_not_allowed")
      }
      if(sharedKnowledgeRoute){
        const access=deps.knowledgeAccessRepository,content=deps.knowledgeContentRepository
        if(!access||!content)throw new HttpError(503,"knowledge_sharing_disabled")
        const id=sharedKnowledgeRoute[1],action=sharedKnowledgeRoute[2]
        const query=new URL(req.url||"/","http://127.0.0.1").searchParams
        if(action==="content-receipt"||action==="access-receipt"){
          if(method!=="GET")throw new HttpError(405,"method_not_allowed")
          if([...query.keys()].length!==1||!isUuid(query.get("request_id")))throw new HttpError(400,"invalid_knowledge_access_request")
          const item=action==="content-receipt"?await content.receipt(identity,id!,query.get("request_id")!):await access.receipt(identity,id!,query.get("request_id")!)
          return send(res,200,{item})
        }
        if([...query.keys()].length)throw new HttpError(400,"invalid_knowledge_query")
        if(!id){
          if(method!=="GET")throw new HttpError(405,"method_not_allowed")
          return send(res,200,{items:await access.listShared(identity)})
        }
        if(method==="GET"){
          if(!action)return send(res,200,{item:await content.get(identity,id)})
          if(action==="documents")return send(res,200,{items:await content.documents(identity,id)})
          if(action==="access")return send(res,200,{items:await access.listGrants(identity,id)})
          throw new HttpError(405,"method_not_allowed")
        }
        if(method!=="POST")throw new HttpError(405,"method_not_allowed")
        if(action==="access")return send(res,200,await access.change(identity,id,await readBody(req,2048)))
        if(action==="search"){
          const body=await readBody(req,2048);allowBodyFields(body,["query","limit"])
          return send(res,200,{items:await content.search(identity,id,body.query as string,body.limit===undefined?8:body.limit as number),mode:"literal_keyword"})
        }
        if(action==="import"){
          const metadata=await content.get(identity,id)
          if(metadata.access_role==="viewer")throw new HttpError(403,"knowledge_editor_required")
          const body=await readBody(req,1100000);allowBodyFields(body,["request_id","filename","text","content_base64"])
          if(!isUuid(body.request_id)||Object.hasOwn(body,"text")===Object.hasOwn(body,"content_base64"))throw new HttpError(400,"invalid_document_request")
          const parsed=Object.hasOwn(body,"text")?safeSharedKnowledgeText({filename:body.filename,text:body.text}):
            await parseDocumentIsolated({filename:body.filename,content_base64:body.content_base64},12000,"employee")
          const result=await content.importParsed(identity,id,body.request_id,parsed)
          return send(res,result.replayed?200:201,result)
        }
        if(action==="delete"){
          const body=await readBody(req,1024);allowBodyFields(body,["request_id","document_id","sha256"])
          return send(res,200,await content.delete(identity,id,body.request_id as string,body.document_id as string,body.sha256 as string))
        }
        throw new HttpError(405,"method_not_allowed")
      }
      if(smitheryRoute){
        const repo=deps.smitheryRepository
        if(!repo)throw new HttpError(503,"smithery_management_disabled")
        if(new URL(req.url||"/","http://127.0.0.1").search)throw new HttpError(400,"invalid_smithery_query")
        const [,entity,id,action]=smitheryRoute
        if(id&&entity!=="connections")throw new HttpError(404,"route_not_found")
        if(entity==="key"){
          if(method==="GET")return send(res,200,{item:await repo.keyStatus(identity)})
          if(!["POST","DELETE"].includes(method))throw new HttpError(405,"method_not_allowed")
          const body=await readBody(req,2048);allowBodyFields(body,method==="POST"?["api_key","expected_revision","request_id"]:["expected_revision","request_id"])
          if(!isUuid(body.request_id)||!Number.isSafeInteger(body.expected_revision)||(body.expected_revision as number)<0)throw new HttpError(400,"invalid_smithery_key_request")
          return send(res,200,{item:method==="POST"?await repo.saveKey(identity,body.api_key,body.expected_revision as number,body.request_id):
            await repo.removeKey(identity,body.expected_revision as number,body.request_id)})
        }
        if(entity==="namespaces"||entity==="catalog"){
          if(method!=="POST")throw new HttpError(405,"method_not_allowed")
          const body=await readBody(req,1024);allowBodyFields(body,entity==="namespaces"?[]:["query","page"])
          if(entity==="namespaces")return send(res,200,{namespaces:await repo.namespaces(identity)})
          if(typeof body.query!=="string"||body.query.length>100||!Number.isSafeInteger(body.page)||(body.page as number)<1||(body.page as number)>100)throw new HttpError(400,"invalid_smithery_catalog_query")
          return send(res,200,{...await repo.catalog(identity,body.query,body.page as number)})
        }
        if(action){
          if(method!=="POST")throw new HttpError(405,"method_not_allowed")
          const body=await readBody(req,128);allowBodyFields(body,["expected_revision"])
          if(!Number.isSafeInteger(body.expected_revision)||(body.expected_revision as number)<1)throw new HttpError(400,"invalid_revision")
          return send(res,200,{item:action==="pause"?await repo.pause(identity,id!,body.expected_revision as number):
            await repo.operate(identity,id!,body.expected_revision as number,action==="retry"?"connect":action as "refresh"|"revoke")})
        }
        if(method==="GET"){
          if(!id)return send(res,200,{items:await repo.list(identity)})
          const item=await repo.get(identity,id);if(!item)throw new HttpError(404,"smithery_connection_not_found")
          return send(res,200,{item})
        }
        if(method==="POST"&&!id){
          const body=await readBody(req,4096);allowBodyFields(body,["request_id","selection"])
          if(!isUuid(body.request_id))throw new HttpError(400,"invalid_smithery_create_request")
          return send(res,201,{item:await repo.connect(identity,body.selection,body.request_id)})
        }
        throw new HttpError(405,"method_not_allowed")
      }
      if(mcpRoute){
        const repo=deps.mcpConnectionRepository
        if(!repo)throw new HttpError(503,"mcp_connections_disabled")
        const connection=mcpRoute[1],discovery=mcpRoute[2]==="discover"
        if(discovery){
          if(method!=="POST")throw new HttpError(405,"method_not_allowed")
          if(!deps.mcpDiscovery)throw new HttpError(503,"mcp_discovery_disabled")
          const body=await readBody(req);allowBodyFields(body,["expected_revision"])
          if(!Number.isSafeInteger(body.expected_revision)||(body.expected_revision as number)<1)throw new HttpError(400,"invalid_revision")
          return send(res,200,{item:await repo.discover(identity,connection!,body.expected_revision as number,deps.mcpDiscovery),mode:"mcp_tools_discovery_only",execution_enabled:false})
        }
        if(method==="GET"){
          if(new URL(req.url!,"http://127.0.0.1").search)throw new HttpError(400,"invalid_mcp_query")
          if(!connection)return send(res,200,{items:await repo.list(identity),execution_enabled:false})
          const item=await repo.get(identity,connection)
          if(!item)throw new HttpError(404,"mcp_connection_not_found")
          return send(res,200,{item,execution_enabled:false})
        }
        const body=await readBody(req,65536)
        if(method==="POST"&&!connection){
          allowBodyFields(body,["request_id","name","description","url","headers","enabled"])
          const {request_id,...input}=body
          if(!isUuid(request_id))throw new HttpError(400,"invalid_mcp_request_id")
          return send(res,201,{item:await repo.create(identity,input,request_id),execution_enabled:false})
        }
        if((method==="PATCH"||method==="DELETE")&&connection){
          allowBodyFields(body,method==="DELETE"?["expected_revision"]:["expected_revision","name","description","url","headers","enabled"])
          const {expected_revision,...input}=body
          if(!Number.isSafeInteger(expected_revision)||(expected_revision as number)<1)throw new HttpError(400,"invalid_revision")
          if(method==="DELETE")return send(res,200,await repo.delete(identity,connection,expected_revision as number))
          return send(res,200,{item:await repo.update(identity,connection,input,expected_revision as number),execution_enabled:false})
        }
        throw new HttpError(405,"method_not_allowed")
      }
      if(schedulesRoute){
        const runtime=deps.scheduleRuntimeRepository
        const action=/^\/api\/v2\/schedules\/([0-9a-fA-F-]{36})\/(execution|activate|pause|run-now|retry-start)$/.exec(path)
        if(action){
          if(!runtime)throw new HttpError(403,"schedule_execution_disabled")
          const id=action[1]!,verb=action[2]!
          if(verb==="execution"&&method==="GET"){
            const state=await runtime.describe(identity,id);if(!state)throw new HttpError(404,"schedule_not_found")
            return send(res,200,{state})
          }
          if(method!=="POST"||verb==="execution")throw new HttpError(405,"method_not_allowed")
          const body=await readBody(req,8192)
          if(verb==="activate")return send(res,200,{state:await runtime.activate(identity,id,body)})
          allowBodyFields(body,verb==="retry-start"?["expected_revision","occurrence_id"]:["expected_revision"])
          if(!Number.isSafeInteger(body.expected_revision)||Number(body.expected_revision)<1)throw new HttpError(400,"invalid_revision")
          if(verb==="pause"){
            if(!await runtime.control(identity,id,Number(body.expected_revision),"pause"))throw new HttpError(409,"schedule_revision_conflict")
            return send(res,200,{ok:true})
          }
          return send(res,200,{state:verb==="run-now"?await runtime.runNow(identity,id,Number(body.expected_revision)):
            await runtime.retryFailedStart(identity,id,Number(body.expected_revision),String(body.occurrence_id))})
        }
        const scheduleRepo=deps.scheduleInventory
        if(!scheduleRepo)throw new HttpError(503,"schedule_inventory_disabled")
        const occurrenceRoute=path.endsWith("/occurrences")
        const suffix=path.startsWith("/api/v2/schedules/")
          ?path.slice("/api/v2/schedules/".length,
            occurrenceRoute?-"/occurrences".length:undefined):null
        if(suffix&&!isUuid(suffix))throw new HttpError(400,"invalid_schedule_id")
        if(method==="GET"){
          const requested=Number(new URL(req.url||"/","http://127.0.0.1")
            .searchParams.get("limit")||30)
          if(!Number.isSafeInteger(requested)||requested<1||requested>50)
            throw new HttpError(400,"invalid_schedule_limit")
          if(!suffix){
            const items=await scheduleRepo.list(identity,requested)
            return send(res,200,{items,mode:"readonly_inventory",scheduler_started:false})
          }
          if(occurrenceRoute){
            const items=await scheduleRepo.occurrences(identity,suffix,requested)
            if(!items)throw new HttpError(404,"schedule_not_found")
            return send(res,200,{items,mode:"readonly_history",scheduler_started:false})
          }
          const item=await scheduleRepo.get(identity,suffix)
          if(!item)throw new HttpError(404,"schedule_not_found")
          return send(res,200,{item,scheduler_started:false})
        }
        if(occurrenceRoute)throw new HttpError(405,"method_not_allowed")
        const drafts=deps.scheduleDraftRepository
        if(!drafts)throw new HttpError(503,"schedule_draft_writes_disabled")
        if(method==="POST"&&!suffix){
          const body=await readBody(req,4096)
          allowBodyFields(body,["name","kind","target_id","time_zone","rule"])
          const item=await drafts.create(identity,body)
          return send(res,201,{item,scheduler_started:false,execution_enabled:false})
        }
        if(method==="PATCH"&&suffix){
          const body=await readBody(req,4096)
          allowBodyFields(body,["name","kind","target_id","time_zone","rule",
            "expected_revision"])
          const revision=body.expected_revision
          if(!Number.isSafeInteger(revision)||(revision as number)<1)
            throw new HttpError(400,"invalid_revision")
          const {expected_revision:_discard,...input}=body
          const item=runtime?.enabled?await runtime.edit(identity,suffix,revision as number,input):await drafts.update(identity,suffix,input,revision as number)
          if(!item){
            if(!await scheduleRepo.get(identity,suffix))
              throw new HttpError(404,"schedule_not_found")
            throw new HttpError(409,"schedule_draft_or_revision_conflict")
          }
          return send(res,200,{item,scheduler_started:false,execution_enabled:false})
        }
        if(method==="DELETE"&&suffix){
          const body=await readBody(req,512)
          allowBodyFields(body,["expected_revision"])
          if(!Number.isSafeInteger(body.expected_revision)||
              (body.expected_revision as number)<1)
            throw new HttpError(400,"invalid_revision")
          if(!await (runtime?.enabled?runtime.control(identity,suffix,body.expected_revision as number,"delete"):drafts.delete(identity,suffix,body.expected_revision as number))){
            if(!await scheduleRepo.get(identity,suffix))
              throw new HttpError(404,"schedule_not_found")
            throw new HttpError(409,"schedule_draft_or_revision_conflict")
          }
          return send(res,200,{ok:true,id:suffix,
            scheduler_started:false,execution_enabled:false})
        }
        throw new HttpError(405,"method_not_allowed")
      }
      if(modelConnectionsRoute){
        const repo=deps.modelConnectionRepository
        if(!repo)throw new HttpError(503,"model_connections_disabled")
        const expectedEmployee=method==="GET"?undefined:optionalExpectedOriginalUiEmployee(req)
        const probeRoute=path.endsWith("/probe")
        const suffix=path.startsWith("/api/v2/model-connections/")
          ?path.slice("/api/v2/model-connections/".length,
            probeRoute?-"/probe".length:undefined):null
        if(suffix&&!isUuid(suffix))
          throw new HttpError(400,"invalid_model_connection_id")
        if(probeRoute){
          if(!suffix||method!=="POST")throw new HttpError(405,"method_not_allowed")
          if(!deps.modelConnectionProbe)
            throw new HttpError(503,"provider_probe_disabled")
          const body=await readBody(req,512)
          allowBodyFields(body,["expected_revision"])
          const revision=body.expected_revision
          if(!Number.isSafeInteger(revision)||(revision as number)<1)
            throw new HttpError(400,"invalid_revision")
          const item=await repo.testConnection(identity,suffix,revision as number,
            deps.modelConnectionProbe,expectedEmployee)
          return send(res,200,{item,mode:"read_only_provider_models_probe"})
        }
        if(method==="GET"){
          if(suffix){
            const item=await repo.get(identity,suffix)
            if(!item)throw new HttpError(404,"model_connection_not_found")
            return send(res,200,{item})
          }
          const requested=Number(new URL(req.url||"/","http://127.0.0.1")
            .searchParams.get("limit")||30)
          if(!Number.isSafeInteger(requested)||requested<1||requested>50)
            throw new HttpError(400,"invalid_limit")
          return send(res,200,{items:await repo.list(identity,requested)})
        }
        if(method==="POST"&&!suffix){
          const body=await readBody(req)
          allowBodyFields(body,["name","provider","base_url","api_key","models","enabled"])
          const input=safeModelConnectionInput(body,true)
          return send(res,201,{item:await repo.create(identity,input,expectedEmployee)})
        }
        if(method==="PATCH"&&suffix){
          const body=await readBody(req)
          allowBodyFields(body,["name","provider","base_url","api_key","models","enabled","expected_revision"])
          const revision=body.expected_revision
          if(!Number.isSafeInteger(revision)||(revision as number)<1)
            throw new HttpError(400,"invalid_revision")
          const {expected_revision:_ignored,...fields}=body
          const input=safeModelConnectionInput(fields,false)
          const item=await repo.update(identity,suffix,input,revision as number,expectedEmployee)
          if(!item){
            const previous=await repo.get(identity,suffix)
            if(!previous)throw new HttpError(404,"model_connection_not_found")
            throw new HttpError(409,"revision_conflict")
          }
          return send(res,200,{item})
        }
        if(method==="DELETE"&&suffix){
          let expectedRevision:number|undefined
          if(expectedEmployee!==undefined){
            const type=req.headers["content-type"],length=req.headers["content-length"],transfer=req.headers["transfer-encoding"]
            if(typeof type!=="string"||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(type)||req.headers["content-encoding"]!==undefined)throw new HttpError(415,"json_content_type_required")
            if(length!==undefined&&(typeof length!=="string"||!/^(0|[1-9][0-9]*)$/.test(length)||!Number.isSafeInteger(Number(length))))throw new HttpError(400,"invalid_json")
            if(length!==undefined&&Number(length)>512)throw new HttpError(413,"request_too_large")
            if(transfer!==undefined&&(transfer!=="chunked"||length!==undefined))throw new HttpError(400,"invalid_json")
            let size=0;const chunks:Buffer[]=[]
            for await(const chunk of req){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;if(size>512)throw new HttpError(413,"request_too_large");chunks.push(bytes)}
            if(length!==undefined&&Number(length)!==size)throw new HttpError(400,"invalid_json")
            let value:unknown
            try{value=parseAgentDesignTransportJson(new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(Buffer.concat(chunks)))}catch{throw new HttpError(400,"invalid_json")}
            if(!value||typeof value!=="object"||Array.isArray(value))throw new HttpError(400,"invalid_json")
            const body=value as Record<string,unknown>;allowBodyFields(body,["expected_revision"])
            if(!Number.isSafeInteger(body.expected_revision)||(body.expected_revision as number)<1)throw new HttpError(400,"invalid_revision")
            expectedRevision=body.expected_revision as number
          }
          if(!await repo.delete(identity,suffix,expectedRevision,expectedEmployee))
            throw new HttpError(404,"model_connection_not_found")
          return send(res,200,{ok:true,id:suffix})
        }
        throw new HttpError(405,"method_not_allowed")
      }

      if(toolConnectionsRoute){
        const repo=deps.toolConnectionRepository
        if(!repo)throw new HttpError(503,"tool_connections_disabled")
        const suffix=path.startsWith("/api/v2/tool-connections/")
          ?path.slice("/api/v2/tool-connections/".length):null
        if(suffix&&!isUuid(suffix))
          throw new HttpError(400,"invalid_tool_connection_id")
        if(method==="GET"){
          if(suffix){
            const item=await repo.get(identity,suffix)
            if(!item)throw new HttpError(404,"tool_connection_not_found")
            return send(res,200,{item,execution_enabled:false})
          }
          const requested=Number(new URL(req.url||"/","http://127.0.0.1")
            .searchParams.get("limit")||30)
          if(!Number.isSafeInteger(requested)||requested<1||requested>50)
            throw new HttpError(400,"invalid_tool_connection_limit")
          return send(res,200,{items:await repo.list(identity,requested),
            execution_enabled:false})
        }
        if(method==="POST"&&!suffix){
          const body=await readBody(req,65536)
          allowBodyFields(body,["name","description","url","method",
            "headers","body_template","timeout_s","enabled"])
          const item=await repo.create(identity,safeToolConnectionInput(body))
          return send(res,201,{item,execution_enabled:false})
        }
        if(method==="PATCH"&&suffix){
          const body=await readBody(req,65536)
          allowBodyFields(body,["name","description","url","method",
            "headers","body_template","timeout_s","enabled","expected_revision"])
          const revision=body.expected_revision
          if(!Number.isSafeInteger(revision)||(revision as number)<1)
            throw new HttpError(400,"invalid_revision")
          const {expected_revision:_ignored,...fields}=body
          const item=await repo.update(identity,suffix,
            safeToolConnectionInput(fields),revision as number)
          if(!item){
            if(!await repo.get(identity,suffix))
              throw new HttpError(404,"tool_connection_not_found")
            throw new HttpError(409,"revision_conflict")
          }
          return send(res,200,{item,execution_enabled:false})
        }
        if(method==="DELETE"&&suffix){
          if(!await repo.delete(identity,suffix))
            throw new HttpError(404,"tool_connection_not_found")
          return send(res,200,{ok:true,id:suffix,execution_enabled:false})
        }
        throw new HttpError(405,"method_not_allowed")
      }
      if(runRoute){
        const runner=deps.runRepository
        if(!runner)throw new HttpError(503,"agent_prepare_pilot_disabled")
        const decisionRoute=path.endsWith("/model-approval")
        const runId=path.startsWith("/api/v2/runs/")
          ?path.slice("/api/v2/runs/".length,
            decisionRoute?-"/model-approval".length:undefined):null
        if(runId&&!isUuid(runId))throw new HttpError(400,"invalid_run_id")
        if(decisionRoute){
          if(!runId||method!=="POST")throw new HttpError(405,"method_not_allowed")
          const body=await readBody(req)
          const outcome=await runner.decideModel(identity,runId,body)
          return send(res,outcome.replayed?200:202,{...outcome,mode:"model_pilot"})
        }
        if(method==="GET"){
          if(runId){
            const run=await runner.get(identity,runId)
            if(!run)throw new HttpError(404,"run_not_found")
            const [approval,steps]=await Promise.all([
              runner.approval(identity,runId),runner.steps(identity,runId)])
            return send(res,200,{run,approval,steps,mode:"model_pilot"})
          }
          const requested=Number(new URL(req.url||"/","http://127.0.0.1")
            .searchParams.get("limit")||30)
          if(!Number.isInteger(requested)||requested<1||requested>50)
            throw new HttpError(400,"invalid_limit")
          const runs=await runner.list(identity,requested)
          return send(res,200,{runs,mode:"model_pilot"})
        }
        throw new HttpError(405,"method_not_allowed")
      }
      if(submitPrepareRoute){
        if(method!=="POST")throw new HttpError(405,"method_not_allowed")
        const runner=deps.runRepository
        if(!runner)throw new HttpError(503,"agent_prepare_pilot_disabled")
        const specId=path.slice("/api/v2/agent-specs/".length,
          -"/runs".length)
        if(!isUuid(specId))throw new HttpError(400,"invalid_spec_id")
        const body=await readBody(req)
        const {run,replayed}=await runner.submit(identity,specId,body)
        return send(res,replayed?200:202,{run,replayed,mode:"model_pilot"})
      }

      if(knowledgeRoute){
        const kbRepo=deps.knowledgeRepository
        if(!kbRepo)throw new HttpError(503,"knowledge_pilot_disabled")
        const suffix=path.startsWith("/api/v2/knowledge-bases/")
          ?path.slice("/api/v2/knowledge-bases/".length):null
        const documents=suffix?.endsWith("/documents")||false
        const searching=suffix?.endsWith("/search")||false
        const importingText=suffix?.endsWith("/text-documents")||false
        const importingFile=suffix?.endsWith("/document-files")||false
        const baseId=suffix?(documents?suffix.slice(0,-"/documents".length):
          searching?suffix.slice(0,-"/search".length):
          importingText?suffix.slice(0,-"/text-documents".length):
          importingFile?suffix.slice(0,-"/document-files".length):suffix):null
        if(baseId && !isUuid(baseId))
          throw new HttpError(400,"invalid_knowledge_base_id")
        if(method==="GET"){
          if(searching || importingText || importingFile)throw new HttpError(405,"method_not_allowed")
          const requested=Number(new URL(req.url||"/","http://127.0.0.1")
            .searchParams.get("limit")||30)
          if(!Number.isInteger(requested)||requested<1||requested>50)
            throw new HttpError(400,"invalid_limit")
          if(documents && baseId){
            const items=await kbRepo.listDocuments(identity,baseId,requested)
            if(!items)throw new HttpError(404,"knowledge_base_not_found")
            return send(res,200,{items,scope:"metadata_only"})
          }
          if(baseId){
            const item=await kbRepo.get(identity,baseId)
            if(!item)throw new HttpError(404,"knowledge_base_not_found")
            return send(res,200,{item})
          }
          const items=await kbRepo.list(identity,requested)
          return send(res,200,{items})
        }
        if(method==="POST"&&importingFile&&baseId){
          if(!await kbRepo.get(identity,baseId))
            throw new HttpError(404,"knowledge_base_not_found")
          // Binary payload is bounded to <=512 KiB before any expensive parser.
          // The JSON base64 envelope gets its own 760 KiB request limit; all
          // other API routes keep the original 32 KiB ceiling.
          const body=await readBody(req,760000)
          const parsed=await parseDocumentIsolated(body)
          const item=await kbRepo.createParsedDocument(identity,baseId,parsed)
          return send(res,201,{item,scope:"private_keyword_only"})
        }
        if(method==="POST"&&importingText&&baseId){
          const body=await readBody(req)
          const safe=safeTextDocumentInput(body)
          const item=await kbRepo.createTextDocument(identity,baseId,safe)
          return send(res,201,{item,scope:"private_keyword_only"})
        }
        if(method==="POST"&&searching&&baseId){
          const body=await readBody(req)
          allowBodyFields(body,["query","limit"])
          const query=safeKnowledgeQuery(body.query)
          const limit=body.limit===undefined?8:body.limit
          if(typeof limit!=="number"||!Number.isSafeInteger(limit)||limit<1||limit>10)
            throw new HttpError(400,"invalid_search_limit")
          const items=await kbRepo.searchKeyword(identity,baseId,query,limit)
          if(!items)throw new HttpError(404,"knowledge_base_not_found")
          return send(res,200,{
            items,mode:"literal_keyword",scope:"current_user",
            indexed_only:true,
          })
        }
        if(method==="POST"&&!baseId){
          const body=await readBody(req)
          allowBodyFields(body,["name","description"])
          const item=await kbRepo.create(identity,
            safeName(body.name),safeDescription(body.description))
          return send(res,201,{item})
        }
        if(method==="PATCH"&&baseId&&!documents&&
           !searching&&!importingText&&!importingFile){
          const body=await readBody(req)
          allowBodyFields(body,["name","description","expected_revision"])
          const revision=body.expected_revision
          if(!Number.isSafeInteger(revision)||(revision as number)<1)
            throw new HttpError(400,"invalid_revision")
          const item=await kbRepo.update(identity,baseId,
            safeName(body.name),safeDescription(body.description),
            revision as number)
          if(!item){
            const previous=await kbRepo.get(identity,baseId)
            if(!previous)throw new HttpError(404,"knowledge_base_not_found")
            throw new HttpError(409,"revision_conflict")
          }
          return send(res,200,{item})
        }
        throw new HttpError(405,"method_not_allowed")
      }

      if(workflowSafeRunSubmitRoute||workflowSafeRunReadRoute){
        const repo=deps.workflowSafeRunRepository
        if(!repo)throw new HttpError(503,"workflow_execution_disabled")
        if(workflowSafeRunSubmitRoute){
          if(method!=="POST")throw new HttpError(405,"method_not_allowed")
          const id=path.slice("/api/v2/workflows/".length,-"/runs".length)
          const body=await readBody(req,512)
          allowBodyFields(body,["expected_revision","idempotency_key"])
          const result=await repo.submit(identity,id,body)
          return send(res,result.replayed?200:202,{...result,
            worker_started_by_api:false})
        }
        if(method!=="GET")throw new HttpError(405,"method_not_allowed")
        if(path==="/api/v2/workflow-runs"){
          const requested=Number(new URL(req.url||"/","http://127.0.0.1")
            .searchParams.get("limit")||30)
          if(!Number.isSafeInteger(requested)||requested<1||requested>50)
            throw new HttpError(400,"invalid_workflow_run_limit")
          const runs=await repo.list(identity,requested)
          return send(res,200,{runs,worker_started_by_api:false})
        }
        const id=path.slice("/api/v2/workflow-runs/".length)
        const result=await repo.get(identity,id)
        if(!result)throw new HttpError(404,"workflow_run_not_found")
        return send(res,200,{...result,worker_started_by_api:false})
      }

      if(workflowValidationSubmitRoute||workflowValidationReadRoute){
        const validator=deps.workflowValidationRepository
        if(!validator)throw new HttpError(503,"workflow_validation_disabled")
        if(workflowValidationSubmitRoute){
          if(method!=="POST")throw new HttpError(405,"method_not_allowed")
          const id=path.slice("/api/v2/workflows/".length,-"/validate".length)
          const body=await readBody(req,512)
          allowBodyFields(body,["expected_revision","idempotency_key"])
          const result=await validator.validate(identity,id,body)
          return send(res,result.replayed?200:201,{...result,
            scheduler_started:false,workflow_worker_started:false})
        }
        if(method!=="GET")throw new HttpError(405,"method_not_allowed")
        const id=path.slice("/api/v2/workflow-validations/".length)
        const result=await validator.get(identity,id)
        if(!result)throw new HttpError(404,"workflow_validation_not_found")
        return send(res,200,{...result,
          scheduler_started:false,workflow_worker_started:false})
      }

      if(workflowV2Submit||workflowNodeDebug||workflowV2Route||autonomousAgentSubmit||autonomousAgentRoute){
        const submit=autonomousAgentSubmit??workflowV2Submit,route=autonomousAgentRoute??workflowV2Route
        const repo=autonomousAgentSubmit||autonomousAgentRoute?deps.autonomousAgentRunRepository:deps.workflowV2RunRepository
        if(!repo)throw new HttpError(503,"workflow_v2_disabled")
        if(workflowNodeDebug){
          if(method!=="POST")throw new HttpError(405,"method_not_allowed")
          const result=await repo.submitNodeDebug(identity,workflowNodeDebug[1]!,await readBody(req,131072))
          return send(res,result.replayed?200:201,{...result,worker_started_by_api:false})
        }
        if(submit){
          if(method!=="POST")throw new HttpError(405,"method_not_allowed")
          const result=await repo.submit(identity,submit[1]!,await readBody(req,8192))
          return send(res,result.replayed?200:201,{...result,worker_started_by_api:false})
        }
        const id=route![1],action=route![2]
        if(action==="human-history"){
          if(method!=="GET")throw new HttpError(405,"method_not_allowed")
          if(!deps.authenticateRequest)throw new HttpError(403,"native_employee_identity_required")
          const human=autonomousAgentRoute?deps.agentHumanInputRepository:deps.workflowHumanInputRepository
          if(!human)throw new HttpError(503,"agent_human_input_unavailable")
          const query=new URL(req.url||"/","http://127.0.0.1").searchParams,keys=[...query.keys()]
          if(keys.length!==new Set(keys).size||keys.some(key=>!["after","limit"].includes(key)))throw new HttpError(400,"invalid_agent_human_history_query")
          return send(res,200,await human.history(identity,id!,query.get("after")??"",Number(query.get("limit")??10)))
        }
        if(action==="respond"||action==="respond-confirm"){
          if(method!=="POST")throw new HttpError(405,"method_not_allowed")
          if(!deps.authenticateRequest)throw new HttpError(403,"native_employee_identity_required")
          const human=autonomousAgentRoute?deps.agentHumanInputRepository:deps.workflowHumanInputRepository
          if(!human)throw new HttpError(503,"agent_human_input_unavailable")
          const body=await readBody(req,12288)
          return send(res,200,await(action==="respond"?human.change(identity,id!,body):human.confirm(identity,id!,body)))
        }
        if(!id){
          if(method!=="GET")throw new HttpError(405,"method_not_allowed")
          const query=new URL(req.url||"/","http://127.0.0.1").searchParams
          return send(res,200,{items:await repo.list(identity,Number(query.get("limit")??30),query.get("workflow_id")??undefined)})
        }
        if(action==="decision"){
          if(method!=="POST")throw new HttpError(405,"method_not_allowed")
          return send(res,200,{...await repo.decide(identity,id,await readBody(req,1024)),worker_started_by_api:false})
        }
        if(autonomousAgentRoute&&['pause','resume','pause-confirm','resume-confirm'].includes(action??'')){
          if(method!=='POST')throw new HttpError(405,'method_not_allowed')
          if(!deps.authenticateRequest)throw new HttpError(403,'native_employee_identity_required')
          const control=deps.autonomousAgentRunRepository!,verb=action!.startsWith('pause')?'pause':'resume',body=await readBody(req,1024)
          return send(res,200,{...await(action!.endsWith('-confirm')?control.confirmRunControl(identity,id!,verb,body):control.changeRunControl(identity,id!,verb,body)),worker_started_by_api:false})
        }
        if(action==="cancel"){
          if(method!=="POST")throw new HttpError(405,"method_not_allowed")
          allowBodyFields(await readBody(req,64),[])
          return send(res,200,{...await repo.cancel(identity,id),worker_started_by_api:false})
        }
        if(method!=="GET")throw new HttpError(405,"method_not_allowed")
        if(action==="outputs"||action==="output-history"){
          const query=new URL(req.url||"/","http://127.0.0.1").searchParams,names=[...query.keys()]
          if(names.length!==new Set(names).size||names.some(name=>action==="outputs"||!["after","limit"].includes(name)))throw new HttpError(400,"invalid_workflow_output_query")
          return send(res,200,action==="outputs"?await repo.outputs(identity,id):await repo.outputHistory(identity,id,query.get("after")??"",Number(query.get("limit")??25)))
        }
        if(action==="steps"){
          const query=new URL(req.url||"/","http://127.0.0.1").searchParams
          return send(res,200,await repo.steps(identity,id,query.get("after")??"",Number(query.get("limit")??100)))
        }
        const result=await repo.get(identity,id)
        if(!result)throw new HttpError(404,"workflow_run_not_found")
        return send(res,200,{...result,worker_started_by_api:false})
      }

      if(workflowRoute){
        const workflowRepo=deps.workflowRepository
        if(!workflowRepo)throw new HttpError(503,"workflow_pilot_disabled")
        const workflowSuffix=path.startsWith("/api/v2/workflows/")
          ?path.slice("/api/v2/workflows/".length):null
        if(workflowSuffix&&!isUuid(workflowSuffix))
          throw new HttpError(400,"invalid_workflow_id")
        if(method==="GET"){
          if(workflowSuffix){
            const item=await workflowRepo.get(identity,workflowSuffix)
            if(!item)throw new HttpError(404,"workflow_not_found")
            return send(res,200,{item})
          }
          const requested=Number(new URL(req.url||"/","http://127.0.0.1")
            .searchParams.get("limit")||30)
          if(!Number.isInteger(requested)||requested<1||requested>50)
            throw new HttpError(400,"invalid_limit")
          const items=await workflowRepo.list(identity,requested)
          return send(res,200,{items})
        }
        if(method==="POST"&&!workflowSuffix){
          const body=await readBody(req,135168)
          allowBodyFields(body,["name","graph","request_id"])
          if(Object.hasOwn(body,"request_id")){
            if(!isUuid(body.request_id))throw new HttpError(400,"invalid_workflow_create_request")
            const result=await workflowRepo.createIdempotent(identity,body.request_id,safeName(body.name),safeWorkflowGraph(body.graph))
            return send(res,result.replayed?200:201,result)
          }
          const item=await workflowRepo.create(identity,
            safeName(body.name),safeWorkflowGraph(body.graph))
          return send(res,201,{item})
        }
        if(method==="PATCH"&&workflowSuffix){
          const body=await readBody(req,135168)
          allowBodyFields(body,["name","graph","expected_revision"])
          const revision=body.expected_revision
          if(!Number.isSafeInteger(revision)||(revision as number)<1)
            throw new HttpError(400,"invalid_revision")
          const item=await workflowRepo.update(identity,workflowSuffix,
            safeName(body.name),safeWorkflowGraph(body.graph),revision as number)
          if(!item){
            const previous=await workflowRepo.get(identity,workflowSuffix)
            if(!previous)throw new HttpError(404,"workflow_not_found")
            throw new HttpError(409,"revision_conflict")
          }
          return send(res,200,{item})
        }
        throw new HttpError(405,"method_not_allowed")
      }

      const suffix=path.startsWith("/api/v2/agent-specs/")
        ? path.slice("/api/v2/agent-specs/".length) : null
      if(suffix && !isUuid(suffix))
        throw new HttpError(400,"invalid_spec_id")

      if(method==="GET"){
        if(suffix){
          const item=await deps.repository.get(identity,suffix)
          if(!item)throw new HttpError(404,"spec_not_found")
          return send(res,200,{item})
        }
        const requested=Number(new URL(req.url||"/","http://127.0.0.1").searchParams.get("limit")||30)
        if(!Number.isInteger(requested) || requested<1 || requested>50)
          throw new HttpError(400,"invalid_limit")
        const items=await deps.repository.list(identity,requested)
        return send(res,200,{items})
      }
      if(method==="POST" && !suffix){
        const body=await readBody(req,262144)
        allowBodyFields(body,["name","spec"])
        const item=await deps.repository.create(identity,safeName(body.name),agentSpec(body.spec,identity))
        return send(res,201,{item})
      }
      if(method==="PATCH" && suffix){
        const body=await readBody(req,262144)
        allowBodyFields(body,["name","spec","expected_revision"])
        const revision=body.expected_revision
        if(!Number.isSafeInteger(revision) || (revision as number)<1)
          throw new HttpError(400,"invalid_revision")
        const item=await deps.repository.update(identity,suffix,
          safeName(body.name),agentSpec(body.spec,identity),revision as number)
        if(!item){
          const original=await deps.repository.get(identity,suffix)
          if(!original)throw new HttpError(404,"spec_not_found")
          throw new HttpError(409,"revision_conflict")
        }
        return send(res,200,{item})
      }
      throw new HttpError(405,"method_not_allowed")
    } catch(error){
      if(error instanceof HttpError)send(res,error.status,{error:error.code})
      else send(res,500,{error:"internal_error"})
    }
  }
}
