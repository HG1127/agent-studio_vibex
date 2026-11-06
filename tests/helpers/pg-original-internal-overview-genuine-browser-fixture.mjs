import {requireOriginalOverviewBrowserCi,originalOverviewRequestPolicy,originalOverviewPath} from './pg-original-internal-overview-browser-guard.mjs'
import {originalLoginPath} from './pg-original-login-browser-guard.mjs'
import {originalOverviewReviewedSources} from './pg-original-internal-overview-reviewed-sources.mjs'
// Hosted-only source; the independent purpose and original071 guard run first.
export async function startOriginalOverviewGenuineBrowserFixture(env=process.env){
  const permit=requireOriginalOverviewBrowserCi(env)
  const [fs,path,url,https,crypto,genuine,backend]=await Promise.all([import('node:fs'),import('node:path'),import('node:url'),import('node:https'),import('node:crypto'),import('../../services/pg-api/tests/helpers/agent-design-genuine-fixture.mjs'),import('./pg-original-internal-overview-backend-fixture.mjs')])
  genuine.requireAgentDesignGenuineCi(env)
  const repo=fs.realpathSync(url.fileURLToPath(new URL('../../',import.meta.url)))
  // Fixed authored checkout hashes, not manifest self-attestation or a signer.
  // Original genuine fixture backend pins/auditors still run independently.
  const sourceHashes=[]
  for(const [relative,expected] of Object.entries(originalOverviewReviewedSources)){
    if(originalLoginPath('/'+relative)!=='/'+relative||!/^[0-9a-f]{64}$/.test(expected))
      throw Error('original_overview_invalid_reviewed_source')
    let filename=repo
    for(const segment of relative.split('/')){
      filename=path.join(filename,segment)
      if(fs.lstatSync(filename).isSymbolicLink())throw Error('original_overview_symlink_reviewed_source')
    }
    const real=fs.realpathSync(filename),stat=fs.statSync(real)
    if(!real.startsWith(repo+path.sep)||!stat.isFile()||stat.size>8*1024*1024)
      throw Error('original_overview_unsafe_reviewed_source')
    const actual=crypto.createHash('sha256').update(fs.readFileSync(real)).digest('hex')
    if(actual!==expected)throw Error('original_overview_reviewed_source_changed:'+relative)
    sourceHashes.push({file:relative,sha256:actual})
  }
  const expectedBuild=path.join(repo,'dist-original-pg')
  if(fs.lstatSync(expectedBuild).isSymbolicLink()||!fs.statSync(expectedBuild).isDirectory()||
    fs.realpathSync(expectedBuild)!==expectedBuild)throw Error('original_overview_build_directory_required')
  const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
    '.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg',
    '.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif','.ico':'image/x-icon',
    '.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf','.wasm':'application/wasm'}
  function checkedFile(relative,max=8*1024*1024){
    if(typeof relative!=='string'||originalLoginPath('/'+relative)!=='/'+relative||relative.endsWith('.map'))
      throw Error('original_overview_unsafe_build_file')
    let current=expectedBuild
    for(const segment of relative.split('/')){
      current=path.join(current,segment)
      if(fs.lstatSync(current).isSymbolicLink())throw Error('original_overview_symlink_build_file')
    }
    const resolved=fs.realpathSync(current),stat=fs.statSync(resolved)
    if(!resolved.startsWith(expectedBuild+path.sep)||!stat.isFile()||stat.size>max)
      throw Error('original_overview_unsafe_build_file')
    return fs.readFileSync(resolved)
  }
  const manifestBytes=checkedFile('.vite/manifest.json',1024*1024)
  const manifest=JSON.parse(manifestBytes.toString('utf8'))
  const entry=manifest?.['index.html']
  if(!entry||entry.isEntry!==true||entry.src!=='index.html'||typeof entry.file!=='string')
    throw Error('original_overview_original_index_entry_required')
  const index=checkedFile('index.html',128*1024),html=index.toString('utf8')
  const scripts=[...html.matchAll(/<script\b[^>]*>/gi)].map(item=>item[0])
    .filter(tag=>/\btype=["']module["']/i.test(tag)).map(tag=>tag.match(/\bsrc=["']([^"']+)["']/i)?.[1])
  if(scripts.length!==1||scripts[0]!=='/'+entry.file||html.includes('/src/main.tsx'))
    throw Error('original_overview_built_index_required')
  const fileNames=new Set(['index.html','agent-studio.svg'])
  for(const item of Object.values(manifest)){
    if(!item||typeof item!=='object'||typeof item.file!=='string')throw Error('original_overview_invalid_manifest')
    for(const relative of [item.file,...(item.css??[]),...(item.assets??[])]){
      if(typeof relative!=='string'||!relative.startsWith('assets/'))throw Error('original_overview_invalid_manifest_file')
      fileNames.add(relative)
    }
  }
  const files=new Map(),assetHashes=[];let buildBytes=0
  for(const relative of [...fileNames].sort()){
    const bytes=relative==='index.html'?index:checkedFile(relative)
    const type=mime[path.extname(relative)]
    if(!type||(buildBytes+=bytes.length)>64*1024*1024)throw Error('original_overview_build_resource_bound')
    files.set('/'+relative,{bytes,type});assetHashes.push({file:relative,sha256:sha(bytes),bytes:bytes.length})
  }
  const provenance={scope:'observed actual build files, not an authorization receipt',
    head:env.GITHUB_SHA??null,build_directory:'dist-original-pg',
    source_authority:'fixed reviewed original source hashes plus unchanged genuine fixture backend pins; Root reseals after any reviewed source change',
    checked_sources:sourceHashes,manifest_sha256:sha(manifestBytes),index_sha256:sha(index),assets:assetHashes}
  let fixture,server,agent,closed=false,hold=null,expectedStatus=null
  const observations={legacy_backend_requests:[],unexpected_api_failures:[],blocked_requests:[],auth_http:[],personal_http:[],expected_failures:[],forbidden_auth_headers:0,held_reply_received:0,held_reply_released:0,held_reply_client_closed:0,held_reply_timed_out:0,overflow:false}
  const remember=(key,value)=>{if(observations[key].length<512)observations[key].push(value);else observations.overflow=true}
  const reply=(res,status,code)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify({error:code}))}
  const close=async()=>{
    if(closed)return;closed=true
    const errors=[]
    try{hold?.release()}catch(error){errors.push(error)}
    try{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}}catch(error){errors.push(error)}
    try{agent?.destroy()}catch(error){errors.push(error)}
    try{await fixture?.close()}catch(error){errors.push(error)}
    files.clear()
    if(errors.length)throw new AggregateError(errors,'original_overview_fixture_cleanup_failed')
  }
  try{
    fixture=await backend.originalOverviewBackendFixture(env)
    const actual=fixture.browserOverviewProfile
    if(actual?.format!=='agentstudio.original-personal-overview.fixture.v1'||actual.profile!==permit.profile||actual.story!==permit.story||actual.head!==permit.head||actual.company_CT03_used!==false||actual.seeded_personal_rows!==true||actual.predecessor?.profile!=='original-login-home071'||actual.predecessor.optional070_verified!==true||actual.predecessor.optional071_verified!==true||actual.predecessor.own_operations_schema_verified!==true||actual.predecessor.monitor073_installed!==false)throw Error('original_overview_actual_predecessor_required')
    const upstream=new URL(fixture.nativeOrigin),tls=fixture.serverTls
    if(fixture.allowedOrigin!==permit.origin||upstream.protocol!=='https:'||upstream.hostname!=='localhost'||!upstream.port||upstream.username||upstream.password||upstream.pathname!=='/'||upstream.search||upstream.hash||!tls?.ca||!tls.cert||!tls.key)throw Error('original_overview_actual_native_tls_required')
    agent=new https.Agent({ca:tls.ca,rejectUnauthorized:true,servername:'localhost',maxSockets:8})
    const hop=new Set(['host','connection','keep-alive','transfer-encoding','upgrade','proxy-authenticate','proxy-authorization','te','trailer'])
    server=https.createServer({...tls,minVersion:'TLSv1.2'},(req,res)=>{
      try{
        const policy=originalOverviewRequestPolicy(req.method,req.url,req.headers.accept),personal=policy.pathname===originalOverviewPath
        const expected=req.headers['x-agentstudio-expected-employee'],employee=expected===fixture.users.alice?'alice':expected===fixture.users.bob?'bob':'unknown'
        const observation={method:req.method,path:policy.pathname,...(personal?{expected_employee:employee}:{})}
        if(policy.kind==='legacy_denied'){remember('legacy_backend_requests',{...observation,status:501});reply(res,501,'original_ui_legacy_backend_not_migrated');return}
        if(policy.kind==='native'){
          if(['authorization','x-rh-user-id','x-forwarded-user','x-agentstudio-identity'].some(k=>req.headers[k]!==undefined))observations.forbidden_auth_headers++
          const selectedHold=personal&&hold&&!hold.claimed&&employee===hold.employee?hold:null
          if(selectedHold)selectedHold.claimed=true
          let recorded=false,upstreamEnded=false
          const record=(status,actualUpstream=false,dependencyBodyValid=false)=>{
            if(recorded)return;recorded=true
            if(personal)remember('personal_http',{...observation,status})
            if(policy.pathname.startsWith('/__pg_native/api/native-auth/'))remember('auth_http',{...observation,status})
            if(status<200||status>=300){
              const matched=actualUpstream&&personal&&expectedStatus?.status===status&&expectedStatus.employee===employee&&(status!==503||dependencyBodyValid===true)
              if(matched){remember('expected_failures',{...observation,status,actual_upstream_response:actualUpstream,...(status===503?{body_contract_valid:dependencyBodyValid}:{})});expectedStatus=null}
              else if(!(policy.pathname==='/__pg_native/api/native-auth/me'&&status===401))remember('unexpected_api_failures',{...observation,status})
            }
          }
          const headers=Object.fromEntries(Object.entries(req.headers).filter(([name])=>!hop.has(name.toLowerCase())))
          // Preserve real Cookie, Origin, CSRF and expected-employee headers.
          const target=https.request({hostname:'127.0.0.1',port:Number(upstream.port),servername:'localhost',path:req.url.replace(/^\/__pg_native(?=\/|$)/,''),method:req.method,headers,agent,ca:tls.ca,rejectUnauthorized:true,minVersion:'TLSv1.2',signal:AbortSignal.timeout(8000)},response=>{
            const status=response.statusCode??502,dependencyResponse=personal&&status===503&&expectedStatus?.status===503&&expectedStatus.employee===employee
            const responseHeaders=Object.fromEntries(Object.entries(response.headers).filter(([name])=>!hop.has(name.toLowerCase())))
            const failed=()=>{remember('unexpected_api_failures',{...observation,status:502});res.destroy()}
            if(dependencyResponse){pipeOriginalOverviewDependencyError(response,res,status,responseHeaders,valid=>{upstreamEnded=true;record(status,true,valid)},()=>{record(status,true,false);failed()});return}
            record(status,true)
            response.once('error',failed);response.once('aborted',failed)
            if(!selectedHold){res.writeHead(status,responseHeaders);response.once('end',()=>{upstreamEnded=true});response.pipe(res);return}
            const chunks=[];let size=0
            response.on('data',chunk=>{size+=chunk.length;if(size>131072){response.destroy();return}chunks.push(Buffer.from(chunk))})
            response.once('end',()=>{
              upstreamEnded=true
              const bytes=Buffer.concat(chunks)
              try{if(status!==200||JSON.parse(bytes.toString('utf8')).employee_id!==fixture.users[selectedHold.employee])throw Error('actual_owner_required')}catch{bytes.fill(0);failed();selectedHold.reject(Error('original_overview_held_real_owner_response_required'));return}
              observations.held_reply_received++
              selectedHold.send=()=>{if(!res.destroyed){res.writeHead(status,responseHeaders);res.end(bytes,()=>bytes.fill(0))}else bytes.fill(0)}
              selectedHold.resolve(Object.freeze({status,employee:selectedHold.employee,actual_upstream_response:true}))
              if(selectedHold.released)selectedHold.send()
            })
          })
          target.once('error',()=>{if(selectedHold&&selectedHold.clientClosed&&upstreamEnded)return;record(503);if(!res.headersSent&&!res.destroyed)reply(res,503,'original_overview_proxy_unavailable');else res.destroy()})
          res.once('close',()=>{if(selectedHold&&!selectedHold.released&&!res.writableFinished){selectedHold.clientClosed=true;observations.held_reply_client_closed++}if(!upstreamEnded)target.destroy()})
          req.once('aborted',()=>target.destroy());req.pipe(target);return
        }
        if(policy.kind==='api_denied'){remember('unexpected_api_failures',{...observation,status:405});reply(res,405,'original_overview_api_denied');return}
        if(policy.kind==='asset'||policy.kind==='spa'){
          const file=files.get(policy.kind==='spa'?'/index.html':policy.pathname)
          if(file){res.writeHead(200,{'Content-Type':file.type,'Content-Length':file.bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:file.bytes);return}
        }
        remember('blocked_requests',{...observation,status:404});reply(res,404,'original_overview_route_not_served')
      }catch{remember('blocked_requests',{method:req.method,path:'/handler-failure',status:500});if(!res.headersSent)reply(res,500,'original_overview_host_failure');else res.destroy()}
    })
    server.requestTimeout=30000;server.headersTimeout=15000
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(17443,'127.0.0.1',resolve)})
    const cert=new crypto.X509Certificate(tls.cert),spki=crypto.createHash('sha256').update(cert.publicKey.export({type:'spki',format:'der'})).digest('base64')
    const holdNextAliceReply=()=>{
      if(hold)throw Error('original_overview_single_hold_only')
      let resolve,reject,timer
      const received=new Promise((yes,no)=>{resolve=yes;reject=no})
      // Hold only the completed real upstream bytes; never fake/alter a DTO,
      // status, request identity or Pool. Native forwarding remains bounded8s.
      hold={employee:'alice',claimed:false,released:false,clientClosed:false,resolve,reject,send:null,release(){if(this.released)return;this.released=true;clearTimeout(timer);observations.held_reply_released++;this.send?.()}}
      timer=setTimeout(()=>{observations.held_reply_timed_out++;hold.release();reject(Error('original_overview_held_reply_deadline'))},6000)
      return Object.freeze({received,release:()=>hold.release()})
    }
    const expectNextStatus=(status,employee)=>{if(expectedStatus||![409,503].includes(status)||!['alice','bob'].includes(employee))throw Error('original_overview_expected_status_scope');expectedStatus={status,employee}}
    return {origin:permit.origin,url:permit.origin+'/login?next=%2Finternal-overview',spki,credentials:fixture.credentials,users:fixture.users,expected:fixture.expected,ownerRuns:fixture.ownerRuns,ownerSchedules:fixture.ownerSchedules,privateSentinel:fixture.privateSentinel,
      provenance,backendProfile:actual,observations,holdNextAliceReply,expectNextStatus,pendingExpectedStatus:()=>expectedStatus!==null,
      setDependencyAvailable:fixture.setDependencyAvailable,businessSnapshot:fixture.businessSnapshot,assertRestored:fixture.assertRestored,counts:fixture.counts,providerRequests:fixture.providerRequests,credentialReads:fixture.credentialReads,assertNoProviderErrors:fixture.assertNoProviderErrors,close}
  }catch(error){try{await close()}catch(cleanup){throw new AggregateError([error,cleanup],'original_overview_host_start_cleanup_failed')}throw error}
}

// The current fixed Native writer uses JSON.stringify on this exact error.
// Match the actual bounded canonical bytes, never a CDP-cached response body.
export function originalOverviewDependencyBodyMatches(bytes){return Buffer.isBuffer(bytes)&&bytes.length<=4096&&bytes.equals(Buffer.from('{"error":"original_internal_overview_unavailable"}','utf8'))}
export function pipeOriginalOverviewDependencyError(response,res,status,responseHeaders,observe,failed){
 let size=0,done=false;const chunks=[]
 const fail=()=>{if(done)return;done=true;for(const b of chunks)b.fill(0);failed()}
 response.on('data',chunk=>{if(done)return;size+=chunk.length;if(size>4096){fail();response.destroy();return}chunks.push(Buffer.from(chunk))})
 response.once('error',fail);response.once('aborted',fail)
 response.once('end',()=>{if(done)return;done=true;const bytes=Buffer.concat(chunks);for(const b of chunks)b.fill(0);const valid=originalOverviewDependencyBodyMatches(bytes);observe(valid);if(!res.destroyed){res.writeHead(status,responseHeaders);res.end(bytes,()=>bytes.fill(0))}else bytes.fill(0)})
}
