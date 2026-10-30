import {requireOriginalModelDraftDiscoveryBrowserCi} from './pg-original-model-draft-discovery-browser-guard.mjs'
import {originalModelDraftDiscoveryPath,originalModelDraftDiscoveryPolicy} from './pg-original-model-draft-discovery-browser-policy.mjs'
import {verifyOriginalModelDraftDiscoveryReviewedSources} from './pg-original-model-draft-discovery-reviewed-check.mjs'
// Import-safe. Admission and fixed sources precede PG, TLS and sockets.
export async function startOriginalModelDraftDiscoveryBrowserFixture(env=process.env){
 const permit=requireOriginalModelDraftDiscoveryBrowserCi(env),reviewed=await verifyOriginalModelDraftDiscoveryReviewedSources(env)
 const [{default:assert},fs,path,https,crypto,{originalModelDraftDiscoveryBackendFixture}]=await Promise.all([import('node:assert/strict'),import('node:fs'),import('node:path'),import('node:https'),import('node:crypto'),import('./pg-original-model-draft-discovery-backend-fixture.mjs')])
 const repo=reviewed.repo,checkSources=reviewed.check,sourceHashes=reviewed.sources
  const expectedBuild=path.join(repo,'dist-original-pg')
  if(fs.lstatSync(expectedBuild).isSymbolicLink()||!fs.statSync(expectedBuild).isDirectory()||
    fs.realpathSync(expectedBuild)!==expectedBuild)throw Error('original_model_draft_discovery_build_directory_required')
  const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
    '.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg',
    '.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif','.ico':'image/x-icon',
    '.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf','.wasm':'application/wasm'}
  function checkedFile(relative,max=8*1024*1024){
    if(typeof relative!=='string'||originalModelDraftDiscoveryPath('/'+relative)!=='/'+relative||relative.endsWith('.map'))
      throw Error('original_model_draft_discovery_unsafe_build_file')
    let current=expectedBuild
    for(const segment of relative.split('/')){
      current=path.join(current,segment)
      if(fs.lstatSync(current).isSymbolicLink())throw Error('original_model_draft_discovery_symlink_build_file')
    }
    const resolved=fs.realpathSync(current),stat=fs.statSync(resolved)
    if(!resolved.startsWith(expectedBuild+path.sep)||!stat.isFile()||stat.size>max)
      throw Error('original_model_draft_discovery_unsafe_build_file')
    return fs.readFileSync(resolved)
  }
  const manifestBytes=checkedFile('.vite/manifest.json',1024*1024)
  const manifest=JSON.parse(manifestBytes.toString('utf8'))
  const entry=manifest?.['index.html']
  if(!entry||entry.isEntry!==true||entry.src!=='index.html'||typeof entry.file!=='string')
    throw Error('original_model_draft_discovery_original_index_entry_required')
  const index=checkedFile('index.html',128*1024),html=index.toString('utf8')
  const scripts=[...html.matchAll(/<script\b[^>]*>/gi)].map(item=>item[0])
    .filter(tag=>/\btype=["']module["']/i.test(tag)).map(tag=>tag.match(/\bsrc=["']([^"']+)["']/i)?.[1])
  if(scripts.length!==1||scripts[0]!=='/'+entry.file||html.includes('/src/main.tsx'))
    throw Error('original_model_draft_discovery_built_index_required')
  const fileNames=new Set(['index.html','agent-studio.svg'])
  for(const item of Object.values(manifest)){
    if(!item||typeof item!=='object'||typeof item.file!=='string')throw Error('original_model_draft_discovery_invalid_manifest')
    for(const relative of [item.file,...(item.css??[]),...(item.assets??[])]){
      if(typeof relative!=='string'||!relative.startsWith('assets/'))throw Error('original_model_draft_discovery_invalid_manifest_file')
      fileNames.add(relative)
    }
  }
  const files=new Map(),assetHashes=[];let buildBytes=0
  for(const relative of [...fileNames].sort()){
    const bytes=relative==='index.html'?index:checkedFile(relative)
    const type=mime[path.extname(relative)]
    if(!type||(buildBytes+=bytes.length)>64*1024*1024)throw Error('original_model_draft_discovery_build_resource_bound')
    files.set('/'+relative,{bytes,type});assetHashes.push({file:relative,sha256:sha(bytes),bytes:bytes.length})
  }
  const provenance={scope:'observed actual build files, not an authorization receipt',
    head:env.GITHUB_SHA??null,build_directory:'dist-original-pg',
    source_authority:'fixed original-UI source closure plus actual F01 and optional070-073 auditors; exact committed head and clean source required',
    checked_sources:sourceHashes,manifest_sha256:sha(manifestBytes),index_sha256:sha(index),assets:assetHashes}
 let fixture,server,agent,closed=false,nextHold=null
 const holds=new Set(),observations={legacy_backend_requests:[],unexpected_api_failures:[],blocked_requests:[],forbidden_auth_headers:0,held_deadline_expirations:0,paging_model_read_successes:0,partial_model_fallback_reads:0,controlled_held_cancellations:0,held_actual_responses:0,overflow:false}
 const remember=(key,value)=>{if(observations[key].length<256)observations[key].push(value);else observations.overflow=true}
 const reply=(res,status,code)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:code}))}
 const close=async()=>{if(closed)return;closed=true;for(const gate of holds)gate.release();holds.clear();nextHold=null;const errors=[]
  try{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}}catch(e){errors.push(e)}
  try{agent?.destroy()}catch(e){errors.push(e)}
  try{fixture?.assertNoModelEffects()}catch(e){errors.push(e)}
  try{await fixture?.close()}catch(e){errors.push(e)}
  files.clear();try{checkSources()}catch(e){errors.push(e)}
  if(errors.length)throw new AggregateError(errors,'original_model_draft_discovery_host_cleanup_failed')
 }
 try{
  fixture=await originalModelDraftDiscoveryBackendFixture(env)
  assert.equal(fixture.browserHomeProfile.head,permit.head);assert.equal(fixture.allowedOrigin,permit.origin)
  const upstream=new URL(fixture.nativeOrigin),tls=fixture.serverTls
  assert.equal(upstream.protocol,'https:');assert.equal(upstream.hostname,'localhost');assert(upstream.port&&!upstream.username&&!upstream.password&&upstream.pathname==='/'&&!upstream.search&&!upstream.hash)
  agent=new https.Agent({ca:tls.ca,rejectUnauthorized:true,servername:'localhost',maxSockets:16})
  const hop=new Set(['host','connection','keep-alive','transfer-encoding','upgrade','proxy-authenticate','proxy-authorization','te','trailer'])
  server=https.createServer({...tls,minVersion:'TLSv1.2'},(req,res)=>{
   const rule=originalModelDraftDiscoveryPolicy(req.method,req.url,req.headers.accept),sample={method:req.method,path:rule.pathname}
   if(rule.kind==='legacy_denied'){remember('legacy_backend_requests',{...sample,status:501});reply(res,501,'original_ui_legacy_backend_not_migrated');return}
   if(rule.kind==='native'){
     if(['authorization','x-rh-user-id','x-forwarded-user','x-agentstudio-identity'].some(name=>req.headers[name]!==undefined)){observations.forbidden_auth_headers++;reply(res,400,'original_model_draft_discovery_forbidden_auth_header');return}
    const held=nextHold&&req.method==='POST'&&nextHold.path===rule.pathname?nextHold:null
    if(held)nextHold=null
    const headers=Object.fromEntries(Object.entries(req.headers).filter(([name])=>!hop.has(name.toLowerCase())))
    // Original method/path/query/Cookie/Origin/CSRF/expected-owner are untouched.
    const proxy=https.request({hostname:'127.0.0.1',port:Number(upstream.port),servername:'localhost',path:req.url.replace(/^\/__pg_native(?=\/|$)/,''),method:req.method,headers,agent,ca:tls.ca,rejectUnauthorized:true,minVersion:'TLSv1.2',signal:AbortSignal.timeout(8000)},response=>{
     const status=response.statusCode??502,responseHeaders=Object.fromEntries(Object.entries(response.headers).filter(([name])=>!hop.has(name.toLowerCase())))
     if(status===200&&req.method==='GET'&&rule.pathname==='/__pg_native/api/v2/model-connections'){const q=new URL(req.url,'https://localhost').searchParams,name=q.get('paging')==='owner_cursor_v1'?'paging_model_read_successes':'partial_model_fallback_reads';if(observations[name]>=256)observations.overflow=true;else observations[name]++}
     if(status<200||status>=300){if(!(rule.pathname==='/__pg_native/api/native-auth/me'&&status===401))remember('unexpected_api_failures',{...sample,status})}
     const chunks=[];let size=0,failed=false
     const fail=()=>{if(failed)return;failed=true;remember('unexpected_api_failures',{...sample,status:502});held?.reject(Error('original_model_draft_discovery_held_upstream_failed'));res.destroy()}
     response.on('data',chunk=>{size+=chunk.length;if(size>1048576){fail();response.destroy();return}chunks.push(Buffer.from(chunk))})
     response.once('error',fail);response.once('aborted',fail)
     response.once('end',()=>{
      if(failed)return
      const actual=Buffer.concat(chunks)
      if(held){
       if(status!==200){held.reject(Error('original_model_draft_discovery_hold_requires_actual200'));if(!res.destroyed){res.writeHead(status,responseHeaders);res.end(actual)}return}
       let body;try{body=JSON.parse(actual.toString('utf8'))}catch{fail();return}
       held.entered=true;observations.held_actual_responses++;held.enter({status:200,body})
       let cancelled=false;res.once('close',()=>{if(!res.writableEnded&&!cancelled){cancelled=true;observations.controlled_held_cancellations++}})
       void held.wait.then(()=>{holds.delete(held);if(!res.destroyed){res.writeHead(status,responseHeaders);res.end(actual)}});return
      }
      if(!res.destroyed){res.writeHead(status,responseHeaders);res.end(actual)}
     })
    })
    proxy.once('error',()=>{held?.reject(Error('original_model_draft_discovery_upstream_unavailable'));remember('unexpected_api_failures',{...sample,status:503});if(!res.headersSent&&!res.destroyed)reply(res,503,'original_model_draft_discovery_upstream_unavailable');else res.destroy()})
    req.once('aborted',()=>proxy.destroy());req.pipe(proxy);return
   }
   if(rule.kind==='api_denied'){remember('unexpected_api_failures',{...sample,status:405});reply(res,405,'original_model_draft_discovery_api_not_mapped');return}
   if(rule.kind==='asset'||rule.kind==='spa'){
    const file=files.get(rule.kind==='spa'?'/index.html':rule.pathname)
    if(file){res.writeHead(200,{'content-type':file.type,'content-length':file.bytes.length,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:file.bytes);return}
   }
   remember('blocked_requests',{...sample,status:404});reply(res,404,'original_model_draft_discovery_route_not_served')
  })
  server.requestTimeout=30000;server.headersTimeout=15000;await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(17443,'127.0.0.1',resolve)})
  const cert=new crypto.X509Certificate(tls.cert),spki=crypto.createHash('sha256').update(cert.publicKey.export({type:'spki',format:'der'})).digest('base64')
  checkSources()
  return{...fixture,origin:permit.origin,url:permit.origin+'/login?next=%2Fmodel-connections',spki,provenance,observations,backendProfile:fixture.browserHomeProfile,close,
   holdNextActualDraftReply(){assert(!nextHold&&!closed)
    let resolveRelease,enter,reject,timer;const wait=new Promise(resolve=>{resolveRelease=resolve}),entered=new Promise((yes,no)=>{enter=yes;reject=no});void entered.catch(()=>{})
    const gate={path:'/__pg_native/api/v2/model-connections/draft-probe',wait,release(){clearTimeout(timer);resolveRelease()},enter,reject,entered:false}
    holds.add(gate);nextHold=gate
    timer=setTimeout(()=>{observations.held_deadline_expirations++;if(nextHold===gate)nextHold=null;gate.release()},5500)
    return{async entered(){let deadline;try{return await Promise.race([entered,new Promise((_,no)=>{deadline=setTimeout(()=>no(Error('original_model_draft_actual_hold_timeout')),7000)})])}finally{clearTimeout(deadline)}},release(){if(nextHold===gate)nextHold=null;gate.release()}}
   },
  }
 }catch(error){try{await close()}catch(cleanup){throw new AggregateError([error,cleanup],'original_model_draft_discovery_host_start_and_cleanup_failed')}throw error}
}
