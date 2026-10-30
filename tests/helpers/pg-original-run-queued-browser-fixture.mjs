import {requireOriginalRunQueuedBrowserCi} from './pg-original-run-queued-browser-guard.mjs'
import {originalRunQueuedPath,originalRunQueuedBrowserPolicy} from './pg-original-run-queued-browser-policy.mjs'
import {verifyOriginalRunQueuedReviewedSources} from './pg-original-run-queued-reviewed-check.mjs'
import {originalQueuedNegativeReads} from './pg-original-run-queued-negative-reads.mjs'
// Import-safe. Admission and fixed sources precede PG, TLS and sockets.
export async function startOriginalRunQueuedBrowserFixture(env=process.env){
 const permit=requireOriginalRunQueuedBrowserCi(env),reviewed=await verifyOriginalRunQueuedReviewedSources(env)
 const [{default:assert},fs,path,https,crypto,{originalRunQueuedBackendFixture}]=await Promise.all([import('node:assert/strict'),import('node:fs'),import('node:path'),import('node:https'),import('node:crypto'),import('./pg-original-run-queued-backend-fixture.mjs')])
 const repo=reviewed.repo,checkSources=reviewed.check,sourceHashes=reviewed.sources
  const expectedBuild=path.join(repo,'dist-original-pg')
  if(fs.lstatSync(expectedBuild).isSymbolicLink()||!fs.statSync(expectedBuild).isDirectory()||
    fs.realpathSync(expectedBuild)!==expectedBuild)throw Error('original_run_queued_build_directory_required')
  const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
    '.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg',
    '.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif','.ico':'image/x-icon',
    '.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf','.wasm':'application/wasm'}
  function checkedFile(relative,max=8*1024*1024){
    if(typeof relative!=='string'||originalRunQueuedPath('/'+relative)!=='/'+relative||relative.endsWith('.map'))
      throw Error('original_run_queued_unsafe_build_file')
    let current=expectedBuild
    for(const segment of relative.split('/')){
      current=path.join(current,segment)
      if(fs.lstatSync(current).isSymbolicLink())throw Error('original_run_queued_symlink_build_file')
    }
    const resolved=fs.realpathSync(current),stat=fs.statSync(resolved)
    if(!resolved.startsWith(expectedBuild+path.sep)||!stat.isFile()||stat.size>max)
      throw Error('original_run_queued_unsafe_build_file')
    return fs.readFileSync(resolved)
  }
  const manifestBytes=checkedFile('.vite/manifest.json',1024*1024)
  const manifest=JSON.parse(manifestBytes.toString('utf8'))
  const entry=manifest?.['index.html']
  if(!entry||entry.isEntry!==true||entry.src!=='index.html'||typeof entry.file!=='string')
    throw Error('original_run_queued_original_index_entry_required')
  const index=checkedFile('index.html',128*1024),html=index.toString('utf8')
  const scripts=[...html.matchAll(/<script\b[^>]*>/gi)].map(item=>item[0])
    .filter(tag=>/\btype=["']module["']/i.test(tag)).map(tag=>tag.match(/\bsrc=["']([^"']+)["']/i)?.[1])
  if(scripts.length!==1||scripts[0]!=='/'+entry.file||html.includes('/src/main.tsx'))
    throw Error('original_run_queued_built_index_required')
  const fileNames=new Set(['index.html','agent-studio.svg'])
  for(const item of Object.values(manifest)){
    if(!item||typeof item!=='object'||typeof item.file!=='string')throw Error('original_run_queued_invalid_manifest')
    for(const relative of [item.file,...(item.css??[]),...(item.assets??[])]){
      if(typeof relative!=='string'||!relative.startsWith('assets/'))throw Error('original_run_queued_invalid_manifest_file')
      fileNames.add(relative)
    }
  }
  const files=new Map(),assetHashes=[];let buildBytes=0
  for(const relative of [...fileNames].sort()){
    const bytes=relative==='index.html'?index:checkedFile(relative)
    const type=mime[path.extname(relative)]
    if(!type||(buildBytes+=bytes.length)>64*1024*1024)throw Error('original_run_queued_build_resource_bound')
    files.set('/'+relative,{bytes,type});assetHashes.push({file:relative,sha256:sha(bytes),bytes:bytes.length})
  }
  const provenance={scope:'observed actual build files, not an authorization receipt',
    head:env.GITHUB_SHA??null,build_directory:'dist-original-pg',
    source_authority:'fixed original-UI source closure plus actual F01 and optional070-073 auditors; exact committed head and clean source required',
    checked_sources:sourceHashes,manifest_sha256:sha(manifestBytes),index_sha256:sha(index),assets:assetHashes}
 let fixture,server,agent,closed=false,nextIdentityDrop=false,nextIdentityHold=null,nextReplyDrop=null,nextStaged=null,feedback403=null,signedOutAllowance=0,negativeReads
 const gates=new Set(),flights=new Set(),pauseStages=new Map()
 const observations={legacy_backend_requests:[],unexpected_api_failures:[],blocked_requests:[],forbidden_auth_headers:0,overflow:false,paging_requests:0,paging_complete_responses:0,partial_model_reads:0,controlled_identity_drops:0,controlled_reply_drops:0,controlled_staged_requests:0,controlled_client_timeouts:0,controlled_feedback403:0,actual_signed_out401:0,expected_not_found:[],negative_control_confirmations:0,positive_control_confirmations:0,gate_deadline_failures:0,control_posts:[],confirmation_posts:[],feedback_posts:[],submission_posts:[]}
 const remember=(key,value)=>{if(observations[key].length<256)observations[key].push(value);else observations.overflow=true}
 const reply=(res,status,code)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:code}))}
 const count=key=>{if(observations[key]>=256)observations.overflow=true;else observations[key]++}
 const gate=(label,maxMs)=>{let enter,reject,release,doneResolve,doneReject,timer;const entered=new Promise((yes,no)=>{enter=yes;reject=no}),wait=new Promise(yes=>release=yes),done=new Promise((yes,no)=>{doneResolve=yes;doneReject=no});void entered.catch(()=>{});void done.catch(()=>{});const g={label,entered,wait,done,request:null,enter,fail(error){g.pause?.abort();reject(error);doneReject(error)},finish:doneResolve,release(){clearTimeout(timer);release()}};timer=setTimeout(()=>{count('gate_deadline_failures');g.fail(Error('original_run_queued_gate_deadline'));g.release()},maxMs);gates.add(g);return g}
 const collect=async req=>{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>131072)throw Error('original_queued_body_bound');chunks.push(Buffer.from(chunk))}return Buffer.concat(chunks)}
 const close=async()=>{if(closed)return;closed=true;for(const g of gates){g.pause?.abort();g.release()}nextIdentityHold=null;nextStaged=null;nextReplyDrop=null;const errors=[]
  try{await Promise.all([...flights])}catch(e){errors.push(e)}
  try{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}}catch(e){errors.push(e)}
  try{agent?.destroy()}catch(e){errors.push(e)}
  try{if(fixture)await fixture.assertZeroExecution()}catch(e){errors.push(e)}
  try{await fixture?.close()}catch(e){errors.push(e)}
  try{negativeReads?.assertEmpty();assert.equal(nextIdentityDrop,false,'unconsumed identity loss');assert.equal(feedback403,null,'unconsumed actual feedback revocation')}catch(e){errors.push(e)}
  files.clear();gates.clear();try{checkSources()}catch(e){errors.push(e)}
  if(errors.length)throw new AggregateError(errors,'original_run_queued_host_cleanup_failed')
 }
 try{
  fixture=await originalRunQueuedBackendFixture(env)
  negativeReads=originalQueuedNegativeReads(Object.values(fixture.owned).flatMap(owner=>Object.values(owner.runs).map(value=>value.run.id)))
  assert.equal(fixture.backendProfile.head,permit.head);assert.equal(fixture.allowedOrigin,permit.origin)
  const upstream=new URL(fixture.nativeOrigin),tls=fixture.serverTls
  assert.equal(upstream.protocol,'https:');assert.equal(upstream.hostname,'localhost');assert(upstream.port&&!upstream.username&&!upstream.password&&upstream.pathname==='/'&&!upstream.search&&!upstream.hash)
  agent=new https.Agent({ca:tls.ca,rejectUnauthorized:true,servername:'localhost',maxSockets:16})
  const hop=new Set(['host','connection','keep-alive','transfer-encoding','upgrade','proxy-authenticate','proxy-authorization','te','trailer'])
  const ownerFor=(id,kind)=>{const owner=Object.entries(fixture.owned).find(([,value])=>value.runs[kind]?.run.id===id)?.[0];assert(owner);return owner}
  const nativePath=p=>p.replace(/^\/__pg_native(?=\/|$)/,'')
  server=https.createServer({...tls,minVersion:'TLSv1.2'},(req,res)=>{
   const requestStarted=Date.now()
   const work=(async()=>{
    const rule=originalRunQueuedBrowserPolicy(req.method,req.url,req.headers.accept,permit.story),sample={method:req.method,path:rule.pathname}
    if(rule.kind==='legacy_denied'){remember('legacy_backend_requests',{...sample,status:501});reply(res,501,'original_ui_legacy_backend_not_migrated');return}
    if(rule.kind==='native'){
     if(['authorization','x-rh-user-id','x-forwarded-user','x-agentstudio-identity'].some(k=>req.headers[k]!==undefined)){count('forbidden_auth_headers');reply(res,400,'original_queued_forbidden_auth_header');return}
     const path=nativePath(rule.pathname),identityDrop=nextIdentityDrop&&req.method==='GET'&&path==='/api/native-auth/me',identityHold=nextIdentityHold&&req.method==='GET'&&path==='/api/native-auth/me'?nextIdentityHold:null,replyDrop=nextReplyDrop&&req.method==='POST'&&path===nextReplyDrop.path?nextReplyDrop:null,staged=nextStaged&&req.method==='POST'&&path===nextStaged.path?nextStaged:null
     if(identityDrop)nextIdentityDrop=false;if(identityHold)nextIdentityHold=null;if(replyDrop)nextReplyDrop=null;if(staged)nextStaged=null
     const headers=Object.fromEntries(Object.entries(req.headers).filter(([name])=>!hop.has(name.toLowerCase())))
     let actualBody
     if(req.method==='POST'){actualBody=await collect(req);if(/^\/api\/v2\/agent-specs\/[^/]+\/autonomous-runs$/.test(path))remember('submission_posts',{path});if(/\/agent-autonomous-runs\/[^/]+\/(pause|resume|cancel)$/.test(path)||/\/workflow-v2-runs\/[^/]+\/cancel$/.test(path))remember('control_posts',{path});if(/\/(pause|resume)-confirm$/.test(path))remember('confirmation_posts',{path});if(/^\/api\/v2\/agent-feedback\/[^/]+\/(change|confirm)$/.test(path))remember('feedback_posts',{path})}
     if(staged){staged.pause=bindOriginalPauseStage({id:staged.id,req,res,actualBody,onClosed:()=>count('controlled_client_timeouts')});staged.request=staged.pause.request;pauseStages.set(staged.id,staged);count('controlled_staged_requests');staged.enter({actual_original_body_received:true,body_sha256:staged.pause.body_sha256});await staged.wait;staged.pause.assertDispatch()}
     if(replyDrop){replyDrop.gate.closed=new Promise((resolve,reject)=>{res.once('close',()=>{if(req.socket.destroyed===true&&!res.writableEnded)resolve({actual_proxy_response_closed:true,actual_socket_destroyed:true});else reject(Error('original_cancel_close_not_observed'))})});void replyDrop.gate.closed.catch(()=>{})}
     await new Promise((resolve,reject)=>{
      const proxy=https.request({hostname:'127.0.0.1',port:Number(upstream.port),servername:'localhost',path:nativePath(req.url),method:req.method,headers,agent,ca:tls.ca,rejectUnauthorized:true,minVersion:'TLSv1.2',signal:AbortSignal.timeout(8000)},response=>{
       const status=response.statusCode??502,responseHeaders=Object.fromEntries(Object.entries(response.headers).filter(([name])=>!hop.has(name.toLowerCase()))),chunks=[];let size=0,failed=false
       const fail=()=>{if(failed)return;failed=true;remember('unexpected_api_failures',{...sample,status:502});const e=Error('original_queued_upstream_failed');staged?.fail(e);identityHold?.fail(e);res.destroy();reject(e)}
       response.on('data',chunk=>{size+=chunk.length;if(size>1048576){response.destroy();fail();return}chunks.push(Buffer.from(chunk))});response.once('error',fail);response.once('aborted',fail)
       response.once('end',()=>{void(async()=>{
        if(failed)return
        const bytes=Buffer.concat(chunks);let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{fail();return}
        let expected=false
        if(status===401&&path==='/api/native-auth/me'&&signedOutAllowance>0&&body.error==='session_required'){signedOutAllowance--;count('actual_signed_out401');expected=true}
        if(status===403&&feedback403&&req.method==='POST'&&path===feedback403&&body.error==='agent_feedback_submission_disabled'){feedback403=null;count('controlled_feedback403');expected=true}
        const miss=negativeReads.consume(req.method,path,status,body);if(miss){remember('expected_not_found',miss);expected=true}
        if((status<200||status>=300)&&!expected)remember('unexpected_api_failures',{...sample,status})
        if(status===200&&req.method==='GET'&&path==='/api/v2/model-connections'){const q=new URL(req.url,permit.origin).searchParams;if(q.get('paging')==='owner_cursor_v1'){count('paging_requests');if(body.complete===true)count('paging_complete_responses')}else count('partial_model_reads')}
        if(status===200&&req.method==='POST'&&/\/(pause|resume)-confirm$/.test(path)){if(body.control_confirmed===false&&body.run_control_confirmation===null)count('negative_control_confirmations');else if(body.control_confirmed===true&&body.run_control_confirmation)count('positive_control_confirmations');else remember('unexpected_api_failures',{...sample,status:502})}
         if(status===200&&req.method==='POST'&&/\/agent-autonomous-runs\/[^/]+\/pause-confirm$/.test(path)&&body.control_confirmed===false&&body.run_control_confirmation===null){const active=pauseStages.get(body.run?.id);if(active)active.pause.observeNegative({originalBody:actualBody,status,responseComplete:response.complete===true,actual:bytes})}
        if(identityDrop){assert.equal(status,200);count('controlled_identity_drops');res.destroy();resolve();return}
        if(identityHold){assert.equal(status,200);identityHold.enter({actual_identity_response_held:true});await identityHold.wait;identityHold.finish({actual_status:status});gates.delete(identityHold)}
         if(replyDrop){const proof=await dropOriginalCommittedCancelReply({req,res,status,headers:responseHeaders,actual:bytes,responseComplete:response.complete===true,requestStarted,id:replyDrop.id,kind:replyDrop.kind,verifyActualOwner:()=>fixture.runState(ownerFor(replyDrop.id,replyDrop.kind),replyDrop.id)});const closedProof=await replyDrop.gate.closed;count('controlled_reply_drops');const record={actual_committed_status:status,actual_run_id:body.run.id,...proof,...closedProof};replyDrop.gate.enter(record);replyDrop.gate.finish(record);replyDrop.gate.release();gates.delete(replyDrop.gate);resolve();return}
        if(staged){assert.equal(status,200);assert.equal(body.run?.id,staged.id);staged.finish({actual_status:status,actual_run_id:body.run.id});staged.release();gates.delete(staged);pauseStages.delete(staged.id)}
        if(!res.destroyed){res.writeHead(status,responseHeaders);res.end(bytes)}resolve()
       })().catch(error=>{staged?.fail(error);identityHold?.fail(error);reject(error);res.destroy()})})
      })
      proxy.once('error',error=>{staged?.fail(error);identityHold?.fail(error);remember('unexpected_api_failures',{...sample,status:503});if(!res.headersSent&&!res.destroyed)reply(res,503,'original_queued_upstream_unavailable');else res.destroy();reject(error)})
      proxy.end(actualBody)
     });return
    }
    if(rule.kind==='api_denied'){remember('unexpected_api_failures',{...sample,status:405});reply(res,405,'original_run_queued_api_not_mapped');return}
    if(rule.kind==='asset'||rule.kind==='spa'){const file=files.get(rule.kind==='spa'?'/index.html':rule.pathname);if(file){res.writeHead(200,{'content-type':file.type,'content-length':file.bytes.length,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:file.bytes);return}}
    remember('blocked_requests',{...sample,status:404});reply(res,404,'original_run_queued_route_not_served')
   })();flights.add(work);void work.finally(()=>flights.delete(work)).catch(()=>res.destroy())
  })
  server.requestTimeout=30000;server.headersTimeout=15000;await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(17443,'127.0.0.1',resolve)})
  const cert=new crypto.X509Certificate(tls.cert),spki=crypto.createHash('sha256').update(cert.publicKey.export({type:'spki',format:'der'})).digest('base64')
  const known=(id,kind)=>Object.values(fixture.owned).some(o=>o.runs[kind]?.run.id===id)
  checkSources()
  return{...fixture,origin:permit.origin,spki,provenance,observations,close,
   allowSignedOutReads(n=4){assert(Number.isSafeInteger(n)&&n>0&&n<=8);signedOutAllowance=n},
   expectNotFound:(id,kinds,reason)=>negativeReads.expect(id,kinds,reason),
   dropNextActualIdentity(){assert.equal(nextIdentityDrop,false);nextIdentityDrop=true},
   holdNextActualIdentity(){assert(!nextIdentityHold);const g=gate('identity_reply',5500);nextIdentityHold=g;return{entered:()=>g.entered,release:()=>g.release(),done:()=>g.done}},
   revokeFeedbackBeforeOriginalSubmit(id){assert(known(id,'agent_autonomous')&&!feedback403);fixture.setFeedbackSubmission(false);feedback403='/api/v2/agent-feedback/'+id+'/change'},
   restoreFeedbackSubmission(){fixture.setFeedbackSubmission(true)},
   dropNextActualCancelReply(id,kind){assert(known(id,kind)&&!nextReplyDrop&&['agent_autonomous','workflow_v2'].includes(kind));const g=gate('committed_cancel_reply',12000);nextReplyDrop={id,kind,path:'/api/v2/'+(kind==='workflow_v2'?'workflow-v2-runs':'agent-autonomous-runs')+'/'+id+'/cancel',gate:g};return{entered:()=>g.entered,done:()=>g.done,clientClosed:()=>g.entered.then(()=>g.closed)}},
   stageNextOriginalPause(id){assert(known(id,'agent_autonomous')&&!nextStaged);const g=gate('original_pause_dispatch',20000);g.id=id;g.path='/api/v2/agent-autonomous-runs/'+id+'/pause';nextStaged=g;return{entered:()=>g.entered,request:()=>{assert(g.request);return g.request},clientClosed:()=>g.entered.then(()=>g.pause.clientClosed()),release:async()=>{await g.pause.authorizeRelease(body=>fixture.controlReceipts(ownerFor(id,'agent_autonomous'),id,body,0));g.release()},done:()=>g.done}},
   assertNoUnconsumedMisses(){negativeReads.assertEmpty()},
  }
 }catch(error){try{await close()}catch(cleanup){throw new AggregateError([error,cleanup],'original_run_queued_host_start_and_cleanup_failed')}throw error}
}
