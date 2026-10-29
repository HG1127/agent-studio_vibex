// Test-only init script. Observe a clone of one armed real fetch response.
// Return the exact original Promise/Response and untouched request arguments.
export function installActualBrowserFetchBodyObserver(config){
 const nativeFetch=window.fetch.bind(window),entries=new Map(),armed=[];let next=0
 const {key,basePath,maxBytes}=config
 window[key]={
  arm(path,method){
   if(typeof path!=='string'||!path.startsWith(basePath+'/')||!['GET','POST'].includes(method))throw Error('invalid_actual_body_observation')
   const id=++next;entries.set(id,{path,method,done:false});armed.push(id);return id
  },
  ready(id){return entries.get(id)?.done===true},
  read(id){const value=entries.get(id);if(!value?.done)return null;entries.delete(id);return value},
 }
 window.fetch=(...args)=>{
  let entry
  try{
   const [url,options]=args
   if(typeof url==='string'){
    const actualUrl=new URL(url,location.href),method=options?.method??'GET'
    if(actualUrl.origin===location.origin){
     const index=armed.findIndex(id=>{const item=entries.get(id);return item?.method===method&&(actualUrl.pathname===item.path||actualUrl.pathname==='/__pg_native'+item.path)})
     if(index>=0){entry=entries.get(armed.splice(index,1)[0]);entry.actual_path=actualUrl.pathname;entry.request=typeof options?.body==='string'?JSON.parse(options.body):null}
    }
   }
  }catch{}
  const actual=nativeFetch(...args)
  if(entry)void actual.then(async response=>{
   const clone=response.clone();entry.status=response.status
   if(!clone.body||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(clone.headers.get('content-type')??''))throw Error('invalid_actual_response')
   const reader=clone.body.getReader(),chunks=[];let size=0
   try{
    for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>maxBytes)throw Error('actual_body_bound');chunks.push(part.value)}
   }catch(error){void reader.cancel().catch(()=>{});throw error}finally{reader.releaseLock()}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
   const length=clone.headers.get('content-length')
   if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)!==size))throw Error('actual_body_length')
   entry.value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));entry.done=true
  }).catch(()=>{entry.error='actual_response_body_incomplete';entry.done=true})
  return actual
 }
}
