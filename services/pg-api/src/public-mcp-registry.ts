// Official public directory data only. Nothing in this file authorizes a tool.
import {createHash} from 'node:crypto'
import {HttpError} from './contracts.ts'
import {safeToolDestination} from './workflow-v2-tool-plan.ts'
import {canonicalMcpJson} from './mcp-catalog.ts'
import {registryServerName,registryVersion} from './public-mcp-registry-contract.ts'
export {registryServerName,registryVersion} from './public-mcp-registry-contract.ts'
export const publicRegistryOrigin='https://registry.modelcontextprotocol.io' as const
export type RegistryRead={kind:'list';query:string;cursor:string}|{kind:'detail';name:string;version:string}
import type {RegistryEntry,RegistryPage} from '../../../shared/tool-hub-public-types.ts'
export type {RegistryEntry,RegistryPage} from '../../../shared/tool-hub-public-types.ts'
function fail():never{throw new HttpError(502,'public_mcp_registry_refused')}
function invalid():never{throw new HttpError(400,'invalid_public_mcp_registry_query')}
const plain=(v:unknown):v is Record<string,unknown>=>Boolean(v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v)))
const text=(v:unknown,max:number,empty=false):string=>{if(typeof v!=='string'||v.length>max||(!empty&&!v.trim())||/[\u0000-\u001f\u007f]/.test(v))return fail();return v}
export function publicRegistryList(query:unknown='',cursor:unknown=''):RegistryRead{
 if(typeof query!=='string'||query.length>100||/[\u0000-\u001f\u007f]/.test(query)||typeof cursor!=='string'||cursor.length>300||/[\u0000-\u0020\u007f]/.test(cursor))invalid()
 const q=query.trim();if(query.length>0&&(!q||Array.from(q).length<3))invalid()
 return {kind:'list',query:q,cursor}
}
export function publicRegistryDetail(name:unknown,version:unknown='latest'):RegistryRead{if(!registryServerName(name)||!registryVersion(version))invalid();return {kind:'detail',name,version}}
export function publicRegistryPath(input:RegistryRead):string{
 if(input.kind==='detail'){const item=publicRegistryDetail(input.name,input.version);if(item.kind!=='detail')invalid();return '/v0.1/servers/'+encodeURIComponent(item.name)+'/versions/'+encodeURIComponent(item.version)}
 if(input.kind!=='list')invalid()
 const item=publicRegistryList(input.query,input.cursor);if(item.kind!=='list')invalid();const params=new URLSearchParams({limit:'24',version:'latest'});if(item.query)params.set('search',item.query);if(item.cursor)params.set('cursor',item.cursor);return '/v0.1/servers?'+params.toString()
}
function entry(raw:unknown,latest=true):RegistryEntry|null{
 if(!plain(raw)||!plain(raw.server)||!plain(raw._meta))fail()
 const server=raw.server,official=raw._meta['io.modelcontextprotocol.registry/official']
 if(!plain(official)||typeof official.status!=='string'||!['active','deprecated','deleted'].includes(official.status))fail()
 if(official.status==='deleted')return null
 if(!registryServerName(server.name)||!registryVersion(server.version)||typeof official.isLatest!=='boolean'||latest&&official.isLatest!==true)fail()
 const remotes:RegistryEntry['remotes']=[],packages:RegistryEntry['packages']=[]
 if(server.remotes!==undefined){if(!Array.isArray(server.remotes)||server.remotes.length>20)fail();for(const remote of server.remotes){
  if(!plain(remote)||remote.type!=='streamable-http'||typeof remote.url!=='string')continue
  try{const url=safeToolDestination(remote.url,['https:']);if(url.search)continue;remotes.push({type:'streamable-http',url:url.toString()})}catch{/* Unsupported/private destinations are display data, never connect targets. */}
  if(remotes.length>=5)break
 }}
 if(server.packages!==undefined){if(!Array.isArray(server.packages)||server.packages.length>20)fail();for(const pkg of server.packages){if(!plain(pkg))fail();packages.push({registry:text(pkg.registryType,40),identifier:text(pkg.identifier,200),version:text(pkg.version,80)});if(packages.length>=5)break}}
 const value={name:server.name,title:server.title===undefined?server.name:text(server.title,200),description:text(server.description,4000,true),version:server.version,status:official.status as 'active'|'deprecated',remotes,packages}
 return {...value,source_sha256:createHash('sha256').update(canonicalMcpJson(value)).digest('hex')}
}
export function projectPublicRegistry(raw:unknown,input:RegistryRead):RegistryPage{
 publicRegistryPath(input)
 if(!plain(raw)||Buffer.byteLength(JSON.stringify(raw))>262144)fail()
 if(input.kind==='detail'){
  const item=entry(raw,input.version==='latest');if(!item||item.name!==input.name||input.version!=='latest'&&item.version!==input.version)fail()
  return {items:[item],next_cursor:'',query:'',source:'official_mcp_registry',is_execution_authority:false}
 }
 if(!Array.isArray(raw.servers)||raw.servers.length>24||!plain(raw.metadata))fail()
 const items=raw.servers.map(value=>entry(value)).filter((v):v is RegistryEntry=>v!==null),seen=new Set<string>()
 for(const item of items){if(seen.has(item.name))fail();seen.add(item.name)}
 const next=raw.metadata.nextCursor===undefined?'':text(raw.metadata.nextCursor,300,true);if(/[\u0000-\u0020\u007f]/.test(next)||next&&next===input.cursor)fail()
 return {items,next_cursor:next,query:input.query,source:'official_mcp_registry',is_execution_authority:false}
}
