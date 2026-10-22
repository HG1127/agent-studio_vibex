import type {AutonomousAgentRunRepository} from "./autonomous-agent-run-repository.ts"
import type { IncomingMessage, ServerResponse } from "node:http"
import { AgentSpecRepository } from "./repository.ts"
import { RunRepository } from "./run-repository.ts"
import { ScheduleInventoryRepository } from "./schedule-inventory-repository.ts"
import {ScheduleDraftRepository} from "./schedule-draft-repository.ts"
import { WorkflowRepository } from "./workflow-repository.ts"
import {WorkflowValidationRepository} from "./workflow-validation-repository.ts"
import {WorkflowSafeRunRepository} from "./workflow-safe-run-repository.ts"
import {WorkflowV2RunRepository} from "./workflow-v2-run-repository.ts"
import { KnowledgeBaseRepository, safeDescription, safeKnowledgeQuery, safeTextDocumentInput } from "./knowledge-repository.ts"
import {ModelConnectionRepository,safeModelConnectionInput} from "./model-connection-repository.ts"
import {ToolConnectionRepository,safeToolConnectionInput} from "./tool-connection-repository.ts"
import type {ProviderProbeInput,ProviderProbeResult} from "./model-connection-probe.ts"
import {parseDocumentIsolated} from "./document-worker.ts"
import { HttpError, isUuid, safeAgentSpec, safeName, safeWorkflowGraph, type Identity } from "./contracts.ts"

export interface AppDependencies {
  repository: AgentSpecRepository
  runRepository?: RunRepository
  scheduleInventory?: ScheduleInventoryRepository
  scheduleDraftRepository?: ScheduleDraftRepository
  workflowRepository?: WorkflowRepository
  workflowValidationRepository?: WorkflowValidationRepository
  workflowSafeRunRepository?: WorkflowSafeRunRepository
  autonomousAgentRunRepository?:AutonomousAgentRunRepository
  workflowV2RunRepository?: WorkflowV2RunRepository
  knowledgeRepository?: KnowledgeBaseRepository
  modelConnectionRepository?: ModelConnectionRepository
  toolConnectionRepository?: ToolConnectionRepository
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
      const workflowV2Route=/^\/api\/v2\/workflow-v2-runs(?:\/([0-9a-fA-F-]{36})(?:\/(decision|cancel|steps))?)?$/.exec(path)
      const autonomousAgentRoute=/^\/api\/v2\/agent-autonomous-runs(?:\/([0-9a-fA-F-]{36})(?:\/(decision|cancel|steps))?)?$/.exec(path)
      const autonomousAgentSubmit=/^\/api\/v2\/agent-specs\/([0-9a-fA-F-]{36})\/autonomous-runs$/.exec(path)
      const runRoute=path==="/api/v2/runs" ||
        /^\/api\/v2\/runs\/[0-9a-fA-F-]{36}(?:\/model-approval)?$/.test(path)
      const submitPrepareRoute=
        /^\/api\/v2\/agent-specs\/[0-9a-fA-F-]{36}\/runs$/.test(path)
      const knowledgeRoute=path==="/api/v2/knowledge-bases" ||
        /^\/api\/v2\/knowledge-bases\/[0-9a-fA-F-]{36}(?:\/(?:documents|search|text-documents|document-files))?$/.test(path)
      const schedulesRoute=path==="/api/v2/schedules" ||
        /^\/api\/v2\/schedules\/[0-9a-fA-F-]{36}(?:\/occurrences)?$/.test(path)
      const modelConnectionsRoute=path==="/api/v2/model-connections" ||
        /^\/api\/v2\/model-connections\/[0-9a-fA-F-]{36}(?:\/probe)?$/.test(path)
      const toolConnectionsRoute=path==="/api/v2/tool-connections" ||
        /^\/api\/v2\/tool-connections\/[0-9a-fA-F-]{36}$/.test(path)
      if(!workflowRoute && !workflowValidationSubmitRoute &&
         !workflowValidationReadRoute && !workflowSafeRunSubmitRoute &&
         !workflowSafeRunReadRoute && !workflowV2Submit && !workflowV2Route && !autonomousAgentSubmit && !autonomousAgentRoute && !knowledgeRoute && !runRoute && !schedulesRoute &&
         !modelConnectionsRoute && !toolConnectionsRoute &&
         !submitPrepareRoute && path!=="/api/v2/agent-specs" &&
         !/^\/api\/v2\/agent-specs\/[0-9a-fA-F-]{36}$/.test(path))
        throw new HttpError(404,"route_not_found")
      if(!["GET","POST","PATCH","DELETE"].includes(method))
        throw new HttpError(405,"method_not_allowed")


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
      if(schedulesRoute){
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
          const item=await drafts.update(identity,suffix,input,revision as number)
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
          if(!await drafts.delete(identity,suffix,body.expected_revision as number)){
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
            deps.modelConnectionProbe)
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
          return send(res,201,{item:await repo.create(identity,input)})
        }
        if(method==="PATCH"&&suffix){
          const body=await readBody(req)
          allowBodyFields(body,["name","provider","base_url","api_key","models","enabled","expected_revision"])
          const revision=body.expected_revision
          if(!Number.isSafeInteger(revision)||(revision as number)<1)
            throw new HttpError(400,"invalid_revision")
          const {expected_revision:_ignored,...fields}=body
          const input=safeModelConnectionInput(fields,false)
          const item=await repo.update(identity,suffix,input,revision as number)
          if(!item){
            const previous=await repo.get(identity,suffix)
            if(!previous)throw new HttpError(404,"model_connection_not_found")
            throw new HttpError(409,"revision_conflict")
          }
          return send(res,200,{item})
        }
        if(method==="DELETE"&&suffix){
          if(!await repo.delete(identity,suffix))
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

      if(workflowV2Submit||workflowV2Route||autonomousAgentSubmit||autonomousAgentRoute){
        const submit=autonomousAgentSubmit??workflowV2Submit,route=autonomousAgentRoute??workflowV2Route
        const repo=autonomousAgentSubmit||autonomousAgentRoute?deps.autonomousAgentRunRepository:deps.workflowV2RunRepository
        if(!repo)throw new HttpError(503,"workflow_v2_disabled")
        if(submit){
          if(method!=="POST")throw new HttpError(405,"method_not_allowed")
          const result=await repo.submit(identity,submit[1]!,await readBody(req,8192))
          return send(res,result.replayed?200:201,{...result,worker_started_by_api:false})
        }
        const id=route![1],action=route![2]
        if(!id){
          if(method!=="GET")throw new HttpError(405,"method_not_allowed")
          const query=new URL(req.url||"/","http://127.0.0.1").searchParams
          return send(res,200,{items:await repo.list(identity,Number(query.get("limit")??30))})
        }
        if(action==="decision"){
          if(method!=="POST")throw new HttpError(405,"method_not_allowed")
          return send(res,200,{...await repo.decide(identity,id,await readBody(req,1024)),worker_started_by_api:false})
        }
        if(action==="cancel"){
          if(method!=="POST")throw new HttpError(405,"method_not_allowed")
          allowBodyFields(await readBody(req,64),[])
          return send(res,200,{...await repo.cancel(identity,id),worker_started_by_api:false})
        }
        if(method!=="GET")throw new HttpError(405,"method_not_allowed")
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
        const body=await readBody(req)
        allowBodyFields(body,["name","spec"])
        const item=await deps.repository.create(identity,safeName(body.name),safeAgentSpec(body.spec))
        return send(res,201,{item})
      }
      if(method==="PATCH" && suffix){
        const body=await readBody(req)
        allowBodyFields(body,["name","spec","expected_revision"])
        const revision=body.expected_revision
        if(!Number.isSafeInteger(revision) || (revision as number)<1)
          throw new HttpError(400,"invalid_revision")
        const item=await deps.repository.update(identity,suffix,
          safeName(body.name),safeAgentSpec(body.spec),revision as number)
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
