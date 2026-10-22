// Closed, bounded discovery DTO. Tool annotations are descriptive, never grants.
export const mcpVersions=["2026-07-28","2025-11-25","2025-06-18","2025-03-26"] as const
export type McpVersion=typeof mcpVersions[number]
export type McpTool={name:string;description:string;input_schema:Record<string,unknown>;read_only:boolean;destructive:boolean;requires_tasks:boolean}
export type McpCatalog={version:McpVersion;tools:McpTool[]}
export class McpProtocolError extends Error{
  constructor(){super("invalid_mcp_response")}
}
export function mcpObject(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=="object"||Array.isArray(value))throw new McpProtocolError()
  return value as Record<string,unknown>
}
function boundedJson(value:unknown,depth=0):void{
  if(depth>12)throw new McpProtocolError()
  if(typeof value==="string"&&value.includes("\0"))throw new McpProtocolError()
  if(value&&typeof value==="object"){
    if(Object.keys(value).length>100)throw new McpProtocolError()
    for(const [key,item] of Object.entries(value)){
      if(["__proto__","constructor","prototype"].includes(key))throw new McpProtocolError()
      boundedJson(item,depth+1)
    }
  }
}
function headerSchema(raw:unknown,reachable=true,names=new Set<string>()):void{
  if(!raw||typeof raw!=="object")return
  if(Array.isArray(raw)){for(const item of raw)headerSchema(item,false,names);return}
  const value=raw as Record<string,unknown>,header=value["x-mcp-header"]
  if(header!==undefined){
    if(!reachable||typeof header!=="string"||!/^[-!#$%&'*+.^_`|~0-9A-Za-z]{1,80}$/.test(header)||
      !["string","integer","boolean"].includes(String(value.type))||names.has(header.toLowerCase()))throw new McpProtocolError()
    names.add(header.toLowerCase())
  }
  for(const [key,item] of Object.entries(value)){
    if(key==="properties"&&reachable){for(const child of Object.values(mcpObject(item)))headerSchema(child,true,names)}
    else if(key!=="x-mcp-header")headerSchema(item,false,names)
  }
}
export function mcpTool(raw:unknown):McpTool{
  const value=mcpObject(raw),schema=mcpObject(value.inputSchema)
  if(typeof value.name!=="string"||!value.name||value.name.length>120||/[\u0000-\u001f\u007f]/.test(value.name)||
    value.description!==undefined&&typeof value.description!=="string"||schema.type!=="object"||new TextEncoder().encode(JSON.stringify(schema)).length>8192)throw new McpProtocolError()
  boundedJson(schema)
  headerSchema(schema)
  const annotations=value.annotations&&typeof value.annotations==="object"?value.annotations as Record<string,unknown>:{}
  const execution=value.execution&&typeof value.execution==="object"?value.execution as Record<string,unknown>:{}
  return {name:value.name,description:String(value.description??"").replace(/[\u0000-\u001f\u007f]/g," ").slice(0,500),
    input_schema:schema,read_only:annotations.readOnlyHint===true,destructive:annotations.destructiveHint===true,
    requires_tasks:execution.taskSupport==="required"}
}
export function parseMcpCatalog(raw:unknown):McpCatalog{
  const item=mcpObject(raw)
  if(Object.keys(item).length!==2||!mcpVersions.some(version=>version===item.version)||!Array.isArray(item.tools)||item.tools.length>50||new TextEncoder().encode(JSON.stringify(raw)).length>65536)throw new McpProtocolError()
  const seen=new Set<string>(),tools=item.tools.map(raw=>{
    const value=mcpObject(raw)
    if(Object.keys(value).length!==6||!["name","description","input_schema","read_only","destructive","requires_tasks"].every(key=>Object.hasOwn(value,key))||
      typeof value.read_only!=="boolean"||typeof value.destructive!=="boolean"||typeof value.requires_tasks!=="boolean")throw new McpProtocolError()
    const tool=mcpTool({name:value.name,description:value.description,inputSchema:value.input_schema,
      annotations:{readOnlyHint:value.read_only,destructiveHint:value.destructive},execution:{taskSupport:value.requires_tasks?"required":"forbidden"}})
    if(seen.has(tool.name))throw new McpProtocolError();seen.add(tool.name);return tool
  })
  return {version:item.version as McpVersion,tools}
}
