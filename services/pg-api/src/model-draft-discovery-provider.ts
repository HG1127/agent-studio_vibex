// Read-only GET inventory only; no arbitrary origin, redirect, proxy or generation.
import {resolve4,resolve6} from 'node:dns/promises'
import {request as httpsRequest,type RequestOptions} from 'node:https'
import {exactProviderEndpoint,resolveSafeProviderAddress,type ProviderResolver,type ProviderProbeInput} from './model-connection-probe.ts'
import {draftProbeObject,draftProbeModels,modelDraftProbeErrors,type DraftProvider} from '../../../shared/model-draft-probe-contract.ts'
export type ModelDiscoveryOutcome={ok:boolean;latency_ms:number;models:string[];complete:boolean;error_code:string}
export type ModelDiscoveryTransport=(input:ProviderProbeInput,beforeNetwork:()=>Promise<void>)=>Promise<ModelDiscoveryOutcome>
const timeoutMs=6000,maxBody=131072,maxTotal=524288
function code(error:unknown):string{const value=error instanceof Error?error.message:'';return(modelDraftProbeErrors as readonly string[]).includes(value)?value:'provider_transport_failed'}
function inventory(raw:unknown,provider:DraftProvider):{models:string[];cursor:string|null}{
 const obj=draftProbeObject(raw),rawRows=provider==='gemini'?obj.models:obj.data
 if(!Array.isArray(rawRows)||rawRows.length>300)throw Error('provider_response_invalid')
 const ids=rawRows.map(raw=>{const row=draftProbeObject(raw);if(provider==='gemini'){if(typeof row.name!=='string'||!/^models\/[A-Za-z0-9._-]{1,190}$/.test(row.name))throw Error('provider_response_invalid');return row.name}return row.id})
 const models=draftProbeModels(ids)
 let cursor:string|null=null
 if(provider==='anthropic'){if(typeof obj.has_more!=='boolean')throw Error('provider_response_invalid');if(obj.has_more){if(typeof obj.last_id!=='string'||obj.last_id!==models.at(-1))throw Error('provider_response_invalid');cursor=obj.last_id}}
 if(provider==='gemini'&&obj.nextPageToken!==undefined&&obj.nextPageToken!==''){if(typeof obj.nextPageToken!=='string'||obj.nextPageToken.length>2048||/[\u0000-\u0020\u007f]/.test(obj.nextPageToken))throw Error('provider_response_invalid');cursor=obj.nextPageToken}
 return{models,cursor}
}
export function createModelDraftDiscoveryProvider(resolver:ProviderResolver={resolve4,resolve6},request:typeof httpsRequest=httpsRequest,now:()=>number=Date.now):ModelDiscoveryTransport{
 return async(input,beforeNetwork)=>{
  const started=now(),abort=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined,total=0
  const work=async()=>{
   const endpoint=exactProviderEndpoint(input);if(typeof input.api_key!=='string'||input.api_key.length<8||input.api_key.length>4096||/[\u0000-\u0020\u007f]/.test(input.api_key))throw Error('provider_response_invalid')
   await beforeNetwork();if(abort.signal.aborted)throw Error('provider_probe_timeout')
   const pinned=await resolveSafeProviderAddress(resolver,endpoint.host);if(abort.signal.aborted)throw Error('provider_probe_timeout')
   const all:string[]=[],seen=new Set<string>(),cursors=new Set<string>();let cursor:string|null=null
   for(let page=0;page<4;page++){
    await beforeNetwork();if(abort.signal.aborted)throw Error('provider_probe_timeout')
    const params=new URLSearchParams();if(input.provider==='anthropic'){params.set('limit','100');if(cursor)params.set('after_id',cursor)}if(input.provider==='gemini'){params.set('pageSize','100');if(cursor)params.set('pageToken',cursor)}
    const headers:Record<string,string>={Accept:'application/json','User-Agent':'agentstudio-original-model-draft-discovery/1'}
    if(input.provider==='openai')headers.Authorization='Bearer '+input.api_key;else if(input.provider==='anthropic'){headers['x-api-key']=input.api_key;headers['anthropic-version']='2023-06-01'}else headers['x-goog-api-key']=input.api_key
    const raw=await new Promise<unknown>((resolve,reject)=>{
     let settled=false;const finish=(error?:Error,value?:unknown)=>{if(settled)return;settled=true;error?reject(error):resolve(value)}
     const options:RequestOptions={protocol:'https:',hostname:endpoint.host,port:443,servername:endpoint.host,method:'GET',path:endpoint.path+(params.size?'?'+params.toString():''),agent:false,rejectUnauthorized:true,minVersion:'TLSv1.2',family:pinned.family,lookup:(_host,_opts,cb)=>cb(null,pinned.address,pinned.family),headers,timeout:timeoutMs,signal:abort.signal}
     const req=request(options,response=>{
      const status=response.statusCode??0,bad=(message:string)=>{response.destroy();finish(Error(message))}
      if(status===401||status===403){bad('provider_credential_rejected');return}if(status===429){bad('provider_rate_limited');return}if(status!==200){bad('provider_response_rejected');return}
      const declared=response.headers['content-length'],type=response.headers['content-type'];if(typeof type!=='string'||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(type)||declared!==undefined&&(typeof declared!=='string'||!/^(0|[1-9][0-9]*)$/.test(declared)||Number(declared)>maxBody)||response.headers['content-encoding']!==undefined&&response.headers['content-encoding']!=='identity'){bad('provider_response_invalid');return}
      const chunks:Buffer[]=[];let size=0
      response.on('data',(chunk:Buffer|string)=>{if(settled)return;const part=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=part.length;total+=part.length;if(size>maxBody||total>maxTotal){bad('provider_response_too_large');return}chunks.push(part)})
      response.once('end',()=>{if(settled)return;try{if(declared!==undefined&&Number(declared)!==size)throw Error();const text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));if(text.includes(input.api_key))throw Error();finish(undefined,JSON.parse(text))}catch{finish(Error('provider_response_invalid'))}})
      response.once('aborted',()=>finish(Error('provider_transport_failed')));response.once('error',()=>finish(Error('provider_transport_failed')))
     });req.once('error',()=>finish(Error(abort.signal.aborted?'provider_probe_timeout':'provider_transport_failed')));req.setTimeout(timeoutMs,()=>{abort.abort();req.destroy()});req.end()
    })
    const next=inventory(raw,input.provider);for(const id of next.models){if(id.includes(input.api_key)||seen.has(id))throw Error('provider_response_invalid');seen.add(id);all.push(id)}if(all.length>300)throw Error('provider_models_incomplete')
    cursor=next.cursor;if(cursor===null)return all;if(cursor.includes(input.api_key)||cursor.includes(encodeURIComponent(input.api_key))||cursors.has(cursor))throw Error('provider_response_invalid');cursors.add(cursor)
   }
   throw Error('provider_models_incomplete')
  }
  try{const models=await Promise.race([work(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(Error('provider_probe_timeout'))},timeoutMs)})]);return{ok:true,latency_ms:Math.max(0,Math.min(timeoutMs,Math.round(now()-started))),models,complete:true,error_code:''}}catch(error){return{ok:false,latency_ms:Math.max(0,Math.min(timeoutMs,Math.round(now()-started))),models:[],complete:false,error_code:code(error)}}finally{clearTimeout(timer);abort.abort()}
 }
}
