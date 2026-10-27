import test from "node:test"
import assert from "node:assert/strict"
import {createServer} from "node:http"
import {knowledgeIndexFixture} from "./helpers/knowledge-index-fixture.mjs"
import {withDisposableBoundModelTls} from "./helpers/bound-model-loopback-tls.mjs"
import {KnowledgeIndexBroker} from "../src/knowledge-index-broker.ts"
import {KnowledgeIndexWorker} from "../src/knowledge-index-worker.ts"
import {createKnowledgeIndexPrivateClient,createKnowledgeIndexPrivateHandler} from "../src/knowledge-index-private-tls.ts"
import {createKnowledgeEmbeddingTransport} from "../src/knowledge-embedding-transport.ts"
import {embeddingEndpointPolicy} from "../src/knowledge-embedding-policy.ts"
import {KnowledgeEmbeddingRepository} from "../src/knowledge-embedding-repository.ts"
import {randomUUID} from "node:crypto"
import {assertKnowledgeIndexWorkerTls} from "../src/knowledge-index-service.ts"
import {alice} from "./helpers/workflow-v2-agent-fixture.mjs"
test("real private mTLS Worker/Broker/loopback embedding POST indexes 2/1536/3072 dimensions, returns metadata only and never resends",async()=>{
  const f=await knowledgeIndexFixture();let dimensions=2,requests=0
  const provider=createServer(async(req,res)=>{
    requests++;assert.match(req.url,/^\/v1(?:\/(?:1536|3072))?\/embeddings$/);assert.equal(req.method,"POST");assert.equal(req.headers.authorization,"Bearer synthetic-alice-model-key-never-network")
    const chunks=[];for await(const piece of req)chunks.push(piece)
    const body=JSON.parse(Buffer.concat(chunks).toString());assert.equal(Object.hasOwn(body,"dimensions"),false);assert.equal(body.model,"synthetic")
    res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({data:body.input.map((_,index)=>({index,embedding:Array.from({length:dimensions},(_,i)=>i===0?1:0)}))}))
  })
  try{
    await new Promise(done=>provider.listen(0,"127.0.0.1",done))
    const port=provider.address().port,policy=embeddingEndpointPolicy({AGENT_STUDIO_EMBEDDING_ALLOW_LOOPBACK:"true",AGENT_STUDIO_EMBEDDING_LOOPBACK_PORTS:String(port)})
    const settings=new KnowledgeEmbeddingRepository(f.pool,policy),network=createKnowledgeEmbeddingTransport(policy)
    const broker=new KnowledgeIndexBroker(f.pool,f.pool,f.key,network,{approvedForIsolatedUat:true})
    await withDisposableBoundModelTls(claim=>broker.dispatch(claim),async config=>{
      assertKnowledgeIndexWorkerTls(config.ca,config.cert,config.key)
      assert.throws(()=>assertKnowledgeIndexWorkerTls(config.ca,config.ca,config.key))
      const client=createKnowledgeIndexPrivateClient(config)
      let revision=1
      for(const next of [2,1536,3072]){
        dimensions=next
        const saved=await settings.change(alice,{action:"configure",request_id:randomUUID(),expected_revision:revision,
          connection_id:f.resources.alice.model.id,connection_revision:f.resources.alice.model.revision,model_name:"synthetic",base_url:"http://127.0.0.1:"+port+"/v1"+(next===2?"":"/"+next)})
        // Different path yields a new profile epoch while the mock accepts it.
        revision=saved.item.revision
        await f.grant();await f.authorize()
        const worker=new KnowledgeIndexWorker(f.pool,client,{approvedForIsolatedUat:true}),claim=await worker.claim()
        const result=await client(claim)
        assert.deepEqual(Object.keys(result).sort(),["chunks","status"])
        assert.equal((await settings.status(alice,f.resources.alice.kb.id)).dimensions,next)
        const previous=requests;await assert.rejects(client(claim));assert.equal(requests,previous)
        assert.equal((await new KnowledgeIndexWorker(f.pool,client,{approvedForIsolatedUat:true}).tick()).status,"idle")
      }
      const forged=createKnowledgeIndexPrivateClient({...config,reviewedServerFingerprint256:"00".repeat(32)})
      await assert.rejects(forged({attempt_id:randomUUID(),worker_id:randomUUID(),lease_token:"f".repeat(64)}))
    },{handlerFactory:createKnowledgeIndexPrivateHandler})
    assert.equal(requests,3)
  }finally{provider.closeAllConnections();await new Promise(done=>provider.close(done));await f.close()}
})
