import {requireOriginalModelDraftDiscoveryBrowserCi} from './pg-original-model-draft-discovery-browser-guard.mjs'
export const noStoreBrowserPin=Object.freeze({sdk:'1.65.0-alpha-2026-10-28',chromium:'157.0.8103.15'})
export const noStoreCases=Object.freeze(['stream-chunked','stream-length','native-json','truncated','abort','cancel'])
export function assertNoStoreBrowserResults(value){
 const bad=()=>{throw Error('original_no_store_browser_check_unconfirmed')}
 if(!value||!['default','full'].includes(value.engine)||value.sdk!==noStoreBrowserPin.sdk||value.browser!==noStoreBrowserPin.chromium||value.outside_requests!==0||value.page_errors!==0||value.web_sockets!==0||!Array.isArray(value.cases)||value.cases.length!==6||new Set(value.cases.map(r=>r.name)).size!==6)bad()
 for(const row of value.cases){
  if(!noStoreCases.includes(row.name)||row.status!==200||!Number.isSafeInteger(row.server_bytes)||typeof row.server_finished!=='boolean'||typeof row.server_closed_early!=='boolean')bad()
  if(['stream-chunked','stream-length','native-json'].includes(row.name)){
   if(row.page_ok!==true||row.host_body_ok!==true||row.host_body_refused!==false||row.terminal!=='finished'||row.failure!==null||row.server_bytes!==11||row.server_finished!==true||row.server_closed_early!==false)bad()
   if(row.name==='native-json'?(row.page_eof!==null||row.page_bytes!==null):(row.page_eof!==true||row.page_bytes!==11))bad()
  }else{
   if(row.page_ok!==false||row.page_eof!==false||row.host_body_ok!==false||row.host_body_refused!==true||row.terminal!=='failed')bad()
   if(row.name==='truncated'?(row.failure!=='truncated'||row.page_bytes!==11||row.server_bytes!==11||row.server_finished!==true||row.server_closed_early!==false):(row.failure!=='aborted'||row.page_bytes!==6||row.server_bytes!==6||row.server_closed_early!==true||row.server_finished!==false))bad()
  }
 }
 return true
}
// Hosted synthetic loopback only. No employee UI, database, credentials,
// interception, extra provider request or altered application fetch is involved.
export async function runOriginalNoStoreBrowserCheck(env=process.env){
 const permit=requireOriginalModelDraftDiscoveryBrowserCi(env)
 const [{default:assert},{createServer},{createRequire},{chromium}]=await Promise.all([import('node:assert/strict'),import('node:http'),import('node:module'),import('@playwright/test')])
 const sdk=createRequire(import.meta.url)('@playwright/test/package.json').version
 assert.equal(sdk,noStoreBrowserPin.sdk)
 const states=new Map(),sockets=new Set(),reports=[],serverErrors=[];let server,browser,context,primary
 const bounded=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('original_no_store_browser_check_deadline')),8000)})])}finally{clearTimeout(timer)}}
 try{
  server=createServer((req,res)=>{
   try{
   const url=new URL(req.url,'http://localhost'),state=states.get(url.searchParams.get('id'))
   if(url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end('<!doctype html><link rel="icon" href="data:,"><title>Synthetic browser regression</title>');return}
   if(!state){res.writeHead(404);res.end();return}
   if(url.pathname==='/advance'&&req.method==='POST'){
    const size=url.searchParams.get('bytes');assert(['6','11'].includes(size));assert(state.response)
    if(size==='6'&&state.bytes===6){state.response.write('true}');state.bytes=11}else if(size==='11'&&state.bytes===11)state.response.end();else throw Error('original_no_store_browser_check_invalid_advance')
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"ok":true}');return
   }
   if(url.pathname!=='/data'||req.method!=='GET'||state.response){res.writeHead(405);res.end();return}
   state.response=res;res.once('finish',()=>{state.finished=true});res.once('close',()=>{state.closedEarly=!res.writableEnded;state.closed()})
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store',...(state.name==='stream-length'?{'Content-Length':'11'}:state.name==='truncated'?{'Content-Length':'12',Connection:'close'}:{})})
   res.write('{"ok":');state.bytes=6
   if(state.name==='native-json'){res.write('true}');state.bytes=11;res.end()}
   }catch(error){serverErrors.push(error);res.destroy()}
  })
  server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket))})
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
  const origin='http://127.0.0.1:'+server.address().port
  for(const engine of ['default','full']){
   browser=await chromium.launch({headless:true,...(engine==='full'?{executablePath:chromium.executablePath()}:{})});assert.equal(browser.version(),noStoreBrowserPin.chromium)
   const report={sdk,browser:browser.version(),engine,outside_requests:0,page_errors:0,web_sockets:0,cases:[]}
   for(const name of noStoreCases){
    const id=engine+'-'+name;let closed;const state={name,response:null,bytes:0,finished:false,closedEarly:false,closed:()=>closed()},closedPromise=new Promise(resolve=>{closed=resolve});states.set(id,state)
    context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();page.setDefaultTimeout(8000);page.setDefaultNavigationTimeout(8000)
    page.on('request',r=>{if(new URL(r.url()).origin!==origin)report.outside_requests++});page.on('pageerror',()=>{report.page_errors++});page.on('websocket',()=>{report.web_sockets++})
    await page.goto(origin,{waitUntil:'domcontentloaded'})
    const isData=r=>{const u=new URL(r.url());return u.origin===origin&&u.pathname==='/data'&&u.searchParams.get('id')===id}
    const terminal=new Promise(resolve=>{page.on('requestfinished',r=>{if(isData(r))resolve({terminal:'finished',failure:null})});page.on('requestfailed',r=>{if(isData(r)){const text=r.failure()?.errorText??'';resolve({terminal:'failed',failure:text.includes('ERR_CONTENT_LENGTH_MISMATCH')?'truncated':text.includes('ERR_ABORTED')?'aborted':'other'})}})})
    const reply=page.waitForResponse(r=>isData(r.request())).then(async response=>{let ok=false,refused=false;try{const value=await response.json();ok=value?.ok===true}catch{refused=true}return{status:response.status(),host_body_ok:ok,host_body_refused:refused}})
    const application=page.evaluate(async({id,name})=>{
     const controller=new AbortController(),response=await fetch('/data?id='+id,{cache:'no-store',signal:controller.signal})
     if(name==='native-json'){const value=await response.json();return{page_ok:value.ok===true,page_eof:null,page_bytes:null}}
     const reader=response.body.getReader();let bytes=0,eof=false
     try{while(true){const part=await reader.read();if(part.done){eof=true;break}bytes+=part.value.byteLength;if(bytes>11)throw Error('synthetic_body_overflow')
      if(name==='abort'){controller.abort();await reader.read();break}
      if(name==='cancel'){await reader.cancel();break}
      const ack=await fetch('/advance?id='+id+'&bytes='+bytes,{method:'POST',cache:'no-store'});if((await ack.json()).ok!==true)throw Error('synthetic_advance_refused')
     }return{page_ok:eof&&bytes===11,page_eof:eof,page_bytes:bytes}}catch{return{page_ok:false,page_eof:eof,page_bytes:bytes}}finally{try{reader.releaseLock()}catch{}}
    },{id,name})
    const [pageResult,hostResult,end]=await bounded(Promise.all([application,reply,terminal]));await bounded(closedPromise)
    report.cases.push({name,...pageResult,...hostResult,...end,server_bytes:state.bytes,server_finished:state.finished,server_closed_early:state.closedEarly})
    await context.close();context=null;states.delete(id)
   }
   assertNoStoreBrowserResults(report);reports.push(report);await browser.close();browser=null
  }
  assert.equal(serverErrors.length,0)
 }catch(error){primary=error}
 finally{
  const cleanup=[];for(const work of [()=>context?.close(),()=>browser?.close(),()=>{for(const socket of sockets)socket.destroy()},()=>server?new Promise(resolve=>server.close(resolve)):undefined])try{await work()}catch(error){cleanup.push(error)}
  states.clear();if(primary||cleanup.length)throw new AggregateError([...(primary?[primary]:[]),...cleanup],'original_no_store_browser_check_failed')
 }
 return Object.freeze({format:'original-no-store-browser-check.v1',head:permit.head,reports,employee_UI_acceptance:false,actual_provider_calls:0,production_GO:false})
}
