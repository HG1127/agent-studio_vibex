/** Only a bounded same-origin, known release artifact can be shown as downloadable.
 * This validates metadata, not a digital signature or endpoint installation. */
export type ConnectorRelease={version:string;bytes:number;sha256:string;codeSigned:boolean;url:string}
export async function readConnectorRelease(signal?:AbortSignal,fetcher:typeof fetch=fetch):Promise<ConnectorRelease>{
 const options={cache:'no-store' as const,redirect:'error' as const,signal:AbortSignal.any([AbortSignal.timeout(10000),...(signal?[signal]:[])])}
 const response=await fetcher('/downloads/connector-release.json',options)
 if(!response.ok)throw Error('connector_release_unavailable')
 const release=parseConnectorRelease(await response.json());if(!release)throw Error('connector_release_invalid')
 const file=await fetcher(release.url,{...options,method:'HEAD'})
 if(!file.ok||Number(file.headers.get('content-length'))!==release.bytes||/text\/html/i.test(file.headers.get('content-type')||''))throw Error('connector_archive_unverified')
 return release
}
export function parseConnectorRelease(value:unknown):ConnectorRelease|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null
 const v=value as Record<string,unknown>
 if(v.format!=='agent-studio-connector-release-v1'||v.platform!=='win32'||v.arch!=='x64'||v.file!=='agent-studio-connector-win-x64.zip'||
  typeof v.version!=='string'||!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(v.version)||v.version.length>60||
  !Number.isSafeInteger(v.bytes)||Number(v.bytes)<10000||Number(v.bytes)>600000000||
  typeof v.sha256!=='string'||!/^[a-f0-9]{64}$/.test(v.sha256)||typeof v.codeSigned!=='boolean')return null
 return {version:v.version,bytes:Number(v.bytes),sha256:v.sha256,codeSigned:v.codeSigned,url:'/downloads/agent-studio-connector-win-x64.zip'}
}
