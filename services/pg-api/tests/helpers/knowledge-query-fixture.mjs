import {randomUUID} from "node:crypto"
import {knowledgeIndexFixture} from "./knowledge-index-fixture.mjs"
import {alice,bob} from "./workflow-v2-agent-fixture.mjs"
import {scopedKnowledgeQueryPool} from "../../src/knowledge-query-policy.ts"
import {KnowledgeQueryRepository} from "../../src/knowledge-query-repository.ts"
import {KnowledgeQueryBroker} from "../../src/knowledge-query-broker.ts"
import {KnowledgeQueryWorker} from "../../src/knowledge-query-worker.ts"
import {QUERY_CHARGE_ACKNOWLEDGEMENT} from "../../src/knowledge-query-contracts.ts"
import {KnowledgeAccessRepository} from "../../src/knowledge-access-repository.ts"
import {EMBEDDING_CHARGE_ACKNOWLEDGEMENT} from "../../src/knowledge-embedding-consent-contracts.ts"
export async function knowledgeQueryFixture(){
  const f=await knowledgeIndexFixture()
  try{
    await f.grant();await f.authorize();await f.worker().tick()
    await f.db.exec(f.sql("migrations/pg_v9_038_knowledge_query_runtime.sql"))
    const pool=scopedKnowledgeQueryPool(f.pool,true),queries=new KnowledgeQueryRepository(pool),base=f.resources.alice.kb.id
    await f.settings.change(bob,{action:"configure",request_id:randomUUID(),expected_revision:0,connection_id:f.resources.bob.model.id,
      connection_revision:f.resources.bob.model.revision,model_name:"synthetic",base_url:"https://api.openai.com/v1"})
    const p=await f.consents.get(bob)
    await f.consents.change(bob,{action:"grant",request_id:randomUUID(),expected_revision:0,profile_id:p.profile_id,profile_revision:p.profile_revision,
      index_enabled:false,query_enabled:true,acknowledgement:EMBEDDING_CHARGE_ACKNOWLEDGEMENT})
    const access=new KnowledgeAccessRepository(pool,async()=>({id:f.users.bob,display_name:"Bob"}))
    await access.change(alice,base,{action:"grant",recipient_email:"bob@example.test",role:"viewer",semantic_allowed:true,expected_revision:0,request_id:randomUUID()})
    const calls=[];let provider=async()=>[[3,4]]
    const broker=new KnowledgeQueryBroker(pool,pool,f.key,async(material,signal)=>{calls.push(structuredClone(material));return provider(material,signal)},{approvedForIsolatedUat:true})
    const request=async(extra={})=>{const p=await f.consents.get(bob);return {request_id:randomUUID(),base_ids:[base],query:"different wording",mode:"semantic",limit:8,
      profile_id:p.profile_id,profile_revision:p.profile_revision,consent_revision:p.revision,acknowledgement:QUERY_CHARGE_ACKNOWLEDGEMENT,...extra}}
    const worker=()=>new KnowledgeQueryWorker(pool,claim=>broker.dispatch(claim),{approvedForIsolatedUat:true})
    return {...f,pool,queries,base,access,queryCalls:calls,queryBroker:broker,queryWorker:worker,queryRequest:request,setQueryProvider:fn=>provider=fn}
  }catch(error){await f.close();throw error}
}
