// V8 standalone API pilot. Current V7 PocketBase runtime remains authoritative.
import {parseWorkflowGraphV2,InvalidWorkflowGraphV2,type WorkflowNodeType,type WorkflowNode,type WorkflowEdge,type WorkflowGraph} from "./workflow-graph-v2.ts"
import {parseAgentHttpTools,type AgentHttpTool} from "./agent-http-tools.ts"
import {parseAgentMcpTools,type AgentMcpTool} from "./mcp-binding.ts"
export type {WorkflowNodeType,WorkflowNode,WorkflowEdge,WorkflowGraph} from "./workflow-graph-v2.ts"
export type Identity = { issuer: string; subject: string }

export interface QueryResult<Row> { rows: Row[] }
export interface SqlClient {
  query<Row=Record<string,unknown>>(
    sql: string, values?: unknown[],
  ): Promise<QueryResult<Row>>
  release(): void
}
export interface SqlPool {
  /** Trusted service configuration only; never derived from request fields. */
  readonly knowledgeSharing?:boolean
  readonly knowledgeEmbeddingSettings?:boolean
  readonly knowledgeEmbeddingConsent?:boolean
  readonly knowledgeIndexRuntime?:boolean
  readonly knowledgeQueryRuntime?:boolean
  connect(): Promise<SqlClient>
}

export class HttpError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string) {
    super(code)
    this.status=status
    this.code=code
  }
}

export interface AgentSpecInput {
  model_binding?:{
    connection_id:string
    connection_revision:number
    model_id:string
  }
  goal: string
  task_scope: string
  deliverables: string[]
  task_plan: string[]
  done_criteria: string[]
  tools: string[]
  http_tools?:AgentHttpTool[]
  mcp_tools?:AgentMcpTool[]
  knowledge_base_ids: string[]
  require_approval: true
}

const allowedTools=new Set([
  "calculate", "summarize", "knowledge_search", "web_search", "web_fetch",
])

function field(value:unknown,max:number): string {
  if(typeof value!=="string" || value.length>max) throw new HttpError(400,"invalid_agent_spec")
  return value.trim()
}
function textList(value:unknown):string[] {
  if(value===undefined)return []
  if(!Array.isArray(value) || value.length>20)throw new HttpError(400,"invalid_agent_spec")
  return value.map(v=>field(v,300))
}
function knowledgeBaseIds(value:unknown,tools:readonly string[]):string[]{
  if(value===undefined)return []
  if(!Array.isArray(value)||value.length>3||
     value.some(x=>!isUuid(x))||new Set(value).size!==value.length||
     (value.length>0&&!tools.includes("knowledge_search")))
    throw new HttpError(400,"invalid_agent_knowledge_scope")
  return [...value]
}
function safeModelBinding(raw:unknown):AgentSpecInput["model_binding"]{
  if(raw===undefined||raw===null)return undefined
  if(!raw||typeof raw!=="object"||Array.isArray(raw))
    throw new HttpError(400,"invalid_agent_model_binding")
  const item=raw as Record<string,unknown>
  if(Object.keys(item).length!==3||
     !["connection_id","connection_revision","model_id"]
        .every(k=>Object.hasOwn(item,k))||
     !isUuid(item.connection_id)||
     !Number.isSafeInteger(item.connection_revision)||
     (item.connection_revision as number)<1||
     typeof item.model_id!=="string"||
     !/^[A-Za-z0-9._:/-]{1,120}$/.test(item.model_id))
    throw new HttpError(400,"invalid_agent_model_binding")
  return {connection_id:item.connection_id,
    connection_revision:item.connection_revision as number,
    model_id:item.model_id}
}
export function safeAgentSpec(raw:unknown):AgentSpecInput {
  if(!raw || typeof raw!=="object" || Array.isArray(raw))throw new HttpError(400,"invalid_agent_spec")
  const data=raw as Record<string,unknown>
  const goal=field(data.goal,2000)
  if(!goal)throw new HttpError(400,"invalid_agent_spec")
  const tools=textList(data.tools)
  let httpTools:AgentHttpTool[]
  try{httpTools=parseAgentHttpTools(data.http_tools)}catch{throw new HttpError(400,"invalid_agent_http_tools")}
  const customNames=new Set(httpTools.map(tool=>tool.name))
  let mcpTools:AgentMcpTool[]
  try{mcpTools=parseAgentMcpTools(data.mcp_tools)}catch{throw new HttpError(400,"invalid_agent_mcp_tools")}
  mcpTools.forEach(tool=>customNames.add(tool.name))
  if(tools.some(t=>!allowedTools.has(t)&&!customNames.has(t)))throw new HttpError(400,"unknown_tool")
  if(httpTools.some(tool=>!tools.includes(tool.name)))throw new HttpError(400,"invalid_agent_http_tools")
  if(mcpTools.some(tool=>!tools.includes(tool.name)))throw new HttpError(400,"invalid_agent_mcp_tools")
  // Only owner-validated model-connection IDs may enter a spec; never
  // accept passwords, API keys, provider URL overrides or worker tokens.
  const permitted=new Set([
    "goal","task_scope","deliverables","task_plan","done_criteria","tools",
    "knowledge_base_ids","model_binding","http_tools","mcp_tools",
  ])
  if(Object.keys(data).some(k=>!permitted.has(k)))throw new HttpError(400,"unsafe_agent_spec_field")
  const modelBinding=safeModelBinding(data.model_binding)
  return {
    goal, task_scope:data.task_scope===undefined?"":field(data.task_scope,2000),
    deliverables:textList(data.deliverables),
    task_plan:textList(data.task_plan),
    done_criteria:textList(data.done_criteria),
    tools:[...new Set(tools)],
    ...(httpTools.length?{http_tools:httpTools}:{}),
    ...(mcpTools.length?{mcp_tools:mcpTools}:{}),
    knowledge_base_ids:knowledgeBaseIds(data.knowledge_base_ids,tools),
    ...(modelBinding?{model_binding:modelBinding}:{}),
    require_approval:true,
  }
}
export function safeName(raw:unknown):string {
  const name=field(raw,120)
  if(!name)throw new HttpError(400,"invalid_name")
  return name
}
export function isUuid(raw:unknown):raw is string {
  return typeof raw==="string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
}
// Unversioned graphs retain the original title-only storage contract.
// Explicit version 2 adds bounded node configuration and owner-checked resource
// revisions. Neither format alone authorizes model/tool/Workflow execution.
const workflowTypes=new Set([
  "start","end","model","tool","agent","condition","loop",
])
function graphError():never {throw new HttpError(400,"invalid_workflow_graph")}
function object(value:unknown):Record<string,unknown> {
  if(!value || typeof value!=="object" || Array.isArray(value))graphError()
  return value as Record<string,unknown>
}
function onlyFields(value:Record<string,unknown>,permitted:string[]):void {
  if(Object.keys(value).some(k=>!permitted.includes(k)))graphError()
}
function graphId(value:unknown):string {
  if(typeof value!=="string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value))graphError()
  return value
}
export function safeWorkflowGraph(raw:unknown):WorkflowGraph {
  const input=object(raw)
  if(input.version===2){
    try{return parseWorkflowGraphV2(input)}
    catch(error){if(error instanceof InvalidWorkflowGraphV2)graphError();throw error}
  }
  onlyFields(input,["nodes","edges"])
  if(!Array.isArray(input.nodes) || !Array.isArray(input.edges) ||
     input.nodes.length<2 || input.nodes.length>40 || input.edges.length>100)
    graphError()

  const nodes:WorkflowNode[]=[]
  const nodeIds=new Set<string>()
  const typeById=new Map<string,WorkflowNodeType>()
  for(const rawNode of input.nodes) {
    const node=object(rawNode)
    onlyFields(node,["id","type","position","data"])
    const id=graphId(node.id)
    if(nodeIds.has(id) || typeof node.type!=="string" ||
       !workflowTypes.has(node.type))graphError()
    const data=object(node.data)
    onlyFields(data,["title"])
    const position=object(node.position)
    onlyFields(position,["x","y"])
    if(typeof data.title!=="string" || !data.title.trim() ||
       data.title.length>120 ||
       typeof position.x!=="number" || typeof position.y!=="number" ||
       !Number.isFinite(position.x) || !Number.isFinite(position.y) ||
       Math.abs(position.x)>100000 || Math.abs(position.y)>100000)
      graphError()
    const type=node.type as WorkflowNodeType
    nodes.push({id,type,data:{title:data.title.trim()},
      position:{x:position.x,y:position.y}})
    nodeIds.add(id)
    typeById.set(id,type)
  }
  const startNodes=nodes.filter(node=>node.type==="start")
  const endNodes=nodes.filter(node=>node.type==="end")
  if(startNodes.length!==1 || endNodes.length<1)graphError()

  const edges:WorkflowEdge[]=[]
  const edgeIds=new Set<string>()
  const pairs=new Set<string>()
  const adj=new Map<string,string[]>(nodes.map(n=>[n.id,[]]))
  const indegree=new Map<string,number>(nodes.map(n=>[n.id,0]))
  for(const rawEdge of input.edges) {
    const edge=object(rawEdge)
    onlyFields(edge,["id","source","target"])
    const id=graphId(edge.id)
    const source=graphId(edge.source)
    const target=graphId(edge.target)
    const pair=source+"\0"+target
    if(edgeIds.has(id) || pairs.has(pair) || source===target ||
       !nodeIds.has(source) || !nodeIds.has(target) ||
       typeById.get(source)==="end" || typeById.get(target)==="start")
      graphError()
    edges.push({id,source,target})
    edgeIds.add(id);pairs.add(pair)
    adj.get(source)!.push(target)
    indegree.set(target,indegree.get(target)!+1)
  }
  const start=startNodes[0]!
  if(indegree.get(start.id)!==0)graphError()
  const visited=new Set<string>()
  const queue=[start.id]
  for(let i=0;i<queue.length;i++){
    const id=queue[i]!
    if(visited.has(id))continue
    visited.add(id)
    for(const next of adj.get(id)||[])queue.push(next)
  }
  if(visited.size!==nodes.length || !endNodes.some(node=>visited.has(node.id)))
    graphError()
  // Fail closed on cycles in the storage-only pilot; safe loop execution has
  // not yet been implemented in the PostgreSQL backend.
  const remaining=new Map(indegree)
  const pending=nodes.filter(n=>remaining.get(n.id)===0).map(n=>n.id)
  let counted=0
  for(let i=0;i<pending.length;i++){
    counted++
    for(const next of adj.get(pending[i]!)||[]) {
      remaining.set(next,remaining.get(next)!-1)
      if(remaining.get(next)===0)pending.push(next)
    }
  }
  if(counted!==nodes.length)graphError()
  return {nodes,edges}
}
