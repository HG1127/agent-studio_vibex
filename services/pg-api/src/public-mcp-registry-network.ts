// Fixed official directory GET only. No cookies, keys, redirects or tool RPC.
import {request as httpsRequest,type RequestOptions} from 'node:https'
import type {ClientRequest,IncomingMessage} from 'node:http'
import {resolve4,resolve6} from 'node:dns/promises'
import {resolveSafeProviderAddress,type ProviderResolver} from './model-connection-probe.ts'
import {HttpError} from './contracts.ts'
import {publicRegistryPath,projectPublicRegistry,type RegistryRead,type RegistryPage} from './public-mcp-registry.ts'
type Requester=(options:RequestOptions,listener:(response:IncomingMessage)=>void)=>ClientRequest
async function registryAddress(resolver:ProviderResolver,signal:AbortSignal){
 let abort=()=>{}
 const cancelled=new Promise<never>((_resolve,reject)=>{abort=()=>reject(new HttpError(502,'public_mcp_registry_unavailable'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()})
 try{return await Promise.race([resolveSafeProviderAddress(resolver,'registry.modelcontextprotocol.io'),cancelled])}finally{signal.removeEventListener('abort',abort)}
}
export function createPublicMcpRegistryNetwork(resolver:ProviderResolver={resolve4,resolve6},request:Requester=httpsRequest){
 return async(input:RegistryRead,signal:AbortSignal):Promise<RegistryPage>=>{
  const path=publicRegistryPath(input),bounded=AbortSignal.any([signal,AbortSignal.timeout(5000)])
  bounded.throwIfAborted();const pinned=await registryAddress(resolver,bounded);bounded.throwIfAborted()
  return new Promise((resolve,reject)=>{
   let settled=false
   const fail=()=>{if(!settled){settled=true;reject(new HttpError(502,'public_mcp_registry_unavailable'))}}
   const req=request({protocol:'https:',hostname:'registry.modelcontextprotocol.io',servername:'registry.modelcontextprotocol.io',port:443,path,method:'GET',
    headers:{accept:'application/json','accept-encoding':'identity','user-agent':'AgentStudio-PG18-Registry'},agent:false,rejectUnauthorized:true,minVersion:'TLSv1.2',family:pinned.family,
    lookup:(_host,_options,callback)=>callback(null,pinned.address,pinned.family),signal:bounded,timeout:5000},res=>{
    if(res.statusCode!==200||!/^application\/json(?:\s*;|$)/i.test(String(res.headers['content-type']??''))||res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){res.destroy();fail();return}
    const chunks:Buffer[]=[];let size=0
    res.on('data',piece=>{if(settled)return;const bytes=Buffer.isBuffer(piece)?piece:Buffer.from(piece);size+=bytes.length;if(size>262144){res.destroy();fail();return}chunks.push(bytes)})
    res.once('error',fail);res.once('aborted',fail);res.once('end',()=>{if(settled)return;try{const value=projectPublicRegistry(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))),input);settled=true;resolve(value)}catch{fail()}})
   })
   req.once('error',fail);req.once('timeout',()=>{req.destroy();fail()});req.end()
  })
 }
}
export function selectPublicMcpRegistryRead(env:NodeJS.ProcessEnv):boolean{
 const enabled=env.AGENT_STUDIO_PG_PUBLIC_MCP_REGISTRY_ENABLED,approved=env.AGENT_STUDIO_PG_PUBLIC_MCP_REGISTRY_APPROVED
 if(enabled===undefined&&approved===undefined)return false
 if(enabled!=='true'||approved!=='APPROVE_DISPOSABLE_PG18_PUBLIC_REGISTRY_READ_ONLY')throw Error('public_mcp_registry_not_approved')
 return true
}
