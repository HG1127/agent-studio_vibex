import test from "node:test"
import assert from "node:assert/strict"
import {knowledgeQueryFixture} from "./helpers/knowledge-query-fixture.mjs"
import {withDisposableBoundModelTls} from "./helpers/bound-model-loopback-tls.mjs"
import {createKnowledgeQueryPrivateClient,createKnowledgeQueryPrivateHandler} from "../src/knowledge-query-private-tls.ts"
import {KnowledgeQueryWorker} from "../src/knowledge-query-worker.ts"
import {bob} from "./helpers/workflow-v2-agent-fixture.mjs"

test("pinned private mTLS query dispatch carries only sealed claims and metadata, with no paid replay",async()=>{
  const f=await knowledgeQueryFixture()
  try{
    const request=await f.queryRequest();await f.queries.submit(bob,request)
    await withDisposableBoundModelTls(claim=>f.queryBroker.dispatch(claim),async config=>{
      const client=createKnowledgeQueryPrivateClient(config),worker=new KnowledgeQueryWorker(f.pool,client,{approvedForIsolatedUat:true}),claim=await worker.claim()
      assert.deepEqual(Object.keys(claim).sort(),["attempt_id","lease_token","worker_id"])
      const wrongPin=createKnowledgeQueryPrivateClient({...config,reviewedServerFingerprint256:"00".repeat(32)})
      await assert.rejects(wrongPin(claim));assert.equal(f.queryCalls.length,0)
      assert.deepEqual(await client(claim),{status:"retrieved"})
      await assert.rejects(client(claim));assert.equal(f.queryCalls.length,1)
      assert.equal((await worker.tick()).status,"idle")
      assert.equal((await f.queries.get(bob,request.request_id)).result.items.length,1)
      await assert.rejects(client({...claim,query:"must not cross private wire"}))
    },{handlerFactory:createKnowledgeQueryPrivateHandler})
  }finally{await f.close()}
})
