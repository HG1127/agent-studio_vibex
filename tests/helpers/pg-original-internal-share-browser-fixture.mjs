import {requireOriginalInternalShareBrowserCi} from './pg-original-internal-share-browser-guard.mjs'
import {originalInternalSharePath,originalInternalSharePolicy} from './pg-original-internal-share-browser-policy.mjs'
import {originalInternalShareReviewedSources} from './pg-original-internal-share-reviewed-sources.mjs'
// Import-safe. Ordinary hosts must fail before filesystem, PG, TLS or sockets.
export async function startOriginalInternalShareBrowserFixture(env=process.env){
 const permit=requireOriginalInternalShareBrowserCi(env)
 const [{default:assert},fs,path,url,https,crypto,child,{agentInternalShareGenuineFixture}]=await Promise.all([
  import('node:assert/strict'),import('node:fs'),import('node:path'),import('node:url'),import('node:https'),import('node:crypto'),import('node:child_process'),
  import('../../services/pg-api/tests/helpers/agent-internal-share-genuine-fixture.mjs')])
 const repo=fs.realpathSync(url.fileURLToPath(new URL('../../',import.meta.url)))
 const checkout=()=>{assert.equal(child.execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8',maxBuffer:4096}).trim(),permit.head);assert.equal(child.execFileSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:repo,encoding:'utf8',maxBuffer:65536}).trim(),'','original share requires clean exact-head source')}
 const sourceHashes=[]
 const checkSources=()=>{checkout();for(const[relative,expected]of Object.entries(originalInternalShareReviewedSources)){
  assert.equal(originalInternalSharePath('/'+relative),'/'+relative);assert.match(expected,/^[a-f0-9]{64}$/)
  let file=repo;for(const part of relative.split('/')){assert(!fs.lstatSync(file).isSymbolicLink());file=path.join(file,part)}
  const real=fs.realpathSync(file),stat=fs.lstatSync(file);assert(real.startsWith(repo+path.sep)&&stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=8*1024*1024)
  const actual=crypto.createHash('sha256').update(fs.readFileSync(real)).digest('hex');assert.equal(actual,expected,'fixed reviewed original share source changed: '+relative)
 }}
 checkSources();for(const[file,sha256]of Object.entries(originalInternalShareReviewedSources))sourceHashes.push({file,sha256})
  const expectedBuild=path.join(repo,'dist-original-pg')
  if(fs.lstatSync(expectedBuild).isSymbolicLink()||!fs.statSync(expectedBuild).isDirectory()||
    fs.realpathSync(expectedBuild)!==expectedBuild)throw Error('original_internal_share_build_directory_required')
  const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
    '.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg',
    '.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif','.ico':'image/x-icon',
    '.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf','.wasm':'application/wasm'}
  function checkedFile(relative,max=8*1024*1024){
    if(typeof relative!=='string'||originalInternalSharePath('/'+relative)!=='/'+relative||relative.endsWith('.map'))
      throw Error('original_internal_share_unsafe_build_file')
    let current=expectedBuild
    for(const segment of relative.split('/')){
      current=path.join(current,segment)
      if(fs.lstatSync(current).isSymbolicLink())throw Error('original_internal_share_symlink_build_file')
    }
    const resolved=fs.realpathSync(current),stat=fs.statSync(resolved)
    if(!resolved.startsWith(expectedBuild+path.sep)||!stat.isFile()||stat.size>max)
      throw Error('original_internal_share_unsafe_build_file')
    return fs.readFileSync(resolved)
  }
  const manifestBytes=checkedFile('.vite/manifest.json',1024*1024)
  const manifest=JSON.parse(manifestBytes.toString('utf8'))
  const entry=manifest?.['index.html']
  if(!entry||entry.isEntry!==true||entry.src!=='index.html'||typeof entry.file!=='string')
    throw Error('original_internal_share_original_index_entry_required')
  const index=checkedFile('index.html',128*1024),html=index.toString('utf8')
  const scripts=[...html.matchAll(/<script\b[^>]*>/gi)].map(item=>item[0])
    .filter(tag=>/\btype=["']module["']/i.test(tag)).map(tag=>tag.match(/\bsrc=["']([^"']+)["']/i)?.[1])
  if(scripts.length!==1||scripts[0]!=='/'+entry.file||html.includes('/src/main.tsx'))
    throw Error('original_internal_share_built_index_required')
  const fileNames=new Set(['index.html','agent-studio.svg'])
  for(const item of Object.values(manifest)){
    if(!item||typeof item!=='object'||typeof item.file!=='string')throw Error('original_internal_share_invalid_manifest')
    for(const relative of [item.file,...(item.css??[]),...(item.assets??[])]){
      if(typeof relative!=='string'||!relative.startsWith('assets/'))throw Error('original_internal_share_invalid_manifest_file')
      fileNames.add(relative)
    }
  }
  const files=new Map(),assetHashes=[];let buildBytes=0
  for(const relative of [...fileNames].sort()){
    const bytes=relative==='index.html'?index:checkedFile(relative)
    const type=mime[path.extname(relative)]
    if(!type||(buildBytes+=bytes.length)>64*1024*1024)throw Error('original_internal_share_build_resource_bound')
    files.set('/'+relative,{bytes,type});assetHashes.push({file:relative,sha256:sha(bytes),bytes:bytes.length})
  }
  const provenance={scope:'observed actual build files, not an authorization receipt',
    head:env.GITHUB_SHA??null,build_directory:'dist-original-pg',
    source_authority:'fixed reviewed original-page hashes and unchanged F08 backend pins; exact committed head and clean source required',
    checked_sources:sourceHashes,manifest_sha256:sha(manifestBytes),index_sha256:sha(index),assets:assetHashes}
 let fixture,server,agent,closed=false,nextHold=null,nextLoss=null
 const holds=new Set(),observations={legacy_backend_requests:[],unexpected_api_failures:[],blocked_requests:[],write_boundaries:[],forbidden_auth_headers:0,controlled_after_record_disconnects:0,controlled_held_cancellations:0,held_actual_responses:0,overflow:false}
 const remember=(key,value)=>{if(observations[key].length<256)observations[key].push(value);else observations.overflow=true}
 const reply=(res,status,code)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:code}))}
 const close=async()=>{if(closed)return;closed=true;for(const gate of holds)gate.release();holds.clear();nextHold=null
  const errors=[]
  try{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}}catch(error){errors.push(error)}
  try{agent?.destroy()}catch(error){errors.push(error)}
  try{await fixture?.assertNoModelEffects()}catch(error){errors.push(error)}
  try{await fixture?.close()}catch(error){errors.push(error)}
  files.clear();try{checkSources()}catch(error){errors.push(error)}
  if(errors.length)throw new AggregateError(errors,'original_internal_share_owned_cleanup_failed')
 }
 try{
  // Repeats its own unchanged F08 admission and fresh PG18/source/catalog audits.
  fixture=await agentInternalShareGenuineFixture(env,{browserMode:true});observations.native_diagnostics=fixture.mutable.nativeDiagnostics
  const target=(await fixture.db.query("SELECT current_database() AS database,session_user::text AS login,current_setting('server_version_num')::integer AS version,NOT pg_is_in_recovery() AS primary")).rows[0]
  assert.equal(target.database,permit.target.database);assert.equal(target.login,permit.target.user);assert(target.version>=180000&&target.version<190000&&target.primary===true)
  const before=await fixture.counts();for(const key of ['invites','snapshots','receipts','consumptions','audit'])assert.equal(before[key],0,'fresh original F08 service required')
  const identities={alice:await fixture.identityFor('alice'),bob:await fixture.identityFor('bob')}
  const originalBobIds=new Set((await fixture.agents.list(identities.bob,50)).map(v=>v.id))
  const profiles={};for(const who of ['alice','bob']){const response=await fixture.request(who,'/api/native-auth/me');assert.equal(response.status,200);assert.equal(response.body.user.id,fixture.users[who]);profiles[who]=response.body.user}
  const upstream=new URL(fixture.nativeOrigin),tls=fixture.serverTls
  assert.equal(fixture.allowedOrigin,permit.origin);assert.equal(upstream.protocol,'https:');assert.equal(upstream.hostname,'localhost');assert(upstream.port&&!upstream.username&&!upstream.password&&upstream.pathname==='/'&&!upstream.search&&!upstream.hash)
  assert(tls.ca&&tls.cert&&tls.key);agent=new https.Agent({ca:tls.ca,rejectUnauthorized:true,servername:'localhost',maxSockets:16})
  fixture.mutable.afterBusiness=async({operation,input})=>{if(nextLoss&&operation==='record'&&input?.action==='create'){assert.equal(nextLoss.recorded,false);nextLoss.recorded=true}}
  const hop=new Set(['host','connection','keep-alive','transfer-encoding','upgrade','proxy-authenticate','proxy-authorization','te','trailer'])
  server=https.createServer({...tls,minVersion:'TLSv1.2'},(req,res)=>{
   const rule=originalInternalSharePolicy(req.method,req.url,req.headers.accept),sample={method:req.method,path:rule.pathname}
   if(rule.kind==='legacy_denied'){remember('legacy_backend_requests',{...sample,status:501});reply(res,501,'original_ui_legacy_backend_not_migrated');return}
   if(rule.kind==='native'){
    if(req.headers.authorization!==undefined||req.headers['x-rh-user-id']!==undefined)observations.forbidden_auth_headers++
    const selectedHold=nextHold&&nextHold.method===req.method&&nextHold.path===rule.pathname?nextHold:null
    if(selectedHold)nextHold=null
    const selectedLoss=nextLoss&&req.method==='POST'&&rule.pathname==='/__pg_native/api/v2/internal-templates'?nextLoss:null
    let recorded=false,nativeStatus=null
    const observeBoundary=(source,error,consumed=false)=>{if(selectedLoss)try{remember('write_boundaries',originalShareProxyBoundary(source,error,{upstream_status:nativeStatus,after_business_completed:fixture.mutable.completedAfterBusinessCreates===selectedLoss.after_business_before+1,drop_selected:fixture.mutable.dropNext===null,actual_drop_completed:fixture.mutable.actualReplyDrops===selectedLoss.drops_before+1,controlled_drop_consumed:consumed}))}catch{}}
    const record=status=>{if(recorded)return;recorded=true;if(status<200||status>=300){if(!(rule.pathname==='/__pg_native/api/native-auth/me'&&status===401))remember('unexpected_api_failures',{...sample,status})}}
    const headers=Object.fromEntries(Object.entries(req.headers).filter(([name])=>!hop.has(name.toLowerCase())))
    // Preserve original Origin, Cookie and CSRF. No caller identity or DTO rewrite.
    const proxy=https.request({hostname:'127.0.0.1',port:Number(upstream.port),servername:'localhost',path:req.url.replace(/^\/__pg_native(?=\/|$)/,''),method:req.method,headers,agent,ca:tls.ca,rejectUnauthorized:true,minVersion:'TLSv1.2',signal:AbortSignal.timeout(8000)},response=>{
     nativeStatus=response.statusCode??502;record(nativeStatus);observeBoundary('native_http_response',null)
     const responseHeaders=Object.fromEntries(Object.entries(response.headers).filter(([name])=>!hop.has(name.toLowerCase())))
     if(!selectedHold){res.writeHead(response.statusCode??502,responseHeaders);response.pipe(res);response.once('error',()=>{remember('unexpected_api_failures',{...sample,status:502});res.destroy()});return}
     const chunks=[];let size=0
     response.on('data',chunk=>{size+=chunk.length;if(size>1048576){remember('unexpected_api_failures',{...sample,status:502});response.destroy();return}chunks.push(Buffer.from(chunk))})
     const heldFailure=()=>{remember('unexpected_api_failures',{...sample,status:502});selectedHold.reject(Error('original_share_held_upstream_failed'));res.destroy()}
     response.once('error',heldFailure);response.once('aborted',heldFailure)
     response.once('end',()=>{
      if(response.statusCode!==200){selectedHold.reject(Error('original_share_hold_requires_actual200'));res.writeHead(response.statusCode??502,responseHeaders);res.end(Buffer.concat(chunks));return}
      selectedHold.entered=true;observations.held_actual_responses++;selectedHold.enter({status:200})
      let cancelled=false
      res.once('close',()=>{if(!res.writableEnded&&!cancelled){cancelled=true;observations.controlled_held_cancellations++}})
      void selectedHold.wait.then(()=>{holds.delete(selectedHold);if(!res.destroyed){res.writeHead(200,responseHeaders);res.end(Buffer.concat(chunks))}})
     });return
    })
    proxy.once('error',error=>{
     if(selectedLoss&&selectedLoss.recorded&&fixture.mutable.completedAfterBusinessCreates===selectedLoss.after_business_before+1&&fixture.mutable.dropNext===null&&nextLoss===selectedLoss&&fixture.mutable.actualReplyDrops===selectedLoss.drops_before+1&&(nativeStatus===null||nativeStatus===200)&&originalShareProxyErrorCode(error)==='ECONNRESET'){nextLoss=null;observations.controlled_after_record_disconnects++;observeBoundary('proxy_transport_error',error,true);req.socket.destroy();return}
     observeBoundary('proxy_transport_error',error);if(recorded&&nativeStatus>=200&&nativeStatus<300)remember('unexpected_api_failures',{...sample,status:503});record(503);if(!res.headersSent&&!res.destroyed)reply(res,503,'original_internal_share_proxy_unavailable');else res.destroy()
    })
    req.once('aborted',()=>proxy.destroy());req.pipe(proxy);return
   }
   if(rule.kind==='api_denied'){remember('unexpected_api_failures',{...sample,status:405});reply(res,405,'original_internal_share_api_not_mapped');return}
   if(rule.kind==='asset'||rule.kind==='spa'){
    const file=files.get(rule.kind==='spa'?'/index.html':rule.pathname)
    if(file){res.writeHead(200,{'content-type':file.type,'content-length':file.bytes.length,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:file.bytes);return}
   }
   remember('blocked_requests',{...sample,status:404});reply(res,404,'original_internal_share_route_not_served')
  })
  server.requestTimeout=30000;server.headersTimeout=15000
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(17443,'127.0.0.1',resolve)})
  const cert=new crypto.X509Certificate(tls.cert),spki=crypto.createHash('sha256').update(cert.publicKey.export({type:'spki',format:'der'})).digest('base64')
  checkSources()
  return{origin:permit.origin,url:permit.origin+'/login?next=%2Finternal-templates',spki,credentials:fixture.credentials,users:fixture.users,profiles,provenance,observations,
   backendProfile:Object.freeze({profile:'fresh-original-F08',head:permit.head,source_and_catalog_audited_by_original_F08:true,original_page_acceptance:false,full_Native_process_entry_verified:false,production_GO:false}),
   sourceSpecId:who=>fixture.resources[who].spec.id,
   async sourceGoal(who){const row=await fixture.agents.get(identities[who],fixture.resources[who].spec.id);assert(row);return row.spec.goal},
   counts:()=>fixture.counts(),assertNoModelEffects:()=>fixture.assertNoModelEffects(),
   async assertExpectedEmployeeRefused(code){const {assertOriginalShareExpectedEmployeeRefused}=await import('../../services/pg-api/tests/helpers/original-internal-share-expected-employee-case.mjs');return assertOriginalShareExpectedEmployeeRefused(fixture,code)},
   holdNextResponse(method,path){assert(!nextHold&&!closed&&['GET','POST'].includes(method)&&path==='/__pg_native/api/v2/internal-templates')
    let release,enter,reject;const wait=new Promise(resolve=>{release=resolve}),entered=new Promise((yes,no)=>{enter=yes;reject=no});void entered.catch(()=>{})
    const gate={method,path,wait,release,enter,reject,entered:false};nextHold=gate;holds.add(gate)
    return{async entered(){let timer;try{return await Promise.race([entered,new Promise((_,no)=>{timer=setTimeout(()=>no(Error('original_share_actual_response_hold_timeout')),20000)})])}finally{clearTimeout(timer)}},release(){if(nextHold===gate)nextHold=null;gate.release()}}
   },
   dropNextActualCreateReply(){assert(!nextLoss&&!closed);nextLoss={recorded:false,after_business_before:fixture.mutable.completedAfterBusinessCreates,drops_before:fixture.mutable.actualReplyDrops};fixture.mutable.dropNext={method:'POST',path:'/api/v2/internal-templates',action:'create'}},
   async assertForeignOwnerRefused(){const before=await fixture.counts(),response=await fixture.request('bob','/api/v2/internal-templates',{action:'preview',id:fixture.resources.alice.spec.id});assert([403,404].includes(response.status));const after=await fixture.counts();for(const key of ['invites','snapshots','receipts','consumptions','agents'])assert.equal(after[key],before[key]);return{status:response.status,actual_Cookie_owner_check:true}},
   async assertRecipientOwnsUnboundCopy(){const rows=await fixture.agents.list(identities.bob,50),copies=rows.filter(v=>!originalBobIds.has(v.id));assert.equal(copies.length,1);const actual=await fixture.agents.get(identities.bob,copies[0].id);assert(actual);assert.equal(await fixture.agents.get(identities.alice,copies[0].id),null);assert.deepEqual(actual.spec.knowledge_base_ids??[],[]);assert(!actual.spec.model_binding);assert.deepEqual(actual.spec.http_tools??[],[]);assert.deepEqual(actual.spec.mcp_tools??[],[]);assert.equal(actual.spec.require_approval,true);return{actual_owner_repository_verified:true,copy_count:1,resource_bindings_absent:true}},
   close}
 }catch(error){try{await close()}catch(cleanup){throw new AggregateError([error,cleanup],'original_internal_share_start_and_cleanup_failed')}throw error}
}

// Observation-only closed data; never inspect message, stack, cause or payload.
export function originalShareProxyErrorCode(error){
 try{const code=Object.getOwnPropertyDescriptor(error??{},'code')?.value;return typeof code==='string'&&['ABORT_ERR','ECONNRESET','ECONNREFUSED','ETIMEDOUT','EPIPE','EHOSTUNREACH','ENETUNREACH','ENOTFOUND','EAI_AGAIN','ERR_SOCKET_CLOSED','ERR_STREAM_PREMATURE_CLOSE'].includes(code)?code:null}catch{return null}
}
export function originalShareProxyBoundary(source,error,state={}){
 if(source!=='native_http_response'&&source!=='proxy_transport_error')return null
 const own=key=>{try{return Object.getOwnPropertyDescriptor(state,key)?.value}catch{return undefined}},status=own('upstream_status')
 return Object.freeze({source,node_error_code:source==='proxy_transport_error'?originalShareProxyErrorCode(error):null,upstream_status:Number.isInteger(status)&&status>=100&&status<=599?status:null,after_business_completed:own('after_business_completed')===true,drop_selected:own('drop_selected')===true,actual_drop_completed:own('actual_drop_completed')===true,controlled_drop_consumed:own('controlled_drop_consumed')===true})
}
