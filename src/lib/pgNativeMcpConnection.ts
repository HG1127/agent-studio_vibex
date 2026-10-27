import {parseMcpCatalog,type McpCatalog} from "../../services/pg-api/src/mcp-catalog.ts"
import {parseMcpBinding,parseAgentMcpTools,type McpBinding,type AgentMcpTool} from "../../services/pg-api/src/mcp-binding.ts"
export type {McpBinding,AgentMcpTool} from "../../services/pg-api/src/mcp-binding.ts"
export type PgNativeMcpInput={name:string;description:string;url:string;headers:{key:string;value:string}[];enabled:boolean}
export type PgNativeMcpConnection=Omit<PgNativeMcpInput,"headers">&{id:string;revision:number;status:"untested"|"ok"|"error";
  catalog:McpCatalog|null;catalog_sha256?:string;managed_by?:"smithery";headers:{key:string;value:string}[];last_error:string;last_checked_at:string|null}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export function parsePgMcpConnection(raw:unknown):PgNativeMcpConnection{
  const invalid=():never=>{throw Error("invalid_pg_mcp_connection")}
  if(!raw||typeof raw!=="object"||Array.isArray(raw))invalid()
  const value=raw as PgNativeMcpConnection
  if(!uuid.test(value.id)||!Number.isSafeInteger(value.revision)||value.revision<1||
    typeof value.name!=="string"||!value.name.trim()||value.name.length>100||typeof value.description!=="string"||value.description.length>500||
    typeof value.url!=="string"||value.url.length>1000||typeof value.enabled!=="boolean"||!["untested","ok","error"].includes(value.status)||
    typeof value.last_error!=="string"||value.last_error.length>80||value.last_checked_at!==null&&typeof value.last_checked_at!=="string"||
    !Array.isArray(value.headers)||value.headers.length>20||value.headers.some(header=>!header||typeof header.key!=="string"||
      !/^[-!#$%&'*+.^_`|~0-9a-z]{1,80}$/.test(header.key)||header.value!=="••••"))invalid()
  let url:URL;try{url=new URL(value.url)}catch{invalid()}
  if(url!.protocol!=="https:"||url!.username||url!.password||url!.hash)invalid()
  const catalog=value.status==="ok"?parseMcpCatalog(value.catalog):null
  if(value.catalog_sha256!==undefined&&(!catalog||typeof value.catalog_sha256!=="string"||!/^[a-f0-9]{64}$/.test(value.catalog_sha256)))invalid()
  if(value.status!=="ok"&&value.catalog!==null)invalid()
  if(value.managed_by!==undefined&&value.managed_by!=="smithery")invalid()
  return {id:value.id,revision:value.revision,name:value.name,description:value.description,url:value.url,enabled:value.enabled,
    status:value.status,catalog,...(value.catalog_sha256?{catalog_sha256:value.catalog_sha256}:{}),...(value.managed_by?{managed_by:value.managed_by}:{}),
    headers:value.headers.map(header=>({key:header.key,value:"••••"})),last_error:value.last_error,last_checked_at:value.last_checked_at}
}
export function readyMcpBinding(raw:unknown,connection:PgNativeMcpConnection|undefined):boolean{
  try{const binding=parseMcpBinding(raw);return Boolean(connection&&connection.id===binding.connection_id&&connection.enabled&&connection.status==="ok"&&
    connection.revision===binding.connection_revision&&connection.catalog_sha256===binding.catalog_sha256&&connection.catalog?.tools.some(tool=>tool.name===binding.tool_name&&!tool.requires_tasks))}catch{return false}
}
export function declaredAgentMcpTool(agent:{spec:{tools?:string[];mcp_tools?:AgentMcpTool[]}}|undefined,raw:unknown):AgentMcpTool|undefined{
  if(!agent)return undefined
  try{const binding=parseMcpBinding(raw)
    return parseAgentMcpTools(agent.spec.mcp_tools).find(({name,...ref})=>agent.spec.tools?.includes(name)&&Object.entries(binding).every(([key,value])=>ref[key as keyof McpBinding]===value))
  }catch{return undefined}
}
export function readyAgentMcpTools(agent:{spec:{tools?:string[];mcp_tools?:AgentMcpTool[]}}|undefined,connections:PgNativeMcpConnection[]):boolean{
  if(!agent)return false
  try{return parseAgentMcpTools(agent.spec.mcp_tools).every(({name,...binding})=>agent.spec.tools?.includes(name)&&
    readyMcpBinding(binding,connections.find(connection=>connection.id===binding.connection_id)))}catch{return false}
}
export function mcpChoices(connections:PgNativeMcpConnection[]){
  return connections.flatMap(connection=>connection.enabled&&connection.status==="ok"&&connection.catalog_sha256?connection.catalog?.tools.flatMap((tool,index)=>tool.requires_tasks?[]:[{
    alias:"mcp_c"+connection.id.replaceAll("-","")+"_"+index,title:connection.name+" · "+tool.name,description:tool.description,
    binding:{connection_id:connection.id,connection_revision:connection.revision,tool_name:tool.name,catalog_sha256:connection.catalog_sha256!},
  }])??[]:[])
}
export function appendAgentMcpChoice(current:AgentMcpTool[],choice:Pick<ReturnType<typeof mcpChoices>[number],"alias"|"binding">):AgentMcpTool[]{
  const selected=parseAgentMcpTools(current)
  if(selected.some(tool=>tool.connection_id===choice.binding.connection_id&&tool.tool_name===choice.binding.tool_name))return selected
  const names=new Set(selected.map(tool=>tool.name));let name=choice.alias,index=2
  // Existing aliases belong to the saved Agent. A changed catalog position
  // must not rename them or allocate the same alias to a newly selected tool.
  while(names.has(name))name=choice.alias+"_"+index++
  return parseAgentMcpTools([...selected,{name,...choice.binding}])
}
