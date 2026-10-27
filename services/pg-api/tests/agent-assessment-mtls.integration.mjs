// Genuine PG18 connections + real loopback mTLS on a fresh disposable GitHub
// service only. All provider transport is forcibly routed to our local TLS
// listener; real provider DNS/network and company databases are never used.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {request as httpsRequest} from 'node:https'
import {agentAssessmentTcpFixture,assessmentRequest,assessmentRows,assessmentCounts,assessmentOutputHash,assessmentEvaluation,assessmentOptimization,expireAssessmentLease,assessmentCancel,assessmentErase} from './helpers/agent-assessment-fixture.mjs'
import {withDisposableBoundModelTls} from './helpers/bound-model-loopback-tls.mjs'
import {AgentAssessmentBroker} from '../src/agent-assessment-broker.ts'
import {AgentAssessmentWorker} from '../src/agent-assessment-worker.ts'
import {createAgentAssessmentMutualTlsClient,createAgentAssessmentInternalHandler} from '../src/agent-assessment-client.ts'
import {agentAssessmentApproval,agentAssessmentRoute} from '../src/agent-assessment-contract.ts'
import {safeAgentSpec} from '../src/contracts.ts'

const activation={executionEnabled:true,executionApproval:agentAssessmentApproval}
const resultFor=p=>p.raw.purpose==='evaluate'?assessmentEvaluation():assessmentOptimization()
function metadataOnly(reply){
  assert.doesNotMatch(JSON.stringify(reply),/messages|choice|model_binding|api_key|owner_user_id|"result"|"descriptive"|"score"|syntheticReviewLedger|Synthetic assessment role/)
}
async function rawPrivate(config,payload,{headers={},credentials=true}={}){
  const data=Buffer.from(JSON.stringify(payload))
  return new Promise(resolve=>{
    const url=new URL(config.origin),req=httpsRequest({hostname:'127.0.0.1',port:Number(url.port),servername:'localhost',path:agentAssessmentRoute,method:'POST',
      ca:config.ca,...(credentials?{cert:config.cert,key:config.key}:{}),rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,signal:AbortSignal.timeout(7000),
      headers:{'Content-Type':'application/json','Content-Length':String(data.length),...headers}},res=>{
      const chunks=[];let size=0
      res.on('data',piece=>{size+=piece.length;if(size>4096){res.destroy();return}chunks.push(Buffer.from(piece))})
      res.once('end',()=>{let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{body=null}resolve({status:res.statusCode,body,networkError:false})})
      res.once('error',()=>resolve({status:0,body:null,networkError:true}))
    })
    req.once('error',()=>resolve({status:0,body:null,networkError:true}));req.end(data)
  })
}

test('disposable PG18: actual isolated Worker -> private mTLS Broker -> committed reservation -> selected credential -> real synthetic provider TLS -> strict result; uncertain effects never resend', {concurrency:false},async()=>{
  // Strict GitHub-only exact-target guard runs inside this helper BEFORE any
  // pool/SQL/certificate/listener effect; no local skip or unguarded URL path.
  const f=await agentAssessmentTcpFixture()
  try{
    const sharedId=randomUUID(),alice=await assessmentRequest(f,{purpose:'evaluate',requestId:sharedId}),bob=await assessmentRequest(f,{purpose:'optimize',who:'bob',requestId:sharedId,outputTokenLimit:16384})
    let active,clientConfig,providerMode='success',dropPrivateAck=false,providerPosts=0,credentialReads=0,brokerCalls=0
    const events=[],proofs=[],providerErrors=[]
    const secretPool={async connect(){
      const db=await f.secretPool.connect()
      return {async query(text,args=[]){
        if(text.includes('api_key_ciphertext')){
          assert.ok(active);assert.ok(args.includes(active.owner));assert.ok(args.includes(active.choice.model_binding.connection_id))
          const count=(await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_assessment_effects WHERE owner_user_id=$1 AND request_id=$2',[active.owner,active.raw.request_id])).rows[0].n
          assert.equal(count,1,'reservation is visible from another connection before credential SELECT')
          credentialReads++;events.push({kind:'credential',owner:active.owner,request_id:active.raw.request_id})
        }
        return db.query(text,args)
      },release:()=>db.release()}
    }}
    const resolver={async resolve4(host){assert.equal(host,'api.openai.com');return ['93.184.216.34']},async resolve6(host){assert.equal(host,'api.openai.com');return []}}
    const providerRequest=(options,callback)=>{
      assert.ok(clientConfig,'provider cannot run before synthetic loopback listener is ready')
      assert.equal(options.hostname,'api.openai.com');assert.equal(options.port,443);assert.equal(options.path,'/v1/chat/completions')
      assert.equal(options.method,'POST');assert.equal(options.rejectUnauthorized,true)
      const url=new URL(clientConfig.origin)
      // Execute the real provider serializer/parser over a real mTLS socket.
      // This adapter is the only request implementation given to the runtime;
      // no request can escape to the selected external hostname or DNS answer.
      return httpsRequest({...options,hostname:'127.0.0.1',port:Number(url.port),servername:'localhost',lookup:undefined,
        ca:clientConfig.ca,cert:clientConfig.cert,key:clientConfig.key,agent:false},callback)
    }
    const broker=new AgentAssessmentBroker(f.pool,f.dispatchPool,secretPool,f.key,{...activation,resolver,request:providerRequest})
    const disabledBroker=new AgentAssessmentBroker(f.pool,f.dispatchPool,secretPool,f.key)
    const dispatch=async proof=>{brokerCalls++;return broker.dispatch(proof)}
    const handlerFactory=raw=>{
      const handler=createAgentAssessmentInternalHandler({...activation,...raw,dispatch})
      return async(req,res)=>{
        if(req.url!== '/v1/chat/completions'){
          if(dropPrivateAck&&req.url===agentAssessmentRoute){
            const end=res.end
            res.end=function(...args){if(this.statusCode===200){this.destroy();return this};return end.apply(this,args)}
          }
          return handler(req,res)
        }
        try{
        assert.equal(req.socket.authorized,true,'synthetic provider also requires a real mutually authenticated TLS client')
        assert.ok(active);assert.equal(req.method,'POST')
        const chunks=[];let bytes=0
        for await(const part of req){bytes+=part.length;assert.ok(bytes<=524288);chunks.push(Buffer.from(part))}
        const body=JSON.parse(Buffer.concat(chunks).toString('utf8'))
        assert.equal(req.headers.authorization,'Bearer synthetic-'+(active.owner===f.users.alice?'alice':'bob')+'-assessment-key-never-network')
        assert.equal(body.model,active.choice.model_binding.model_id);assert.equal(body.max_completion_tokens,active.choice.output_token_limit)
        assert.deepEqual(body.messages,active.prepared.messages);assert.deepEqual(body.response_format,{type:'json_object'})
        const effects=(await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_assessment_effects WHERE owner_user_id=$1 AND request_id=$2',[active.owner,active.raw.request_id])).rows[0].n
        assert.equal(effects,1,'a committed durable reservation must exist when the POST reaches the provider')
        const event=events.at(-1);assert.equal(event?.kind,'credential');assert.equal(event.owner,active.owner);assert.equal(event.request_id,active.raw.request_id)
        providerPosts++;events.push({kind:'post',owner:active.owner,request_id:active.raw.request_id})
        if(providerMode==='disconnect'){res.destroy();return}
        const result=providerMode==='invalid_result'?{...assessmentEvaluation(),tools:['web_fetch']}:resultFor(active)
        res.writeHead(200,{'Content-Type':'application/json'})
        res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(result)}}]}))
        }catch(error){providerErrors.push(error);throw error}
      }
    }
    await withDisposableBoundModelTls(dispatch,async config=>{
      clientConfig=config
      const privateClient=createAgentAssessmentMutualTlsClient({...activation,...config})
      const worker=new AgentAssessmentWorker(f.workerPool,randomUUID(),async proof=>{proofs.push({...proof});return privateClient(proof)},activation)
      const disabledWorker=new AgentAssessmentWorker(f.workerPool,randomUUID(),privateClient)
      const disabledBefore=await assessmentCounts(f)
      assert.deepEqual(await disabledWorker.tick(),{state:'disabled'})
      await assert.rejects(disabledBroker.dispatch({request_id:sharedId,lease_token:randomUUID(),lease_version:1,worker_id:randomUUID()}),/agent_assessment_execution_disabled/)
      assert.deepEqual(await assessmentCounts(f),disabledBefore)
      for(const p of [alice,bob]){
        active=p;const before=await assessmentCounts(f),role=await f.agents.get(p.identity,p.role.id)
        const reply=await worker.tick(),result=resultFor(p)
        assert.equal(providerErrors.length,0,providerErrors[0]?.stack)
        assert.equal(reply.request_id,p.raw.request_id);assert.equal(reply.state,'succeeded');assert.equal(reply.result_sha256,assessmentOutputHash(p,result));metadataOnly(reply)
        const rows=await assessmentRows(f,p.raw.request_id,p.owner)
        assert.equal(rows.effects.length,1);assert.equal(rows.outcomes.length,1);assert.equal(rows.outputs.length,1)
        assert.equal(rows.effects[0].owner_user_id,p.owner);assert.equal(rows.outcomes[0].status,'succeeded')
        assert.deepEqual(rows.outputs[0].result,result);assert.equal(rows.outputs[0].result_sha256,reply.result_sha256)
        const after=await assessmentCounts(f)
        assert.equal(after.old_effects,before.old_effects);assert.equal(after.old_jobs,before.old_jobs)
        assert.equal(after.role_history,before.role_history);assert.equal(after.role_acceptances,before.role_acceptances)
        assert.deepEqual(await f.agents.get(p.identity,p.role.id),role)
      }
      assert.equal(providerPosts,2);assert.equal(credentialReads,2);assert.notEqual(proofs[0].lease_token,proofs[1].lease_token)
      assert.equal(proofs[0].request_id,proofs[1].request_id,'the real Broker must also resolve deliberate cross-owner UUID collisions')
      const rejectedBefore=await assessmentCounts(f),postsBefore=providerPosts
      const noCertificate=await rawPrivate(config,proofs[0],{credentials:false})
      assert.equal(noCertificate.networkError,true)
      const badPin=createAgentAssessmentMutualTlsClient({...activation,...config,reviewedServerFingerprint256:'00:'.repeat(31)+'00'})
      await assert.rejects(badPin(proofs[0]),/agent_assessment_transport_unknown/)
      for(const patch of [{owner_user_id:alice.owner},{identity:alice.identity},{messages:alice.prepared.messages},{model_binding:alice.choice.model_binding},{fee_acknowledgement:'forged'},{lease_version:0}]){
        const reply=await rawPrivate(config,{...proofs[0],...patch})
        assert.equal(reply.status,400);metadataOnly(reply.body)
      }
      for(const headers of [{'x-rh-user-id':alice.owner},{authorization:'Bearer synthetic-forged-identity'},{cookie:'synthetic_owner=alice'}])
        assert.equal((await rawPrivate(config,proofs[0],{headers})).status,404)
      for(const patch of [{lease_token:randomUUID()},{lease_version:proofs[0].lease_version+1},{worker_id:randomUUID()}])
        assert.equal((await rawPrivate(config,{...proofs[0],...patch})).status,503)
      assert.equal(providerPosts,postsBefore);assert.deepEqual(await assessmentCounts(f),rejectedBefore)
      for(const change of ['role','epoch','cancel','erase']){
        active=await assessmentRequest(f)
        const expected=active,guardedWorker=new AgentAssessmentWorker(f.workerPool,randomUUID(),async proof=>{
          proofs.push({...proof})
          // Claim has already committed. Change authority/source before the
          // private Broker can prepare input or reserve a paid POST.
          if(change==='role'){
            const role=await f.agents.get(expected.identity,expected.role.id),{require_approval:_,...spec}=role.spec
            await f.agents.update(expected.identity,role.id,role.name,safeAgentSpec({...spec,goal:'Current source changed before private assessment'}),role.revision)
          }
          if(change==='epoch')await f.db.query('UPDATE agentstudio_auth.accounts SET governance_revision=governance_revision+2 WHERE user_id=$1',[expected.owner])
          if(change==='cancel')await assessmentCancel(f,expected)
          if(change==='erase')await assessmentErase(f,expected)
          return privateClient(proof)
        },activation)
        const readsBefore=credentialReads,postsBefore=providerPosts,reply=await guardedWorker.tick()
        assert.equal(reply.request_id,expected.raw.request_id);assert.equal(reply.state,'paused');metadataOnly(reply)
        const rows=await assessmentRows(f,expected.raw.request_id,expected.owner)
        assert.equal(rows.effects.length,0);assert.equal(rows.outcomes.length,0);assert.equal(rows.outputs.length,0)
        assert.equal(rows.leases[0].state,'paused')
        assert.equal(credentialReads,readsBefore);assert.equal(providerPosts,postsBefore)
      }
      for(const mode of ['disconnect','invalid_result','lost_private_ack']){
        active=await assessmentRequest(f,{purpose:mode==='lost_private_ack'?'optimize':'evaluate',outputTokenLimit:mode==='lost_private_ack'?16384:2048})
        providerMode=mode==='lost_private_ack'?'success':mode;dropPrivateAck=mode==='lost_private_ack'
        const beforePosts=providerPosts,reply=await worker.tick(),proof=proofs.at(-1)
        assert.equal(providerErrors.length,0,providerErrors[0]?.stack)
        assert.equal(reply.state,'unknown');assert.equal(reply.request_id,active.raw.request_id);metadataOnly(reply)
        assert.equal(providerPosts,beforePosts+1,'each reserved request makes at most one actual provider POST')
        const rows=await assessmentRows(f,active.raw.request_id,active.owner)
        assert.equal(rows.effects.length,1);assert.equal(rows.outcomes.length,1)
        assert.equal(rows.outcomes[0].status,mode==='lost_private_ack'?'succeeded':'unknown')
        assert.equal(rows.outputs.length,mode==='lost_private_ack'?1:0)
        providerMode='success';dropPrivateAck=false
        await expireAssessmentLease(f,proof)
        const beforeReplay=await assessmentCounts(f)
        assert.deepEqual(await worker.tick(),{state:'idle'})
        await assert.rejects(privateClient(proof),/agent_assessment_transport_unknown/)
        assert.equal(providerPosts,beforePosts+1);assert.deepEqual(await assessmentCounts(f),beforeReplay)
      }
      assert.equal(providerPosts,5);assert.equal(credentialReads,5);assert.ok(brokerCalls>=5)
    },{handlerFactory})
  }finally{await f.close()}
})
