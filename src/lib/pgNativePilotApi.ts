/** Separate, local-only PostgreSQL 18 native-auth test client.
 * Cookie is HttpOnly, sent by browser same-origin to the Vite dev proxy.
 * Never imports PocketBase, never stores a bearer token or session value. */
export type PgNativeConfigCapabilities={
  mode:"native_pg18";config_writes_enabled:boolean;run_execution_enabled:false
  model_probe_enabled:boolean
  run_submission_enabled?:boolean
  bound_model_runs_enabled?:boolean
  workflow_validation_enabled?:boolean
  workflow_execution_enabled?:boolean
}
export type PgNativeStaff={
  id:string;email:string;display_name:string;is_admin:boolean
}
export type PgNativeEmployee=PgNativeStaff&{
  enabled:boolean;status:"active"|"disabled";created_at:string
}
export type PgNativeAgentModelBinding={
  connection_id:string;connection_revision:number;model_id:string
}
export type PgNativeAgent={
  id:string;name:string;revision:number
  spec:{goal:string;task_scope:string;deliverables?:string[];
    task_plan?:string[];done_criteria?:string[];tools?:string[];
    knowledge_base_ids?:string[];model_binding?:PgNativeAgentModelBinding}
}
export type PgNativeWorkflow={id:string;name:string;revision:number;
  graph?:{nodes:unknown[];edges:unknown[]}}
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
type RootPath=""|"/__pg_native"
const routes={
  login:"/api/native-auth/login",
  me:"/api/native-auth/me",
  logout:"/api/native-auth/logout",
  capabilities:"/api/native-auth/capabilities",
  employees:"/api/native-auth/employees",
  agents:"/api/v2/agent-specs",
  workflows:"/api/v2/workflows",
  bases:"/api/v2/knowledge-bases",
  runs:"/api/v2/runs",
  workflowRuns:"/api/v2/workflow-runs",
  schedules:"/api/v2/schedules",
  modelConnections:"/api/v2/model-connections",
  toolConnections:"/api/v2/tool-connections",
} as const
type Route=typeof routes[keyof typeof routes]|
  `/api/v2/runs/${string}`|`/api/v2/agent-specs/${string}/runs`|
  `/api/v2/knowledge-bases/${string}/documents`|
  `/api/v2/knowledge-bases/${string}/search`|
  `/api/v2/knowledge-bases/${string}/text-documents`|
  `/api/v2/schedules/${string}/occurrences`
  | `/api/v2/schedules/${string}`
  | `/api/v2/model-connections/${string}`
  | `/api/v2/tool-connections/${string}`
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
  const del=<T>(route:Route)=>request<T>(route,"DELETE",undefined,transport,rootPath)
  return {
    me:async()=> (await get<{authenticated:true;user:PgNativeStaff}>(routes.me)).user,
    getConfigCapabilities:async()=>{
      const value=await get<PgNativeConfigCapabilities>(routes.capabilities)
      if(value?.mode!=="native_pg18"||
         typeof value.config_writes_enabled!=="boolean"||
         typeof value.model_probe_enabled!=="boolean"||
          (value.workflow_validation_enabled!==undefined&&
            typeof value.workflow_validation_enabled!=="boolean")||
          (value.workflow_execution_enabled!==undefined&&
            typeof value.workflow_execution_enabled!=="boolean")||
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
    listModelConnections:async()=>
      (await get<{items:PgNativeModelConnection[]}>(routes.modelConnections)).items,
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
        knowledge_base_ids:old.knowledge_base_ids??[],
        ...(old.model_binding?{model_binding:old.model_binding}:{})}
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
        done_criteria:old.done_criteria??[],tools,knowledge_base_ids:ids,
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
      const spec={goal:old.goal,task_scope:old.task_scope??"",
        deliverables:old.deliverables??[],task_plan:old.task_plan??[],
        done_criteria:old.done_criteria??[],tools:old.tools??[],
        knowledge_base_ids:old.knowledge_base_ids??[],
        ...(binding?{model_binding:binding}:{})}
      return (await patch<{item:PgNativeAgent}>(route,{
        name:current.name,spec,expected_revision:revision
      })).item
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
