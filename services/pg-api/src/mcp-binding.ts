// Browser-safe references. No endpoint, identity, schema override or credential.
import {canonicalMcpJson,parseMcpCatalog,type McpTool,type McpVersion} from "./mcp-catalog.ts"
export type McpBinding={connection_id:string;connection_revision:number;tool_name:string;catalog_sha256:string}
export type AgentMcpTool=McpBinding&{name:string}
export function parseMcpBinding(raw:unknown):McpBinding{
  const invalid=():never=>{throw Error("invalid_mcp_binding")}
  if(!raw||typeof raw!=="object"||Array.isArray(raw))invalid()
  const item=raw as Record<string,unknown>
  if(Object.keys(item).length!==4||!["connection_id","connection_revision","tool_name","catalog_sha256"].every(key=>Object.hasOwn(item,key))||
    typeof item.connection_id!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(item.connection_id)||
    !Number.isSafeInteger(item.connection_revision)||(item.connection_revision as number)<1||typeof item.tool_name!=="string"||
    !item.tool_name||item.tool_name.length>120||/[\u0000-\u001f\u007f]/.test(item.tool_name)||
    typeof item.catalog_sha256!=="string"||!/^[a-f0-9]{64}$/.test(item.catalog_sha256))invalid()
  return {connection_id:(item.connection_id as string).toLowerCase(),connection_revision:item.connection_revision as number,
    tool_name:item.tool_name as string,catalog_sha256:item.catalog_sha256 as string}
}
export type McpAgentSnapshot={name:string;binding:McpBinding;version:McpVersion;definition:McpTool}
export function parseAgentMcpSnapshots(refs:AgentMcpTool[]|undefined,raw:unknown):McpAgentSnapshot[]{
  const selected=parseAgentMcpTools(refs)
  if(!selected.length){if(raw!==undefined&&(!Array.isArray(raw)||raw.length))throw Error("invalid_agent_mcp_snapshot");return []}
  if(!Array.isArray(raw)||raw.length!==selected.length)throw Error("invalid_agent_mcp_snapshot")
  return selected.map(({name,...ref},index)=>{
    const value=raw[index]
    if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).length!==4||
      !["name","binding","version","definition"].every(key=>Object.hasOwn(value,key))||value.name!==name)throw Error("invalid_agent_mcp_snapshot")
    const binding=parseMcpBinding(value.binding),catalog=parseMcpCatalog({version:value.version,tools:[value.definition]})
    if(canonicalMcpJson(binding)!==canonicalMcpJson(ref)||catalog.tools[0]!.name!==ref.tool_name||catalog.tools[0]!.requires_tasks)throw Error("invalid_agent_mcp_snapshot")
    return {name,binding,version:catalog.version,definition:catalog.tools[0]!}
  })
}
export function parseAgentMcpTools(raw:unknown):AgentMcpTool[]{
  if(raw===undefined)return []
  if(!Array.isArray(raw)||raw.length>10)throw Error("invalid_agent_mcp_tools")
  const names=new Set<string>(),refs=new Set<string>()
  return raw.map(value=>{
    if(!value||typeof value!=="object"||Array.isArray(value))throw Error("invalid_agent_mcp_tools")
    const {name,...binding}=value
    if(typeof name!=="string"||!/^mcp_[a-z][a-z0-9_]{0,54}$/.test(name)||names.has(name))throw Error("invalid_agent_mcp_tools")
    const checked=parseMcpBinding(binding),ref=checked.connection_id+"\0"+checked.tool_name
    if(refs.has(ref))throw Error("invalid_agent_mcp_tools")
    names.add(name);refs.add(ref);return {name,...checked}
  })
}
