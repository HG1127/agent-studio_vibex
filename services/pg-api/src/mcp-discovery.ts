import {mcpObject,mcpTool,mcpVersions,McpProtocolError,type McpCatalog,type McpVersion} from "./mcp-catalog.ts"
export type McpMaterial={url:string;headers:{key:string;value:string}[]}
export type McpWireRequest={body:Record<string,unknown>;headers:Record<string,string>}
export type McpWireResponse={status:number;text:string;content_type:string;session:string}
export type McpTransport=(material:McpMaterial,request:McpWireRequest,signal:AbortSignal)=>Promise<McpWireResponse>
const metadata=(version:McpVersion)=>({"io.modelcontextprotocol/protocolVersion":version,
  "io.modelcontextprotocol/clientInfo":{name:"AgentStudio",version:"pg18"},"io.modelcontextprotocol/clientCapabilities":{}})
export function mcpResponse(response:McpWireResponse,id:number):Record<string,unknown>{
  const messages:unknown[]=[]
  if(/^application\/(?:[a-z0-9.+-]*\+)?json(?:;|$)/i.test(response.content_type)){
    try{messages.push(JSON.parse(response.text))}catch{throw new McpProtocolError()}
  }else if(/^text\/event-stream(?:;|$)/i.test(response.content_type)){
    // SSE fields, CR/CRLF, comments and multi-line data follow EventSource
    // framing. A matching final response is mandatory; no stream reconnect.
    const events=response.text.replaceAll("\r\n","\n").replaceAll("\r","\n").split("\n\n")
    for(const event of events){
      const data=event.split("\n").filter(line=>line.startsWith("data:")).map(line=>line.slice(5).replace(/^ /,"")).join("\n")
      if(!data)continue
      try{messages.push(JSON.parse(data))}catch{throw new McpProtocolError()}
    }
  }else throw new McpProtocolError()
  let final:Record<string,unknown>|undefined
  for(const message of messages){
    const value=mcpObject(message)
    if(value.jsonrpc!=="2.0")throw new McpProtocolError()
    if(Object.hasOwn(value,"method")){
      if(Object.hasOwn(value,"id"))throw new McpProtocolError() // no sampling, roots or elicitation
      continue
    }
    if(value.id!==id||final||Object.hasOwn(value,"result")===Object.hasOwn(value,"error"))throw new McpProtocolError()
    final=value
  }
  if(!final)throw new McpProtocolError();return final
}
export function createMcpDiscovery(transport:McpTransport){
  return async(material:McpMaterial,signal:AbortSignal):Promise<McpCatalog>=>{
    let version:McpVersion="2026-07-28",session="",nextId=0
    const rpc=async(method:string,params:Record<string,unknown>,id=++nextId)=>{
      signal.throwIfAborted()
      const modern=version==="2026-07-28"
      const response=await transport(material,{body:{jsonrpc:"2.0",id,method,params:{...params,...(modern?{_meta:metadata(version)}:{})}},
        headers:{"mcp-protocol-version":version,...(modern?{"mcp-method":method}:{}),...(session?{"mcp-session-id":session}:{})}},signal)
      let value:Record<string,unknown>
      try{value=mcpResponse(response,id)}catch(error){
        if(id!==1||response.status!==400)throw error
        value={} // legacy endpoints may return an empty/plain HTTP 400
      }
      return {response,value}
    }
    let first=await rpc("tools/list",{})
    if(first.response.status===400){
      const error=first.value.error===undefined?undefined:mcpObject(first.value.error)
      const data=error?.data&&typeof error.data==="object"&&!Array.isArray(error.data)?mcpObject(error.data):undefined
      const supported=data?.supported
      if(error?.code===-32022&&Array.isArray(supported)){
        const mutually=mcpVersions.find(item=>supported.includes(item))
        if(!mutually)throw new McpProtocolError()
        version=mutually
        if(version==="2026-07-28")throw new McpProtocolError()
      }else{
        // Read-only discovery may detect the legacy era. Calls never use this
        // fallback/retry path; the verified catalog pins their protocol version.
        if(typeof error?.code==="number"&&error.code<=-32020&&error.code>=-32030)throw new McpProtocolError()
        version="2025-11-25"
      }
      const initialized=await rpc("initialize",{protocolVersion:version,capabilities:{},clientInfo:{name:"AgentStudio",version:"pg18"}})
      const result=mcpObject(initialized.value.result)
      if(initialized.response.status!==200||!mcpVersions.includes(result.protocolVersion as McpVersion)||result.protocolVersion==="2026-07-28"||
        !result.capabilities||typeof result.capabilities!=="object")throw new McpProtocolError()
      version=result.protocolVersion as McpVersion;session=initialized.response.session
      if(session&&!/^[\x21-\x7e]{1,1024}$/.test(session))throw new McpProtocolError()
      const notification=await transport(material,{body:{jsonrpc:"2.0",method:"notifications/initialized"},
        headers:{"mcp-protocol-version":version,...(session?{"mcp-session-id":session}:{})}},signal)
      if(notification.status!==202||notification.text.trim())throw new McpProtocolError()
      first=await rpc("tools/list",{})
    }
    const tools:McpCatalog["tools"]=[],names=new Set<string>(),cursors=new Set<string>()
    const secrets=material.headers.flatMap(header=>[header.value,/^(?:Bearer|Basic)\s+(.+)$/i.exec(header.value)?.[1]??""]).filter(Boolean)
    for(let page=0;page<5;page++){
      if(first.response.status!==200||first.value.error)throw new McpProtocolError()
      const result=mcpObject(first.value.result)
      if(!Array.isArray(result.tools)||result.tools.length>50)throw new McpProtocolError()
      for(const raw of result.tools){
        // Do not persist a remote reflection of any credential, even inside a
        // schema default/enum. Omit that tool rather than alter its semantics.
        if(secrets.some(secret=>JSON.stringify(raw).includes(secret)))continue
        let tool
        try{tool=mcpTool(raw)}catch{continue}
        if(names.has(tool.name)||tools.length>=50)throw new McpProtocolError()
        names.add(tool.name);tools.push(tool)
      }
      if(new TextEncoder().encode(JSON.stringify({version,tools})).length>65536)throw new McpProtocolError()
      if(result.nextCursor===undefined||result.nextCursor===null||result.nextCursor==="")return {version,tools}
      if(typeof result.nextCursor!=="string"||result.nextCursor.length>1024||cursors.has(result.nextCursor)||page===4)throw new McpProtocolError()
      cursors.add(result.nextCursor);first=await rpc("tools/list",{cursor:result.nextCursor})
    }
    throw new McpProtocolError()
  }
}
