// Shared, pure declaration parser. Endpoints and credentials stay in the
// owner-scoped Tool connection; a planner can select only a declared alias.
export type AgentHttpTool={name:string;description:string;connection_id:string;connection_revision:number}
export class InvalidAgentHttpTools extends Error{
  constructor(){super("invalid_agent_http_tools")}
}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export function parseAgentHttpTools(raw:unknown):AgentHttpTool[]{
  const invalid=():never=>{throw new InvalidAgentHttpTools()}
  if(raw===undefined)return []
  if(!Array.isArray(raw)||raw.length>10)invalid()
  const names=new Set<string>(),ids=new Set<string>()
  return (raw as unknown[]).map(value=>{
    if(!value||typeof value!=="object"||Array.isArray(value))invalid()
    const item=value as Record<string,unknown>
    if(Object.keys(item).length!==4||!["name","description","connection_id","connection_revision"].every(key=>Object.hasOwn(item,key))||
      typeof item.name!=="string"||!/^http_[a-z][a-z0-9_]{0,54}$/.test(item.name)||names.has(item.name)||
      typeof item.description!=="string"||!item.description.trim()||item.description.length>500||/[\u0000-\u001f\u007f]/.test(item.description)||
      typeof item.connection_id!=="string"||!uuid.test(item.connection_id)||ids.has(item.connection_id.toLowerCase())||
      !Number.isSafeInteger(item.connection_revision)||(item.connection_revision as number)<1)invalid()
    const name=item.name as string,connection_id=(item.connection_id as string).toLowerCase()
    names.add(name);ids.add(connection_id)
    return {name,description:(item.description as string).trim(),connection_id,connection_revision:item.connection_revision as number}
  })
}
