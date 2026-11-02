/** Passive diagnostics for one fixed response family. No request, response body,
 * URL, Cookie, header or credential is retained in the exported observation. */
export function observeBrowserJsonResponses(page,{origin,pathname,maxEntries=16}){
 const expected=new URL(origin);if(expected.protocol!=='https:'||expected.origin!==origin||typeof pathname!=='string'||!pathname.startsWith('/__pg_native/api/')||/[?#\\]/.test(pathname)||!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>16)throw Error('invalid_browser_response_observer')
 let active=true,navigation=0,overflow=false;const rows=[],indices=new WeakMap(),handlers=[]
 const matches=request=>{try{const raw=request.url();if(typeof raw!=='string'||raw.length>4096)return false;const url=new URL(raw);return url.origin===origin&&url.pathname===pathname&&!url.search&&request.method()==='POST'}catch{return false}}
 const rowFor=request=>{if(!active||!matches(request))return null;let row=indices.get(request);if(row)return row;if(rows.length>=maxEntries){overflow=true;return null}row={sequence:rows.length+1,navigation_started:navigation,navigation_body_read:null,status:null,finished:false,failed:false,transport_failure:null,body_read:'not_started',body_failure:null};indices.set(request,row);rows.push(row);return row}
 const on=(event,fn)=>{page.on(event,fn);handlers.push([event,fn])}
 on('request',request=>{rowFor(request)})
 on('response',response=>{const row=rowFor(response.request()),status=response.status();if(row&&Number.isInteger(status)&&status>=100&&status<=599)row.status=status})
 on('requestfinished',request=>{const row=rowFor(request);if(row)row.finished=true})
 on('requestfailed',request=>{const row=rowFor(request);if(!row)return;row.failed=true;let reason='';try{reason=String(request.failure()?.errorText??'')}catch{}row.transport_failure=/aborted/i.test(reason)?'aborted':reason?'failed':'unreported'})
 on('framenavigated',frame=>{if(active&&frame===page.mainFrame())navigation=Math.min(100000,navigation+1)})
 const snapshot=()=>Object.freeze({format:'original-browser-json-response-observation.v1',observer_only:true,requests_sent:0,overflow,entries:Object.freeze(rows.map(row=>Object.freeze({...row})))})
 return Object.freeze({
  async capture(response){const row=rowFor(response.request());if(row){row.body_read='pending';row.navigation_body_read=navigation}try{const body=await response.json();if(active&&row)row.body_read='complete';return{status:response.status(),body}}catch(error){if(active&&row){row.body_read='failed';const text=error instanceof Error?error.message:'';row.body_failure=text.includes('Network.getResponseBody')&&text.includes('No data found')?'cdp_body_unavailable':'body_read_failed'}throw error}},
  snapshot,
  stop(){if(active){active=false;for(const[event,fn]of handlers)page.off(event,fn);handlers.length=0}return snapshot()},
 })
}
