import {randomUUID} from "node:crypto"
import {knowledgeKeywordFixture} from "./knowledge-keyword-fixture.mjs"
import {bob} from "./workflow-v2-agent-fixture.mjs"
import {RunRepository} from "../../src/run-repository.ts"
import {AgentPrepareWorker} from "../../src/agent-worker.ts"
import {AgentModelWorker} from "../../src/model-worker.ts"
import {OwnerBoundModelDispatch} from "../../src/owner-model-dispatch.ts"
import {BoundLeaseIdentityRepository,createVerifiedBoundDispatchAdapter} from "../../src/bound-lease-identity.ts"
import {createBoundModelMutualTlsClient} from "../../src/bound-model-client.ts"
import {withDisposableBoundModelTls} from "./bound-model-loopback-tls.mjs"
export async function knowledgeAgentFixture(){
  const f=await knowledgeKeywordFixture()
  try{
    await f.db.exec(f.sql("migrations/pg_v9_042_agent_knowledge_observations.sql"))
    const singleRuns=new RunRepository(f.pool,{allowBoundModelRuns:true})
    async function approved({bases=[f.base],bound=true,instruction="Search KB: OWN_CITATION",pool=f.pool}={}){
      const runs=pool===f.pool?singleRuns:new RunRepository(pool,{allowBoundModelRuns:true})
      const spec=await f.agents.create(bob,"Single-shot evidence",{goal:"Use approved original evidence",tools:bases.length?["knowledge_search"]:[],knowledge_base_ids:bases,
        ...(bound?{model_binding:f.resources.bob.binding}:{})})
      const queued=await runs.submit(bob,spec.id,{instruction,idempotency_key:randomUUID()})
      if((await new AgentPrepareWorker(pool,"single-prepare").tick()).status!=="prepared")throw Error("synthetic_prepare_failed")
      await runs.decideModel(bob,queued.run.id,{decision:"approved"})
      return {runs,run:queued.run,spec}
    }
    async function withBound(executor,run,{businessPool=f.pool,brokerPool=f.pool,workerPool=f.pool,beforeDispatch}={}){
      const key=Buffer.from("0123456789abcdef".repeat(4),"hex")
      try{
        const broker=new OwnerBoundModelDispatch(businessPool,key,executor,brokerPool)
        const verified=createVerifiedBoundDispatchAdapter(new BoundLeaseIdentityRepository(f.pool),broker)
        return await withDisposableBoundModelTls(async(claim,input)=>{await beforeDispatch?.(claim,input);return verified(claim,input)},async tls=>{
          const worker=new AgentModelWorker(workerPool,"single-model",{async generate(){throw Error("shared_fallback_forbidden")}},
            {boundOnly:true,boundExecutionApproved:true,boundModelDispatch:createBoundModelMutualTlsClient(tls)})
          return run(worker,broker)
        })
      }finally{key.fill(0)}
    }
    return {...f,singleRuns,approved,withBound}
  }catch(error){await f.close();throw error}
}
