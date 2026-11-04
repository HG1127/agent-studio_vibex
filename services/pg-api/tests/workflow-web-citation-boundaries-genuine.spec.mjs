// AUTHORED/UNRUN: one CASE and one fixture per NEW disposable PG18 service.
// Real Native identity, Worker lease and production Actor/Broker; only final
// DNS/request contents are synthetic. No public-provider/mTLS requalification.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {requireWebCitationBoundariesCi} from './helpers/web-citation-boundaries-genuine-guard.mjs'
test('web citations/redirects: real approved task and original unknown/no-replay ledger',{concurrency:false,timeout:180000},async()=>{
 requireWebCitationBoundariesCi()
 const [fs,path,url,crypto]=await Promise.all([import('node:fs'),import('node:path'),import('node:url'),import('node:crypto')]),root=path.resolve(url.fileURLToPath(new URL('../../../',import.meta.url))),raw=fs.readFileSync(path.join(root,'services/pg-api/tests/helpers/web-citation-boundaries-reviewed-sources.json'))
 assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),process.env.AGENT_STUDIO_WEB_CITATION_BOUNDARIES_SOURCES_SHA256)
 const reviewed=JSON.parse(raw);assert.equal(reviewed.format,'web-citation-boundaries-sources.v2');assert.equal(reviewed.files.length,10);assert.deepEqual(reviewed.files.map(pin=>pin.path),["services/pg-api/src/model-connection-probe.ts","services/pg-api/src/workflow-v2-effect-failure.ts","services/pg-api/src/workflow-v2-tool-dispatch.ts","services/pg-api/src/workflow-v2-tool-network.ts","services/pg-api/src/workflow-v2-tool-plan.ts","services/pg-api/tests/helpers/web-citation-boundaries-genuine-guard.mjs","services/pg-api/tests/workflow-web-citation-boundaries-genuine.spec.mjs","tests/workflow-web-citation-boundaries-pure.test.mjs","tests/workflow-web-quoted-tag-boundary-pure.test.mjs","tests/workflow-web-snippet-href-presence-pure.test.mjs"])
 for(const pin of reviewed.files){assert(/^(?:services\/pg-api|shared|tests)\/[A-Za-z0-9_./-]+$/.test(pin.path));assert(!pin.path.split('/').includes('..'));assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,pin.path))).digest('hex'),pin.sha256)}
 const [{toolHubGenuineFixture},{WorkflowV2Worker},{createWorkflowToolNetwork},{WorkflowV2ToolDispatch,WorkflowV2ToolLeaseIdentity,verifiedWorkflowV2ToolDispatch},{EventEmitter}]=await Promise.all([import('./helpers/tool-hub-genuine-fixture.mjs'),import('../src/workflow-v2-worker.ts'),import('../src/workflow-v2-tool-network.ts'),import('../src/workflow-v2-tool-dispatch.ts'),import('node:events')])
 const scenario=process.env.AGENT_STUDIO_WEB_CITATION_BOUNDARIES_CASE,f=await toolHubGenuineFixture(),calls=[]
 let worker
 try{
  const identity=await f.identityFor('alice'),search=scenario.startsWith('search_'),tool=search?'web_search':'web_fetch',target='https://citation.example.com/story',wrapped='//html.duckduckgo.com/l/?uddg='+encodeURIComponent(target),html='<div class="result"><a class="result__a" href="https://127.0.0.1/">Rejected</a><a class="result__snippet">FIRST</a></div><div class="result"><a class="result__a" href="'+wrapped+'">Retained</a><a class="result__snippet" href="'+target+'">SECOND</a></div>'
  const responses=scenario==='fetch_redirect'?[{status:302,location:'/final'},{body:'<p>Synthetic final page</p>'}]:scenario==='fetch_empty_location'?[{status:302,location:''}]:[{body:scenario==='search_snippet'?html:scenario==='search_empty'?'<div class="no-results__message">No results</div>':'<form id="challenge-form"></form>'}]
  const network=createWorkflowToolNetwork({async resolve4(){return['93.184.216.34']},async resolve6(){return[]}},(options,callback)=>{
   assert.equal(options.rejectUnauthorized,true);assert.equal(options.minVersion,'TLSv1.2');const answer=responses[calls.length];assert(answer,'no automatic request/replay beyond explicit DATA responses');calls.push(options)
   const req=new EventEmitter();req.setTimeout=()=>req;req.destroy=e=>{if(e)req.emit('error',e);return req};req.end=()=>{queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=answer.status??200;res.headers={'content-type':'text/html',...(Object.hasOwn(answer,'location')?{location:answer.location}:{})};res.destroy=()=>{res.destroyed=true};callback(res);if(!res.destroyed){if(answer.body!==undefined)res.emit('data',Buffer.from(answer.body));if(!res.destroyed)res.emit('end')}});return req};return req
  })
  const broker=new WorkflowV2ToolDispatch(f.brokerApi,f.key,network,f.brokerPool),dispatch=verifiedWorkflowV2ToolDispatch(new WorkflowV2ToolLeaseIdentity(f.identityPool),broker)
  worker=new WorkflowV2Worker(f.workflowWorkerPool,'web-citation-'+randomUUID().slice(0,8),{executor:{supports:r=>r.kind==='tool',async execute(request,lease){return(await dispatch({claim:{run_id:lease.run_id,job_id:lease.job_id,lease_token:lease.lease_token,lease_version:lease.lease_version,lease_owner:lease.worker_id},step_key:request.step_key,input_sha256:request.input_sha256})).text}}})
  const body={purpose:'tool',request_id:randomUUID(),target:{kind:'builtin',tool},arguments_json:JSON.stringify(search?{query:'synthetic public query',limit:5}:{url:'https://public.example.com/story'}),effect_consent:'APPROVE_ONE_OWNER_TOOL_TRIAL_EFFECT',fee_consent:'APPROVE_ONE_OWNER_TOOL_TRIAL_POSSIBLE_CHARGES'},submitted=await f.request('alice','/api/v2/tool-hub/trials',body);assert.equal(submitted.status,201);const receipt=submitted.body.receipt
  let detail;for(let i=0;i<8;i++){detail=await f.runs.get(identity,receipt.run_id);if(detail.run.status==='awaiting_approval')break;await worker.tick()}assert.equal(detail.run.status,'awaiting_approval');assert.equal(calls.length,0);const pending=detail.pending_effect;assert(pending)
  const approved=await f.request('alice','/api/v2/workflow-v2-runs/'+receipt.run_id+'/decision',{decision:'approved',step_key:pending.step_key,input_sha256:pending.input_sha256});assert.equal(approved.status,200)
  // Stop at the first execution. Failed/unknown outcomes must never be pushed
  // through another tick merely to make the story look successful.
  for(let i=0;i<8&&!calls.length;i++)await worker.tick();assert.equal(calls.length,scenario==='fetch_redirect'?2:1)
  const effects=(await f.db.query('SELECT status FROM agentstudio.external_effects WHERE owner_user_id=$1::uuid AND run_id=$2::uuid AND step_key=$3::text',[f.users.alice,receipt.run_id,'wf2_tool:'+pending.step_key])).rows;assert.equal(effects.length,1)
  const unknown=scenario==='fetch_empty_location'||scenario==='search_challenge'
  if(unknown){assert.equal(effects[0].status,'unknown');const confirmation=await f.request('alice','/api/v2/tool-hub/trials/'+receipt.request_id+'/confirm?request_sha256='+receipt.request_sha256);assert.equal(confirmation.status,200);assert.equal(confirmation.body.confirmed,true);assert.equal(confirmation.body.receipt.run_id,receipt.run_id);assert.equal(calls.length,1)}
  else{
   assert.equal(effects[0].status,'succeeded');for(let i=0;i<12;i++){detail=await f.runs.get(identity,receipt.run_id);if(['succeeded','failed','paused'].includes(detail.run.status))break;await worker.tick()}assert.equal(detail.run.status,'succeeded')
   if(scenario==='search_snippet'){const hits=JSON.parse(detail.run.result_text);assert.equal(hits.length,1);assert.equal(hits[0].url,target);assert.equal(hits[0].snippet,'SECOND')}
   if(scenario==='fetch_redirect'){assert.equal(detail.run.result_text,'Synthetic final page');assert.equal(calls[1].path,'/final')}
   if(scenario==='search_empty')assert.equal(detail.run.result_text,'（搜索服务明确未找到匹配结果）')
  }
  assert.equal(Object.values(f.network).reduce((sum,n)=>sum+n,0),0,'no existing synthetic public-provider adapter should be called')
 }finally{worker?.closeNewClaims();await f.close()}
})
