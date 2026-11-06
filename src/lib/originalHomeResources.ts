import {parseAgentHttpTools,type AgentHttpTool} from '../../services/pg-api/src/agent-http-tools.ts'
import {parseAgentMcpTools,type AgentMcpTool} from '../../services/pg-api/src/mcp-binding.ts'
import type {ConnectedToolOption} from '../pages/Home/presets'
import type {VerifiedMarketTool} from './marketToolSelection'
import type {KnowledgeBase} from './knowledgeBases'
import {hasExplicitCalendarTimestamp} from './agentQualityChecks.ts'

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const fail=():never=>{throw Error('invalid_original_home_resources')}
function object(raw:unknown,keys:string[]):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Object.getPrototypeOf(raw)!==Object.prototype||Reflect.ownKeys(raw).length!==keys.length)return fail()
  for(const key of keys){const d=Object.getOwnPropertyDescriptor(raw,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))return fail()}
  return raw as Record<string,unknown>
}
function list(raw:unknown,max:number):unknown[]{if(!Array.isArray(raw)||raw.length>max||Reflect.ownKeys(raw).length!==raw.length+1)return fail();for(let i=0;i<raw.length;i++){const d=Object.getOwnPropertyDescriptor(raw,String(i));if(!d||!Object.hasOwn(d,'value'))return fail()}return raw}
function integer(raw:unknown,min=0):number{if(!Number.isSafeInteger(raw)||Number(raw)<min||Number(raw)>=Number.MAX_SAFE_INTEGER)return fail();return Number(raw)}
function text(raw:unknown,max:number,nonblank=false):string{if(typeof raw!=='string'||raw.length>max||raw.includes('\0')||nonblank&&!raw.trim())return fail();return raw}
function id(raw:unknown):string{if(typeof raw!=='string'||!uuid.test(raw)||raw!==raw.toLowerCase())return fail();return raw}
function bool(raw:unknown):boolean{if(typeof raw!=='boolean')return fail();return raw}
function date(raw:unknown):number{if(!hasExplicitCalendarTimestamp(raw))return fail();return Date.parse(raw)}
const connectionFields=['id','owner_user_id','revision','name','description','enabled','status','last_checked_at']
function connection(raw:Record<string,unknown>,employee:string){
  if(id(raw.owner_user_id)!==employee||!['ok','untested','error'].includes(String(raw.status)))return fail()
  if(raw.last_checked_at!==null)date(raw.last_checked_at)
  return {id:id(raw.id),revision:integer(raw.revision,1),name:text(raw.name,100,true),description:text(raw.description,500),enabled:bool(raw.enabled),status:raw.status as 'ok'|'untested'|'error'}
}
export type OriginalHomeBindingOptions={http:AgentHttpTool[];mcp:AgentMcpTool[]}
export function normalizeOriginalHomeBindingOptions(raw:unknown):OriginalHomeBindingOptions{
  const data=object(raw,['http','mcp'])
  for(const value of list(data.http,10))object(value,['name','description','connection_id','connection_revision'])
  for(const value of list(data.mcp,10))object(value,['name','connection_id','connection_revision','catalog_sha256','tool_name'])
  return {http:parseAgentHttpTools(data.http),mcp:parseAgentMcpTools(data.mcp)}
}
export type OriginalHomeResourceView={connectedHttp:ConnectedToolOption[];verifiedMarket:VerifiedMarketTool[];knowledgeBases:KnowledgeBase[];bindings:OriginalHomeBindingOptions}
/** Real server metadata only. This DTO never grants execution or substitutes for owner checks. */
export function parseOriginalHomeResources(raw:unknown,employee:string):OriginalHomeResourceView{
  const data=object(raw,['format','employee_id','knowledge_sharing_enabled','http_connections','mcp_connections','knowledge_bases'])
  if(data.format!=='agentstudio.original-home-resources.v1'||id(data.employee_id)!==id(employee))return fail()
  const sharing=bool(data.knowledge_sharing_enabled),connectedHttp:ConnectedToolOption[]=[],verifiedMarket:VerifiedMarketTool[]=[],knowledgeBases:KnowledgeBase[]=[],bindings:OriginalHomeBindingOptions={http:[],mcp:[]},aliases=new Set<string>(),connectionIds=new Set<string>()
  for(const raw of list(data.http_connections,50)){
    const row=object(raw,[...connectionFields,'method','alias','binding']),c=connection(row,employee),alias='http_c'+c.id.replaceAll('-','')
    if(connectionIds.has(c.id)||row.alias!==alias||!['GET','POST'].includes(String(row.method))||aliases.has(alias))return fail()
    connectionIds.add(c.id);aliases.add(alias)
    if(c.enabled&&c.status==='ok'){
      object(row.binding,['name','description','connection_id','connection_revision'])
      const binding=parseAgentHttpTools([row.binding])[0]!
      if(binding.name!==alias||binding.connection_id!==c.id||binding.connection_revision!==c.revision)return fail()
      bindings.http.push(binding)
    }else if(row.binding!==null)return fail()
    if(c.enabled)connectedHttp.push({name:alias,display_name:c.name,description:c.description,method:row.method as 'GET'|'POST',status:c.status})
  }
  connectionIds.clear()
  for(const raw of list(data.mcp_connections,50)){
    const row=object(raw,[...connectionFields,'catalog_sha256','tools']),c=connection(row,employee)
    if(connectionIds.has(c.id)||row.catalog_sha256!==null&&(typeof row.catalog_sha256!=='string'||!/^[a-f0-9]{64}$/.test(row.catalog_sha256)))return fail()
    connectionIds.add(c.id)
    const tools=list(row.tools,200)
    if(tools.length&&(!c.enabled||c.status!=='ok'||row.catalog_sha256===null))return fail()
    for(const rawTool of tools){
      const tool=object(rawTool,['alias','tool_name','description','binding','read_only','destructive']),alias=text(tool.alias,45,true)
      if(!/^mcp_t[a-f0-9]{40}$/.test(alias)||aliases.has(alias))return fail()
      aliases.add(alias)
      object(tool.binding,['name','connection_id','connection_revision','catalog_sha256','tool_name'])
      const binding=parseAgentMcpTools([tool.binding])[0]!,name=text(tool.tool_name,120,true)
      if(binding.name!==alias||binding.connection_id!==c.id||binding.connection_revision!==c.revision||binding.catalog_sha256!==row.catalog_sha256||binding.tool_name!==name)return fail()
      bindings.mcp.push(binding)
      verifiedMarket.push({id:alias,name,label:c.name+' · '+name,description:text(tool.description,1000),connectionTitle:c.name,readOnly:bool(tool.read_only),destructive:bool(tool.destructive)})
      if(verifiedMarket.length>200)return fail()
    }
  }
  const bases=new Set<string>()
  for(const raw of list(data.knowledge_bases,149)){
    const row=object(raw,['id','owner_user_id','revision','name','description','created_at','updated_at','access_role','semantic_allowed','document_count','chunk_count']),base=id(row.id),owner=id(row.owner_user_id)
    integer(row.revision,1)
    if(bases.has(base)||!['owner','viewer','editor'].includes(String(row.access_role)))return fail()
    bases.add(base)
    const own=row.access_role==='owner'
    if(own?(owner!==employee||row.semantic_allowed!==null):(!sharing||owner===employee||typeof row.semantic_allowed!=='boolean'))return fail()
    knowledgeBases.push({id:base,name:text(row.name,120,true),description:text(row.description,1000),created_ms:date(row.created_at),updated_ms:date(row.updated_at),access_role:row.access_role as 'owner'|'viewer'|'editor',owner_uid:owner,...(own?{}:{semantic_allowed:bool(row.semantic_allowed)}),document_count:integer(row.document_count),chunk_count:integer(row.chunk_count)})
  }
  return {connectedHttp,verifiedMarket,knowledgeBases,bindings}
}
