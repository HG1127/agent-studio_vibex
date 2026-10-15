/**
 * PG V8.2 PILOT ONLY. All requests stay under the same-origin /__pg proxy.
 * A separately verified OIDC access token must be provided in memory.
 * Never reuse PocketBase tokens or persist tokens in browser storage.
 */
export type PgStatus="queued"|"running"|"awaiting_approval"|"paused"|"succeeded"|"failed"|"cancelled"
export interface PgAgentSpec {
  id:string;name:string;revision:number;updated_at:string
  spec:{goal:string;task_scope:string;deliverables:string[];task_plan:string[];done_criteria:string[];tools:string[]}
}
export interface PgRun {
  id:string;agent_spec_id:string;instruction:string;status:PgStatus
  checkpoint:Record<string,unknown>;result_text:string
  last_error_code:string;created_at:string;updated_at:string
}
export interface PgApproval {status:"pending"|"approved"|"rejected"|"expired";step_key:string}
export interface PgWorkflow {
  id:string;name:string;revision:number
  graph:{nodes:{id:string;type:string;data:{title:string};position:{x:number;y:number}}[];edges:{id:string;source:string;target:string}[]}
}
export interface PgKnowledgeBase {id:string;name:string;description:string;revision:number}
export interface PgKnowledgeDocument {id:string;filename:string;mime_type:string;status:string;sha256:string}
export interface PgKnowledgeHit {document_id:string;filename:string;snippet:string;citation:string;chunk_index:number}
export class PgPilotApiError extends Error {
  readonly status:number
  readonly code:string
  constructor(status:number,code:string){super(code);this.status=status;this.code=code}
}
const root="/__pg/api/v2" as const
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function id(raw:string):string {
  if(!uuid.test(raw))throw new PgPilotApiError(400,"invalid_resource_id")
  return raw
}
export function createPgPilotApi(accessToken:string,transport:typeof fetch=fetch) {
  const token=accessToken.trim()
  // This is input validation, NOT authentication; the server verifies OIDC.
  if(!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)||
    token.length>8192)
    throw new PgPilotApiError(401,"oidc_access_token_required")
  async function request<T>(method:"GET"|"POST"|"PATCH",route:string,body?:unknown):Promise<T>{
    if(!route.startsWith("/")||route.startsWith("//")||route.includes("..")||
       route.includes("://")||route.includes("\\"))
      throw new PgPilotApiError(400,"invalid_pilot_path")
    let response:Response
    try {
      response=await transport(root+route,{
        method,
        credentials:"omit",cache:"no-store",redirect:"error",
        referrerPolicy:"no-referrer",
        headers:{
          Authorization:"Bearer "+token,
          Accept:"application/json",
          ...(body===undefined?{}:{"Content-Type":"application/json"}),
        },
        ...(body===undefined?{}:{body:JSON.stringify(body)}),
        signal:AbortSignal.timeout(12000),
      })
    }catch {
      throw new PgPilotApiError(0,"pilot_connection_unavailable")
    }
    let value:unknown
    try {value=await response.json()}catch {
      throw new PgPilotApiError(response.status,"invalid_pilot_response")
    }
    if(!response.ok) {
      const possible=(value as {error?:unknown})?.error
      const code=typeof possible==="string"&&/^[a-z_]{1,80}$/.test(possible)
        ?possible:"pilot_request_failed"
      throw new PgPilotApiError(response.status,code)
    }
    return value as T
  }
  return {
    listAgents:async()=> (await request<{items:PgAgentSpec[]}>("GET","/agent-specs")).items,
    createAgent:async(name:string,goal:string)=>request<{item:PgAgentSpec}>(
      "POST","/agent-specs",{name,spec:{
        goal,task_scope:"",deliverables:[],task_plan:[],done_criteria:[],tools:[],
      }}),
    listRuns:async()=> (await request<{runs:PgRun[]}>("GET","/runs")).runs,
    getRun:(runId:string)=>request<{run:PgRun;approval:PgApproval|null;mode:string}>(
      "GET","/runs/"+id(runId)),
    submitRun:(specId:string,instruction:string,idempotencyKey:string)=>
      request<{run:PgRun;replayed:boolean}>(
        "POST","/agent-specs/"+id(specId)+"/runs",
        {instruction,idempotency_key:idempotencyKey}),
    decideModel:(runId:string,decision:"approved"|"rejected")=>
      request<{run:PgRun;approval:string;replayed:boolean}>(
        "POST","/runs/"+id(runId)+"/model-approval",{decision}),
    listWorkflows:async()=> (await request<{items:PgWorkflow[]}>(
      "GET","/workflows")).items,
    createWorkflow:(name:string)=>request<{item:PgWorkflow}>(
      "POST","/workflows",{name,graph:{
        nodes:[
          {id:"start",type:"start",data:{title:"开始"},position:{x:0,y:60}},
          {id:"end",type:"end",data:{title:"结束"},position:{x:280,y:60}},
        ],
        edges:[{id:"start_end",source:"start",target:"end"}],
      }}),
    listKnowledgeBases:async()=> (await request<{items:PgKnowledgeBase[]}>(
      "GET","/knowledge-bases")).items,
    createKnowledgeBase:(name:string,description:string)=>
      request<{item:PgKnowledgeBase}>("POST","/knowledge-bases",{name,description}),
    listDocuments:async(baseId:string)=>
      (await request<{items:PgKnowledgeDocument[]}>(
        "GET","/knowledge-bases/"+id(baseId)+"/documents")).items,
    importText:(baseId:string,filename:string,text:string)=>
      request<{item:{id:string;filename:string;status:string;chunk_count:number}}>(
        "POST","/knowledge-bases/"+id(baseId)+"/text-documents",
        {filename,text}),
    searchKnowledge:async(baseId:string,query:string)=>
      (await request<{items:PgKnowledgeHit[];mode:string}>(
        "POST","/knowledge-bases/"+id(baseId)+"/search",{query,limit:8})).items,
  }
}
