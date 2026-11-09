// Install on the context BEFORE newPage/navigation. The Node ledger survives
// every reload/login/logout document; no Cookie, URL, headers or event payload
// are stored. A local fail-closed PB event is a migration failure even when it
// prevents the request from ever reaching the rejecting HTTPS host.
export async function installOriginalLegacyBlockObserver(context){
 const binding='__studioOriginalLegacyBlockObserved',flush='__studioOriginalLegacyBlocksFlush'
 let count=0,overflow=false;const codes=[]
 await context.exposeBinding(binding,(_source,code)=>{
  if(count<129)count++
  if(codes.length<128)codes.push(code==='pocketbase_unavailable_in_pg_runtime'?code:'unrecognized_legacy_block_event')
  else overflow=true
 })
 await context.addInitScript(({binding,flush})=>{
  const pending=new Set();let failed=false
  window.addEventListener('studio:legacy-backend-blocked',event=>{
   let code='unrecognized_legacy_block_event'
   try{if(event.detail?.code==='pocketbase_unavailable_in_pg_runtime')code='pocketbase_unavailable_in_pg_runtime'}catch{}
   let acknowledged
   try{acknowledged=Promise.resolve(window[binding](code))}catch{failed=true;return}
   if(pending.size>=128){failed=true;void acknowledged.catch(()=>{});return}
   const tracked=acknowledged.catch(()=>{failed=true}).finally(()=>pending.delete(tracked));pending.add(tracked)
  })
  Object.defineProperty(window,flush,{configurable:false,writable:false,value:async()=>{
   await Promise.all([...pending]);return{ok:!failed}
  }})
 },{binding,flush})
 return Object.freeze({
  snapshot:()=>({event_count_capped_129:count,codes:[...codes],overflow}),
  async flush(page){const result=await page.evaluate(async key=>{
   if(typeof window[key]!=='function')throw Error('legacy_block_observer_missing')
   return window[key]()
  },flush);if(result?.ok!==true)throw Error('legacy_block_observer_ack_failed')},
 })
}
