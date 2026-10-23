// Independent, default-off metadata preparation. Does not permit paid egress.
import {isIP} from "node:net"
import {HttpError} from "./contracts.ts"
export function selectKnowledgeEmbeddingSettings(env:NodeJS.ProcessEnv):boolean{
  const enabled=env.AGENT_STUDIO_PG18_EMBEDDING_SETTINGS_UAT_ENABLED,approval=env.AGENT_STUDIO_PG18_EMBEDDING_SETTINGS_UAT_APPROVED
  if(enabled===undefined&&approval===undefined)return false
  if(enabled!=="true"||approval!=="APPROVE_DISPOSABLE_PG18_EMBEDDING_SETTINGS_ONLY")throw Error("unsafe_knowledge_embedding_settings_config")
  return true
}
export interface EmbeddingEndpointPolicy {readonly allowedHosts:readonly string[];readonly loopbackPorts:readonly number[]}
function hostName(value:string):boolean{
  return value.length<=253&&value.includes(".")&&!value.includes("..")&&isIP(value)===0&&
    !["localhost","local","internal"].some(suffix=>value===suffix||value.endsWith("."+suffix))&&
    value.split(".").every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
}
export function embeddingEndpointPolicy(env:NodeJS.ProcessEnv):EmbeddingEndpointPolicy{
  const hosts=[...new Set((env.AGENT_STUDIO_EMBEDDING_ALLOWED_HOSTS||"api.openai.com").split(",").map(value=>value.trim().toLowerCase()))]
  if(hosts.length<1||hosts.some(host=>!hostName(host)))throw Error("unsafe_embedding_endpoint_policy")
  const local=env.AGENT_STUDIO_EMBEDDING_ALLOW_LOOPBACK,raw=env.AGENT_STUDIO_EMBEDDING_LOOPBACK_PORTS
  if(local!==undefined&&local!=="true"&&local!=="false")throw Error("unsafe_embedding_endpoint_policy")
  const ports=local==="true"?[...new Set((raw??"").split(",").map(value=>Number(value.trim())))]:[]
  if(local==="true"&&(ports.length<1||ports.some(port=>!Number.isInteger(port)||port<1||port>65535)))throw Error("unsafe_embedding_endpoint_policy")
  return Object.freeze({allowedHosts:Object.freeze(hosts),loopbackPorts:Object.freeze(ports)})
}
export function approvedEmbeddingEndpoint(raw:unknown,policy:EmbeddingEndpointPolicy):string{
  const refuse=():never=>{throw new HttpError(400,"embedding_endpoint_unapproved")}
  if(typeof raw!=="string")throw new HttpError(400,"embedding_endpoint_unapproved")
  if(raw.length<8||raw.length>2048||raw.trim()!==raw||/[\u0000-\u0020\u007f\\]/u.test(raw))refuse()
  let url:URL
  try{url=new URL(raw)}catch{return refuse()}
  if(url.username||url.password||url.search||url.hash||!/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/.test(url.pathname))refuse()
  const host=url.hostname.toLowerCase()
  const publicHttps=url.protocol==="https:"&&!url.port&&hostName(host)&&policy.allowedHosts.includes(host)
  const approvedLocal=url.protocol==="http:"&&/^http:\/\/(127\.0\.0\.1|localhost):[0-9]{1,5}(\/|$)/i.test(raw)&&
    ["127.0.0.1","localhost"].includes(host)&&policy.loopbackPorts.includes(Number(url.port||80))
  if(!publicHttps&&!approvedLocal)refuse()
  return (approvedLocal?"http://"+host+":"+Number(url.port||80)+url.pathname:url.href).replace(/\/+$/,"")
}
