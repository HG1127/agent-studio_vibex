/** Separate, local-only PostgreSQL 18 native-auth test client.
 * Cookie is HttpOnly, sent by browser same-origin to the Vite dev proxy.
 * Never imports PocketBase, never stores a bearer token or session value. */
export type PgNativeStaff={
  id:string;email:string;display_name:string;is_admin:boolean
}
export type PgNativeAgent={
  id:string;name:string;revision:number
  spec:{goal:string;task_scope:string;deliverables?:string[];
    task_plan?:string[];done_criteria?:string[];tools?:string[];
    knowledge_base_ids?:string[]}
}
export type PgNativeWorkflow={id:string;name:string;revision:number;
  graph?:{nodes:unknown[];edges:unknown[]}}
export type PgNativeKnowledge={id:string;name:string;description:string;revision:number}
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
  next_at:string|null;enabled:boolean;revision:number
  created_at:string;updated_at:string
}
export type PgNativeScheduleOccurrence={
  id:string;schedule_id:string;scheduled_for:string
  status:"pending"|"started"|"succeeded"|"failed"|"skipped"
  run_id:string|null;created_at:string
}
export type PgNativeRunStatus="queued"|"running"|"awaiting_approval"|"paused"|
  "succeeded"|"failed"|"cancelled"
export type PgNativeRun={
  id:string;agent_spec_id:string;owner_user_id:string
  status:PgNativeRunStatus;instruction:string;result_text:string
  checkpoint:Record<string,unknown>;step_count:number
  last_error_code:string;created_at:string;updated_at:string
}
export type PgNativeRunDetail={
  run:PgNativeRun;approval:{status:string;step_key:string}|null
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
type RootPath=""|"/__pg_native"
const routes={
  login:"/api/native-auth/login",
  me:"/api/native-auth/me",
  logout:"/api/native-auth/logout",
  employees:"/api/native-auth/employees",
  agents:"/api/v2/agent-specs",
  workflows:"/api/v2/workflows",
  bases:"/api/v2/knowledge-bases",
  runs:"/api/v2/runs",
  schedules:"/api/v2/schedules",
} as const
type Route=typeof routes[keyof typeof routes]|
  `/api/v2/runs/${string}`|`/api/v2/agent-specs/${string}/runs`|
  `/api/v2/knowledge-bases/${string}/documents`|
  `/api/v2/knowledge-bases/${string}/search`|
  `/api/v2/knowledge-bases/${string}/text-documents`|
  `/api/v2/schedules/${string}/occurrences`
async function request<T>(
  route:Route,
  method:"GET"|"POST"|"PATCH"="GET",
  body?:Record<string,unknown>,
  transport:typeof fetch=fetch,
  rootPath:RootPath="/__pg_native",
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
      signal:AbortSignal.timeout(12000),
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
  if(route!==routes.agents&&route!==routes.workflows&&route!==routes.bases)
    throw new PgNativePilotError(400,"invalid_pg_native_resource")
  return (route+"/"+id) as Route
}
function scheduleOccurrencesRoute(id:string):`/api/v2/schedules/${string}/occurrences`{
  if(!safeId.test(id))throw new PgNativePilotError(400,"invalid_pg_native_schedule_id")
  return `/api/v2/schedules/${id}/occurrences`
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
  if(typeof instruction!=="string"||instruction.length>1200||
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
function simpleAgentSpec(goal:string){
  return {goal,task_scope:"",deliverables:[],task_plan:[],
    done_criteria:[],tools:[]}
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
  return {
    me:async()=> (await get<{authenticated:true;user:PgNativeStaff}>(routes.me)).user,
    login:(email:string,password:string)=>post<{authenticated:true;role:string}>(
      routes.login,{email,password}),
    logout:()=>post<{ok:true}>(routes.logout,{}),
    createEmployee:async(email:string,password:string,display_name:string)=>
      (await post<{user:PgNativeStaff}>(routes.employees,{
        email,password,display_name
      })).user,
    listAgents:async()=> (await get<{items:PgNativeAgent[]}>(routes.agents)).items,
    createAgent:async(name:string,goal:string)=>(
      await post<{item:PgNativeAgent}>(routes.agents,{name,spec:{
        ...simpleAgentSpec(goal)
      }})
    ).item,
    getAgent:async(id:string)=>
      (await get<{item:PgNativeAgent}>(recordRoute(routes.agents,id))).item,
    updateAgent:async(id:string,expected_revision:number,name:string,goal:string)=>{
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
      const spec={goal,task_scope:old.task_scope??"",
        deliverables:old.deliverables??[],task_plan:old.task_plan??[],
        done_criteria:old.done_criteria??[],tools:old.tools??[],
        knowledge_base_ids:old.knowledge_base_ids??[]}
      return (await patch<{item:PgNativeAgent}>(route,{
        name,spec,expected_revision:revision
      })).item
    },
    // Explicit development UAT only. Server verifies all KB IDs belong to
    // this employee and the config-write capability before saving.
    updateAgentKnowledgeBases:async(id:string,expected_revision:number,ids:string[])=>{
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
      const spec={goal:old.goal,task_scope:old.task_scope??"",
        deliverables:old.deliverables??[],task_plan:old.task_plan??[],
        done_criteria:old.done_criteria??[],tools,knowledge_base_ids:ids}
      return (await patch<{item:PgNativeAgent}>(route,{
        name:current.name,spec,expected_revision:revision
      })).item
    },
    listWorkflows:async()=> (
      await get<{items:PgNativeWorkflow[]}>(routes.workflows)).items,
    createWorkflow:async(name:string)=> (
      await post<{item:PgNativeWorkflow}>(routes.workflows,{
        name,graph:simpleWorkflowGraph()
      })
    ).item,
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
    // Inventory only: no schedule create/update/enable/run endpoints.
    listSchedules:async()=>
      (await get<{items:PgNativeSchedule[]}>(routes.schedules)).items,
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
    listRuns:async()=> (await get<{runs:PgNativeRun[]}>(routes.runs)).runs,
    getRun:(id:string)=>get<PgNativeRunDetail>(runRoute(id)),
    submitRun:(specId:string,instruction:string,idempotencyKey:string)=>
      post<PgNativeRunSubmission>(runSubmissionRoute(specId),
        safeRunPayload(instruction,idempotencyKey)),
    decideModel:(id:string,decision:"approved"|"rejected")=>{
      if(decision!=="approved"&&decision!=="rejected")
        throw new PgNativePilotError(400,"invalid_pg_native_decision")
      return post<PgNativeRunDecision>(`${runRoute(id)}/model-approval`,{decision})
    },
  }
}
