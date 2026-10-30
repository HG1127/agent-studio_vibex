import {requireOriginalLoginBrowserCi,originalLoginPath,originalLoginRequestPolicy} from './pg-original-login-browser-guard.mjs'
import {originalLoginReviewedSources} from './pg-original-login-reviewed-sources.mjs'
import {requireOriginalLoginHome071Ci} from '../../services/pg-api/tests/helpers/original-login-home071-ci-guard.mjs'

// Import is side-effect free. Never call this on the local authoring host.
export async function startOriginalLoginGenuineBrowserFixture(env=process.env){
  const approved=requireOriginalLoginBrowserCi(env) // BEFORE files/PG/TLS/browser.
  const homePermit=requireOriginalLoginHome071Ci(env) // Independent 070/071 purpose before effects.
  const [fs,path,url,https,crypto,genuine,homeBackend]=await Promise.all([
    import('node:fs'),import('node:path'),import('node:url'),import('node:https'),import('node:crypto'),
    import('../../services/pg-api/tests/helpers/agent-design-genuine-fixture.mjs'),
    import('../../services/pg-api/tests/helpers/original-login-home071-genuine-fixture.mjs'),
  ])
  genuine.requireAgentDesignGenuineCi(env)
  const repo=fs.realpathSync(url.fileURLToPath(new URL('../../',import.meta.url)))
  // Fixed authored checkout hashes, not manifest self-attestation or a signer.
  // Original genuine fixture backend pins/auditors still run independently.
  const sourceHashes=[]
  for(const [relative,expected] of Object.entries(originalLoginReviewedSources)){
    if(originalLoginPath('/'+relative)!=='/'+relative||!/^[0-9a-f]{64}$/.test(expected))
      throw Error('original_login_invalid_reviewed_source')
    let filename=repo
    for(const segment of relative.split('/')){
      filename=path.join(filename,segment)
      if(fs.lstatSync(filename).isSymbolicLink())throw Error('original_login_symlink_reviewed_source')
    }
    const real=fs.realpathSync(filename),stat=fs.statSync(real)
    if(!real.startsWith(repo+path.sep)||!stat.isFile()||stat.size>8*1024*1024)
      throw Error('original_login_unsafe_reviewed_source')
    const actual=crypto.createHash('sha256').update(fs.readFileSync(real)).digest('hex')
    if(actual!==expected)throw Error('original_login_reviewed_source_changed:'+relative)
    sourceHashes.push({file:relative,sha256:actual})
  }
  const expectedBuild=path.join(repo,'dist-original-pg')
  if(fs.lstatSync(expectedBuild).isSymbolicLink()||!fs.statSync(expectedBuild).isDirectory()||
    fs.realpathSync(expectedBuild)!==expectedBuild)throw Error('original_login_build_directory_required')
  const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
    '.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg',
    '.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif','.ico':'image/x-icon',
    '.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf','.wasm':'application/wasm'}
  function checkedFile(relative,max=8*1024*1024){
    if(typeof relative!=='string'||originalLoginPath('/'+relative)!=='/'+relative||relative.endsWith('.map'))
      throw Error('original_login_unsafe_build_file')
    let current=expectedBuild
    for(const segment of relative.split('/')){
      current=path.join(current,segment)
      if(fs.lstatSync(current).isSymbolicLink())throw Error('original_login_symlink_build_file')
    }
    const resolved=fs.realpathSync(current),stat=fs.statSync(resolved)
    if(!resolved.startsWith(expectedBuild+path.sep)||!stat.isFile()||stat.size>max)
      throw Error('original_login_unsafe_build_file')
    return fs.readFileSync(resolved)
  }
  const manifestBytes=checkedFile('.vite/manifest.json',1024*1024)
  const manifest=JSON.parse(manifestBytes.toString('utf8'))
  const entry=manifest?.['index.html']
  if(!entry||entry.isEntry!==true||entry.src!=='index.html'||typeof entry.file!=='string')
    throw Error('original_login_original_index_entry_required')
  const index=checkedFile('index.html',128*1024),html=index.toString('utf8')
  const scripts=[...html.matchAll(/<script\b[^>]*>/gi)].map(item=>item[0])
    .filter(tag=>/\btype=["']module["']/i.test(tag)).map(tag=>tag.match(/\bsrc=["']([^"']+)["']/i)?.[1])
  if(scripts.length!==1||scripts[0]!=='/'+entry.file||html.includes('/src/main.tsx'))
    throw Error('original_login_built_index_required')
  const fileNames=new Set(['index.html','agent-studio.svg'])
  for(const item of Object.values(manifest)){
    if(!item||typeof item!=='object'||typeof item.file!=='string')throw Error('original_login_invalid_manifest')
    for(const relative of [item.file,...(item.css??[]),...(item.assets??[])]){
      if(typeof relative!=='string'||!relative.startsWith('assets/'))throw Error('original_login_invalid_manifest_file')
      fileNames.add(relative)
    }
  }
  const files=new Map(),assetHashes=[];let buildBytes=0
  for(const relative of [...fileNames].sort()){
    const bytes=relative==='index.html'?index:checkedFile(relative)
    const type=mime[path.extname(relative)]
    if(!type||(buildBytes+=bytes.length)>64*1024*1024)throw Error('original_login_build_resource_bound')
    files.set('/'+relative,{bytes,type});assetHashes.push({file:relative,sha256:sha(bytes),bytes:bytes.length})
  }
  const provenance={scope:'observed actual build files, not an authorization receipt',
    head:env.GITHUB_SHA??null,build_directory:'dist-original-pg',
    source_authority:'fixed reviewed original source hashes plus unchanged genuine fixture backend pins; Root reseals after any reviewed source change',
    checked_sources:sourceHashes,manifest_sha256:sha(manifestBytes),index_sha256:sha(index),assets:assetHashes}
  let fixture,server,agent,closed=false,meUnavailable=false,logoutUnavailable=false
  const observations={legacy_backend_requests:[],unexpected_api_failures:[],blocked_requests:[],
    auth_http:[],injected_me_disconnects:0,injected_logout_disconnects:0,forbidden_auth_headers:0,overflow:false}
  const remember=(key,value)=>{
    if(observations[key].length<512)observations[key].push(value)
    else observations.overflow=true
  }
  const reply=(res,status,code)=>{
    res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
    res.end(JSON.stringify({error:code}))
  }
  const close=async()=>{
    if(closed)return;closed=true
    const errors=[]
    try{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}}catch(error){errors.push(error)}
    try{agent?.destroy()}catch(error){errors.push(error)}
    try{await fixture?.close()}catch(error){errors.push(error)}
    files.clear()
    if(errors.length)throw new AggregateError(errors,'original_login_fixture_cleanup_failed')
  }
  try{
    fixture=await homeBackend.originalLoginHome071GenuineFixture(env)
    if(fixture.browserHomeProfile?.profile!==homePermit.profile||fixture.browserHomeProfile.head!==homePermit.head)
      throw Error('original_login_home071_profile_mismatch')
    const upstream=new URL(fixture.nativeOrigin)
    if(fixture.allowedOrigin!==approved.origin||upstream.protocol!=='https:'||upstream.hostname!=='localhost'||
      !upstream.port||upstream.username||upstream.password||upstream.pathname!=='/'||upstream.search||upstream.hash)
      throw Error('original_login_native_origin_mismatch')
    const tls=fixture.serverTls
    if(!tls?.ca||!tls.cert||!tls.key)throw Error('original_login_fixture_tls_required')
    agent=new https.Agent({ca:tls.ca,rejectUnauthorized:true,servername:'localhost',maxSockets:8})
    const hop=new Set(['host','connection','keep-alive','transfer-encoding','upgrade','proxy-authenticate','proxy-authorization','te','trailer'])
    server=https.createServer({...tls,minVersion:'TLSv1.2'},(req,res)=>{
      try{
        const policy=originalLoginRequestPolicy(req.method,req.url,req.headers.accept)
        const observation={method:req.method,path:policy.pathname}
        if(policy.kind==='legacy_denied'){
          remember('legacy_backend_requests',{...observation,status:501})
          reply(res,501,'original_ui_legacy_backend_not_migrated');return
        }
        if(policy.kind==='native'){
          if(req.headers.authorization!==undefined||req.headers['x-rh-user-id']!==undefined)
            observations.forbidden_auth_headers++
          const isMe=policy.pathname==='/__pg_native/api/native-auth/me'
          if(isMe&&meUnavailable){observations.injected_me_disconnects++;req.socket.destroy();return}
          if(req.method==='POST'&&policy.pathname==='/__pg_native/api/native-auth/logout'&&logoutUnavailable){
            // Fail before creating an upstream request: no revoke or fake ACK.
            observations.injected_logout_disconnects++;req.socket.destroy();return
          }
          let recorded=false
          const record=status=>{
            if(recorded)return;recorded=true
            if(policy.pathname.startsWith('/__pg_native/api/native-auth/'))remember('auth_http',{...observation,status})
            if(status<200||status>=300){
              if(!(isMe&&status===401))remember('unexpected_api_failures',{...observation,status})
            }
          }
          const headers=Object.fromEntries(Object.entries(req.headers).filter(([name])=>!hop.has(name.toLowerCase())))
          // Origin/Cookie/CSRF headers are preserved, not synthesized or stripped.
          const target=https.request({hostname:'127.0.0.1',port:Number(upstream.port),servername:'localhost',
            path:req.url.replace(/^\/__pg_native(?=\/|$)/,''),method:req.method,headers,agent,
            ca:tls.ca,rejectUnauthorized:true,minVersion:'TLSv1.2',signal:AbortSignal.timeout(8000)},response=>{
            record(response.statusCode??502)
            const responseHeaders=Object.fromEntries(Object.entries(response.headers).filter(([name])=>!hop.has(name.toLowerCase())))
            res.writeHead(response.statusCode??502,responseHeaders)
            const failed=()=>{remember('unexpected_api_failures',{...observation,status:502});res.destroy()}
            response.once('error',failed)
            response.once('aborted',failed)
            response.pipe(res)
          })
          target.once('error',()=>{record(503);if(!res.headersSent&&!res.destroyed)reply(res,503,'original_login_proxy_unavailable');else res.destroy()})
          req.once('aborted',()=>target.destroy())
          req.pipe(target);return
        }
        if(policy.kind==='api_denied'){
          remember('unexpected_api_failures',{...observation,status:405})
          reply(res,405,'original_login_business_write_or_api_denied');return
        }
        if(policy.kind==='asset'||policy.kind==='spa'){
          const file=files.get(policy.kind==='spa'?'/index.html':policy.pathname)
          if(file){res.writeHead(200,{'Content-Type':file.type,'Content-Length':file.bytes.length,
            'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
            res.end(req.method==='HEAD'?undefined:file.bytes);return}
        }
        remember('blocked_requests',{...observation,status:404})
        reply(res,404,'original_login_route_not_served')
      }catch{
        remember('blocked_requests',{method:req.method,path:'/handler-failure',status:500})
        if(!res.headersSent)reply(res,500,'original_login_host_failure');else res.destroy()
      }
    })
    server.requestTimeout=30000;server.headersTimeout=15000
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(17443,'127.0.0.1',resolve)})
    const cert=new crypto.X509Certificate(tls.cert)
    const spki=crypto.createHash('sha256').update(cert.publicKey.export({type:'spki',format:'der'})).digest('base64')
    const probeRevokedCookie=async value=>{
      if(typeof value!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value))throw Error('original_login_invalid_cookie_probe')
      return new Promise((resolve,reject)=>{
        const request=https.request({hostname:'127.0.0.1',port:Number(upstream.port),servername:'localhost',
          path:'/api/native-auth/me',method:'GET',agent,ca:tls.ca,rejectUnauthorized:true,minVersion:'TLSv1.2',
          signal:AbortSignal.timeout(8000),headers:{Origin:approved.origin,Accept:'application/json',Cookie:'__Host-agentstudio_session='+value}},response=>{
          response.resume();response.once('end',()=>resolve(response.statusCode));response.once('error',reject)
        });request.once('error',reject);request.end()
      })
    }
    return {url:approved.origin+'/login',origin:approved.origin,spki,credentials:fixture.credentials,users:fixture.users,
      provenance,backendProfile:fixture.browserHomeProfile,observations,setMeUnavailable:value=>{if(typeof value!=='boolean')throw Error('original_login_invalid_outage_toggle');meUnavailable=value},
      setLogoutUnavailable:value=>{if(typeof value!=='boolean')throw Error('original_login_invalid_outage_toggle');logoutUnavailable=value},
      probeRevokedCookie,counts:()=>fixture.counts(),providerRequests:fixture.providerRequests,
      credentialReads:()=>fixture.credentialReads(),assertNoProviderErrors:()=>fixture.assertNoProviderErrors(),close}
  }catch(error){try{await close()}catch(cleanup){throw new AggregateError([error,cleanup],'original_login_start_and_cleanup_failed')}throw error}
}
