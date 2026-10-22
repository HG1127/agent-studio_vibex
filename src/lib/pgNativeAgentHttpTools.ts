import {parseAgentHttpTools,type AgentHttpTool} from "../../services/pg-api/src/agent-http-tools.ts"
import type {PgNativeAgent,PgNativeToolConnection} from "./pgNativePilotApi.ts"
export function declaredAgentHttpTool(agent:PgNativeAgent|undefined,raw:unknown):AgentHttpTool|undefined{
  if(!agent||!raw||typeof raw!=="object"||Array.isArray(raw))return undefined
  const binding=raw as Record<string,unknown>
  if(Object.keys(binding).length!==2)return undefined
  try{return parseAgentHttpTools(agent.spec.http_tools).find(tool=>agent.spec.tools?.includes(tool.name)&&
    tool.connection_id===binding.connection_id&&tool.connection_revision===binding.connection_revision)}catch{return undefined}
}
export function readyAgentHttpTools(agent:PgNativeAgent|undefined,connections:PgNativeToolConnection[]):boolean{
  if(!agent)return false
  try{return parseAgentHttpTools(agent.spec.http_tools).every(tool=>agent.spec.tools?.includes(tool.name)&&
    connections.some(connection=>connection.id===tool.connection_id&&connection.revision===tool.connection_revision&&connection.enabled))}catch{return false}
}
