import {randomUUID} from "node:crypto"
import {agentFixture,alice} from "./workflow-v2-agent-fixture.mjs"
import {scopedEmbeddingSettingsPool,scopedEmbeddingConsentPool} from "../../src/knowledge-scope-policy.ts"
import {scopedKnowledgeIndexPool} from "../../src/knowledge-index-policy.ts"
import {KnowledgeEmbeddingRepository} from "../../src/knowledge-embedding-repository.ts"
import {KnowledgeEmbeddingConsentRepository} from "../../src/knowledge-embedding-consent-repository.ts"
import {embeddingEndpointPolicy} from "../../src/knowledge-embedding-policy.ts"
import {EMBEDDING_CHARGE_ACKNOWLEDGEMENT} from "../../src/knowledge-embedding-consent-contracts.ts"
import {INDEX_START_ACKNOWLEDGEMENT} from "../../src/knowledge-index-contracts.ts"
import {KnowledgeIndexRepository} from "../../src/knowledge-index-repository.ts"
import {KnowledgeIndexBroker} from "../../src/knowledge-index-broker.ts"
import {KnowledgeIndexWorker} from "../../src/knowledge-index-worker.ts"
export async function knowledgeIndexFixture(){
  const f=await agentFixture({mcp:true,smithery:true,sharing:true})
  try{
    for(const version of ["035_knowledge_embedding_state","036_knowledge_embedding_consent","037_knowledge_index_runtime"])
      await f.db.exec(f.sql("migrations/pg_v9_"+version+".sql"))
    const pool=scopedKnowledgeIndexPool(scopedEmbeddingConsentPool(scopedEmbeddingSettingsPool(f.pool,true),true),true)
    const settings=new KnowledgeEmbeddingRepository(pool,embeddingEndpointPolicy({})),consents=new KnowledgeEmbeddingConsentRepository(pool),index=new KnowledgeIndexRepository(pool)
    const configure=(expected=0,extra={})=>settings.change(alice,{action:"configure",request_id:randomUUID(),expected_revision:expected,
      connection_id:f.resources.alice.model.id,connection_revision:f.resources.alice.model.revision,model_name:"synthetic",base_url:"https://api.openai.com/v1",...extra})
    await configure()
    const grant=async()=>{const s=await consents.get(alice);return consents.change(alice,{action:"grant",request_id:randomUUID(),expected_revision:s.revision,
      profile_id:s.profile_id,profile_revision:s.profile_revision,index_enabled:true,query_enabled:false,acknowledgement:EMBEDDING_CHARGE_ACKNOWLEDGEMENT})}
    const authorize=async(extra={})=>{const s=await consents.get(alice);return index.authorize(alice,{request_id:randomUUID(),profile_id:s.profile_id,profile_revision:s.profile_revision,
      expected_consent_revision:s.revision,acknowledgement:INDEX_START_ACKNOWLEDGEMENT,...extra})}
    const key=Buffer.from("0123456789abcdef".repeat(4),"hex"),calls=[]
    let provider=async material=>material.input.map(()=>[3,4])
    const broker=new KnowledgeIndexBroker(pool,f.pool,key,async(material,signal)=>{calls.push(structuredClone(material));return provider(material,signal)},{approvedForIsolatedUat:true})
    const worker=()=>new KnowledgeIndexWorker(pool,x=>broker.dispatch(x),{approvedForIsolatedUat:true})
    return {...f,pool,settings,consents,index,configure,grant,authorize,key,calls,broker,worker,setProvider:fn=>provider=fn,
      async close(){key.fill(0);await f.close()}}
  }catch(error){await f.close();throw error}
}
