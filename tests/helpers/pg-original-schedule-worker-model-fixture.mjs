import {requireOriginalScheduleWorkerCi} from './pg-original-schedule-worker-guard.mjs'
/** Hosted-only actual Broker and three same-round private TLS listeners. */
export async function originalScheduleWorkerModelRuntime(f,identityPool,env=process.env){
 const permit=requireOriginalScheduleWorkerCi(env)
 const [{default:assert},crypto,https,tls,dispatchModule,handlerModule,clientModule,executors,probeModule,peer]=await Promise.all([import('node:assert/strict'),import('node:crypto'),import('node:https'),import('../../services/pg-api/tests/helpers/bound-model-loopback-tls.mjs'),import('../../services/pg-api/src/workflow-v2-model-dispatch.ts'),import('../../services/pg-api/src/workflow-v2-model-handler.ts'),import('../../services/pg-api/src/workflow-v2-model-client.ts'),import('../../services/pg-api/src/model-connection-executor.ts'),import('../../services/pg-api/src/model-connection-probe.ts'),import('../../services/pg-api/src/bound-worker-mtls.ts')])
 const nonce=crypto.randomBytes(16).toString('hex'),modelId='synthetic-schedule-worker',keys={alice:'synthetic-schedule-worker-alice-'+nonce,bob:'synthetic-schedule-worker-bob-'+nonce},configs={},proofs=[],privateEvents=[],credentialEvents=[],providerEvents=[],failures=[],outputs=new Map(),flights=new Set(),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
 let providerTls,broker,lifetime,closed=false,finishResolve,readyResolve,readyReject
 const finish=new Promise(resolve=>{finishResolve=resolve}),ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject})
 const bounded=async(p,ms=20000)=>{let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('schedule_worker_model_lifetime_timeout')),ms)})])}finally{clearTimeout(timer)}}
 const remember=(list,value)=>{assert(list.length<128,'bounded synthetic model observation');list.push(value)}
 const selectedOwner=key=>Object.keys(keys).find(who=>keys[who]===key)
 const resolver={resolve4:async host=>{assert.equal(host,'api.openai.com');return['93.184.216.34']},resolve6:async host=>{assert.equal(host,'api.openai.com');return[]}}
 const request=(options,callback)=>{
  assert.equal(options.hostname,'api.openai.com');assert.equal(Number(options.port),443);assert.equal(options.rejectUnauthorized,true);assert(['GET','POST'].includes(options.method));assert.equal(options.path,options.method==='GET'?'/v1/models':'/v1/chat/completions');assert(providerTls);assert.equal(providerTls.origin,permit.modelOrigin)
  return https.request({...options,hostname:'127.0.0.1',port:7459,servername:'localhost',lookup:undefined,ca:providerTls.ca,cert:providerTls.cert,key:providerTls.key,agent:false},callback)
 }
 const secretPool={async connect(){const db=await f.secretPool.connect();return{async query(sql,args=[]){
  if(sql.startsWith('SELECT revision,enabled,status,provider,base_url,models,api_key_ciphertext')){
   const proof=proofs.at(-1);assert(proof);const owner=(await f.db.query('SELECT owner_user_id FROM agentstudio.runs WHERE id=$1::uuid',[proof.claim.run_id])).rows[0]?.owner_user_id;assert.equal(owner,args[1]);assert(Object.values(f.users).includes(owner));assert.equal((await db.query('SELECT current_user::text AS role')).rows[0].role,'agentstudio_model_broker')
   const started=(await f.db.query('SELECT status,arguments_sha256 FROM agentstudio.external_effects WHERE owner_user_id=$1::uuid AND run_id=$2::uuid AND step_key=$3::text',[owner,proof.claim.run_id,'wf2_model:'+proof.step_key])).rows;assert.equal(started.length,1);assert.equal(started[0].status,'started');assert.equal(started[0].arguments_sha256,proof.input_sha256)
   const origin=(await f.db.query('SELECT owner_user_id FROM agentstudio.schedule_execution_origins WHERE run_id=$1::uuid',[proof.claim.run_id])).rows;assert.equal(origin.length,1);assert.equal(origin[0].owner_user_id,owner)
   remember(credentialEvents,{run_id:proof.claim.run_id,step_key:proof.step_key,input_sha256:proof.input_sha256,actual_committed_reservation:true,actual_schedule_origin:true,actual_secret_role:true})
  }
  return db.query(sql,args)
 },release:()=>db.release()}}}
 const providerFactory=config=>async(req,res)=>{try{
  peer.verifyBoundWorkerMutualTlsPeer(req.socket,config.reviewedClientFingerprint256);const who=selectedOwner(String(req.headers.authorization??'').replace(/^Bearer /,''));assert(who)
  if(req.method==='GET'){assert.equal(req.url,'/v1/models');remember(providerEvents,{phase:'probe',owner:who});res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({data:[{id:modelId}]}));return}
  assert.equal(req.method,'POST');assert.equal(req.url,'/v1/chat/completions');assert.equal(req.headers['content-type'],'application/json');const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;assert(size<=524288);chunks.push(Buffer.from(chunk))}
  const bytes=Buffer.concat(chunks),body=JSON.parse(bytes.toString('utf8')),prompt=body.messages?.[1]?.content,proof=proofs.at(-1);assert.equal(body.model,modelId);assert.equal(typeof prompt,'string');assert(prompt.includes(nonce));assert(proof);assert(credentialEvents.some(row=>row.run_id===proof.claim.run_id&&row.step_key===proof.step_key&&row.input_sha256===proof.input_sha256))
  const actual=(await f.db.query('SELECT owner_user_id,checkpoint FROM agentstudio.runs WHERE id=$1::uuid',[proof.claim.run_id])).rows[0];assert.equal(actual.owner_user_id,f.users[who]);const mode=proof.execution_mode??'workflow_native_v2';assert.equal(actual.checkpoint.execution_mode,mode);assert(!outputs.has(proof.claim.run_id),'one selected model response per tested run')
  const answer='Synthetic scheduled Worker result '+nonce+' '+proof.claim.run_id;outputs.set(proof.claim.run_id,answer);remember(providerEvents,{phase:'generate',owner:who,run_id:proof.claim.run_id,step_key:proof.step_key,input_sha256:proof.input_sha256,wire_sha256:sha(bytes),response_sha256:sha(answer),execution_mode:mode})
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:mode==='agent_native_v2'?JSON.stringify({action:'answer',answer}):answer}}]}))
 }catch{remember(failures,{phase:'synthetic_model_TLS',code:'schedule_worker_model_wire_refused'});res.destroy()}}
 const privateFactory=mode=>config=>handlerModule.createWorkflowV2ModelInternalHandler({...config,executionMode:mode,dispatch:async proof=>{
  assert.equal(proof.execution_mode??'workflow_native_v2',mode);remember(proofs,proof);remember(privateEvents,{run_id:proof.claim.run_id,step_key:proof.step_key,input_sha256:proof.input_sha256,execution_mode:mode});assert(broker)
  const work=dispatchModule.verifiedWorkflowV2ModelDispatch(new dispatchModule.WorkflowV2ModelLeaseIdentity(identityPool),broker)(proof);flights.add(work);try{return await work}finally{flights.delete(work)}
 }})
 lifetime=tls.withDisposableBoundModelTls(async()=>{throw Error('original_schedule_worker_actual_private_handler_required')},async agent=>tls.withDisposableBoundModelTls(async()=>{throw Error('original_schedule_worker_actual_private_handler_required')},async workflow=>tls.withDisposableBoundModelTls(async()=>{throw Error('original_schedule_worker_model_endpoint_only')},async provider=>{
  configs.agent_native_v2=agent;configs.workflow_native_v2=workflow;providerTls=provider;assert.equal(provider.origin,permit.modelOrigin);assert(provider.serverTls)
  broker=new dispatchModule.WorkflowV2ModelDispatch(f.pool,f.key,executors.createIsolatedWorkflowModelExecutor(env,permit.origin,true,resolver,request),secretPool,{allowAutonomousExecution:true,agentExecutor:executors.createIsolatedAutonomousAgentModelExecutor(env,permit.origin,true,resolver,request)})
  readyResolve();await finish
 },{handlerFactory:providerFactory,listenPort:7459,includeServerTls:true}),{handlerFactory:privateFactory('workflow_native_v2')}),{handlerFactory:privateFactory('agent_native_v2')}).catch(error=>{readyReject(error);throw error});void lifetime.catch(()=>{})
 try{await bounded(ready,60000)}catch(error){finishResolve();await lifetime.catch(()=>{});throw error}
 return{nonce,modelId,keys,serverTls:providerTls.serverTls,providerEvents,privateEvents,credentialEvents,failures,outputs,probe:probeModule.createProviderConnectivityProbe(resolver,request),executor:mode=>clientModule.workflowV2ModelEffectExecutor(configs[mode]),
  async assertReplayDenied(){const proof=proofs.at(-1);assert(proof);const before=providerEvents.filter(row=>row.phase==='generate').length;await assert.rejects(clientModule.createWorkflowV2ModelMutualTlsClient(configs[proof.execution_mode??'workflow_native_v2'])(proof));assert.equal(providerEvents.filter(row=>row.phase==='generate').length,before)},
  async close(){if(closed)return;closed=true;await bounded(Promise.allSettled([...flights]));finishResolve();await bounded(lifetime);outputs.clear()}
 }
}
