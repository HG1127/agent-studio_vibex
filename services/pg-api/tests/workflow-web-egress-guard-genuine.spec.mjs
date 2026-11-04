// AUTHORED / UNRUN. Real isolated PG18, original Worker/Actor/lease/Broker checks;
// in-process verified private dispatch and synthetic final DNS/request DATA.
// This does not re-qualify mTLS transport or public-provider availability.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {requireWebEgressGuardGenuineCi} from './helpers/web-egress-guard-genuine-guard.mjs'
test('G01 actual current PG authority refuses egress after DNS delay',{concurrency:false,timeout:600000},async t=>{
 requireWebEgressGuardGenuineCi()
 const [fs,url,path,crypto]=await Promise.all([import('node:fs'),import('node:url'),import('node:path'),import('node:crypto')]),root=path.resolve(url.fileURLToPath(new URL('../../../',import.meta.url))),raw=fs.readFileSync(path.join(root,'services/pg-api/tests/helpers/web-egress-guard-reviewed-sources.json'))
 assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),process.env.AGENT_STUDIO_WEB_EGRESS_GUARD_SOURCES_SHA256)
 const reviewed=JSON.parse(raw);assert.equal(reviewed.format,'web-egress-guard-sources.v1');assert(reviewed.files.length>=5);for(const pin of reviewed.files){assert(/^(?:services\/pg-api|tests|shared)\/[A-Za-z0-9_./-]+$/.test(pin.path));assert(!pin.path.split('/').includes('..'));assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,pin.path))).digest('hex'),pin.sha256)}
 const [{toolHubGenuineFixture},{WorkflowV2Worker},{createWorkflowToolNetwork},{WorkflowV2ToolDispatch,WorkflowV2ToolLeaseIdentity,verifiedWorkflowV2ToolDispatch},{EventEmitter}]=await Promise.all([import('./helpers/tool-hub-genuine-fixture.mjs'),import('../src/workflow-v2-worker.ts'),import('../src/workflow-v2-tool-network.ts'),import('../src/workflow-v2-tool-dispatch.ts'),import('node:events')])
 const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return{promise,resolve}}
 for(const scenario of ['allowed','employee_disabled','approval_changed','lease_expired','source_changed','run_cancelled'])await t.test(scenario,{concurrency:false,timeout:90000},async()=>{
  const f=await toolHubGenuineFixture(),entered=deferred(),release=deferred();let requests=0,inflight
  try{
   const identity=await f.identityFor('alice'),owner=f.users.alice
   const body={purpose:'tool',request_id:randomUUID(),target:{kind:'builtin',tool:'web_fetch'},arguments_json:JSON.stringify({url:'https://public.example.com/'}),effect_consent:'APPROVE_ONE_OWNER_TOOL_TRIAL_EFFECT',fee_consent:'APPROVE_ONE_OWNER_TOOL_TRIAL_POSSIBLE_CHARGES'},submitted=await f.request('alice','/api/v2/tool-hub/trials',body);assert.equal(submitted.status,201);const receipt=submitted.body.receipt
   const network=createWorkflowToolNetwork({async resolve4(){entered.resolve();await release.promise;return['93.184.216.34']},async resolve6(){return[]}},(options,callback)=>{requests++;const req=new EventEmitter();req.setTimeout=()=>req;req.end=()=>{queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=200;res.headers={'content-type':'text/plain'};res.destroy=()=>{};callback(res);res.emit('data',Buffer.from('Synthetic approved page'));res.emit('end')});return req};req.destroy=e=>{if(e)req.emit('error',e);return req};return req})
   const broker=new WorkflowV2ToolDispatch(f.brokerApi,f.key,network,f.brokerPool),dispatch=verifiedWorkflowV2ToolDispatch(new WorkflowV2ToolLeaseIdentity(f.identityPool),broker)
   const worker=new WorkflowV2Worker(f.workflowWorkerPool,'g01-'+randomUUID().slice(0,8),{executor:{supports:r=>r.kind==='tool',async execute(request,lease){const result=await dispatch({claim:{run_id:lease.run_id,job_id:lease.job_id,lease_token:lease.lease_token,lease_version:lease.lease_version,lease_owner:lease.worker_id},step_key:request.step_key,input_sha256:request.input_sha256});return result.text}}})
   let detail;for(let i=0;i<8;i++){detail=await f.runs.get(identity,receipt.run_id);if(detail.run.status==='awaiting_approval')break;await worker.tick()}assert.equal(detail.run.status,'awaiting_approval');const pending=detail.pending_effect;assert(pending)
   const approval=await f.request('alice','/api/v2/workflow-v2-runs/'+receipt.run_id+'/decision',{decision:'approved',step_key:pending.step_key,input_sha256:pending.input_sha256});assert.equal(approval.status,200)
   inflight=worker.tick().then(value=>({value}),error=>({error}));let timer;try{await Promise.race([entered.promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('synthetic_dns_barrier_not_entered')),15000)})])}finally{clearTimeout(timer)}assert.equal(requests,0)
   // Deliberate mutations affect only this fresh synthetic CI owner/run. No
   // fake Actor result or bypass replaces the actual production verifier.
   if(scenario==='employee_disabled')await f.db.query("UPDATE agentstudio.users SET status='disabled' WHERE id=$1::uuid",[owner])
   if(scenario==='approval_changed')await f.db.query("UPDATE agentstudio.approvals SET status='rejected' WHERE owner_user_id=$1::uuid AND run_id=$2::uuid AND step_key=$3::text",[owner,receipt.run_id,pending.step_key])
   if(scenario==='lease_expired')await f.db.query('UPDATE agentstudio.jobs SET lease_until=clock_timestamp() WHERE owner_user_id=$1::uuid AND run_id=$2::uuid',[owner,receipt.run_id])
   if(scenario==='source_changed')await f.db.query('UPDATE agentstudio.workflows SET revision=revision+1 WHERE owner_user_id=$1::uuid AND id=$2::uuid',[owner,receipt.workflow_id])
   if(scenario==='run_cancelled'){const result=await f.request('alice','/api/v2/workflow-v2-runs/'+receipt.run_id+'/cancel',{});assert.equal(result.status,200)}
   release.resolve();await inflight;assert.equal(requests,scenario==='allowed'?1:0)
   const effects=(await f.db.query("SELECT status FROM agentstudio.external_effects WHERE owner_user_id=$1::uuid AND run_id=$2::uuid AND step_key=$3::text",[owner,receipt.run_id,'wf2_tool:'+pending.step_key])).rows;assert.equal(effects.length,1);if(scenario==='allowed')assert.equal(effects[0].status,'succeeded');else assert.notEqual(effects[0].status,'succeeded')
   // Never call another tick/dispatch to make an unknown result look successful.
   assert.equal(requests,scenario==='allowed'?1:0)
  }finally{release.resolve();await inflight;await f.close()}
 })
})
