import {createHash} from "node:crypto"
import {HttpError,type SqlClient} from "./contracts.ts"
import {canonicalMcpJson,parseMcpCatalog,type McpCatalog} from "./mcp-catalog.ts"
import {parseMcpBinding,parseAgentMcpTools,type McpBinding,type AgentMcpTool,type McpAgentSnapshot} from "./mcp-binding.ts"
import {validateMcpArguments} from "./mcp-validation.ts"
export const mcpCatalogHash=(catalog:McpCatalog)=>createHash("sha256").update(canonicalMcpJson(catalog)).digest("hex")
export async function resolveMcpBinding(db:SqlClient,owner:string,raw:McpBinding,compile=false){
  const binding=parseMcpBinding(raw)
  const row=(await db.query<{id:string;revision:number|string;enabled:boolean;status:string;url:string;catalog:unknown}>(
    "SELECT id,revision,enabled,status,url,catalog FROM agentstudio.mcp_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[binding.connection_id,owner])).rows[0]
  if(!row)throw new HttpError(404,"mcp_connection_not_found")
  if(Number(row.revision)!==binding.connection_revision)throw new HttpError(409,"mcp_connection_revision_changed")
  if(!row.enabled||row.status!=="ok")throw new HttpError(409,"mcp_connection_not_ready")
  let catalog:McpCatalog
  try{catalog=parseMcpCatalog(row.catalog)}catch{throw new HttpError(409,"mcp_catalog_changed")}
  if(mcpCatalogHash(catalog)!==binding.catalog_sha256)throw new HttpError(409,"mcp_catalog_changed")
  const definition=catalog.tools.find(tool=>tool.name===binding.tool_name)
  if(!definition||definition.requires_tasks)throw new HttpError(409,"mcp_tool_not_available")
  if(compile&&!await validateMcpArguments(definition))throw new HttpError(409,"mcp_schema_not_supported")
  return {row,catalog,definition,binding}
}
export async function resolveAgentMcpTools(db:SqlClient,owner:string,raw:AgentMcpTool[]|undefined,compile=false):Promise<McpAgentSnapshot[]>{
  const selected=parseAgentMcpTools(raw),snapshots=new Map<string,McpAgentSnapshot>()
  for(const {name,...binding} of [...selected].sort((a,b)=>(a.connection_id+":"+a.tool_name).localeCompare(b.connection_id+":"+b.tool_name))){
    const result=await resolveMcpBinding(db,owner,binding,compile)
    snapshots.set(name,{name,binding:result.binding,version:result.catalog.version,definition:result.definition})
  }
  return selected.map(tool=>snapshots.get(tool.name)!)
}
