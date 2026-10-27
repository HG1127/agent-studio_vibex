// Browser-safe Smithery DTOs. Vendor responses never become local credentials,
// arbitrary destinations, executable code or tool-call permission.
export class SmitheryProtocolError extends Error{constructor(){super("invalid_smithery_response")}}
export function selectSmitheryManagement(env:Record<string,string|undefined>):boolean{
  const enabled=env.AGENT_STUDIO_PG18_SMITHERY_UAT_ENABLED,approved=env.AGENT_STUDIO_PG18_SMITHERY_UAT_APPROVED
  if(enabled===undefined&&approved===undefined)return false
  if(enabled!=="true"||approved!=="APPROVE_DISPOSABLE_PG18_SMITHERY_MANAGEMENT_ONLY")throw Error("smithery_management_not_approved")
  return true
}
export const smitheryName=(value:unknown):value is string=>typeof value==="string"&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,59}$/.test(value)
export const smitheryServer=(value:unknown):value is string=>typeof value==="string"&&value.length<=255&&/^@?[a-zA-Z0-9][a-zA-Z0-9_-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9_-]*)?$/.test(value)
export function smitheryObject(raw:unknown):Record<string,unknown>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new SmitheryProtocolError()
  return raw as Record<string,unknown>
}
const text=(raw:unknown,max:number)=>typeof raw==="string"&&!/[\u0000-\u001f\u007f]/.test(raw)?raw.slice(0,max):""
export function smitheryApiKey(raw:unknown):string{
  if(typeof raw!=="string"||!raw||raw.length<8||raw.length>512||!/^[\x21-\x7e]+$/.test(raw))throw new SmitheryProtocolError()
  return raw
}
export type SmitherySelection={namespace:string;server:string;name:string;description:string}
export function parseSmitherySelection(raw:unknown):SmitherySelection{
  const value=smitheryObject(raw)
  if(Object.keys(value).length!==4||!["namespace","server","name","description"].every(key=>Object.hasOwn(value,key))||
    !smitheryName(value.namespace)||!smitheryServer(value.server)||typeof value.name!=="string"||!value.name.trim()||
    value.name.length>100||text(value.name,100)!==value.name||typeof value.description!=="string"||!value.description.trim()||
    value.description.length>500||text(value.description,500)!==value.description)throw new SmitheryProtocolError()
  return {namespace:value.namespace,server:value.server,name:value.name.trim(),description:value.description.trim()}
}
export function smitheryRemoteId(uuid:string):string{
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(uuid))throw new SmitheryProtocolError()
  return "studio-"+uuid.replaceAll("-","").toLowerCase()
}
export function smitheryGateway(namespace:string,connection:string):string{
  if(!smitheryName(namespace)||!smitheryName(connection))throw new SmitheryProtocolError()
  return "https://smithery.run/"+namespace+"/"+connection
}
export function safeSmitherySetupUrl(raw:unknown):string{
  if(typeof raw!=="string"||!raw||raw.length>2048||/[\u0000-\u0020\u007f]/.test(raw))return ""
  try{const url=new URL(raw)
    return url.protocol==="https:"&&["auth.smithery.ai","smithery.ai"].includes(url.hostname)&&!url.port&&!url.username&&!url.password&&!url.hash?url.toString():""
  }catch{return ""}
}
export function parseSmitheryNamespaces(raw:unknown):string[]{
  const value=Array.isArray(raw)?raw:smitheryObject(raw),rows=Array.isArray(value)?value:[value.namespaces,value.items,value.data].find(Array.isArray)
  if(!Array.isArray(rows)||rows.length>200)throw new SmitheryProtocolError()
  const names=new Set<string>()
  for(const row of rows){const name=typeof row==="string"?row:row&&typeof row==="object"?(row.name??row.namespace??row.id):undefined
    if(smitheryName(name))names.add(name)
    if(names.size===50)break
  }
  return [...names]
}
export type SmitheryCatalogItem={server:string;name:string;description:string;verified:boolean;deployed:boolean}
export function parseSmitheryCatalog(raw:unknown,page:number):{items:SmitheryCatalogItem[];page:number;next_page:number}{
  if(!Number.isSafeInteger(page)||page<1||page>100)throw new SmitheryProtocolError()
  const value=smitheryObject(raw),rows=[value.servers,value.items,value.data].find(Array.isArray)
  if(!Array.isArray(rows)||rows.length>100)throw new SmitheryProtocolError()
  const items:SmitheryCatalogItem[]=[],seen=new Set<string>()
  for(const row of rows){if(!row||typeof row!=="object")continue
    const item=row.server&&typeof row.server==="object"?row.server:row,server=item.qualifiedName??item.qualified_name??item.slug??item.name
    if(!smitheryServer(server)||seen.has(server))continue;seen.add(server)
    items.push({server,name:text(item.displayName??item.title,100)||server.slice(0,100),description:text(item.description,500),
      verified:item.verified===true||item.isVerified===true,deployed:item.isDeployed===true||item.deployed===true})
    if(items.length===24)break
  }
  const pages=value.pagination&&typeof value.pagination==="object"?(value.pagination as Record<string,unknown>).totalPages:undefined
  const next=Number.isSafeInteger(pages)?Number(pages)>page:rows.length>=24
  return {items,page,next_page:page<100&&next?page+1:0}
}
export type SmitheryRemoteState={state:"connected"|"disconnected"|"auth_required"|"input_required"|"error";setup_url:string;missing:string[]}
export function parseSmitheryRemoteState(raw:unknown,connectionId:string,bindingProof:string,secret=""):SmitheryRemoteState{
  const value=smitheryObject(raw),metadata=smitheryObject(value.metadata),status=smitheryObject(value.status)
  if(!smitheryName(connectionId)||!/^[a-f0-9]{64}$/.test(bindingProof)||value.connectionId!==connectionId||value.transport!=="http"||
    metadata.agent_studio_binding!==bindingProof||value.mock&&smitheryObject(value.mock).enabled===true||
    !["connected","disconnected","auth_required","input_required","error"].includes(String(status.state)))throw new SmitheryProtocolError()
  const setup=safeSmitherySetupUrl(status.setupUrl??value.setupUrl)
  if(secret&&setup.includes(secret))throw new SmitheryProtocolError()
  const missing=Array.isArray(status.missing)?status.missing.slice(0,10).map(item=>text(item,70)).filter(item=>item&&(!secret||!item.includes(secret))):[]
  return {state:status.state as SmitheryRemoteState["state"],setup_url:setup,missing}
}
