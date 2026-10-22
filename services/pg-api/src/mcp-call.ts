// Exactly one approved tools/call. Protocol/schema are pinned by discovery;
// no negotiation, reconnect, POST replay, server sampling or implicit consent.
import {mcpObject,McpProtocolError,mcpVersions,type McpTool,type McpVersion} from "./mcp-catalog.ts"
import {mcpResponse,type McpMaterial,type McpTransport} from "./mcp-discovery.ts"
import {redactWorkflowToolResponse} from "./workflow-v2-tool-network.ts"
export type McpCallMaterial=McpMaterial&{version:McpVersion;definition:McpTool}
export type McpCallResult={text:string;isError:boolean}
function headerValue(value:string):string{
  return !/^[\x20-\x7e]*$/.test(value)||value!==value.trim()||/^=\?base64\?.*\?=$/.test(value)?"=?base64?"+Buffer.from(value).toString("base64")+"?=":value
}
export function mcpToolCallHeaders(tool:McpTool,args:Record<string,unknown>):Record<string,string>{
  const headers:Record<string,string>={"mcp-method":"tools/call","mcp-name":headerValue(tool.name)}
  function walk(schema:Record<string,unknown>,value:unknown){
    if(schema["x-mcp-header"]!==undefined&&value!==undefined&&value!==null){
      if(typeof value!=="string"&&typeof value!=="boolean"&&!(typeof value==="number"&&Number.isSafeInteger(value)))throw new McpProtocolError()
      headers["mcp-param-"+String(schema["x-mcp-header"]).toLowerCase()]=headerValue(String(value))
    }
    if(schema.properties&&typeof schema.properties==="object"&&!Array.isArray(schema.properties))for(const [key,child] of Object.entries(schema.properties)){
      const next=value&&typeof value==="object"&&!Array.isArray(value)&&Object.hasOwn(value,key)?(value as Record<string,unknown>)[key]:undefined
      if(child&&typeof child==="object"&&!Array.isArray(child))walk(child as Record<string,unknown>,next)
    }
  }
  walk(tool.input_schema,args)
  if(Object.values(headers).some(value=>value.length>2048)||JSON.stringify(headers).length>8192)throw new McpProtocolError()
  return headers
}
export function createMcpToolExecutor(transport:McpTransport){
  return async(material:McpCallMaterial,args:Record<string,unknown>,signal:AbortSignal):Promise<McpCallResult>=>{
    if(!mcpVersions.includes(material.version)||material.definition.requires_tasks)throw new McpProtocolError()
    let session="",nextId=0
    const rpc=async(method:string,params:Record<string,unknown>,extra:Record<string,string>={})=>{
      signal.throwIfAborted();const id=++nextId,modern=material.version==="2026-07-28"
      const response=await transport(material,{body:{jsonrpc:"2.0",id,method,params:{...params,...(modern?{_meta:{
        "io.modelcontextprotocol/protocolVersion":material.version,"io.modelcontextprotocol/clientInfo":{name:"AgentStudio",version:"pg18"},"io.modelcontextprotocol/clientCapabilities":{}}}:{})}},
        headers:{"mcp-protocol-version":material.version,...extra,...(session?{"mcp-session-id":session}:{})}},signal)
      if(response.status!==200)throw new McpProtocolError()
      const envelope=mcpResponse(response,id)
      if(envelope.error)throw new McpProtocolError()
      return {response,result:mcpObject(envelope.result)}
    }
    if(material.version!=="2026-07-28"){
      const init=await rpc("initialize",{protocolVersion:material.version,capabilities:{},clientInfo:{name:"AgentStudio",version:"pg18"}})
      if(init.result.protocolVersion!==material.version||!mcpObject(init.result.capabilities).tools)throw new McpProtocolError()
      session=init.response.session
      if(session&&!/^[\x21-\x7e]{1,1024}$/.test(session))throw new McpProtocolError()
      signal.throwIfAborted()
      const note=await transport(material,{body:{jsonrpc:"2.0",method:"notifications/initialized"},headers:{"mcp-protocol-version":material.version,...(session?{"mcp-session-id":session}:{})}},signal)
      if(note.status!==202||note.text.trim())throw new McpProtocolError()
    }
    const result=(await rpc("tools/call",{name:material.definition.name,arguments:args},material.version==="2026-07-28"?mcpToolCallHeaders(material.definition,args):{})).result
    // Input-required/MRTR and asynchronous task results do not authorize
    // another RPC, a browser login, sampling or resubmission of this effect.
    if(result.inputRequests!==undefined||result.task!==undefined||result.isError!==undefined&&typeof result.isError!=="boolean")throw new McpProtocolError()
    if(result.content===undefined&&result.structuredContent===undefined)throw new McpProtocolError()
    let text=""
    if(result.content!==undefined){
      if(!Array.isArray(result.content)||result.content.length>100)throw new McpProtocolError()
      for(const raw of result.content){const item=mcpObject(raw)
        if(typeof item.type!=="string")throw new McpProtocolError()
        if(item.type==="text"){if(typeof item.text!=="string")throw new McpProtocolError();text+=item.text+"\n"}
        else if(item.type==="resource"&&item.resource&&typeof item.resource==="object"){
          const resource=mcpObject(item.resource)
          text+=typeof resource.text==="string"?resource.text+"\n":"[MCP resource]\n"
        }else text+="[MCP "+item.type.slice(0,30)+"]\n"
        if(text.length>12000)break
      }
    }
    if(!text&&result.structuredContent!==undefined)text=JSON.stringify(result.structuredContent)
    const secrets=material.headers.flatMap(header=>[header.value,/^(?:Bearer|Basic)\s+(.+)$/i.exec(header.value)?.[1]??""]).filter(Boolean)
    return {text:redactWorkflowToolResponse(text,secrets).trim().slice(0,4000)||"（MCP 工具返回空内容）",isError:result.isError===true}
  }
}
export function selectMcpExecution(env:NodeJS.ProcessEnv):boolean{
  const enabled=env.AGENT_STUDIO_PG_MCP_TOOLS_ENABLED,approved=env.AGENT_STUDIO_PG_MCP_TOOLS_APPROVED
  if(enabled===undefined&&approved===undefined)return false
  if(enabled!=="true"||approved!=="APPROVE_DISPOSABLE_PG18_MCP_TOOLS_ONLY")throw Error("mcp_tool_execution_not_approved")
  return true
}
