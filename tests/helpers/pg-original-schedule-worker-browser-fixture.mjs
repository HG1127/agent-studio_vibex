import {requireOriginalScheduleWorkerCi} from './pg-original-schedule-worker-guard.mjs'
import {verifyOriginalScheduleWorkerSources} from './pg-original-schedule-worker-reviewed-check.mjs'
import {originalScheduleWorkerPolicy} from './pg-original-schedule-worker-policy.mjs'
/** Actual original Vite build and unchanged Native response proxy; no fulfilled DTOs. */
export async function originalScheduleWorkerBrowserFixture(env=process.env){
 const permit=requireOriginalScheduleWorkerCi(env),reviewed=await verifyOriginalScheduleWorkerSources(env)
 const [{default:assert},fs,path,https,crypto,{originalScheduleWorkerBackendFixture}]=await Promise.all([import('node:assert/strict'),import('node:fs'),import('node:path'),import('node:https'),import('node:crypto'),import('./pg-original-schedule-worker-backend-fixture.mjs')])
 const build=path.join(reviewed.repo,'dist-original-pg'),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),files=new Map(),assets=[]
 assert(!fs.lstatSync(build).isSymbolicLink()&&fs.statSync(build).isDirectory()&&fs.realpathSync(build)===build)
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf','.wasm':'application/wasm'}
 function checkedFile(relative,max=8*1024*1024){assert(typeof relative==='string'&&!relative.startsWith('/')&&!relative.includes('..')&&!relative.includes('\\')&&!relative.endsWith('.map'));let at=build;for(const part of relative.split('/')){assert(part);at=path.join(at,part);assert(!fs.lstatSync(at).isSymbolicLink())}const actual=fs.realpathSync(at),stat=fs.statSync(actual);assert(actual.startsWith(build+path.sep)&&stat.isFile()&&stat.size<=max);return fs.readFileSync(actual)}
 const manifestBytes=checkedFile('.vite/manifest.json',1048576),manifest=JSON.parse(manifestBytes.toString('utf8')),entry=manifest['index.html'];assert(entry?.isEntry===true&&entry.src==='index.html'&&typeof entry.file==='string')
 const index=checkedFile('index.html',131072),html=index.toString('utf8'),scripts=[...html.matchAll(/<script\b[^>]*>/gi)].map(value=>value[0]).filter(tag=>/\btype=["']module["']/i.test(tag)).map(tag=>tag.match(/\bsrc=["']([^"']+)["']/i)?.[1]);assert.deepEqual(scripts,['/'+entry.file]);assert(!html.includes('/src/main.tsx'))
 const names=new Set(['index.html','agent-studio.svg']);for(const item of Object.values(manifest)){assert(item&&typeof item.file==='string');for(const file of [item.file,...(item.css??[]),...(item.assets??[])]){assert(typeof file==='string'&&file.startsWith('assets/'));names.add(file)}}
 let buildBytes=0;for(const name of [...names].sort()){const bytes=name==='index.html'?index:checkedFile(name),type=mime[path.extname(name)];assert(type&&(buildBytes+=bytes.length)<=64*1024*1024);files.set('/'+name,{bytes,type});assets.push({file:name,sha256:sha(bytes),bytes:bytes.length})}
 const observations={native_me_reads:0,run_reads:0,operation_posts:0,held_actual_run_responses:0,legacy_requests:0,forbidden_auth_headers:0,unexpected_api_failures:[],blocked_requests:[],overflow:false},provenance={head:permit.head,manifest_sha256:sha(manifestBytes),index_sha256:sha(index),source_count:reviewed.sources.length,assets}
 let backend,server,agent,closed=false,nextHold=null;const holds=new Set(),flights=new Set(),remember=(key,value)=>{if(observations[key].length>=128)observations.overflow=true;else observations[key].push(value)},reply=(res,status,error)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error}))}
 async function close(){if(closed)return;closed=true;nextHold=null;for(const gate of holds)gate.release();holds.clear();const errors=[],clean=async work=>{try{await work()}catch(error){errors.push(error)}}
  if(server)await clean(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))});agent?.destroy();await clean(async()=>{let timer;try{await Promise.race([Promise.allSettled([...flights]),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('schedule_worker_proxy_drain_timeout')),15000)})])}finally{clearTimeout(timer)}});await clean(async()=>backend?.close());files.clear();await clean(async()=>reviewed.check());if(errors.length)throw new AggregateError(errors,'schedule_worker_browser_fixture_cleanup_failed')
 }
 try{
  backend=await originalScheduleWorkerBackendFixture(env);const upstream=new URL(backend.nativeOrigin),tls=backend.serverTls;assert.equal(upstream.protocol,'https:');assert.equal(upstream.hostname,'localhost');assert(upstream.port);agent=new https.Agent({ca:tls.ca,rejectUnauthorized:true,servername:'localhost',maxSockets:16})
  const hop=new Set(['host','connection','keep-alive','transfer-encoding','upgrade','proxy-authenticate','proxy-authorization','te','trailer'])
  server=https.createServer({...tls,minVersion:'TLSv1.2'},(req,res)=>{
   const rule=originalScheduleWorkerPolicy(req.method,req.url,req.headers.accept),sample={method:req.method,path:rule.pathname}
   if(rule.kind==='legacy_denied'){observations.legacy_requests++;reply(res,501,'original_schedule_worker_legacy_refused');return}
   if(rule.kind==='native'){
    if(['authorization','x-rh-user-id','x-forwarded-user','x-agentstudio-identity'].some(key=>req.headers[key]!==undefined)){observations.forbidden_auth_headers++;reply(res,400,'original_schedule_worker_identity_header_refused');return}
    if(req.method==='GET'&&rule.pathname==='/__pg_native/api/native-auth/me')observations.native_me_reads++
    if(req.method==='GET'&&/^\/__pg_native\/api\/v2\/(?:workflow-v2-runs|agent-autonomous-runs)\//.test(rule.pathname))observations.run_reads++
    if(req.method==='POST'&&rule.pathname==='/__pg_native/api/v2/original-ui/schedules/operations')observations.operation_posts++
    const held=nextHold&&req.method==='GET'&&req.url===nextHold.path?nextHold:null;if(held)nextHold=null
    const headers=Object.fromEntries(Object.entries(req.headers).filter(([key])=>!hop.has(key.toLowerCase())))
    const flight=new Promise(resolve=>{
     let settled=false;const done=()=>{if(!settled){settled=true;resolve()}},proxy=https.request({hostname:'127.0.0.1',port:Number(upstream.port),servername:'localhost',path:req.url.replace(/^\/__pg_native(?=\/|$)/,''),method:req.method,headers,agent,ca:tls.ca,rejectUnauthorized:true,minVersion:'TLSv1.2',signal:AbortSignal.timeout(15000)},response=>{
      const status=response.statusCode??502,outHeaders=Object.fromEntries(Object.entries(response.headers).filter(([key])=>!hop.has(key.toLowerCase()))),chunks=[];let size=0,failed=false
      const fail=()=>{if(failed)return;failed=true;remember('unexpected_api_failures',{...sample,status:502});held?.reject(Error('schedule_worker_held_upstream_failed'));res.destroy();done()}
      if((status<200||status>=300)&&!(rule.pathname==='/__pg_native/api/native-auth/me'&&status===401))remember('unexpected_api_failures',{...sample,status})
      response.on('data',chunk=>{size+=chunk.length;if(size>1048576){response.destroy();fail()}else chunks.push(Buffer.from(chunk))});response.once('error',fail);response.once('aborted',fail)
      response.once('end',()=>{if(failed)return;const actual=Buffer.concat(chunks);const forward=()=>{try{if(!res.destroyed){res.writeHead(status,outHeaders);res.end(actual)}}finally{actual.fill(0);for(const chunk of chunks)chunk.fill(0);done()}}
       if(held){if(status!==200||response.complete!==true){held.reject(Error('schedule_worker_hold_requires_actual_complete200'));forward();return}observations.held_actual_run_responses++;held.enter({actual_status:200});void held.wait.then(()=>{holds.delete(held);forward()});return}forward()
      })
     });proxy.once('error',()=>{remember('unexpected_api_failures',{...sample,status:503});held?.reject(Error('schedule_worker_proxy_unavailable'));if(!res.destroyed){if(res.headersSent)res.destroy();else reply(res,503,'schedule_worker_proxy_unavailable')}done()});req.pipe(proxy)
    });flights.add(flight);void flight.then(()=>flights.delete(flight));return
   }
   if(rule.kind==='spa'||rule.kind==='asset'){const file=files.get(rule.kind==='spa'?'/index.html':rule.pathname);if(file){res.writeHead(200,{'Content-Type':file.type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'"});res.end(req.method==='HEAD'?undefined:file.bytes);return}}
   remember('blocked_requests',sample);reply(res,404,'original_schedule_worker_route_refused')
  })
  server.requestTimeout=30000;server.headersTimeout=15000;await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(17443,'127.0.0.1',resolve)});reviewed.check()
  return{...backend,origin:permit.origin,url:permit.origin+'/login?next=%2Fscheduled-tasks',spki:crypto.createHash('sha256').update(new crypto.X509Certificate(tls.cert).publicKey.export({type:'spki',format:'der'})).digest('base64'),provenance,observations,
   holdNextRunRead(id,mode){assert(!nextHold&&holds.size===0);assert.match(id,/^[a-f0-9-]{36}$/);assert(['agent_native_v2','workflow_native_v2'].includes(mode));let release,enter,reject;const wait=new Promise(resolve=>{release=resolve}),entered=new Promise((resolve,fail)=>{enter=resolve;reject=fail});void entered.catch(()=>{});const gate={path:'/__pg_native/api/v2/'+(mode==='agent_native_v2'?'agent-autonomous-runs':'workflow-v2-runs')+'/'+id,wait,release,enter,reject};holds.add(gate);nextHold=gate;return{entered,release}},close
  }
 }catch(error){try{await close()}catch(cleanup){throw new AggregateError([error,cleanup],'schedule_worker_browser_start_and_cleanup_failed')}throw error}
}
