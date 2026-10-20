import type { IncomingMessage, ServerResponse } from "node:http"
import { AgentSpecRepository } from "./repository.ts"
import { RunRepository } from "./run-repository.ts"
import { WorkflowRepository } from "./workflow-repository.ts"
import { KnowledgeBaseRepository, safeDescription, safeKnowledgeQuery, safeTextDocumentInput } from "./knowledge-repository.ts"
import {parseDocumentIsolated} from "./document-worker.ts"
import { HttpError, isUuid, safeAgentSpec, safeName, safeWorkflowGraph, type Identity } from "./contracts.ts"

export interface AppDependencies {
  repository: AgentSpecRepository
  runRepository?: RunRepository
  workflowRepository?: WorkflowRepository
  knowledgeRepository?: KnowledgeBaseRepository
  verifyToken(token: string): Promise<Identity>
  // Only an explicitly injected, server-trusted Native session verifier
  // may replace OIDC; never accept browser-supplied identity or bearer.
  authenticateRequest?: (req:IncomingMessage)=>Promise<Identity>
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
      const runRoute=path==="/api/v2/runs" ||
        /^\/api\/v2\/runs\/[0-9a-fA-F-]{36}(?:\/model-approval)?$/.test(path)
      const submitPrepareRoute=
        /^\/api\/v2\/agent-specs\/[0-9a-fA-F-]{36}\/runs$/.test(path)
      const knowledgeRoute=path==="/api/v2/knowledge-bases" ||
        /^\/api\/v2\/knowledge-bases\/[0-9a-fA-F-]{36}(?:\/(?:documents|search|text-documents|document-files))?$/.test(path)
      if(!workflowRoute && !knowledgeRoute && !runRoute &&
         !submitPrepareRoute && path!=="/api/v2/agent-specs" &&
         !/^\/api\/v2\/agent-specs\/[0-9a-fA-F-]{36}$/.test(path))
        throw new HttpError(404,"route_not_found")
      if(!["GET","POST","PATCH"].includes(method))
        throw new HttpError(405,"method_not_allowed")

      // Explicitly ignore X-Rh-User-Id. Only a cryptographically verified token
      // from the configured issuer yields an employee identity.
      let identity:Identity
      try{
        if(deps.authenticateRequest)
          identity=await deps.authenticateRequest(req)
        else identity=await deps.verifyToken(tokenFrom(req))
      }catch(error){
        if(deps.authenticateRequest &&
           (error as {status?:number})?.status===403)
          throw new HttpError(403,"native_request_origin_denied")
        throw new HttpError(401,"invalid_token")
      }
      if(typeof identity?.issuer!=="string" || !identity.issuer ||
         typeof identity?.subject!=="string" || !identity.subject)
        throw new HttpError(401,"invalid_token")
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
            const approval=await runner.approval(identity,runId)
            return send(res,200,{run,approval,mode:"model_pilot"})
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
          const body=await readBody(req)
          allowBodyFields(body,["name","graph"])
          const item=await workflowRepo.create(identity,
            safeName(body.name),safeWorkflowGraph(body.graph))
          return send(res,201,{item})
        }
        if(method==="PATCH"&&workflowSuffix){
          const body=await readBody(req)
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
