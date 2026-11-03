/** Only public GitHub SKILL.md source, never arbitrary HTTP or a server fetch. */
export function originalRoleGithubRaw(raw:string):string{
 const url=new URL(raw)
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash)throw Error('skill_source_url_invalid')
 if(url.hostname==='github.com'){const match=/^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/blob\/(.+\/SKILL\.md)$/i.exec(url.pathname);if(!match)throw Error('skill_source_url_invalid');url.hostname='raw.githubusercontent.com';url.pathname='/'+match[1]+'/'+match[2]+'/'+match[3]}
 if(url.hostname!=='raw.githubusercontent.com'||!/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(?:[A-Za-z0-9_.-]+\/)+SKILL\.md$/i.test(url.pathname))throw Error('skill_source_url_invalid')
 return url.href
}
export async function readOriginalRoleGithub(raw:string,transport:typeof fetch=fetch){
 const url=originalRoleGithubRaw(raw),controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined
 let reader:ReadableStreamDefaultReader<Uint8Array>|undefined
 const work=async()=>{const response=await transport(url,{method:'GET',credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal});if(!(response instanceof Response)||!response.ok||response.redirected||!response.body)throw Error('skill_github_fetch_failed')
  reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0
  for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>64400)throw Error('skill_size_invalid');chunks.push(next.value)}
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length}
  const source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(source.length>16100)throw Error('skill_size_invalid');return {source,source_url:url}}
 try{return await Promise.race([work(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('skill_github_fetch_failed'))},8000)})])}
 finally{clearTimeout(timer);if(reader){void reader.cancel().catch(()=>{});try{reader.releaseLock()}catch{}}}
}
